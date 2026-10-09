import { useRef, useState } from 'react';
import { loadLocal } from '../lib/export';
import { clearAllAttempts, type HistoryEntry, loadArchived, removeFromHistory } from '../lib/history';
import { type Config, type Dataset, defaultConfig, MODE_INFO, type Mode, type Session } from '../lib/types';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function Setup({ data, initial, history, debug, onStart, onSimulate, onOpenSession, onHistoryChange }: {
  data: Dataset; initial: Config; history: HistoryEntry[]; debug: boolean; onStart: (c: Config) => void; onSimulate: (c: Config) => void; onOpenSession: (s: Session) => void; onHistoryChange: (h: HistoryEntry[]) => void;
}) {
  const [c, setC] = useState<Config>(initial);
  const [last, setLast] = useState(() => loadLocal());
  const fileRef = useRef<HTMLInputElement>(null);
  const total = c.phases.reduce((a, p) => a + p.trials, 0);
  const seenIds = new Set(history.flatMap((h) => h.window_ids));
  const loadFile = async (f: File) => { try { const s = JSON.parse(await f.text()) as Session; if (!s.meta || !Array.isArray(s.trials)) throw 0; onOpenSession(s); } catch { alert('Not a session JSON.'); } };
  const setMode = (m: Mode) => setC(defaultConfig(m));
  return (
    <div className="screen">
      <div className="setup" style={{ width: 'min(980px, 100%)' }}>
        <a className="bioai-link" href="https://matt115a.github.io/BioAI_by_eye/">PART OF BIOAI BY EYE →</a>
        <h1 className="title">Fill the mask</h1>
        <p className="subtitle">Learn to predict a hidden amino acid the way protein AI models are trained; then race ESM2 and ProteinMPNN on the same sites.</p>
        <div className="mode-cards">
          {(['seq', 'struct'] as Mode[]).map((m) => (
            <button key={m} className={`mode-card ${c.mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              <div className="mode-title">{MODE_INFO[m].title}</div>
              <div className="mode-like">{MODE_INFO[m].like}</div>
              <div className="mode-desc">{MODE_INFO[m].description}</div>
              <div className="mode-demo">{m === 'seq' ? <span className="demo-seq">…K L V E A <b>?</b> G Q R L D…</span> : <span className="demo-seq">backbone · 3D neighbours · window</span>}</div>
            </button>
          ))}
        </div>
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="card-title">How it works</h3>
          <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            Protein AI models can learn by filling in blanks. <b>ESM2</b> hides ~15% of the amino acids in millions of natural sequences and learns to predict them
            from the rest. <b>ProteinMPNN</b> learns the reverse of folding: given a backbone structure (no side chains) and the identities of nearby residues,
            predict each residue. Here you do the same task, on {data.sites.length.toLocaleString()} sites in {data.proteins.length} real proteins (AlphaFold structures),
            with the same feedback a model gets: the right answer. After each guess you'll see the model's probabilities for all 20 amino acids. Pick by clicking a
            structure, or type its one-letter code. A live leaderboard lets you race a model as you go. Chance is 5%; always guessing the commonest amino acid (leucine) gets about 10%.
          </p>
        </div>
        <Attempts history={history} last={last} total={data.sites.length} onOpen={onOpenSession} onChange={(h) => { onHistoryChange(h); setLast(loadLocal()); }} />
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><div><h3 className="card-title">{MODE_INFO[c.mode].title}: the session</h3><p className="card-sub">Learn on {data.proteins.filter((p) => p.group === 'learn').length} proteins, then test on {data.proteins.filter((p) => p.group === 'new').length} you haven't seen.</p></div></div>
          <div className="table-scroll"><table className="data"><thead><tr><th>Part</th><th className="num">Sites</th><th>After each guess</th></tr></thead>
            <tbody>{c.phases.map((p, i) => <tr key={p.name}><td>{i + 1}. {p.label}</td><td className="num">{debug ? <input type="number" style={{ width: 70 }} value={p.trials} onChange={(e) => setC({ ...c, phases: c.phases.map((q, j) => (j === i ? { ...q, trials: Number(e.target.value) } : q)) })} /> : p.trials}</td><td className="muted">real answer + model probabilities</td></tr>)}</tbody></table></div>
          <p className="note" style={{ marginTop: 8 }}>{total} sites · self-paced (roughly {c.mode === 'seq' ? '15–25' : '20–35'} min). {seenIds.size ? `${seenIds.size} sites from earlier attempts won't be repeated.` : ''}</p>
        </div>
        {debug && <div className="debug-panel"><h4>DEBUG</h4><button className="btn btn-sm" onClick={() => onSimulate(c)}>Simulate full session</button></div>}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <button className="btn btn-primary" onClick={() => onStart(c)} style={{ padding: '12px 26px', fontSize: 16 }}>Start {MODE_INFO[c.mode].short.toLowerCase()} game</button>
          <div className="row">
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>Open session file…</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </div>
        </div>
        <p className="save-note">
          <b>You don't have to finish in one sitting.</b> Pause at any point (<kbd>Esc</kbd>, or the Pause button on a phone) and choose <b>Stop &amp; save</b>, or just close the tab;
          your answers are saved in this browser every few sites. When you come back they're listed under <b>Your attempts</b>, and your next run carries on with sites you haven't seen yet.
        </p>
        <p className="note" style={{ marginTop: 22 }}>
          Data: AlphaFold2 structures from <a href="https://proteingym.org" target="_blank" rel="noreferrer">ProteinGym</a> (originally <a href="https://alphafold.ebi.ac.uk" target="_blank" rel="noreferrer">AlphaFold DB</a>, CC BY 4.0).
          Models: <a href="https://github.com/facebookresearch/esm" target="_blank" rel="noreferrer">ESM2</a> (Lin et al. 2023) and <a href="https://github.com/dauparas/ProteinMPNN" target="_blank" rel="noreferrer">ProteinMPNN</a> (Dauparas et al. 2022), run on every site in advance. Source and method: <a href="https://github.com/Matt115A/Protein_sequence_by_eye" target="_blank" rel="noreferrer">github.com/Matt115A/Protein_sequence_by_eye</a>.
        </p>
      </div>
    </div>
  );
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Past attempts on this device: re-open, remove one, or clear everything and start fresh. Always visible, so people know where it is. */
function Attempts({ history, last, total, onOpen, onChange }: { history: HistoryEntry[]; last: Session | null; total: number; onOpen: (s: Session) => void; onChange: (h: HistoryEntry[]) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const seen = new Set(history.flatMap((h) => h.window_ids)).size;
  const sessionFor = (id: string) => loadArchived(id) ?? (last?.meta.session_id === id ? last : null);
  return (
    <div className="card attempts" style={{ marginBottom: 18 }}>
      <div className="card-head"><div>
        <h3 className="card-title">Your attempts</h3>
        <p className="card-sub">{history.length
          ? <>{history.length} on this device · {seen.toLocaleString()} of {total.toLocaleString()} sites seen. New runs skip sites you've already seen; clear your attempts to start from scratch.</>
          : cleared ? <span className="attempts-cleared">✓ Cleared. Every site is available again.</span> : <>No attempts yet. Your runs on this device appear here, including ones you stop partway, so you can re-open their analysis or start fresh.</>}</p>
      </div></div>
      {history.length > 0 && (
        <>
          <div className="table-scroll"><table className="data">
            <thead><tr><th>#</th><th>When</th><th>Game</th><th className="num">Sites</th><th className="num">Accuracy</th><th className="num">Right family</th><th /></tr></thead>
            <tbody>{history.slice().reverse().map((h, i) => {
              const s = sessionFor(h.session_id);
              return (
                <tr key={h.session_id}>
                  <td className="muted">{history.length - i}</td><td>{fmtWhen(h.start_time)}</td><td>{MODE_INFO[h.mode]?.short ?? '—'}</td><td className="num">{h.n_trials}</td><td className="num"><b>{pct(h.final.acc)}</b></td><td className="num muted">{pct(h.final.fam)}</td>
                  <td className="attempt-actions">{confirm === h.session_id ? (
                    <><span className="muted">Remove this attempt?</span><button className="btn btn-sm" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-sm btn-danger" onClick={() => { setConfirm(null); onChange(removeFromHistory(h.session_id)); }}>Remove</button></>
                  ) : (
                    <>{s && <button className="btn btn-sm" onClick={() => onOpen(s)}>Open</button>}<button className="btn btn-sm btn-ghost" onClick={() => setConfirm(h.session_id)}>Remove</button></>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div className="attempts-foot">
            {confirm === 'all' ? (
              <div className="confirm-all">
                <span>Delete {history.length === 1 ? 'your attempt' : `all ${history.length} attempts`} from this browser? Download any session you want to keep first (Open → Session JSON). This can't be undone.</span>
                <div className="row"><button className="btn btn-sm" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-sm btn-danger" onClick={() => { setConfirm(null); setCleared(true); onChange(clearAllAttempts()); }}>Clear all</button></div>
              </div>
            ) : <button className="btn btn-sm btn-ghost" onClick={() => setConfirm('all')}>Clear all &amp; start fresh</button>}
          </div>
        </>
      )}
    </div>
  );
}
