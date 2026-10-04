import { makeRng, type Rng } from './rng';
import { SessionCore } from './session';
import type { Config, Dataset, PriorExperience, Session, Site } from './types';

/** Toy player for debug runs/tests: copies a model with some probability, otherwise guesses from the answers it has seen. */
export class SimPlayer {
  private rng: Rng; private seen: string[] = [];
  constructor(seed: number, private copy: string, private pCopy = 0.3) { this.rng = makeRng(seed); }
  respond(s: Site): { aa: string; rt: number } {
    const aa = this.rng() < this.pCopy ? s.calls[this.copy] : this.seen.length && this.rng() < 0.8 ? this.seen[Math.floor(this.rng() * this.seen.length)] : 'ACDEFGHIKLMNPQRSTVWY'[Math.floor(this.rng() * 20)];
    return { aa, rt: 2500 + 6000 * this.rng() };
  }
  learn(s: Site) { this.seen.push(s.aa); }
}

export function simulateSession(config: Config, data: Dataset, seed?: number, opts: { exclude?: Set<number>; prior?: PriorExperience } = {}): Session {
  const start = new Date();
  const core = new SessionCore(config, data, { seed, simulated: true, startTime: start, ...opts });
  const player = new SimPlayer(core.meta.seed ^ 0x9e37, config.mode === 'struct' ? 'mpnn' : 'esm650_f');
  let t = 0, perf = 1000, reason: string | null = null;
  while (!(reason = core.endReason(t))) {
    const site = core.nextStimulus();
    if (!site) { reason = 'pool_exhausted'; break; }
    const { aa, rt } = player.respond(site);
    core.record({ site, response: aa, input: 'sim', rtMs: rt, onsetPerf: perf, responsePerf: perf + rt, wallOnset: new Date(start.getTime() + t), elapsedMs: t });
    player.learn(site);
    const step = rt + 3000;
    t += step; perf += step;
  }
  return core.finish(reason, t, 0, new Date(start.getTime() + t));
}
