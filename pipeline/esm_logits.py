"""Step 2: ESM2 masked-token probabilities at every site, for 4 model sizes x 2 contexts.

window = exactly what the player sees (5 aa, <mask>, 5 aa); full = the whole protein with that one site masked.
Writes data/work/esm_{model}_{context}.npy, each [n_sites, 20] probabilities over AA (renormalised over the 20 standard aa).
"""
import json, os, sys, time
import numpy as np, torch, esm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = f'{ROOT}/data/work'
AA = 'ACDEFGHIKLMNPQRSTVWY'
MODELS = ['esm2_t6_8M_UR50D', 'esm2_t12_35M_UR50D', 'esm2_t30_150M_UR50D', 'esm2_t33_650M_UR50D']
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
proteins = {p['key']: p for p in json.load(open(f'{WORK}/proteins.json'))}
sites = json.load(open(f'{WORK}/sites.json'))

for name in (sys.argv[1:] or MODELS):
    model, alphabet = getattr(esm.pretrained, name)()
    model = model.eval().to(dev)
    conv = alphabet.get_batch_converter()
    aa_idx = torch.tensor([alphabet.get_idx(a) for a in AA], device=dev)
    mask_idx = alphabet.mask_idx

    def run(seqs, pos):   # seqs: list of strings; pos: masked index (0-based, in sequence coordinates) per seq
        _, _, toks = conv([(str(k), s) for k, s in enumerate(seqs)])
        toks = toks.to(dev)
        toks[torch.arange(len(seqs)), torch.tensor(pos) + 1] = mask_idx   # +1 for <cls>
        with torch.no_grad():
            logits = model(toks)['logits']
        sel = logits[torch.arange(len(seqs)), torch.tensor(pos, device=dev) + 1][:, aa_idx]
        return torch.softmax(sel.float(), -1).cpu().numpy()

    t0 = time.time()
    out = run([s['window'] for s in sites], [5] * len(sites))
    np.save(f'{WORK}/esm_{name}_window.npy', out.astype(np.float32))
    full = np.zeros((len(sites), 20), np.float32)
    by_prot = {}
    for k, s in enumerate(sites): by_prot.setdefault(s['protein'], []).append(k)
    B = 8
    for key, ks in by_prot.items():
        seq = proteins[key]['seq']
        for b in range(0, len(ks), B):
            chunk = ks[b:b + B]
            full[chunk] = run([seq] * len(chunk), [sites[k]['i'] for k in chunk])
    np.save(f'{WORK}/esm_{name}_full.npy', full)
    y = np.array([AA.index(s['aa']) for s in sites])
    print(f"{name}: window acc {(out.argmax(1) == y).mean():.3f} · full acc {(full.argmax(1) == y).mean():.3f} · {time.time() - t0:.0f}s", flush=True)
    del model; torch.mps.empty_cache() if dev == 'mps' else None
