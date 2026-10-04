import { useMemo, useRef } from 'react';
import { C, Card, Heatmap, Legend, LineChart, useWidth } from '../components/charts';
import { FEEDBACK_MODELS } from './Experiment';
import { confusion, contextCurve, mean, modelCorrect, modelsFor, perAA, phaseStats, resemblance, rolling, streamLearners } from '../lib/analysis';
import { AA_INFO, AA_ORDER, type Dataset, MODE_INFO, type Session, type Site } from '../lib/types';

export const KIND_COLOR: Record<string, string> = { you: C.yellow, learner: '#199e70', simple: '#9cc3e6', window: '#c98500', full: '#3987e5', structure: '#e87ba4' };
const KIND_LABEL: Record<string, string> = { learner: 'Learns from your trials only', simple: 'Simple baseline', window: 'ESM2 · same window as you', full: 'ESM2 · whole protein', structure: 'ProteinMPNN' };
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const FONT = "Inter, -apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

export function Analysis({ session, data, byId }: { session: Session; data: Dataset; byId: Map<number, Site> }) {
  const mode = session.meta.config.mode;
  const models = useMemo(() => modelsFor(data, mode), [data, mode]);
  const rival = FEEDBACK_MODELS[mode].main;
  const r = useMemo(() => {
    const ts = session.trials;
    const you = ts.map((t) => t.correct);
    const learners = streamLearners(session, byId, mode);
    const board = [
      { name: 'you', label: 'You', kind: 'you', correct: you },
      ...learners.map((l) => ({ name: l.key, label: l.label, kind: 'learner', correct: l.correct })),
      ...models.map((m) => ({ name: m.name, label: m.label, kind: m.kind as string, correct: modelCorrect(ts, byId, m.name) })),
    ].map((b) => ({ ...b, acc: mean(b.correct) })).sort((a, b) => (b.acc ?? 0) - (a.acc ?? 0));
    return { phases: phaseStats(session), board, you, fam: mean(ts.map((t) => t.same_family)), rivalAcc: mean(modelCorrect(ts, byId, rival)), always: mean(modelCorrect(ts, byId, 'always')),
      conf: confusion(session, AA_ORDER), per: perAA(session, byId, rival, AA_ORDER), res: resemblance(session, byId, models), ctx: mode === 'seq' ? contextCurve(session, byId) : null,
      rivalSeries: modelCorrect(ts, byId, rival), alwaysSeries: modelCorrect(ts, byId, 'always') };
  }, [session, byId, models, mode, rival]);
  const refs = { board: useRef<SVGSVGElement>(null), curve: useRef<SVGSVGElement>(null), ctx: useRef<SVGSVGElement>(null), scale: useRef<SVGSVGElement>(null), conf: useRef<SVGSVGElement>(null), res: useRef<SVGSVGElement>(null) };
  if (!session.trials.length) return <div className="card empty">No trials.</div>;
  const rivalLabel = data.models.find((m) => m.name === rival)!.label;
  const W = Math.min(30, session.trials.length);
  const kinds = [...new Set(r.board.map((b) => b.kind))].filter((k) => k !== 'you');
  return (
    <div className="analysis">
      <div className="kpis">
        {r.phases.map((p) => <div key={p.name} className="kpi"><div className="kpi-label">{p.label}</div><div className="kpi-value">{pct(p.acc)}</div><div className="kpi-sub">n={p.n} · right family {pct(p.fam)}</div></div>)}
        <div className="kpi"><div className="kpi-label">{rivalLabel} on the same sites</div><div className="kpi-value">{pct(r.rivalAcc)}</div><div className="kpi-sub">{mode === 'seq' ? 'sees exactly what you saw' : 'sees backbone + neighbours'}</div></div>
        <div className="kpi"><div className="kpi-label">Baselines</div><div className="kpi-value">5% · {pct(r.always)}</div><div className="kpi-sub">random · always the commonest</div></div>
      </div>

      <Card title="Leaderboard on identical sites" svgRef={refs.board} exportName="leaderboard"
        sub={<>Every player scored on exactly the {session.trials.length} sites you answered (top-1 accuracy). {mode === 'seq'
          ? 'ESM2 "same window" gets only the 10 residues you saw; "whole protein" gets the entire sequence with the site masked — how it is normally used.'
          : 'ProteinMPNN "backbone + neighbours" is how it scores a residue (all other residues known); "backbone only" gets no sequence at all.'} Green bars learn only from your trials, in your order, with your feedback.</>}>
        <Legend items={[{ name: 'You', color: C.yellow, square: true }, ...kinds.map((k) => ({ name: KIND_LABEL[k], color: KIND_COLOR[k], square: true }))]} />
        <RankBars rows={r.board.map((b) => ({ label: b.label, value: b.acc ?? 0, color: KIND_COLOR[b.kind], bold: b.kind === 'you' }))} svgRef={refs.board} />
      </Card>

      <Card title="Your learning curve" svgRef={refs.curve} exportName="learning_curve" sub={`Rolling accuracy over the last ${W} sites, with ${rivalLabel} and the always-${data.models.find((m) => m.name === 'always')!.label.split(' ')[1]} baseline on the same sites.`}>
        <Legend items={[{ name: 'You', color: C.yellow }, { name: rivalLabel, color: KIND_COLOR[mode === 'seq' ? 'window' : 'structure'] }, { name: 'Always the commonest', color: C.muted, dash: true }]} />
        <LineChart svgRef={refs.curve} height={280} yDomain={[0, mode === 'seq' ? 0.5 : 1]} yFormat={(v) => `${Math.round(v * 100)}%`} xLabel="Site" yLabel="Accuracy"
          markers={session.meta.phase_starts ? Object.entries(session.meta.phase_starts).filter(([, v]) => v > 1).map(([k, v]) => ({ x: v, label: k === 'new' ? 'new proteins' : k })) : []}
          series={[
            { name: 'Always', color: C.muted, points: rolling(r.alwaysSeries, W), dash: '5 4' },
            { name: rivalLabel, color: KIND_COLOR[mode === 'seq' ? 'window' : 'structure'], points: rolling(r.rivalSeries, W) },
            { name: 'You', color: C.yellow, points: rolling(r.you, W), width: 2.5 },
          ]} />
      </Card>

      {r.ctx && (
        <div className="grid2">
          <Card title="How much context does ESM2 need?" svgRef={refs.ctx} exportName="context_curve"
            sub="ESM2 650M on your sites, given more and more of the protein around the hidden residue. You (and the model, at the left) had only 10 residues.">
            <LineChart svgRef={refs.ctx} height={280} yDomain={[0, 0.7]} xDomain={[0, 6]} yFormat={(v) => `${Math.round(v * 100)}%`} xFormat={(v) => r.ctx![Math.round(v)]?.label ?? ''}
              xLabel="Residues of context" yLabel="Accuracy" refLines={[{ y: mean(r.you) ?? 0, label: `you: ${pct(mean(r.you))}`, at: 'end' }]}
              series={[{ name: 'ESM2 650M', color: KIND_COLOR.full, dots: true, points: r.ctx.map((p, k) => ({ x: k, y: p.y })) }]} />
          </Card>
          <Card title="Does a bigger model help?" svgRef={refs.scale} exportName="model_size"
            sub="ESM2 at four sizes on your sites. With only your 10-residue window, size barely matters; with the whole protein, bigger models get much better.">
            <Legend items={[{ name: 'Same window as you', color: KIND_COLOR.window }, { name: 'Whole protein', color: KIND_COLOR.full }]} />
            <LineChart svgRef={refs.scale} height={250} yDomain={[0, 0.7]} xDomain={[0, 3]} yFormat={(v) => `${Math.round(v * 100)}%`} xFormat={(v) => ['8M', '35M', '150M', '650M'][Math.round(v)] ?? ''} xLabel="Parameters" yLabel="Accuracy"
              series={(['w', 'f'] as const).map((c) => ({ name: c, color: c === 'w' ? KIND_COLOR.window : KIND_COLOR.full, dots: true, points: ['esm8', 'esm35', 'esm150', 'esm650'].map((m, k) => ({ x: k, y: mean(modelCorrect(session.trials, byId, `${m}_${c}`)) ?? 0 })) }))} />
          </Card>
        </div>
      )}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <Card title="What you picked vs the real answer" svgRef={refs.conf} exportName="confusion"
          sub="Rows: the real amino acid. Columns: your pick. Grouped by family, so near-misses within a family sit near the diagonal (green outline = correct).">
          <Heatmap svgRef={refs.conf} cell={24} rowHeader="real ↓" colHeader="your pick →" cols={[...AA_ORDER]}
            rows={[...AA_ORDER].map((a, i) => {
              const row = r.conf[i], n = row.reduce((x, y) => x + y, 0);
              return { label: a, values: row.map((v) => (n ? v / n : 0)), texts: row.map((v) => (v ? String(v) : '')), marks: row.map((_, j) => (i === j ? 'target' : null)),
                title: row.map((v, j) => `${AA_INFO[a].name} → you picked ${AA_INFO[AA_ORDER[j]].name}: ${v} of ${n}`) };
            })} />
        </Card>
        <Card title="Amino acid by amino acid" sub={`How often each amino acid was the answer, how often you got it, and how often ${rivalLabel} got it.`}>
          <div className="table-scroll"><table className="data" style={{ fontSize: 13 }}>
            <thead><tr><th>Amino acid</th><th className="num">Was the answer</th><th className="num">You got it</th><th className="num">Model got it</th><th className="num">You picked it</th></tr></thead>
            <tbody>{r.per.filter((p) => p.n || p.picked).map((p) => <tr key={p.aa}><td><b>{p.aa}</b> <span className="muted">{AA_INFO[p.aa].name}</span></td><td className="num">{p.n}</td><td className="num"><b>{pct(p.you)}</b></td><td className="num">{pct(p.model)}</td><td className="num muted">{p.picked}</td></tr>)}</tbody>
          </table></div>
        </Card>
      </div>

      {r.res.length > 0 && (
        <Card title="Which model do you think like?" svgRef={refs.res} exportName="model_resemblance"
          sub="Agreement beyond chance (Cohen's κ) between your picks and each model's, on the same sites. 'Shared mistakes' = of the sites you got wrong, how often the model picked the same wrong amino acid — the strongest sign of thinking alike.">
          <div className="grid2" style={{ marginBottom: 0 }}>
            <RankBars rows={r.res.map((m) => ({ label: m.label, value: m.kappa, color: KIND_COLOR[m.kind], bold: false }))} svgRef={refs.res} format={(v) => v.toFixed(2)} />
            <div className="table-scroll"><table className="data" style={{ fontSize: 13 }}>
              <thead><tr><th>Model</th><th className="num">Same pick</th><th className="num">Same family</th><th className="num">κ</th><th className="num">Shared mistakes</th></tr></thead>
              <tbody>{r.res.map((m) => <tr key={m.name}><td><span style={{ color: KIND_COLOR[m.kind] }}>●</span> {m.label}</td><td className="num">{pct(m.agree)}</td><td className="num">{pct(m.famAgree)}</td><td className="num"><b>{m.kappa.toFixed(2)}</b></td><td className="num">{pct(m.sharedErrors)}</td></tr>)}</tbody>
            </table></div>
          </div>
        </Card>
      )}
      <p className="note">{MODE_INFO[mode].title} · {session.trials.length} sites · {data.source}</p>
    </div>
  );
}

