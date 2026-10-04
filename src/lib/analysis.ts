import { FAMILY_OF, type Dataset, type Mode, type ModelInfo, type Session, type Site, type TrialRecord } from './types';

export interface Pt { x: number; y: number }

export const acc = (ts: { correct: boolean }[]) => (ts.length ? ts.filter((t) => t.correct).length / ts.length : null);
export const mean = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function wilson(k: number, n: number, z = 1.96): [number, number] | null {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}
/** Rolling mean of 0/1 values (window w), one point per trial. */
export function rolling(v: boolean[], w: number): Pt[] {
  const out: Pt[] = [];
  let s = 0;
  v.forEach((x, i) => { s += x ? 1 : 0; if (i >= w) s -= v[i - w] ? 1 : 0; out.push({ x: i + 1, y: s / Math.min(i + 1, w) }); });
  return out;
}

export function phaseList(s: Session) { return s.meta.config.phases.filter((p) => s.trials.some((t) => t.phase === p.name)); }
export function phaseStats(s: Session) {
  return phaseList(s).map((p) => {
    const ts = s.trials.filter((t) => t.phase === p.name), k = ts.filter((t) => t.correct).length;
    return { ...p, n: ts.length, acc: acc(ts), ci: wilson(k, ts.length), fam: ts.length ? ts.filter((t) => t.same_family).length / ts.length : null, rt: median(ts.map((t) => t.rt_ms)) };
  });
}

/** Benchmarks that are a fair or reference comparison in this game (not the context sweep). */
export const modelsFor = (data: Dataset, mode: Mode): ModelInfo[] => data.models.filter((m) => m.games.includes(mode));

export const modelCorrect = (trials: TrialRecord[], byId: Map<number, Site>, model: string) => trials.map((t) => byId.get(t.site_id)!.calls[model] === t.truth);

// ── learners that get exactly your experience: the same trials, in your order, with the same feedback ──
const AAS = 'ACDEFGHIKLMNPQRSTVWY';
export function cues(site: Site, mode: Mode): number[] {
  const v = new Array(200).fill(0);
  const ctx = site.w.slice(0, 5) + site.w.slice(6);
  for (let k = 0; k < 10; k++) { const a = AAS.indexOf(ctx[k]); if (a >= 0) v[k * 20 + a] = 1; }
  return mode === 'struct' ? [...v, ...site.f] : v;
}

/** Online softmax regression: predict first, then learn from the answer (like you). */
export class OnlineSoftmax {
  W: number[][]; b: number[];
  constructor(dim: number, private lr = 0.15, private l2 = 1e-4) { this.W = AAS.split('').map(() => new Array(dim).fill(0)); this.b = new Array(20).fill(0); }
  probs(x: number[]): number[] {
    const z = this.W.map((w, k) => this.b[k] + w.reduce((a, wi, i) => a + (x[i] ? wi * x[i] : 0), 0));
    const m = Math.max(...z), e = z.map((v) => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
  }
  predict(x: number[]): string { const p = this.probs(x); return AAS[p.indexOf(Math.max(...p))]; }
  update(x: number[], y: string) {
    const p = this.probs(x), t = AAS.indexOf(y);
    for (let k = 0; k < 20; k++) {
      const g = p[k] - (k === t ? 1 : 0);
      this.b[k] -= this.lr * g;
      const w = this.W[k];
      for (let i = 0; i < x.length; i++) if (x[i]) w[i] -= this.lr * (g * x[i] + this.l2 * w[i]);
    }
  }
}

export function streamLearners(s: Session, byId: Map<number, Site>, mode: Mode) {
  const ts = s.trials.filter((t) => byId.has(t.site_id));
  const counts: Record<string, number> = {};
  const freq: boolean[] = [], lr: boolean[] = [];
  const model = new OnlineSoftmax(mode === 'struct' ? 229 : 200);
  for (const t of ts) {
    const site = byId.get(t.site_id)!, x = cues(site, mode);
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'L';
    freq.push(top === t.truth);
    lr.push(model.predict(x) === t.truth);
    counts[t.truth] = (counts[t.truth] ?? 0) + 1;
    model.update(x, t.truth);
  }
  return [
    { key: 'freq', label: 'Most common so far (your feedback)', correct: freq },
    { key: 'lr', label: mode === 'struct' ? 'Logistic regression on your cues (your feedback)' : 'Logistic regression on the window (your feedback)', correct: lr },
  ];
}

/** Counts [truth][response] in the given amino-acid order. */
export function confusion(s: Session, order: string) {
  const M = [...order].map(() => new Array(order.length).fill(0));
  for (const t of s.trials) { const r = order.indexOf(t.truth), c = order.indexOf(t.response); if (r >= 0 && c >= 0) M[r][c]++; }
  return M;
}

/** For each amino acid: how often it was the answer, how often you got it, how often a model got it, and how often you picked it. */
export function perAA(s: Session, byId: Map<number, Site>, model: string, order: string) {
  return [...order].map((a) => {
    const ts = s.trials.filter((t) => t.truth === a);
    return { aa: a, n: ts.length, you: acc(ts), model: mean(ts.map((t) => byId.get(t.site_id)!.calls[model] === a)), picked: s.trials.filter((t) => t.response === a).length };
  });
}

/** Agreement with each model on your trials: same pick %, Cohen's κ (beyond chance), and the share of your mistakes it made identically. */
export function resemblance(s: Session, byId: Map<number, Site>, models: ModelInfo[]) {
  const ts = s.trials.filter((t) => byId.has(t.site_id));
  if (ts.length < 20) return [];
  const n = ts.length, pYou: Record<string, number> = {};
  for (const t of ts) pYou[t.response] = (pYou[t.response] ?? 0) + 1 / n;
  const wrong = ts.filter((t) => !t.correct);
  return models.map((m) => {
    const calls = ts.map((t) => byId.get(t.site_id)!.calls[m.name]);
    const agree = calls.filter((c, i) => c === ts[i].response).length / n;
    const pM: Record<string, number> = {};
    for (const c of calls) pM[c] = (pM[c] ?? 0) + 1 / n;
    const pe = Object.keys(pYou).reduce((a, k) => a + pYou[k] * (pM[k] ?? 0), 0);
    return {
      ...m, agree, kappa: pe >= 1 ? 0 : (agree - pe) / (1 - pe),
      sharedErrors: wrong.length ? wrong.filter((t) => byId.get(t.site_id)!.calls[m.name] === t.response).length / wrong.length : null,
      accuracy: calls.filter((c, i) => c === ts[i].truth).length / n,
      famAgree: calls.filter((c, i) => FAMILY_OF[c] === FAMILY_OF[ts[i].response]).length / n,
    };
  }).sort((a, b) => b.kappa - a.kappa);
}

/** ESM2-650M accuracy on your sites as the context grows (10 aa = what you saw). */
export function contextCurve(s: Session, byId: Map<number, Site>) {
  const steps: [string, string, number][] = [['esm650_w', '10', 10], ['ctx20', '20', 20], ['ctx30', '30', 30], ['ctx50', '50', 50], ['ctx100', '100', 100], ['ctx200', '200', 200], ['esm650_f', 'whole', 400]];
  return steps.map(([m, label, x]) => ({ model: m, label, x, y: mean(modelCorrect(s.trials, byId, m)) ?? 0 }));
}
