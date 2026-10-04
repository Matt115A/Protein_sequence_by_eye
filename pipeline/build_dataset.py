"""Step 5: assemble app/public/data/dataset.json from the work files (run steps 1-4 first)."""
import json, os
import numpy as np
from collections import Counter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = f'{ROOT}/data/work'
AA = 'ACDEFGHIKLMNPQRSTVWY'
proteins = json.load(open(f'{WORK}/proteins.json'))
sites = json.load(open(f'{WORK}/sites.json'))
y = np.array([AA.index(s['aa']) for s in sites])
E = lambda n, c: np.load(f'{WORK}/esm_esm2_{n}_UR50D_{c}.npy')
probs = {
    'esm650_w': E('t33_650M', 'window'), 'esm650_f': E('t33_650M', 'full'),
    'mpnn': np.load(f'{WORK}/mpnn_seqbb.npy'), 'mpnn_bb': np.load(f'{WORK}/mpnn_bb.npy'),
}
most = Counter(s['aa'] for s in sites if s['group'] == 'learn').most_common(1)[0][0]
calls = {
    'always': np.full(len(sites), AA.index(most)),
    'corpus_window': np.load(f'{WORK}/corpus_window.npy').argmax(1), 'corpus_struct': np.load(f'{WORK}/corpus_struct.npy').argmax(1),
    'esm8_w': E('t6_8M', 'window').argmax(1), 'esm35_w': E('t12_35M', 'window').argmax(1), 'esm150_w': E('t30_150M', 'window').argmax(1), 'esm650_w': probs['esm650_w'].argmax(1),
    'esm8_f': E('t6_8M', 'full').argmax(1), 'esm35_f': E('t12_35M', 'full').argmax(1), 'esm150_f': E('t30_150M', 'full').argmax(1), 'esm650_f': probs['esm650_f'].argmax(1),
    'mpnn': probs['mpnn'].argmax(1), 'mpnn_bb': probs['mpnn_bb'].argmax(1),
}
for h in (10, 15, 25, 50, 100): calls[f'ctx{2 * h}'] = np.load(f'{WORK}/sweep_{h}.npy')
# kind: what the model gets to see.  games: where it is a fair or reference comparison
MODELS = [
    ('always', f'Always {most} (most common)', 'simple', 'seq,struct'),
    ('corpus_window', 'Window model (27k sites)', 'simple', 'seq'),
    ('corpus_struct', 'Structure-feature model (27k sites)', 'simple', 'struct'),
    ('esm8_w', 'ESM2 8M · same window', 'window', 'seq'), ('esm35_w', 'ESM2 35M · same window', 'window', 'seq'),
    ('esm150_w', 'ESM2 150M · same window', 'window', 'seq'), ('esm650_w', 'ESM2 650M · same window', 'window', 'seq'),
    ('esm8_f', 'ESM2 8M · whole protein', 'full', 'seq'), ('esm35_f', 'ESM2 35M · whole protein', 'full', 'seq'),
    ('esm150_f', 'ESM2 150M · whole protein', 'full', 'seq'), ('esm650_f', 'ESM2 650M · whole protein', 'full', 'seq,struct'),
    ('mpnn_bb', 'ProteinMPNN · backbone only', 'structure', 'struct'), ('mpnn', 'ProteinMPNN · backbone + neighbours', 'structure', 'struct'),
] + [(f'ctx{n}', f'ESM2 650M · {n} aa context', 'sweep', '') for n in (20, 30, 50, 100, 200)]
order = [m[0] for m in MODELS]
feats = np.load(f'{WORK}/struct_feats.npy')
out_sites = []
for k, s in enumerate(sites):
    out_sites.append(dict(
        id=k, p=s['protein'], i=s['i'], aa=s['aa'], w=s['window'], ss=s['ss'], phi=s['phi'], psi=s['psi'], nbr=s['nbr'], plddt=s['plddt'], nbrs=s['nbrs'],
        pr={m: [int(round(float(v) * 1000)) for v in probs[m][k]] for m in probs},
        c=''.join(AA[int(calls[m][k])] for m in order),
        f=[round(float(v), 3) for v in feats[k]],
    ))
ds = dict(version='1.0', source='ProteinGym v1.3 AlphaFold2 structures; ESM2 (Lin et al. 2023); ProteinMPNN v_48_020 (Dauparas et al. 2022)',
          aa=AA, models=[dict(name=n, label=l, kind=k, games=g.split(',') if g else []) for n, l, k, g in MODELS], model_order=order,
          proteins=[dict(key=p['key'], group=p['group'], name=p['name'], organism=p['organism'], uid=p['uid'], seq=p['seq']) for p in proteins],
          sites=out_sites)
path = f'{ROOT}/app/public/data/dataset.json'
json.dump(ds, open(path, 'w'), separators=(',', ':'), allow_nan=False)
print(f'{len(out_sites)} sites → {os.path.getsize(path) / 1e6:.1f} MB')
for m in order:
    for g in ('learn', 'new'):
        ix = [k for k, s in enumerate(sites) if s['group'] == g]
        print(f'{m:14s} {g:5s} {(calls[m][ix] == y[ix]).mean():.3f}', end='   ')
    print()
