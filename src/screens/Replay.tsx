import { useState } from 'react';
import { Picker } from '../components/Picker';
import { BackbonePanel, NeighbourPanel, ProteinLine, SequenceWindow, StructurePanel } from '../components/TrialViews';
import { probsOf } from '../lib/dataset';
import { AA_INFO, type Dataset, type Session, type Site } from '../lib/types';
import { FEEDBACK_MODELS } from './Experiment';

export function Replay({ session, data, byId }: { session: Session; data: Dataset; byId: Map<number, Site> }) {
  const [k, setK] = useState(0);
  const mode = session.meta.config.mode, fm = FEEDBACK_MODELS[mode];
  const t = session.trials[k], site = t && byId.get(t.site_id);
  if (!t || !site) return <div className="card empty">No trials.</div>;
  return (
    <div className="replay-m">
      <div className="card scrub-card">
        <div className="scrub">
          <button className="btn btn-sm" onClick={() => setK(Math.max(0, k - 1))} disabled={k === 0}>←</button>
          <input type="range" min={0} max={session.trials.length - 1} value={k} onChange={(e) => setK(Number(e.target.value))} />
          <button className="btn btn-sm" onClick={() => setK(Math.min(session.trials.length - 1, k + 1))} disabled={k === session.trials.length - 1}>→</button>
          <span className="muted">Site {k + 1} of {session.trials.length}</span>
          <span className={`badge ${t.correct ? 'badge-good' : 'badge-bad'}`}>You: {AA_INFO[t.response].name} {t.correct ? '✓' : t.same_family ? '≈ family' : '✗'}</span>
        </div>
      </div>
      <div className="q-card"><ProteinLine site={site} reveal /><SequenceWindow site={site} reveal big={mode === 'seq'} /></div>
      {mode === 'struct' && (
        <div className="panels-s">
          <StructurePanel site={site} reveal height={380} mode={mode} />
          <div className="panels-s-side"><BackbonePanel site={site} /><NeighbourPanel site={site} /></div>
        </div>
      )}
      <Picker reveal={{ truth: site.aa, pick: t.response, main: probsOf(site, fm.main, data.aa), second: probsOf(site, fm.second, data.aa) }} showKeys={false} labels={fm.labels} />
      <div className="pk-legend muted">Numbers on the keys: <b>{fm.labels[0]}</b> · smaller: {fm.labels[1]}.</div>
    </div>
  );
}
