"""Step 2b: how much context does ESM2-650M need? Top-1 call at each site for half-windows 5..100 (data/work/sweep_{h}.npy)."""
import json, os
import numpy as np, torch, esm
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WORK = f'{ROOT}/data/work'
AA = 'ACDEFGHIKLMNPQRSTVWY'
GROUP = {a: g for g, s in {'hyd': 'AVLIM', 'aro': 'FWY', 'pol': 'STNQ', 'pos': 'KRH', 'neg': 'DE', 'G': 'G', 'P': 'P', 'C': 'C'}.items() for a in s}
proteins = {p['key']: p for p in json.load(open(f'{WORK}/proteins.json'))}
sites = json.load(open(f'{WORK}/sites.json'))
model, alphabet = esm.pretrained.esm2_t33_650M_UR50D(); model = model.eval().to('mps'); conv = alphabet.get_batch_converter()
aa_idx = torch.tensor([alphabet.get_idx(a) for a in AA], device='mps')
y = np.array([AA.index(s['aa']) for s in sites])
for h in [5, 10, 15, 25, 50, 100]:
    seqs, pos = [], []
    for s in sites:
        seq = proteins[s['protein']]['seq']; a, b = max(0, s['i'] - h), min(len(seq), s['i'] + h + 1)
        seqs.append(seq[a:b]); pos.append(s['i'] - a)
    P = np.zeros((len(sites), 20))
    for b0 in range(0, len(sites), 64):
        _, _, t = conv([(str(k), x) for k, x in enumerate(seqs[b0:b0 + 64])]); t = t.to('mps')
        pp = torch.tensor(pos[b0:b0 + 64]) + 1
        t[torch.arange(len(pp)), pp] = alphabet.mask_idx
        with torch.no_grad(): lg = model(t)['logits'][torch.arange(len(pp)), pp.to('mps')][:, aa_idx]
        P[b0:b0 + 64] = torch.softmax(lg.float(), -1).cpu().numpy()
    pred = P.argmax(1)
    np.save(f'{WORK}/sweep_{h}.npy', pred.astype(np.int8))
    grp = np.mean([GROUP[AA[p]] == GROUP[AA[t]] for p, t in zip(pred, y)])
    print(f'±{h:3d} ({2 * h} aa context): top-1 {np.mean(pred == y):.3f}  top-3 {np.mean([t in np.argsort(-p)[:3] for p, t in zip(P, y)]):.3f}  same group {grp:.3f}  p(true) {P[np.arange(len(y)), y].mean():.3f}', flush=True)
