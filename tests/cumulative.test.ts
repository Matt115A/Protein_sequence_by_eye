import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../src/lib/types';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
const { cumulativeSession } = await import('../src/lib/history');

const mk = (id: string, start: string, n: number, mode: 'seq' | 'struct' = 'seq'): Session =>
  ({ meta: { session_id: id, start_time: start, dataset_version: '1.0.0', simulated: false, active_duration_ms: 1000, config: { mode } },
     trials: Array.from({ length: n }, (_, i) => ({ site_id: i, tag: `${id}:${i}`, trial: i + 1, elapsed_ms: (i + 1) * 100, phase: i ? 'main' : 'warmup' })) } as unknown as Session);
const archive = (...ss: Session[]) => mem.set('mask.sessions', JSON.stringify(Object.fromEntries(ss.map((s) => [s.meta.session_id, s]))));
const tags = (s: Session) => (s.trials as unknown as { tag: string }[]).map((t) => t.tag);

beforeEach(() => mem.clear());

describe('cumulative analysis keeps the two games apart', () => {
  it('a sequence session never merges with a structure session', () => {
    archive(mk('seq-old', '2026-01-01', 2, 'seq'), mk('struct-old', '2026-02-01', 5, 'struct'));
    const got = cumulativeSession(mk('seq-now', '2026-06-01', 1, 'seq'));
    expect(got.sessions).toBe(2);
    expect(tags(got.session)).toEqual(['seq-old:0', 'seq-old:1', 'seq-now:0']);

    const other = cumulativeSession(mk('struct-now', '2026-06-02', 1, 'struct'));
    expect(other.sessions).toBe(2);
    expect(tags(other.session)).toEqual(['struct-old:0', 'struct-old:1', 'struct-old:2', 'struct-old:3', 'struct-old:4', 'struct-now:0']);
  });

  it('renumbers trials and offsets time so sessions follow one another on the x axis', () => {
    archive(mk('a', '2026-01-01', 3));
    const got = cumulativeSession(mk('b', '2026-02-01', 2)).session;
    expect(got.trials.map((t) => t.trial)).toEqual([1, 2, 3, 4, 5]);
    expect(got.trials.map((t) => t.elapsed_ms)).toEqual([100, 200, 300, 1100, 1200]);   // session a lasted 1000 ms
    expect(got.meta.phase_starts).toEqual({ warmup: 1, main: 2 });
  });
});