/** Horizontal ranked bars with labels on the left (readable with long model names). */
function RankBars({ rows, svgRef, format = (v) => `${Math.round(v * 100)}%` }: { rows: { label: string; value: number; color: string; bold: boolean }[]; svgRef: React.RefObject<SVGSVGElement | null>; format?: (v: number) => string }) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const rowH = 24, labelW = Math.min(300, width * 0.45), top = 6, H = top + rows.length * rowH + 10;
  const lo = Math.min(0, ...rows.map((r) => r.value)), hi = Math.max(0.1, ...rows.map((r) => r.value));
  const X = (v: number) => labelW + ((v - lo) / (hi - lo)) * Math.max(10, width - labelW - 50);
  return (
    <div className="chart-wrap" ref={wrap}>
      <svg ref={svgRef} width={width} height={H} fontFamily={FONT}>
        <line x1={X(0)} x2={X(0)} y1={top - 2} y2={H - 8} stroke={C.axis} />
        {rows.map((r, i) => {
          const y = top + i * rowH;
          return (
            <g key={r.label + i}>
              <text x={labelW - 8} y={y + rowH / 2} dy="0.35em" textAnchor="end" fill={r.bold ? C.text : C.text2} fontSize={12.5} fontWeight={r.bold ? 700 : 400}>{r.label}</text>
              <rect x={Math.min(X(0), X(r.value))} y={y + 5} width={Math.abs(X(r.value) - X(0))} height={rowH - 10} rx={3} fill={r.color} />
              <text x={Math.max(X(0), X(r.value)) + 6} y={y + rowH / 2} dy="0.35em" fill={C.text} fontSize={12} fontWeight={r.bold ? 700 : 400}>{format(r.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
