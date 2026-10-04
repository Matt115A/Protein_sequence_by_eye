"""Shared parsing and feature code for the pipeline."""
import io, math
import numpy as np
from Bio.PDB import PDBParser, PPBuilder

AA = 'ACDEFGHIKLMNPQRSTVWY'
THREE = dict(ALA='A', ARG='R', ASN='N', ASP='D', CYS='C', GLN='Q', GLU='E', GLY='G', HIS='H', ILE='I', LEU='L', LYS='K', MET='M', PHE='F', PRO='P', SER='S', THR='T', TRP='W', TYR='Y', VAL='V')
SS = ['helix', 'strand', 'loop', 'left']
HALF = 5

def virtual_cb(n, ca, c):   # ProteinMPNN's ideal Cβ from backbone
    b, cc = ca - n, c - ca
    a = np.cross(b, cc)
    return -0.58273431 * a + 0.56802827 * b - 0.54067466 * cc + ca

def parse(name, text):
    s = PDBParser(QUIET=True).get_structure(name, io.StringIO(text))
    chain = next(s[0].get_chains())
    res = [r for r in chain if r.id[0] == ' ' and r.get_resname() in THREE and all(a in r for a in ('N', 'CA', 'C', 'O'))]
    seq = ''.join(THREE[r.get_resname()] for r in res)
    bb = np.array([[r[a].coord for a in ('N', 'CA', 'C', 'O')] for r in res], dtype=float)
    plddt = np.array([r['CA'].bfactor for r in res])
    phipsi = []
    pos = {r.id: i for i, r in enumerate(res)}
    tmp = [None] * len(res)
    for pp in PPBuilder().build_peptides(chain):
        for r, (phi, psi) in zip(pp, pp.get_phi_psi_list()):
            if r.id in pos: tmp[pos[r.id]] = (phi, psi)
    for t in tmp:
        phipsi.append((None if t is None or t[0] is None else math.degrees(t[0]), None if t is None or t[1] is None else math.degrees(t[1])))
    nums = [r.id[1] for r in res]
    return seq, bb, plddt, phipsi, nums

def ss_class(phi, psi):
    if phi is None or psi is None: return 'loop'
    if phi > 0: return 'left'
    if -160 < phi < -20 and -120 < psi < 50: return 'helix'
    if -180 <= phi < -45 and (psi > 90 or psi < -150): return 'strand'
    return 'loop'

def smooth_ss(raw):   # call helix/strand only in runs (≥4 helix, ≥3 strand), like a crude DSSP
    out = ['loop' if x in ('helix', 'strand') else x for x in raw]
    i = 0
    while i < len(raw):
        j = i
        while j < len(raw) and raw[j] == raw[i]: j += 1
        if (raw[i] == 'helix' and j - i >= 4) or (raw[i] == 'strand' and j - i >= 3):
            for k in range(i, j): out[k] = raw[i]
        i = j
    return out


def cb_coords(bb):
    return np.array([virtual_cb(*bb[i, :3]) for i in range(len(bb))])

def struct_features(seq, phipsi, ss, d, i):
    """What the structure game shows, as numbers: backbone state, burial, and who the spatial neighbours are (29 values)."""
    phi, psi = phipsi[i]
    f = [1.0 if ss[i] == k else 0.0 for k in SS]
    for ang in (phi, psi):
        f += [0.0, 0.0] if ang is None else [math.sin(math.radians(ang)), math.cos(math.radians(ang))]
    near = [j for j in np.where(d[i] < 10)[0] if j != i]
    f.append(len(near) / 30)
    comp = np.zeros(20)
    for j in near: comp[AA.index(seq[j])] += 1
    f += list(comp / max(1, len(near)))
    return f

def window_onehot(window):
    """10 context positions x 20 aa (the centre is the mask)."""
    v = np.zeros(200)
    for k, a in enumerate(window[:HALF] + window[HALF + 1:]):
        if a in AA: v[k * 20 + AA.index(a)] = 1
    return v
