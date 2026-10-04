import { readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { boardRows } from '../src/components/LiveBoard';
import { contextCurve, mean, modelCorrect, resemblance, streamLearners } from '../src/lib/analysis';
import { parseDataset } from '../src/lib/dataset';
import { maskResidue, virtualCb } from '../src/lib/structure';
import { CSV_COLUMNS, trialsToCsv } from '../src/lib/export';
import { revealedBy, SessionCore } from '../src/lib/session';
import { simulateSession } from '../src/lib/simulate';
import { AA_ORDER, defaultConfig, FAMILY_OF, type Mode, type Session } from '../src/lib/types';

const data = parseDataset(JSON.parse(readFileSync('public/data/dataset.json', 'utf8')));
const byId = new Map(data.sites.map((s) => [s.id, s]));
const play = (core: SessionCore, n: number, pick: (i: number, truth: string) => string) => {
  for (let i = 0; i < n && !core.done; i++) {
    const site = core.nextStimulus()!;
    core.record({ site, response: pick(i, site.aa), input: 'tap', rtMs: 3000, onsetPerf: i * 6000, responsePerf: i * 6000 + 3000, wallOnset: new Date(), elapsedMs: i * 6000 });
  }
};

describe('dataset', () => {
  it('is internally consistent', () => {
    expect(data.sites.length).toBe(2520);
    expect(AA_ORDER.length).toBe(20);
    expect(new Set(AA_ORDER).size).toBe(20);
    for (const s of data.sites) {
      expect(s.w[5]).toBe(s.aa);
      expect(s.protein.seq.slice(s.i - 5, s.i + 6)).toBe(s.w);
      expect(s.nbrs).toHaveLength(16);
      expect(s.nbrs.some(([j]) => j === s.i)).toBe(false);
      for (const m of ['esm650_w', 'esm650_f', 'mpnn', 'mpnn_bb']) expect(Math.abs(s.pr[m].reduce((a, b) => a + b, 0) - 1000)).toBeLessThan(15);
      for (const m of data.models) expect(AA_ORDER).toContain(s.calls[m.name]);
      expect(FAMILY_OF[s.aa]).toBeTruthy();
    }
  });
  it('structure files match the sequences, and the 3D view cannot show the hidden residue', () => {
    expect(readdirSync('public/data/structures').length).toBe(data.proteins.length);
    const THREE: Record<string, string> = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V' };
    for (const p of data.proteins) {
      const pdb = readFileSync(`public/data/structures/${p.key}.pdb`, 'utf8');
      const atoms = pdb.split('\n').filter((l) => l.startsWith('ATOM'));
      const seq = new Map<number, string>();
      for (const l of atoms) seq.set(Number(l.slice(22, 26)), THREE[l.slice(17, 20)]);
      expect([...seq.values()].join('')).toBe(p.seq);
      expect(atoms.some((l) => l.slice(76, 78).trim() === 'H')).toBe(false);
      for (const site of data.sites.filter((s) => s.protein === p)) {
        const masked = maskResidue(pdb, site.i + 1).split('\n').filter((l) => l.startsWith('ATOM'));
        const mine = masked.filter((l) => Number(l.slice(22, 26)) === site.i + 1);
        expect(mine.map((l) => l.slice(12, 16).trim())).toEqual(['N', 'CA', 'C', 'O', 'CB']);   // glycines get a virtual Cβ too
        expect(new Set(mine.map((l) => l.slice(17, 20)))).toEqual(new Set(['ALA']));
        expect(masked.filter((l) => Number(l.slice(22, 26)) !== site.i + 1)).toEqual(atoms.filter((l) => Number(l.slice(22, 26)) !== site.i + 1));
      }
    }
  });
  it('the virtual Cβ lands where real Cβ atoms are', () => {
    const pdb = readFileSync('public/data/structures/p00.pdb', 'utf8').split('\n').filter((l) => l.startsWith('ATOM'));
    const res = new Map<number, Record<string, [number, number, number]>>();
    for (const l of pdb) { const r = Number(l.slice(22, 26)); if (!res.has(r)) res.set(r, {}); res.get(r)![l.slice(12, 16).trim()] = [Number(l.slice(30, 38)), Number(l.slice(38, 46)), Number(l.slice(46, 54))]; }
    const d = [...res.values()].filter((a) => a.CB).map((a) => { const v = virtualCb(a.N, a.CA, a.C); return Math.hypot(v[0] - a.CB[0], v[1] - a.CB[1], v[2] - a.CB[2]); });
    expect(d.length).toBeGreaterThan(150);
    expect(d.reduce((x, y) => x + y, 0) / d.length).toBeLessThan(0.2);
  });
});

describe('session', () => {
  for (const mode of ['seq', 'struct'] as Mode[]) {
    it(`${mode}: runs the protocol with no repeats and never shows an already-revealed residue`, () => {
      const cfg = defaultConfig(mode), core = new SessionCore(cfg, data, { seed: 11 });
      play(core, 1000, (i, truth) => (i % 3 ? 'L' : truth));
      expect(core.done).toBe(true);
      const total = cfg.phases.reduce((a, p) => a + p.trials, 0);
      expect(core.trials).toHaveLength(total);
      expect(new Set(core.trials.map((t) => t.site_id)).size).toBe(total);
      for (const p of cfg.phases) expect(core.trials.filter((t) => t.phase === p.name).every((t) => t.group === p.group)).toBe(true);
      const revealed = new Set<string>();
      for (const t of core.trials) {
        const s = byId.get(t.site_id)!;
        expect(revealed.has(`${s.protein.key}:${s.i}`)).toBe(false);
        for (const j of [s.i, ...revealedBy(s, mode)]) revealed.add(`${s.protein.key}:${j}`);
      }
      expect(core.trials.filter((t) => t.correct).length).toBeGreaterThan(total / 3 - 2);
      expect(core.trials.every((t) => t.same_family === (FAMILY_OF[t.response] === FAMILY_OF[t.truth]))).toBe(true);
    });
  }
  it('excludes sites from earlier attempts', () => {
    const first = new SessionCore(defaultConfig('seq'), data, { seed: 1 });
    play(first, 60, () => 'A');
    const ex = new Set(first.trials.map((t) => t.site_id));
    const second = new SessionCore(defaultConfig('struct'), data, { seed: 2, exclude: ex });
    play(second, 60, () => 'A');
    expect(second.trials.some((t) => ex.has(t.site_id))).toBe(false);
  });
});

describe('analysis', () => {
  const s: Session = simulateSession(defaultConfig('seq'), data, 5);
  it('simulates and exports', () => {
    expect(s.trials.length).toBe(140);
    const csv = trialsToCsv(s).trim().split('\n');
    expect(csv[0].split(',')).toEqual(['session_id', ...CSV_COLUMNS]);
    expect(csv).toHaveLength(141);
  });
  it('benchmarks, learners and the context curve use the same sites', () => {
    const L = streamLearners(s, byId, 'seq');
    for (const l of L) expect(l.correct).toHaveLength(s.trials.length);
    const ctx = contextCurve(s, byId);
    expect(ctx[0].y).toBeCloseTo(mean(modelCorrect(s.trials, byId, 'esm650_w'))!, 9);
    expect(ctx.at(-1)!.y).toBeCloseTo(mean(modelCorrect(s.trials, byId, 'esm650_f'))!, 9);
    const st = simulateSession(defaultConfig('struct'), data, 6);
    expect(streamLearners(st, byId, 'struct')[1].correct).toHaveLength(st.trials.length);
  });
  it('a player who copies a model resembles it perfectly', () => {
    const copy: Session = { ...s, trials: s.trials.map((t) => { const r = byId.get(t.site_id)!.calls.esm650_f; return { ...t, response: r, correct: r === t.truth }; }) };
    const res = resemblance(copy, byId, data.models.filter((m) => m.games.includes('seq')));
    expect(res[0].name).toBe('esm650_f');
    expect(res[0].kappa).toBeCloseTo(1, 6);
  });
  it('live leaderboard scores everyone on the answered sites', () => {
    const seen = s.trials.slice(0, 30).map((t) => byId.get(t.site_id)!);
    const rows = boardRows(seen, s.trials.slice(0, 30).map((t) => t.correct), data.models, 20);
    expect(rows[0].all).toBeCloseTo(s.trials.slice(0, 30).filter((t) => t.correct).length / 30, 9);
    expect(rows.find((r) => r.name === 'mpnn')!.all).toBeCloseTo(seen.filter((x) => x.calls.mpnn === x.aa).length / 30, 9);
  });
});

describe('attempts', () => {
  it('archives, removes one, and clears all', async () => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const { addToHistory, loadArchived, removeFromHistory, clearAllAttempts, loadHistory } = await import('../src/lib/history');
    const a = simulateSession(defaultConfig('seq'), data, 1), b = simulateSession(defaultConfig('struct'), data, 2);
    for (const x of [a, b]) x.meta.simulated = false;
    addToHistory(a); addToHistory(b);
    expect(loadHistory().map((h) => h.mode).sort()).toEqual(['seq', 'struct']);
    expect(loadArchived(a.meta.session_id)?.trials.length).toBe(a.trials.length);
    expect(removeFromHistory(a.meta.session_id)).toHaveLength(1);
    expect(clearAllAttempts()).toEqual([]);
    expect(loadArchived(b.meta.session_id)).toBeNull();
  });
});
