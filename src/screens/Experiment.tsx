import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveBoard } from '../components/LiveBoard';
import { Picker } from '../components/Picker';
import { BackbonePanel, NeighbourPanel, ProteinLine, SequenceWindow, StructurePanel } from '../components/TrialViews';
import { probsOf } from '../lib/dataset';
import { saveLocal } from '../lib/export';
import type { SessionCore } from '../lib/session';
import { AA_INFO, FAMILY_OF, MODE_INFO, type ModelInfo, type PhaseSpec, type Session, type Site, type TrialRecord } from '../lib/types';

type State = 'intro' | 'trial' | 'feedback' | 'paused';
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const isNarrow = () => typeof innerWidth !== 'undefined' && innerWidth <= 760;
const noFocus = { tabIndex: -1, onMouseDown: (e: React.MouseEvent) => e.preventDefault() };
const fmtClock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const LETTERS = new Set('ACDEFGHIKLMNPQRSTVWY');

/** What the feedback shows for each game: the main model (on the keys) and a second for comparison. */
export const FEEDBACK_MODELS = {
  seq: { main: 'esm650_w', second: 'esm650_f', labels: ['ESM2 650M · same window', 'ESM2 650M · whole protein'] as [string, string] },
  struct: { main: 'mpnn', second: 'mpnn_bb', labels: ['ProteinMPNN · backbone + neighbours', 'ProteinMPNN · backbone only'] as [string, string] },
};

export function Experiment({ core, aa, models, onEnd }: { core: SessionCore; aa: string; models: ModelInfo[]; onEnd: (s: Session) => void }) {
  const mode = core.config.mode;
  const [state, setState] = useState<State>(core.phase?.intro ? 'intro' : 'trial');
  const [site, setSite] = useState<Site | null>(() => core.nextStimulus());
  const [last, setLast] = useState<TrialRecord | null>(null);
  const [phase, setPhase] = useState<PhaseSpec | null>(core.phase);
  const [clock, setClock] = useState(0);
  const onset = useRef<{ perf: number; wall: Date; elapsed: number } | null>(null);
  const active = useRef({ accum: 0, since: performance.now(), pausedAccum: 0, pauseSince: 0 });
  const prevState = useRef<State>('trial');
  const ended = useRef(false);
  const seen = useRef<Site[]>([]);
  const [touch] = useState(isTouch);
  const [narrow, setNarrow] = useState(isNarrow);
  useEffect(() => { const h = () => setNarrow(isNarrow()); addEventListener('resize', h); return () => removeEventListener('resize', h); }, []);

  const stateRef = useRef(state); stateRef.current = state;
  const activeMs = () => active.current.accum + (stateRef.current === 'paused' ? 0 : performance.now() - active.current.since);

  const end = useCallback((reason: string) => {
    if (ended.current) return;
    ended.current = true;
    const a = active.current;
    const s = core.finish(reason, a.accum + (state === 'paused' ? 0 : performance.now() - a.since), a.pausedAccum + (state === 'paused' ? performance.now() - a.pauseSince : 0));
    saveLocal(s); onEnd(s);
  }, [core, onEnd, state]);

  useEffect(() => {
    if (state !== 'trial' || !site) return;
    onset.current = null;
    const id = requestAnimationFrame(() => (onset.current = { perf: performance.now(), wall: new Date(), elapsed: activeMs() }));
    return () => cancelAnimationFrame(id);
  }, [state, site]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const id = setInterval(() => setClock(activeMs()), 500); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    const reason = core.endReason(activeMs());
    if (reason) return end(reason);
    const s = core.nextStimulus();
    if (!s) return end('pool_exhausted');
    setSite(s);
    scrollTo({ top: 0 });
    const ph = core.phase;
    if (ph && ph !== phase) { setPhase(ph); setState(ph.intro ? 'intro' : 'trial'); }
    else setState('trial');
  }, [core, phase, end]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePause = useCallback(() => {
    if (state === 'paused') { active.current.pausedAccum += performance.now() - active.current.pauseSince; active.current.since = performance.now(); setState(prevState.current); }
    else { active.current.accum += performance.now() - active.current.since; active.current.pauseSince = performance.now(); prevState.current = state; setState('paused'); }
  }, [state]);

  const respond = useCallback((letter: string, input: string, stamp: number) => {
    if (state !== 'trial' || !site || !onset.current) return;
    const now = performance.now(), on = onset.current;
    const resp = stamp > on.perf && stamp <= now + 1 ? stamp : now;
    const { trial, next, finished } = core.record({ site, response: letter, input, rtMs: resp - on.perf, onsetPerf: on.perf, responsePerf: resp, wallOnset: on.wall, elapsedMs: on.elapsed });
    seen.current.push(site);
    setLast(trial);
    if (next || trial.trial % 5 === 0) saveLocal(core.snapshot());
    if (finished && phase?.feedback === 'none') return end('protocol_complete');
    if (phase?.feedback === 'none') advance();
    else setState('feedback');
  }, [state, site, core, phase, advance, end]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
      if (state === 'intro' && e.code === 'Space') { e.preventDefault(); setState('trial'); return; }
      if (state === 'feedback' && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); advance(); return; }
      if (state !== 'trial' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (!LETTERS.has(k)) return;
      e.preventDefault();
      respond(k, 'key', e.timeStamp);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state, advance, togglePause, respond]);

  const fm = FEEDBACK_MODELS[mode];
  const revealed = state === 'feedback' && last && site;
  const reveal = revealed ? { truth: site.aa, pick: last.response, main: probsOf(site, fm.main, aa), second: probsOf(site, fm.second, aa) } : null;
  return (
    <div className={`exp-m mode-${mode}`}>
      <div className="hud-p">
        <span><span className="muted">{MODE_INFO[mode].short}</span> <b>{phase?.label ?? '—'}</b></span>
        <span><span className="muted">Trial</span> <b>{core.trials.length + (state === 'feedback' ? 0 : 1)}</b></span>
        <span><span className="muted">Time</span> <b>{fmtClock(clock)}</b></span>
        {touch ? <button className="btn btn-sm hud-pause" {...noFocus} onClick={togglePause}>Pause</button> : <span className="muted hud-esc">Esc to pause or stop · progress is saved</span>}
        <LiveBoard seen={seen.current} correct={core.trials.map((t) => t.correct)} models={models} window={20} storageKey={`mask.rival.${mode}`} fallback={MODE_INFO[mode].rival} />
      </div>
      {site && (
        <>
          <div className="q-card">
            <ProteinLine site={site} reveal={!!revealed} />
            <SequenceWindow site={site} reveal={!!revealed} big={mode === 'seq'} />
            {!revealed && <div className="q-prompt">Which amino acid is hidden? <span className="muted">{touch ? 'Tap one below.' : 'Click one below or type its letter.'}</span></div>}
            {revealed && <Feedback site={site} t={last} aa={aa} mode={mode} onNext={advance} touch={touch} />}
          </div>
          {mode === 'struct' && (
            <div className="panels-s">
              <StructurePanel site={site} reveal={!!revealed} height={narrow ? 300 : 400} mode={mode} />
              <div className="panels-s-side"><BackbonePanel site={site} /><NeighbourPanel site={site} /></div>
            </div>
          )}
          <Picker onPick={(a, stamp) => respond(a, 'tap', stamp)} reveal={reveal} showKeys={!touch} labels={fm.labels} />
          {reveal && <div className="pk-legend muted">Numbers on the keys: <b>{fm.labels[0]}</b>'s probability for each amino acid · smaller: {fm.labels[1]}. Green ring = real answer.</div>}
        </>
      )}
      {state === 'intro' && phase && (
        <div className="overlay"><div className="intro">{phase.intro.split('\n').map((l, i) => (i ? <p key={i}>{l}</p> : <h2 key={i}>{l}</h2>))}
          <p className="hint">{touch ? null : <span className="pulse">Press <kbd>Space</kbd> or </span>}<button className="btn btn-primary" {...noFocus} onClick={() => setState('trial')}>Begin</button></p></div></div>
      )}
      {state === 'paused' && (
        <div className="overlay"><div className="intro"><h2>Paused</h2><p>The timer is stopped.</p>
          <p className="save-note"><b>Need to go?</b> Stop &amp; save keeps your {core.trials.length} answer{core.trials.length === 1 ? '' : 's'} in this browser and shows your results so far. They stay under <b>Your attempts</b>, and next time you start a new run with sites you haven't seen.</p>
          <div className="row" style={{ justifyContent: 'center' }}><button className="btn btn-primary" {...noFocus} onClick={togglePause}>Resume{touch ? '' : ' (Esc)'}</button><button className="btn" onClick={() => end('ended_by_user')}>Stop &amp; save · see results</button></div></div></div>
      )}
    </div>
  );
}

