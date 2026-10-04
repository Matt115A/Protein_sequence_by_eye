"""Step 1: pick proteins (ProteinGym AF2 structures), sample masked sites, compute backbone features, write side-chain-free PDBs.

Outputs data/work/proteins.json, data/work/sites.json, data/work/corpus.json (held-out proteins for the big-data baseline),
data/work/pdb_orig/*.pdb (for ProteinMPNN) and app/public/data/structures/*.pdb (backbone + virtual Cβ only, all residues ALA).
"""
import io, json, math, os, random, zipfile
import numpy as np, pandas as pd
from common import AA, THREE, HALF, parse, smooth_ss, ss_class, virtual_cb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.environ.get('PROTEINGYM_RAW', f'{ROOT}/data/raw')   # ProteinGym AF2.zip + DMS_substitutions.csv
WORK = f'{ROOT}/data/work'; OUT_STRUCT = f'{ROOT}/app/public/data/structures'
os.makedirs(f'{WORK}/pdb_orig', exist_ok=True); os.makedirs(OUT_STRUCT, exist_ok=True)
N_LEARN, N_NEW = 28, 8   # proteins in the game
SITES_PER_PROT = 70
MIN_PLDDT = 80
rng = random.Random(7)

ref = pd.read_csv(f'{RAW}/DMS_substitutions.csv').drop_duplicates('UniProt_ID').set_index('UniProt_ID')

def kmers(s, k=3): return {s[i:i + k] for i in range(len(s) - k + 1)}

z = zipfile.ZipFile(f'{RAW}/AF2.zip')
cands = []
for n in sorted(z.namelist()):
    if not n.endswith('.pdb'): continue
    uid = os.path.basename(n)[:-4]
    text = z.read(n).decode()
    seq, bb, plddt, phipsi, nums = parse(uid, text)
    cands.append(dict(uid=uid, text=text, seq=seq, bb=bb, plddt=plddt, phipsi=phipsi, nums=nums, L=len(seq), mean_plddt=float(plddt.mean())))
print(len(cands), 'structures')

# drop near-duplicates (3-mer Jaccard), keep the higher-confidence one
cands.sort(key=lambda c: -c['mean_plddt'])
kept = []
for c in cands:
    km = kmers(c['seq'])
    if all(len(km & kmers(k['seq'])) / len(km | kmers(k['seq'])) < 0.15 for k in kept): kept.append(c)
print(len(kept), 'after de-duplication')

good = [c for c in kept if 80 <= c['L'] <= 600 and c['mean_plddt'] >= 85 and (c['plddt'] >= MIN_PLDDT).sum() >= SITES_PER_PROT + 10]
rng.shuffle(good)
game, corpus = good[:N_LEARN + N_NEW], [c for c in kept if c not in good[:N_LEARN + N_NEW]]
print(len(good), 'eligible;', len(game), 'in game;', len(corpus), 'held out for the corpus baseline')

proteins, sites = [], []
for gi, c in enumerate(game):
    group = 'learn' if gi < N_LEARN else 'new'
    L, bb = c['L'], c['bb']
    cb = np.array([virtual_cb(*bb[i, :3]) for i in range(L)])
    d = np.linalg.norm(cb[:, None] - cb[None], axis=-1)
    nbr10 = (d < 10).sum(1) - 1
    ss = smooth_ss([ss_class(*pp) for pp in c['phipsi']])
    key = f'p{gi:02d}'
    # side-chain-free structure for the browser: backbone + virtual Cβ, every residue ALA, renumbered 1..L
    lines, k = [], 1
    for i in range(L):
        for an, xyz, el in [('N', bb[i, 0], 'N'), ('CA', bb[i, 1], 'C'), ('C', bb[i, 2], 'C'), ('O', bb[i, 3], 'O'), ('CB', cb[i], 'C')]:
            lines.append(f"ATOM  {k:5d}  {an:<3s} ALA A{i + 1:4d}    {xyz[0]:8.3f}{xyz[1]:8.3f}{xyz[2]:8.3f}  1.00{c['plddt'][i]:6.2f}           {el}")
            k += 1
    open(f'{OUT_STRUCT}/{key}.pdb', 'w').write('\n'.join(lines) + '\nEND\n')
    open(f'{WORK}/pdb_orig/{key}.pdb', 'w').write(c['text'])
    r = ref.loc[c['uid']] if c['uid'] in ref.index else None
    proteins.append(dict(key=key, uid=c['uid'], group=group, name=str(r.molecule_name) if r is not None else c['uid'], organism=str(r.source_organism) if r is not None else '',
                         seq=c['seq'], L=L, mean_plddt=round(c['mean_plddt'], 1)))
    ok = [i for i in range(HALF, L - HALF) if c['plddt'][i] >= MIN_PLDDT]
    for i in sorted(rng.sample(ok, min(SITES_PER_PROT, len(ok)))):
        nb = [int(j) for j in np.argsort(d[i]) if j != i][:16]
        phi, psi = c['phipsi'][i]
        sites.append(dict(protein=key, group=group, i=i, aa=c['seq'][i], window=c['seq'][i - HALF:i + HALF + 1],
                          phi=None if phi is None else round(phi), psi=None if psi is None else round(psi), ss=ss[i],
                          nbr=int(nbr10[i]), plddt=round(float(c['plddt'][i]), 1),
                          nbrs=[[j, round(float(d[i, j]), 1)] for j in nb]))
json.dump(proteins, open(f'{WORK}/proteins.json', 'w'))
json.dump(sites, open(f'{WORK}/sites.json', 'w'))
json.dump([dict(uid=c['uid'], seq=c['seq'], plddt=[round(float(x), 1) for x in c['plddt']]) for c in corpus], open(f'{WORK}/corpus.json', 'w'))
print(len(sites), 'sites')
from collections import Counter
cnt = Counter(s['aa'] for s in sites); print('most common:', cnt.most_common(4), f"→ always-{cnt.most_common(1)[0][0]} baseline {cnt.most_common(1)[0][1] / len(sites):.3f}")
print(Counter(s['ss'] for s in sites))
for p in proteins: print(p['group'], p['key'], p['uid'], p['L'], p['name'][:40], '|', p['organism'][:30])
