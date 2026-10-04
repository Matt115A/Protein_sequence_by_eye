"""Step 4: 'big data' baselines trained on ~45k sites from the 149 ProteinGym structures NOT used in the game.

window_model : multinomial logistic regression on the 10 context residues (exactly what the sequence game shows)
struct_model : gradient boosting on backbone state + burial + neighbour identities + the window (what the structure game shows)
Writes data/work/corpus_window.npy and corpus_struct.npy ([n_sites, 20] probabilities) for the game's sites.
"""
import io, json, os, sys, time, zipfile
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import AA, HALF, cb_coords, parse, smooth_ss, ss_class, struct_features, window_onehot

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = f'{ROOT}/data/work'; RAW = os.environ.get('PROTEINGYM_RAW', f'{ROOT}/data/raw')   # ProteinGym AF2.zip + DMS_substitutions.csv
corpus = {c['uid'] for c in json.load(open(f'{WORK}/corpus.json'))}
z = zipfile.ZipFile(f'{RAW}/AF2.zip')

def featurise(seq, bb, plddt, phipsi, idxs):
    cb = cb_coords(bb); d = np.linalg.norm(cb[:, None] - cb[None], axis=-1)
    ss = smooth_ss([ss_class(*pp) for pp in phipsi])
    W = np.array([window_onehot(seq[i - HALF:i + HALF + 1]) for i in idxs])
    S = np.array([struct_features(seq, phipsi, ss, d, i) for i in idxs])
    return W, S

t0 = time.time()
Wc, Sc, yc = [], [], []
for n in z.namelist():
    uid = os.path.basename(n)[:-4]
    if not n.endswith('.pdb') or uid not in corpus: continue
    seq, bb, plddt, phipsi, _ = parse(uid, z.read(n).decode())
    if len(seq) > 1200: continue
    idxs = [i for i in range(HALF, len(seq) - HALF) if plddt[i] >= 80]
    if not idxs: continue
    W, S = featurise(seq, bb, plddt, phipsi, idxs)
    Wc.append(W); Sc.append(S); yc += [AA.index(seq[i]) for i in idxs]
Wc, Sc, yc = np.vstack(Wc), np.vstack(Sc), np.array(yc)
print(f'corpus: {len(yc):,} sites ({time.time() - t0:.0f}s)', flush=True)

proteins = {p['key']: p for p in json.load(open(f'{WORK}/proteins.json'))}
sites = json.load(open(f'{WORK}/sites.json'))
Wg, Sg = [], []
for key in proteins:
    ks = [k for k, s in enumerate(sites) if s['protein'] == key]
    seq, bb, plddt, phipsi, _ = parse(key, open(f'{WORK}/pdb_orig/{key}.pdb').read())
    W, S = featurise(seq, bb, plddt, phipsi, [sites[k]['i'] for k in ks])
    Wg.append((ks, W)); Sg.append((ks, S))
Wgame = np.zeros((len(sites), 200)); Sgame = np.zeros((len(sites), Sc.shape[1]))
for (ks, W), (_, S) in zip(Wg, Sg): Wgame[ks] = W; Sgame[ks] = S
yg = np.array([AA.index(s['aa']) for s in sites])

lr = LogisticRegression(max_iter=2000, C=0.5).fit(Wc, yc)
pw = lr.predict_proba(Wgame)
print(f'window model: game acc {(pw.argmax(1) == yg).mean():.3f}', flush=True)
gb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, max_leaf_nodes=31, random_state=0).fit(np.hstack([Sc, Wc]), yc)
ps = gb.predict_proba(np.hstack([Sgame, Wgame]))
print(f'structure model: game acc {(ps.argmax(1) == yg).mean():.3f} ({time.time() - t0:.0f}s)', flush=True)
np.save(f'{WORK}/corpus_window.npy', pw.astype(np.float32)); np.save(f'{WORK}/corpus_struct.npy', ps.astype(np.float32))
np.save(f'{WORK}/struct_feats.npy', Sgame.astype(np.float32))