const pct = (p: number) => (p >= 0.095 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`);

function Feedback({ site, t, aa, mode, onNext, touch }: { site: Site; t: TrialRecord; aa: string; mode: 'seq' | 'struct'; onNext: () => void; touch: boolean }) {
  const fm = FEEDBACK_MODELS[mode];
  const lines = ([fm.main, fm.second] as const).map((m, k) => {
    const p = probsOf(site, m, aa)!;
    const top = Object.entries(p).sort((a, b) => b[1] - a[1]);
    return { label: fm.labels[k], top: top[0], truthP: p[site.aa], rank: top.findIndex(([a]) => a === site.aa) + 1, right: top[0][0] === site.aa };
  });
  const fam = FAMILY_OF[site.aa] === FAMILY_OF[t.response];
  return (
    <div className={`feedback-m ${t.correct ? 'ok' : fam ? 'fam' : 'no'}`}>
      <div className="fb-verdict">
        {t.correct ? `✓ Correct — ${AA_INFO[site.aa].name}` : fam ? `≈ Right family — it was ${AA_INFO[site.aa].name} (${site.aa})` : `✗ It was ${AA_INFO[site.aa].name} (${site.aa})`}
        {!t.correct && <span className="muted"> · you picked {AA_INFO[t.response].name}</span>}
      </div>
      <div className="fb-models">
        {lines.map((l) => (
          <div key={l.label} className={l.right ? 'good' : ''}>
            <span className="muted">{l.label}:</span> guessed <b>{l.top[0]}</b> ({pct(l.top[1])}) · real answer {pct(l.truthP)}, #{l.rank} of 20 {l.right ? '✓' : ''}
          </div>
        ))}
      </div>
      <div className="fb-foot">
        <span className="muted">{touch ? '' : <>Press <kbd>Space</kbd> for the next one</>}</span>
        <button className="btn btn-primary fb-btn" {...noFocus} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
