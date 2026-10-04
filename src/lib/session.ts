import { freshSeed, makeRng, type Rng, shuffle } from './rng';
import { type Config, type Dataset, FAMILY_OF, type Mode, type PhaseSpec, type PriorExperience, type Session, type SessionMeta, type Site, type TrialRecord } from './types';

export const APP_VERSION = '1.0.0';

export interface ResponseInput { site: Site; response: string; input: string; rtMs: number; onsetPerf: number; responsePerf: number; wallOnset: Date; elapsedMs: number }

/** Residues a trial shows the player: the sequence window, plus the spatial neighbours in the structure game. */
export function revealedBy(site: Site, mode: Mode): number[] {
  const out: number[] = [];
  for (let d = -5; d <= 5; d++) if (d) out.push(site.i + d);
  if (mode === 'struct') for (const [j] of site.nbrs) out.push(j);
  return out;
}

/**
 * Game rules, no DOM. Parts run in order; each rotates through its protein group (shuffled round-robin) and draws a random
 * unused site from that protein. A site is never one whose residue an earlier trial already showed as context (so you never
 * get a residue you've already seen), and never one from an earlier session.
 */
export class SessionCore {
  readonly config: Config;
  readonly meta: SessionMeta;
  readonly trials: TrialRecord[] = [];
  phaseIdx = 0;
  private inPhase = 0;
  private rng: Rng;
  private pools = new Map<string, Site[]>();          // protein key → shuffled remaining sites
  private order = new Map<string, string[]>();        // group → shuffled protein keys
  private rot = new Map<string, number>();
  private revealed = new Set<string>();               // `${protein}:${index}` shown to the player so far

  constructor(config: Config, data: Dataset, opts: { seed?: number; simulated?: boolean; startTime?: Date; exclude?: Set<number>; prior?: PriorExperience } = {}) {
    this.config = structuredClone(config);
    const seed = opts.seed ?? freshSeed();
    this.rng = makeRng(seed);
    const ex = config.excludeSeen ? opts.exclude ?? new Set<number>() : new Set<number>();
    for (const s of shuffle(data.sites.filter((x) => !ex.has(x.id)), this.rng)) {
      if (!this.pools.has(s.protein.key)) this.pools.set(s.protein.key, []);
      this.pools.get(s.protein.key)!.push(s);
    }
    for (const p of data.proteins) {
      if (!this.order.has(p.group)) this.order.set(p.group, []);
      this.order.get(p.group)!.push(p.key);
    }
    for (const [g, keys] of this.order) this.order.set(g, shuffle(keys, this.rng));
    const start = opts.startTime ?? new Date();
    this.meta = {
      app: 'masked-residue', app_version: APP_VERSION, session_id: `${config.mode}_${start.toISOString().replace(/[:.]/g, '-')}_${seed.toString(16)}`,
      seed, simulated: !!opts.simulated, config: this.config, dataset_version: data.version,
      phase_starts: { [config.phases[0].name]: 1 }, prior: opts.prior ?? { sessions: 0, trials: 0, session_ids: [], excluded_sites: 0 },
      start_time: start.toISOString(), end_time: null, end_reason: null, total_trials: 0, active_duration_ms: 0, paused_ms: 0,
      environment: { user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node', screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'n/a' },
      timing_notes: 'Onset = first animation frame after the trial rendered; response = key press or tap timeStamp. Self-paced, so RT is a rough measure.',
    };
  }

  get phase(): PhaseSpec | null { return this.config.phases[this.phaseIdx] ?? null; }
  get done() { return this.phaseIdx >= this.config.phases.length; }

  nextStimulus(): Site | null {
    if (!this.phase) return null;
    const keys = this.order.get(this.phase.group) ?? [];
    for (let tries = 0; tries < keys.length * 2; tries++) {
      const r = this.rot.get(this.phase.group) ?? 0;
      this.rot.set(this.phase.group, r + 1);
      const key = keys[r % keys.length];
      const pool = this.pools.get(key) ?? [];
      const k = pool.findIndex((s) => !this.revealed.has(`${key}:${s.i}`));
      if (k < 0) continue;
      const [s] = pool.splice(k, 1);
      return s;
    }
    return null;
  }

  liveAccuracy(window: number): number | null {
    if (!this.trials.length) return null;
    const ts = this.trials.slice(-window);
    return ts.filter((t) => t.correct).length / ts.length;
  }

  record(r: ResponseInput): { trial: TrialRecord; next: PhaseSpec | null; finished: boolean } {
    const ph = this.phase!, s = r.site;
    const trial: TrialRecord = {
      trial: this.trials.length + 1, timestamp: r.wallOnset.toISOString(), elapsed_ms: Math.round(r.elapsedMs), mode: this.config.mode, phase: ph.name, feedback: ph.feedback,
      site_id: s.id, protein: s.protein.key, group: s.protein.group, position: s.i + 1, truth: s.aa, response: r.response,
      correct: r.response === s.aa, same_family: FAMILY_OF[r.response] === FAMILY_OF[s.aa], input: r.input, rt_ms: Math.round(r.rtMs), rolling_accuracy: null,
      onset_perf_ms: Math.round(r.onsetPerf * 100) / 100, response_perf_ms: Math.round(r.responsePerf * 100) / 100,
    };
    for (const j of [s.i, ...revealedBy(s, this.config.mode)]) this.revealed.add(`${s.protein.key}:${j}`);
    this.trials.push(trial);
    this.inPhase++;
    const w = Math.min(30, this.trials.length);
    trial.rolling_accuracy = this.trials.slice(-w).filter((t) => t.correct).length / w;
    this.meta.total_trials = this.trials.length;
    if (this.inPhase >= ph.trials) {
      this.phaseIdx++; this.inPhase = 0;
      const next = this.phase;
      if (next) this.meta.phase_starts![next.name] = trial.trial + 1;
      return { trial, next, finished: !next };
    }
    return { trial, next: null, finished: false };
  }

  endReason(activeMs: number): string | null {
    if (this.done) return 'protocol_complete';
    if (activeMs >= this.config.maxDurationMin * 60_000) return 'max_duration';
    return null;
  }

  finish(reason: string, activeMs: number, pausedMs: number, endTime = new Date()): Session {
    Object.assign(this.meta, { end_time: endTime.toISOString(), end_reason: reason, active_duration_ms: Math.round(activeMs), paused_ms: Math.round(pausedMs) });
    return this.snapshot();
  }
  snapshot(): Session { return { meta: structuredClone(this.meta), trials: this.trials.map((t) => ({ ...t })) }; }
}
