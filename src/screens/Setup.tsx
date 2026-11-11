import { useState } from 'react';
import { loadLocal } from '../lib/export';
import { LevelToggle, useLevel } from '../lib/level';
import { clearAllAttempts, type HistoryEntry, loadArchived, removeFromHistory } from '../lib/history';
import { type Config, type Dataset, defaultConfig, FAMILIES, FAMILY_COLOR, FAMILY_CREDIT, MODE_INFO, type Mode, type Session } from '../lib/types';

const EXPERT_MODE: Record<Mode, string> = {
  seq: 'Masked-token prediction from an 11-residue window (10 flanking residues). Compared with ESM2 8M to 650M on the same window and on the full sequence with only the site masked. Good luck!',
  struct: 'Inverse folding: the masked residue as backbone plus virtual Cβ, its 16 nearest neighbours with side chains (toggleable), and the local sequence. Compared with ProteinMPNN decoding the site last and first. This is marginally easier than the sequence game.',
};

const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`);

export function Setup({ data, initial, history, debug, onStart, onSimulate, onOpenSession, onHistoryChange }: {
  data: Dataset; initial: Config; history: HistoryEntry[]; debug: boolean; onStart: (c: Config) => void; onSimulate: (c: Config) => void; onOpenSession: (s: Session) => void; onHistoryChange: (h: HistoryEntry[]) => void;
}) {
  const [c, setC] = useState<Config>(initial);
  const [level, setLevel] = useLevel();
  const [last, setLast] = useState(() => loadLocal());
  const setMode = (m: Mode) => setC(defaultConfig(m));
  return (
    <div className="screen">
      <div className="setup" style={{ width: 'min(980px, 100%)' }}>
        <div className="setup-top"><a className="bioai-link" href="https://matt115a.github.io/BioAI_by_eye/">PART OF BIOAI BY EYE →</a><LevelToggle level={level} onChange={setLevel} /></div>
        <h1 className="title">Build a protein</h1>
        <p className="subtitle">{level === 'learner' ? 'Learn to predict a hidden amino acid the way protein AI models are trained, then race ESM2 and ProteinMPNN on the same sites.'
          : '20-way masked residue prediction on AlphaFold2 models · scored against ESM2 (8M to 650M) and ProteinMPNN on identical sites.'}</p>
        <div className="mode-cards">
          {(['seq', 'struct'] as Mode[]).map((m) => (
            <button key={m} className={`mode-card ${c.mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              <div className="mode-title">{MODE_INFO[m].title}</div>
              <div className="mode-like">{MODE_INFO[m].like}</div>
              <div className="mode-desc">{level === 'learner' ? MODE_INFO[m].description : EXPERT_MODE[m]}</div>
              <div className="mode-demo">{m === 'seq' ? <span className="demo-seq">…K L V E A <b>?</b> G Q R L D…</span> : <span className="demo-seq">backbone and 3D neighbours</span>}</div>
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => onStart(c)} style={{ padding: '12px 34px', fontSize: 16, margin: '0 0 22px' }}>Start {MODE_INFO[c.mode].short.toLowerCase()} game</button>
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="card-title">How it works</h3>
          {level === 'learner' ? (
            <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Protein AI models can learn by filling in blanks. <b>ESM2</b> hides ~15% of the amino acids in millions of natural sequences and learns to predict them
              from the ones it can see. <b>ProteinMPNN</b> learns the reverse of folding: given a backbone structure (no side chains) and the identities of nearby residues,
              predict each residue. Here you do the same tasks! After each guess you'll see the model's guess for all 20 amino acids. A live leaderboard
              lets you race a model as you go. Chance is 5%; always guessing the commonest amino acid (leucine) gets about 10% (leucine is over-represented).
            </p>
          ) : (
            <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              {data.sites.length.toLocaleString()} sites in {data.proteins.length} proteins (AlphaFold2 models distributed with ProteinGym v1.3; mean pLDDT ≥ 85, site pLDDT ≥ 80).
              Competitors: ESM2 masked-token probabilities (8M, 35M, 150M, 650M), run on exactly what you see and separately on
              the whole sequence with only the site masked; ProteinMPNN v_48_020 with no backbone noise, decoding the site last (backbone plus all other residues, how
              it scores a residue) and first (backbone only). After each guess you see the true residue and the reference model's full distribution.
              Baselines: always leucine (about 10%), plus logistic regression on the window and gradient boosting on the structure cues, both
              trained on ~27k sites from ProteinGym structures not used here. Chance is 5% (about 8% in the structure game, with family credit).
            </p>
          )}
        </div>
        {c.mode === 'struct' && (
          <div className="card scoring-card" style={{ marginBottom: 18 }}>
            <h3 className="card-title">How points work in the structure game</h3>
            <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              {level === 'learner'
                ? 'The correct amino acid scores 1 point. The wrong amino acid from the right family scores partial credit, and rarer families are worth more (always picking the most common kind of amino acid does not pay). The AI models are scored the same way.'
                : 'Exact match: 1. Same family: 0.5 × (share of the rarest family / share of this family) over the 2,520 sites, so a blind pick from any family has the same expected bonus (about 0.04). Models are scored on their top-1 pick under the same rule.'}
            </p>
            <div className="credit-chips"><span className="credit-chip exact">exact amino acid <b>1</b></span>
              {FAMILIES.map((f) => <span key={f.key} className="credit-chip" style={{ borderColor: FAMILY_COLOR[f.key] }}><span style={{ color: FAMILY_COLOR[f.key] }}>{f.label}</span> family <b>{FAMILY_CREDIT[f.key]}</b></span>)}</div>
          </div>
        )}
        <Attempts history={history} last={last} total={data.sites.length} onOpen={onOpenSession} onChange={(h) => { onHistoryChange(h); setLast(loadLocal()); }} />
        {debug && <div className="debug-panel"><h4>DEBUG</h4><button className="btn btn-sm" onClick={() => onSimulate(c)}>Simulate full session</button></div>}
        <p className="save-note" style={{ margin: '14px auto 0' }}>
          <b>You don't have to finish in one sitting.</b> Pause at any point (<kbd>Esc</kbd>, or the Pause button on a phone) and choose <b>Stop &amp; save</b>, or just close the tab;
          your answers are saved in this browser every few sites. When you come back they're listed under <b>Your attempts</b>, and your next run carries on with sites you haven't seen yet.
        </p>
        <button className="btn btn-primary" onClick={() => onStart(c)} style={{ display: 'block', width: '100%', padding: '14px 26px', fontSize: 17, marginTop: 22 }}>Start {MODE_INFO[c.mode].short.toLowerCase()} game</button>
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
          : cleared ? <span className="attempts-cleared">✓ Cleared. Every site is available again.</span> : <>No attempts yet. Your runs on this device appear here, including ones you stop partway, so you can re-open their analysis, delete them to start fresh, or (default) pick up where you left off.</>}</p>
      </div></div>
      {history.length > 0 && (
        <>
          <div className="table-scroll"><table className="data">
            <thead><tr><th>#</th><th>When</th><th>Game</th><th className="num">Sites</th><th className="num">Score</th><th className="num">Right family</th><th /></tr></thead>
            <tbody>{history.slice().reverse().map((h, i) => {
              const s = sessionFor(h.session_id);
              return (
                <tr key={h.session_id}>
                  <td className="muted">{history.length - i}</td><td>{fmtWhen(h.start_time)}</td><td>{MODE_INFO[h.mode]?.short ?? '–'}</td><td className="num">{h.n_trials}</td><td className="num"><b>{pct(h.final.acc)}</b></td><td className="num muted">{pct(h.final.fam)}</td>
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
