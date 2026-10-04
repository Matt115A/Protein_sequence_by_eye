import { useMemo, useState } from 'react';
import { downloadCsv, downloadMetadata, downloadSessionJson } from '../lib/export';
import type { HistoryEntry } from '../lib/history';
import { type Dataset, MODE_INFO, type Session } from '../lib/types';
import { Analysis } from './Analysis';
import { ContributeCard } from '../components/ContributeCard';
import { buildContribution } from '../lib/bioai';
import { Replay } from './Replay';

export function Results({ session, data, onNew }: { session: Session; data: Dataset; history: HistoryEntry[]; onNew: () => void }) {
  const [tab, setTab] = useState<'analysis' | 'replay'>('analysis');
  const byId = useMemo(() => new Map(data.sites.map((v) => [v.id, v])), [data]);
  const missing = session.trials.some((t) => !byId.has(t.site_id));
  const m = session.meta;
  return (
    <div className="results">
      <div className="results-head">
        <div><h1>Results</h1><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>{new Date(m.start_time).toLocaleString()} · {MODE_INFO[m.config.mode].title} · {session.trials.length} sites{m.simulated && <span className="tag" style={{ marginLeft: 8 }}>simulated</span>}{!m.end_time && <span className="tag" style={{ marginLeft: 8 }}>incomplete</span>}</div></div>
        <div className="tabs">{(['analysis', 'replay'] as const).map((t) => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'analysis' ? 'Analysis' : 'Replay'}</button>)}</div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => downloadCsv(session)}>↓ Trials CSV</button>
          <button className="btn btn-sm" onClick={() => downloadMetadata(session)}>↓ Metadata JSON</button>
          <button className="btn btn-sm" onClick={() => downloadSessionJson(session)}>↓ Session JSON</button>
          <button className="btn btn-sm btn-primary" onClick={onNew}>Back to start</button>
        </div>
      </div>
      <ContributeCard sessionId={m.session_id} simulated={!!m.simulated} contribution={buildContribution(m.config.mode, String(m.app_version ?? ''), String(m.dataset_version ?? ''), ['learn', 'new'], session.trials.map((t) => ({ item: t.site_id, response: t.response, phase: t.phase, rt: t.rt_ms })))} />
      {missing ? <div className="card empty">This session used a different dataset version ({m.dataset_version}).</div>
        : tab === 'analysis' ? <Analysis session={session} data={data} byId={byId} /> : <Replay session={session} data={data} byId={byId} />}
    </div>
  );
}
