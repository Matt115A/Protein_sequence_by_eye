import { useEffect, useState } from 'react';
import { loadIcons } from '../lib/dataset';
import { AA_INFO, FAMILIES, FAMILY_COLOR } from '../lib/types';

/**
 * Crop the RDKit drawings so they fill the keys, but with one shared scale: every icon gets a viewBox of the same size,
 * centred on its own drawing — so glycine still looks tiny next to tryptophan.
 */
function cropIcons(raw: Record<string, string>): Record<string, string> {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  document.body.appendChild(host);
  try {
    const boxes: Record<string, DOMRect> = {};
    for (const [a, svg] of Object.entries(raw)) {
      host.innerHTML = svg;
      const el = host.querySelector('svg');
      if (el) boxes[a] = el.getBBox();
    }
    const w = Math.max(...Object.values(boxes).map((b) => b.width)) + 6, h = Math.max(...Object.values(boxes).map((b) => b.height)) + 6;
    return Object.fromEntries(Object.entries(raw).map(([a, svg]) => {
      const b = boxes[a];
      if (!b) return [a, svg];
      const vb = `${(b.x + b.width / 2 - w / 2).toFixed(1)} ${(b.y + b.height / 2 - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
      return [a, svg.replace(/viewBox='[^']*'/, `viewBox='${vb}' preserveAspectRatio='xMidYMid meet'`)];
    }));
  } finally { host.remove(); }
}

let cropped: Promise<Record<string, string>> | null = null;
export function useIcons() {
  const [icons, setIcons] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let on = true;
    cropped ??= loadIcons().then(cropIcons);
    cropped.then((x) => on && setIcons(x)).catch(() => on && setIcons({}));
    return () => { on = false; };
  }, []);
  return icons;
}

export interface PickerReveal {
  truth: string;
  pick: string;
  /** main model probabilities (0–1) by letter, and an optional second model */
  main: Record<string, number> | null;
  second?: Record<string, number> | null;
}

/** Buttons must never keep focus: Space would then re-click them on the next trial. */
const noFocus = { tabIndex: -1, onMouseDown: (e: React.MouseEvent) => e.preventDefault() };
const fmt = (p: number) => (p >= 0.995 ? '99%' : p >= 0.095 ? `${Math.round(p * 100)}%` : p >= 0.0005 ? `${(p * 100).toFixed(1)}%` : '<0.1%');

/**
 * The 20 amino acids as structure drawings, grouped by family. Before answering: click one (or type its letter).
 * After: each key shows the model's probability, the real answer is ringed green and your pick yellow (or red if wrong).
 */
export function Picker({ onPick, reveal, labels }: { onPick?: (aa: string, stamp: number) => void; reveal?: PickerReveal | null; showKeys?: boolean; labels?: [string, string?] }) {
  const icons = useIcons();
  const max = reveal?.main ? Math.max(...Object.values(reveal.main)) : 1;
  return (
    <div className={`picker ${reveal ? 'revealed' : ''}`}>
      {FAMILIES.map((f) => (
        <div key={f.key} className="pk-family" style={{ ['--fam' as string]: FAMILY_COLOR[f.key] }}>
          <div className="pk-fam-label"><b>{f.label}</b> <span>{f.note}</span></div>
          <div className="pk-keys">
            {[...f.aas].map((a) => {
              const isTruth = reveal?.truth === a, isPick = reveal?.pick === a;
              const p = reveal?.main?.[a], p2 = reveal?.second?.[a];
              return (
                <button key={a} {...noFocus} disabled={!!reveal || !onPick}
                  className={`pk-key ${isTruth ? 'is-truth' : ''} ${isPick ? (isTruth ? 'is-pick ok' : 'is-pick no') : ''}`}
                  onClick={(e) => onPick?.(a, e.timeStamp)} title={`${AA_INFO[a].name} (${AA_INFO[a].three})`}>
                  <span className="pk-icon" dangerouslySetInnerHTML={{ __html: icons?.[a] ?? '' }} />
                  <span className="pk-letter">{a}</span>
                  <span className="pk-name">{AA_INFO[a].three}</span>
                  {reveal && p != null && (
                    <span className="pk-prob" title={`${labels?.[0] ?? 'model'}: ${fmt(p)}${p2 != null ? ` · ${labels?.[1]}: ${fmt(p2)}` : ''}`}>
                      <span className="pk-bar"><span style={{ height: `${Math.max(2, (p / max) * 100)}%` }} /></span>
                      <span className="pk-pct">{fmt(p)}</span>
                      {p2 != null && <span className="pk-pct2">{fmt(p2)}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
