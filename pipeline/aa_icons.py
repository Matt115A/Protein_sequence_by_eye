"""Side-chain skeletal drawings (RDKit) for the amino-acid picker: each side chain hangs from a labelled Cα, same scale for all."""
import json, math, os, re
from rdkit import Chem
from rdkit.Chem import AllChem, rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Geometry import Point3D

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SMI = {  # * = Cα
    'G': '*[H]', 'A': '*C', 'V': '*C(C)C', 'L': '*CC(C)C', 'I': '*C(C)CC', 'M': '*CCSC', 'F': '*Cc1ccccc1', 'W': '*Cc1c[nH]c2ccccc12',
    'Y': '*Cc1ccc(O)cc1', 'S': '*CO', 'T': '*C(O)C', 'N': '*CC(N)=O', 'Q': '*CCC(N)=O', 'C': '*CS', 'P': '[*]1CCCN1',
    'K': '*CCCC[NH3+]', 'R': '*CCCNC(N)=[NH2+]', 'H': '*Cc1c[nH]cn1', 'D': '*CC(=O)[O-]', 'E': '*CCC(=O)[O-]',
}
icons = {}
for aa, smi in SMI.items():
    m = Chem.MolFromSmiles(smi, sanitize=True) if aa != 'G' else Chem.AddHs(Chem.MolFromSmiles('*'), explicitOnly=False)
    if aa == 'G':
        m = Chem.RWMol(); a = m.AddAtom(Chem.Atom(0)); h = m.AddAtom(Chem.Atom(1)); m.AddBond(a, h, Chem.BondType.SINGLE); m = m.GetMol()
    rdDepictor.SetPreferCoordGen(True); rdDepictor.Compute2DCoords(m)
    conf = m.GetConformer()
    star = next(a.GetIdx() for a in m.GetAtoms() if a.GetAtomicNum() == 0)
    if aa == 'P':   # point the ring away from Cα: use the ring centroid
        pts = [conf.GetAtomPosition(i) for i in range(m.GetNumAtoms())]
        tx, ty = sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts)
    else:
        nb = m.GetAtomWithIdx(star).GetNeighbors()[0].GetIdx(); tx, ty = conf.GetAtomPosition(nb).x, conf.GetAtomPosition(nb).y
    sx, sy = conf.GetAtomPosition(star).x, conf.GetAtomPosition(star).y
    ang = math.atan2(ty - sy, tx - sx); rot = -math.pi / 2 - ang   # side chain points down
    for i in range(m.GetNumAtoms()):
        p = conf.GetAtomPosition(i); x, y = p.x - sx, p.y - sy
        conf.SetAtomPosition(i, Point3D(x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot), 0))
    d = rdMolDraw2D.MolDraw2DSVG(96, 132, -1, -1, True)   # noFreetype: labels as <text>, so the browser renders 'α'
    o = d.drawOptions()
    o.clearBackground = False; o.fixedBondLength = 21; o.padding = 0.08; o.bondLineWidth = 1.6; o.minFontSize = 9; o.maxFontSize = 11
    o.updateAtomPalette({0: (0.62, 0.62, 0.58), 1: (0.85, 0.85, 0.82), 6: (0.88, 0.88, 0.85), 7: (0.48, 0.65, 1.0), 8: (1.0, 0.5, 0.45), 16: (0.95, 0.8, 0.3)})
    o.atomLabels[star] = 'C~'   # '~' becomes α after drawing (RDKit can't encode it)
    d.DrawMolecule(m); d.FinishDrawing()
    svg = d.GetDrawingText().replace('>~<', '>α<')
    svg = re.sub(r'<\?xml[^>]*\?>\s*', '', svg)
    svg = re.sub(r"<rect[^>]*style='opacity:1.0;fill:#FFFFFF[^>]*>\s*</rect>", '', svg)
    svg = re.sub(r"width='96px' height='132px'", "viewBox='0 0 96 132'", svg)
    icons[aa] = svg.replace('\n', '')
json.dump(icons, open(f'{ROOT}/app/public/data/aa_icons.json', 'w'))
print('icons', len(icons), sum(len(v) for v in icons.values()) // 1024, 'KB')
open(f'{ROOT}/data/work/icons_preview.html', 'w').write("<body style='background:#141413;display:flex;flex-wrap:wrap;gap:8px'>" + ''.join(f"<div style='width:96px;color:#ddd;font:14px sans-serif;text-align:center;border:1px solid #333'>{k}{v}</div>" for k, v in icons.items()) + '</body>')
