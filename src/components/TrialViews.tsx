import { aaColor, AA_INFO, type Mode, type Site, SS_TEXT } from '../lib/types';
import { StructureViewer } from './StructureViewer';

/** The 11-residue window: 5 context, the hidden residue, 5 context (the hidden one is filled in after you answer). */
export function SequenceWindow({ site, reveal, big }: { site: Site; reveal: boolean; big?: boolean }) {
  const L = site.protein.seq.length;
  return (
    <div className={`seqwin ${big ? 'big' : ''}`}>
      <span className="seq-ellipsis" title={`${site.i - 5} more residues before`}>…</span>
      {[...site.w].map((a, k) => {
        const centre = k === 5;
        const show = !centre || reveal;
        return (
          <span key={k} className={`seq-tile ${centre ? 'centre' : ''} ${centre && reveal ? 'revealed' : ''}`} style={show ? { borderColor: aaColor(a), color: aaColor(a) } : undefined}>
            <b>{show ? a : '?'}</b>
            <small>{centre ? (reveal ? AA_INFO[a].three : 'mask') : k - 5 > 0 ? `+${k - 5}` : k - 5}</small>
          </span>
        );
      })}
      <span className="seq-ellipsis" title={`${L - site.i - 6} more residues after`}>…</span>
    </div>
  );
}

export function ProteinLine({ site, reveal }: { site: Site; reveal: boolean }) {
  return reveal
    ? <div className="protein-line">Residue <b>{site.i + 1}</b> of {site.protein.seq.length} in <b>{site.protein.name}</b> <span className="muted">· {site.protein.organism}</span></div>
    : <div className="protein-line muted">From inside a real protein (which one is revealed after you answer)</div>;
}

/** φ/ψ on a mini Ramachandran plot, secondary structure, and burial — the backbone facts ProteinMPNN gets. */
export function BackbonePanel({ site }: { site: Site }) {
  const S = 120, X = (phi: number) => ((phi + 180) / 360) * S, Y = (psi: number) => ((180 - psi) / 360) * S;
  const bur = site.nbr >= 22 ? 'buried' : site.nbr >= 14 ? 'partly buried' : 'exposed';
  return (
    <section className="panel">
      <h4>Backbone</h4>
      <div className="bb-row">
        <svg width={S} height={S} className="rama" aria-label="Ramachandran plot">
          <rect x={0} y={0} width={S} height={S} fill="#1c1c1a" />
          <ellipse cx={X(-63)} cy={Y(-43)} rx={16} ry={14} fill="rgba(201,133,0,.28)" /><text x={X(-63)} y={Y(-43) + 28} textAnchor="middle" className="rama-t">α</text>
          <ellipse cx={X(-120)} cy={Y(135)} rx={26} ry={16} fill="rgba(57,135,229,.25)" /><text x={X(-120)} y={Y(135) - 20} textAnchor="middle" className="rama-t">β</text>
          <ellipse cx={X(60)} cy={Y(45)} rx={13} ry={13} fill="rgba(154,154,144,.28)" /><text x={X(60)} y={Y(45) + 26} textAnchor="middle" className="rama-t">αL</text>
          <line x1={S / 2} x2={S / 2} y1={0} y2={S} stroke="#333" /><line x1={0} x2={S} y1={S / 2} y2={S / 2} stroke="#333" />
          {site.phi != null && site.psi != null && <circle cx={X(site.phi)} cy={Y(site.psi)} r={5} fill="#f2c230" stroke="#111" strokeWidth={1.5} />}
          <text x={3} y={S - 3} className="rama-t">φ →</text><text x={3} y={11} className="rama-t">ψ</text>
        </svg>
        <div className="bb-facts">
          <div><span className="muted">Shape</span><b>{SS_TEXT[site.ss]}</b></div>
          <div><span className="muted">φ, ψ</span><b>{site.phi ?? '—'}°, {site.psi ?? '—'}°</b></div>
          <div><span className="muted">Neighbours within 10 Å</span><b>{site.nbr}</b> <span className="muted">{bur}</span></div>
          <div className="bur-track"><span style={{ width: `${Math.min(100, (site.nbr / 32) * 100)}%` }} /></div>
        </div>
      </div>
    </section>
  );
}

/** The 16 nearest residues in 3D (by Cβ): which amino acid, how far, and how far along the chain. */
export function NeighbourPanel({ site }: { site: Site }) {
  const seq = site.protein.seq;
  return (
    <section className="panel">
      <h4>3D neighbours <span className="muted">(nearest 16 by Cβ)</span></h4>
      <div className="nbr-list">
        {site.nbrs.map(([j, d]) => {
          const a = seq[j], off = j - site.i;
          return (
            <div key={j} className="nbr-row" title={`${AA_INFO[a].name} ${j + 1}: ${d} Å away, ${Math.abs(off)} residues ${off > 0 ? 'later' : 'earlier'} in the chain`}>
              <span className="nbr-aa" style={{ color: aaColor(a), borderColor: aaColor(a) }}>{a}</span>
              <span className="nbr-bar"><span style={{ width: `${Math.max(4, ((12 - Math.min(12, d)) / 9) * 100)}%`, background: aaColor(a) }} /></span>
              <span className="nbr-d">{d.toFixed(1)} Å</span>
              <span className={`nbr-off ${Math.abs(off) <= 5 ? 'local' : ''}`}>{off > 0 ? `+${off}` : off}</span>
            </div>
          );
        })}
      </div>
      <div className="muted nbr-note">Offset = position along the chain relative to the hidden residue; highlighted when it's in the sequence window.</div>
    </section>
  );
}

export function StructurePanel({ site, reveal, height, mode }: { site: Site; reveal: boolean; height?: number; mode: Mode }) {
  return (
    <section className="panel">
      <h4>Backbone structure <span className="muted">(no side chains — what ProteinMPNN sees)</span></h4>
      <StructureViewer site={site} reveal={reveal} height={height} key={mode} />
    </section>
  );
}
