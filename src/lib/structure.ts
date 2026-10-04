/**
 * Hide the answer in the 3D view: drop the masked residue's side chain, rename it ALA, and give it a virtual Cβ built from its
 * backbone (ProteinMPNN's ideal-geometry formula) — so every masked site looks the same, glycines included.
 */
const BACKBONE = new Set(['N', 'CA', 'C', 'O']);
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function virtualCb(n: V, ca: V, c: V): V {
  const b = sub(ca, n), cc = sub(c, ca), a = cross(b, cc);
  return [0, 1, 2].map((k) => -0.58273431 * a[k] + 0.56802827 * b[k] - 0.54067466 * cc[k] + ca[k]) as V;
}

export function maskResidue(pdb: string, resi: number): string {
  const out: string[] = [];
  const bb: Record<string, V> = {};
  let template = '';
  for (const line of pdb.split('\n')) {
    if (!line.startsWith('ATOM') || Number(line.slice(22, 26)) !== resi) { out.push(line); continue; }
    const name = line.slice(12, 16).trim();
    if (!BACKBONE.has(name)) continue;
    bb[name] = [Number(line.slice(30, 38)), Number(line.slice(38, 46)), Number(line.slice(46, 54))];
    const renamed = line.slice(0, 17) + 'ALA' + line.slice(20);
    out.push(renamed);
    if (name === 'O') {
      template = renamed;
      if (bb.N && bb.CA && bb.C) {
        const [x, y, z] = virtualCb(bb.N, bb.CA, bb.C);
        out.push(template.slice(0, 12) + ' CB ' + template.slice(16, 30) + x.toFixed(3).padStart(8) + y.toFixed(3).padStart(8) + z.toFixed(3).padStart(8) + template.slice(54, 76) + ' C');
      }
    }
  }
  return out.join('\n');
}
