import { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import { loadStructure } from '../lib/dataset';
import { maskResidue } from '../lib/structure';
import { aaColor, type Site } from '../lib/types';

/**
 * AlphaFold model with the hidden residue's side chain removed (backbone + a virtual Cβ, shown yellow). Its 16 nearest
 * neighbours are drawn as side-chain sticks with family-coloured carbons (or as Cβ spheres with side chains off), labelled
 * with their amino acid. Drag to rotate, scroll/pinch to zoom.
 */
export function StructureViewer({ site, reveal, height = 380, sideChains = true }: { site: Site; reveal: boolean; height?: number; sideChains?: boolean }) {
  const div = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof $3Dmol.createViewer> | null>(null);
  const loaded = useRef<string | null>(null);
  const framed = useRef<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!div.current || viewer.current) return;
    try {
      const probe = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
      if (!probe) throw new Error('WebGL unavailable');
      viewer.current = $3Dmol.createViewer(div.current, { backgroundColor: '#141413', antialias: true } as never);
      if (!viewer.current) throw new Error('could not create the 3D viewer');
    } catch (e) {
      viewer.current = null;
      setErr(`3D view unavailable in this browser (${e instanceof Error ? e.message : e}). The neighbour list and backbone panel still describe the structure.`);
    }
    return () => { try { viewer.current?.clear(); } catch { /* ignore */ } viewer.current = null; loaded.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = viewer.current;
        if (!v) return;
        const tag = `${site.protein.key}:${site.i}`;
        if (loaded.current !== tag) {   // a fresh model per site: the masked residue differs each time
          const pdb = await loadStructure(site.protein.key);
          if (cancelled) return;
          v.removeAllModels();
          v.addModel(maskResidue(pdb, site.i + 1), 'pdb');
          loaded.current = tag;
          if (framed.current !== site.id) framed.current = null;
        }
        v.resize();
        v.removeAllLabels();
        v.removeAllShapes();
        const resi = site.i + 1, seq = site.protein.seq;
        v.setStyle({}, { cartoon: { color: '#5d5d57', opacity: 0.8 } });
        for (const [j] of site.nbrs) {
          const a = seq[j], anchor = { resi: j + 1, atom: a === 'G' ? 'CA' : 'CB' };
          if (sideChains) {
            const elem = { prop: 'elem', map: { C: aaColor(a), N: '#7aa2ff', O: '#ff6b5e', S: '#f2c230' } };
            v.addStyle({ resi: j + 1 } as never, { stick: { colorscheme: elem, radius: 0.2 } } as never);
            v.setStyle({ resi: j + 1, atom: ['N', 'C', 'O'] } as never, { cartoon: { color: '#5d5d57', opacity: 0.8 } });   // side chain + Cα only
            if (a === 'G') v.addStyle(anchor as never, { sphere: { color: aaColor(a), radius: 0.5 } });
          } else {
            v.addStyle(anchor as never, { sphere: { color: aaColor(a), radius: 0.85 } });
          }
          v.addLabel(a, { fontSize: 11, fontColor: '#111', backgroundColor: aaColor(a), backgroundOpacity: 0.8, borderThickness: 0, inFront: true, alignment: 'center', showBackground: true } as never, anchor as never);
        }
        v.setStyle({ resi }, { cartoon: { color: '#f2c230' }, stick: { color: '#f2c230', radius: 0.28 } });
        v.addStyle({ resi, atom: 'CB' } as never, { sphere: { color: '#f2c230', radius: 1.0 } });
        v.addLabel(reveal ? site.aa : '?', { fontSize: 15, fontColor: '#111', backgroundColor: '#f2c230', backgroundOpacity: 0.95, borderThickness: 0, inFront: true, alignment: 'bottomCenter' } as never, { resi, atom: 'CB' } as never);
        if (framed.current !== site.id) {   // keep the user's rotation when only the label changes (reveal)
          v.zoomTo({ resi: [resi, ...site.nbrs.map(([j]) => j + 1)] } as never);
          v.zoom(1.15);
          framed.current = site.id;
        }
        v.render();
      } catch (e) { setErr(String(e)); }
    })();
    return () => { cancelled = true; };
  }, [site, reveal, sideChains]);

  return (
    <div className="structure-wrap">
      <div ref={div} style={{ width: '100%', height, position: 'relative' }} />
      {err && <div className="structure-error">{err}</div>}
      <div className="structure-hint">drag to rotate · scroll to zoom</div>
    </div>
  );
}
