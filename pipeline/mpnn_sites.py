"""Step 3: ProteinMPNN (v_48_020, no backbone noise) probabilities at the sampled sites only.

seqbb = p(aa_i | backbone + identities of all other residues)  — the site is decoded last; how ProteinMPNN scores a residue
bb    = p(aa_i | backbone only)                                — the site is decoded first
Writes data/work/mpnn_seqbb.npy and mpnn_bb.npy, [n_sites, 20] over AA order ACDEFGHIKLMNPQRSTVWY.
"""
import json, os, sys, time
import numpy as np, torch
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{ROOT}/tools/ProteinMPNN')
from protein_mpnn_utils import ProteinMPNN, StructureDatasetPDB, parse_PDB, tied_featurize

WORK = f'{ROOT}/data/work'
AA = 'ACDEFGHIKLMNPQRSTVWY'; MPNN_ALPHA = 'ACDEFGHIKLMNPQRSTVWYX'
dev = torch.device('cpu')
ck = torch.load(f'{ROOT}/tools/ProteinMPNN/vanilla_model_weights/v_48_020.pt', map_location=dev)
model = ProteinMPNN(ca_only=False, num_letters=21, node_features=128, edge_features=128, hidden_dim=128, num_encoder_layers=3, num_decoder_layers=3, augment_eps=0.0, k_neighbors=ck['num_edges'])
model.load_state_dict(ck['model_state_dict']); model.eval()
proteins = {p['key']: p for p in json.load(open(f'{WORK}/proteins.json'))}
sites = json.load(open(f'{WORK}/sites.json'))
out = {m: np.zeros((len(sites), 20), np.float32) for m in ('seqbb', 'bb')}
by_prot = {}
for k, s in enumerate(sites): by_prot.setdefault(s['protein'], []).append(k)
torch.manual_seed(1)
t0 = time.time()
for key, ks in by_prot.items():
    pdb = parse_PDB(f'{WORK}/pdb_orig/{key}.pdb')
    ds = StructureDatasetPDB(pdb, truncate=None, max_length=100000)
    prot = ds[0]
    X, S, mask, lengths, chain_M, chain_enc, *_rest = tied_featurize([prot], dev, {prot['name']: (['A'], [])}, None, None, None, None, None)
    residue_idx = _rest[-8]
    seq = ''.join(MPNN_ALPHA[i] for i in S[0].tolist())
    assert seq == proteins[key]['seq'], f'{key}: sequence mismatch'
    pos = [sites[k]['i'] for k in ks]
    cm = torch.zeros_like(chain_M); cm[0, pos] = 1.0
    randn = torch.randn(chain_M.shape)
    with torch.no_grad():
        for m, bb_only in (('seqbb', False), ('bb', True)):
            lp = model.conditional_probs(X, S, mask, cm, residue_idx, chain_enc, randn, bb_only)[0, pos, :20]
            out[m][ks] = torch.softmax(lp, -1).numpy()
    print(f'{key} L={len(seq)} {time.time() - t0:.0f}s', flush=True)
y = np.array([AA.index(s['aa']) for s in sites])
for m in out:
    np.save(f'{WORK}/mpnn_{m}.npy', out[m]); print(m, 'acc', round(float((out[m].argmax(1) == y).mean()), 3))
