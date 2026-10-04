import { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import { loadStructure } from '../lib/dataset';
import { aaColor, type Site } from '../lib/types';

/**
 * Side-chain-free AlphaFold backbone (the served files contain only N, Cα, C, O and a virtual Cβ, every residue named ALA,
 * so nothing gives the answer away). The hidden residue is yellow; its 16 nearest neighbours are Cβ spheres coloured by
 * family and labelled with their amino acid. Drag to rotate, scroll/pinch to zoom.
 */
export function StructureViewer({ site, reveal, height = 380 }: { site: Site; reveal: boolean; height?: number }) {
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
        if (loaded.current !== site.protein.key) {
          const pdb = await loadStructure(site.protein.key);
          if (cancelled) return;
          v.removeAllModels();
          v.addModel(pdb, 'pdb');
          loaded.current = site.protein.key;
          framed.current = null;
        }
        v.resize();
        v.removeAllLabels();
        v.removeAllShapes();
        const resi = site.i + 1, seq = site.protein.seq;
        v.setStyle({}, { cartoon: { color: '#5d5d57', opacity: 0.85 } });
        for (const [j] of site.nbrs) {
          const a = seq[j];
          v.addStyle({ resi: j + 1, atom: 'CB' } as never, { sphere: { color: aaColor(a), radius: 0.85 } });
          v.addLabel(a, { fontSize: 11, fontColor: '#111', backgroundColor: aaColor(a), backgroundOpacity: 0.85, borderThickness: 0, inFront: true, alignment: 'center', showBackground: true } as never, { resi: j + 1, atom: 'CB' } as never);
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
  }, [site, reveal]);

  return (
    <div className="structure-wrap">
      <div ref={div} style={{ width: '100%', height, position: 'relative' }} />
      {err && <div className="structure-error">{err}</div>}
      <div className="structure-hint">drag to rotate · scroll to zoom</div>
    </div>
  );
}
