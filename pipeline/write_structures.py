"""Step 1b: full heavy-atom structures for the browser (no hydrogens), residues renumbered 1..L to match the dataset.

The hidden residue's side chain is stripped in the browser for each trial (lib/structure.ts), so neighbours can show their
side chains while the masked site shows only backbone + a virtual Cβ.
"""
import io, json, os, sys
from Bio.PDB import PDBParser
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import THREE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = f'{ROOT}/data/work'; OUT = f'{ROOT}/app/public/data/structures'
total = 0
for p in json.load(open(f'{WORK}/proteins.json')):
    s = PDBParser(QUIET=True).get_structure(p['key'], f"{WORK}/pdb_orig/{p['key']}.pdb")
    chain = next(s[0].get_chains())
    res = [r for r in chain if r.id[0] == ' ' and r.get_resname() in THREE and all(a in r for a in ('N', 'CA', 'C', 'O'))]
    assert ''.join(THREE[r.get_resname()] for r in res) == p['seq'], p['key']
    lines, k = [], 1
    for i, r in enumerate(res):
        for a in r:
            el = a.element.strip() or a.get_id()[0]
            if el == 'H': continue
            n = a.get_id()
            name = f' {n:<3s}' if len(n) < 4 else n
            x, y, z = a.coord
            lines.append(f"ATOM  {k:5d} {name} {r.get_resname()} A{i + 1:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00{a.bfactor:6.2f}          {el:>2s}")
            k += 1
    text = '\n'.join(lines) + '\nEND\n'
    open(f"{OUT}/{p['key']}.pdb", 'w').write(text)
    total += len(text)
print(f'wrote 36 structures, {total / 1e6:.1f} MB')
