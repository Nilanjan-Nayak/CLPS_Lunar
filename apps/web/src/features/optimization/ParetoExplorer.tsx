import { useMemo, useState } from 'react';
import { Badge, KV, Note, Panel } from '@/ui/primitives';
import type { SiteOptimizationCandidate, SiteOptimizationResult } from '@/types/domain';

type ObjectiveKey = 'solarPct' | 'earthPct' | 'terrainSafetyPct' | 'mriScore' | 'darknessSafetyPct';

const AXES: { key: ObjectiveKey; label: string }[] = [
  { key: 'solarPct', label: 'Solar Availability (%)' },
  { key: 'earthPct', label: 'Earth Visibility (%)' },
  { key: 'terrainSafetyPct', label: 'Terrain Safety (%)' },
  { key: 'mriScore', label: 'Schedule Resilience (MRI)' },
  { key: 'darknessSafetyPct', label: 'Darkness Survival Margin (%)' },
];

/**
 * ParetoExplorer — Multi-Site / Multi-Date Optimizer (Feature 4) & Non-Dominated Pareto Frontier (Feature 5).
 */
export function ParetoExplorer({
  data,
  compact = false,
  onApplyCandidate,
}: {
  data: SiteOptimizationResult;
  compact?: boolean;
  onApplyCandidate?: (candidate: SiteOptimizationCandidate) => void;
}) {
  const [xAxis, setXAxis] = useState<ObjectiveKey>('earthPct');
  const [yAxis, setYAxis] = useState<ObjectiveKey>('mriScore');
  const [selectedId, setSelectedId] = useState<string>(data.recommendedCandidate?.id ?? data.candidates[0]?.id ?? '');

  const selected = useMemo(
    () => data.candidates.find((c) => c.id === selectedId) ?? data.candidates[0],
    [data.candidates, selectedId],
  );

  const W = 440;
  const H = compact ? 210 : 250;
  const L = 42;
  const R = 18;
  const T = 18;
  const B = 32;

  const plot = useMemo(() => {
    const cands = data.candidates;
    const x = (v: number) => L + (Math.min(Math.max(v, 0), 100) / 100) * (W - L - R);
    const y = (v: number) => T + (1 - Math.min(Math.max(v, 0), 100) / 100) * (H - T - B);

    // 2D non-dominated frontier on the currently selected (xAxis, yAxis) projection among feasible sites
    const feas = cands.filter((c) => c.feasible).sort((a, b) => a.objectives[xAxis] - b.objectives[xAxis] || b.objectives[yAxis] - a.objectives[yAxis]);
    const front2d: SiteOptimizationCandidate[] = [];
    for (const c of feas) {
      while (front2d.length > 0 && front2d[front2d.length - 1].objectives[yAxis] <= c.objectives[yAxis]) {
        front2d.pop();
      }
      front2d.push(c);
    }
    const frontierPath = front2d
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.objectives[xAxis]).toFixed(1)},${y(c.objectives[yAxis]).toFixed(1)}`)
      .join(' ');

    return { x, y, front2d, frontierPath };
  }, [data.candidates, xAxis, yAxis, H]);

  const xLabel = AXES.find((a) => a.key === xAxis)?.label ?? xAxis;
  const yLabel = AXES.find((a) => a.key === yAxis)?.label ?? yAxis;

  return (
    <div className="pareto-explorer" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : '1.15fr 1fr',
          gap: 12,
        }}
      >
        {/* Interactive Pareto Frontier Chart */}
        <Panel
          title={<>Pareto Frontier Explorer <Badge tone="ok">{data.paretoFrontierCount} Rank-1 Frontier Sites</Badge></>}
          subtitle={
            <span>
              {data.feasibleCandidates}/{data.totalCandidates} pass hard constraints · non-dominated multi-objective sorting
            </span>
          }
        >
          <div className="panel-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center', fontSize: 11.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="dim">X Axis:</span>
                <select value={xAxis} onChange={(e) => setXAxis(e.target.value as ObjectiveKey)} style={{ padding: '2px 6px', fontSize: 11.5 }}>
                  {AXES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="dim">Y Axis:</span>
                <select value={yAxis} onChange={(e) => setYAxis(e.target.value as ObjectiveKey)} style={{ padding: '2px 6px', fontSize: 11.5 }}>
                  {AXES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
            </div>

            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              role="img"
              aria-label="Pareto frontier multi-objective scatter plot"
              style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 9 }}
            >
              <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="rgba(15,23,42,0.55)" stroke="rgba(148,163,184,0.22)" />

              {[25, 50, 75].map((pct) => (
                <g key={pct}>
                  <line x1={plot.x(pct)} x2={plot.x(pct)} y1={T} y2={H - B} stroke="rgba(148,163,184,0.12)" strokeDasharray="2 2" />
                  <line x1={L} x2={W - R} y1={plot.y(pct)} y2={plot.y(pct)} stroke="rgba(148,163,184,0.12)" strokeDasharray="2 2" />
                </g>
              ))}

              {/* 2D Projected Pareto Frontier Curve */}
              {plot.frontierPath && (
                <path d={plot.frontierPath} fill="none" stroke="#ffd166" strokeWidth={2} strokeDasharray="4 2" opacity={0.9} />
              )}

              {/* Candidate Points */}
              {(() => {
                const placedLabels: { x: number; y: number }[] = [];
                return data.candidates.map((c) => {
                  const cx = plot.x(c.objectives[xAxis]);
                  const cy = plot.y(c.objectives[yAxis]);
                  const isSel = selected?.id === c.id;
                  const fill = c.paretoOptimal ? '#ffd166' : c.feasible ? '#38bdf8' : '#f87171';
                  const r = isSel ? 7 : c.paretoOptimal ? 6 : 4.5;
                  const showLabel = c.paretoOptimal || isSel;
                  let labelY = cy - 7;
                  if (showLabel) {
                    for (const pl of placedLabels) {
                      if (Math.abs(pl.x - cx) < 65 && Math.abs(pl.y - labelY) < 11) {
                        labelY = pl.y + 13;
                      }
                    }
                    placedLabels.push({ x: cx, y: labelY });
                  }
                  const anchorEnd = cx > W * 0.56;
                  return (
                    <g
                      key={c.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedId(c.id);
                      }}
                    >
                      {isSel && <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke="#ffffff" strokeWidth={1.4} />}
                      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#020617" strokeWidth={1.2}>
                        <title>{`${c.name} — Rank #${c.paretoRank} (${c.resultStatus})\nSolar ${c.objectives.solarPct}% · Earth ${c.objectives.earthPct}% · Terrain ${c.objectives.terrainSafetyPct}% · MRI ${c.mriScore}`}</title>
                      </circle>
                      {showLabel && (
                        <text
                          x={anchorEnd ? cx - 9 : cx + 9}
                          y={labelY}
                          textAnchor={anchorEnd ? 'end' : 'start'}
                          fill={isSel ? '#ffffff' : '#fde68a'}
                          fontWeight={isSel ? 700 : 600}
                          fontSize={8.5}
                        >
                          {c.name.split(' (')[0]}
                        </text>
                      )}
                    </g>
                  );
                });
              })()}

              {/* Axes labels */}
              {[0, 50, 100].map((v) => (
                <g key={v}>
                  <text x={plot.x(v)} y={H - B + 12} textAnchor="middle" fill="rgba(226,232,240,0.6)">{v}%</text>
                  <text x={L - 5} y={plot.y(v) + 3} textAnchor="end" fill="rgba(226,232,240,0.6)">{v}</text>
                </g>
              ))}
              <text x={(L + W - R) / 2} y={H - 5} textAnchor="middle" fill="#94a3b8" fontWeight={600}>{xLabel} →</text>
              <text x={11} y={(T + H - B) / 2} textAnchor="middle" fill="#94a3b8" fontWeight={600} transform={`rotate(-90 11 ${(T + H - B) / 2})`}>
                {yLabel} →
              </text>
            </svg>

            <div className="dim" style={{ fontSize: 11, marginTop: 6, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <span>
                <span style={{ color: '#ffd166' }}>● ╌</span> Rank-1 Pareto Frontier ·{' '}
                <span style={{ color: '#38bdf8' }}>●</span> Feasible (Dominated) ·{' '}
                <span style={{ color: '#f87171' }}>●</span> Constraint Violation
              </span>
              <span>Click any site bubble to inspect trade-offs</span>
            </div>
          </div>
        </Panel>

        {/* Selected Candidate Trade-Off & Explainable Card */}
        {selected && (
          <Panel
            title={
              <>
                #{selected.overallRank} · {selected.name}{' '}
                <Badge tone={selected.paretoOptimal ? 'ok' : selected.feasible ? 'info' : 'bad'}>
                  {selected.paretoOptimal ? 'PARETO FRONTIER' : selected.feasible ? `Pareto Rank #${selected.paretoRank}` : 'INFEASIBLE'}
                </Badge>
              </>
            }
            subtitle={
              <span>
                {Math.abs(selected.latitude).toFixed(2)}°{selected.latitude < 0 ? 'S' : 'N'},{' '}
                {Math.abs(selected.longitude).toFixed(2)}°{selected.longitude < 0 ? 'W' : 'E'} · optimal window {selected.optimalLandingUtc}
              </span>
            }
          >
            <div className="panel-body">
              <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,209,102,0.08)', border: '1px solid rgba(255,209,102,0.28)', fontSize: 12, marginBottom: 8 }}>
                <strong>Multi-Objective Trade-off:</strong> {selected.tradeoffSummary}
              </div>

              <KV k="5-Objective Vector" v={`Solar ${selected.objectives.solarPct}% · Earth ${selected.objectives.earthPct}% · Terrain Safety ${selected.objectives.terrainSafetyPct}% (slope ${selected.terrain.slopeDeg}°) · Max Dark ${selected.objectives.darknessHours}h · MRI ${selected.mriScore}/100`} />
              <KV k="Power & Viability" v={`Viability ${selected.viabilityScore}/100 · min battery SOC ${selected.power.minSocPct.toFixed(0)}% · net energy ${selected.power.energyMarginKwh >= 0 ? '+' : ''}${selected.power.energyMarginKwh.toFixed(1)} kWh`} />
              <KV
                k="Delay Resilience Strip"
                v={
                  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                    {selected.delayStrip.map((d) => (
                      <span
                        key={d.delayDays}
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: d.feasible ? 'rgba(52,211,153,0.16)' : 'rgba(248,113,113,0.18)',
                          color: d.feasible ? '#6ee7b7' : '#fca5a5',
                        }}
                      >
                        +{d.delayDays}d:{d.solarPct}%
                      </span>
                    ))}
                  </span>
                }
              />

              <h4 className="card-title" style={{ color: '#5eead4' }}>Why chosen / strengths</h4>
              <ul className="flags" style={{ borderColor: 'rgba(52,211,153,0.35)' }}>
                {selected.recommendations.whyRecommended.slice(0, 4).map((w) => <li key={w}>{w}</li>)}
              </ul>

              <h4 className="card-title" style={{ color: '#fbbf24' }}>Known risks</h4>
              <ul className="flags">
                {selected.recommendations.knownRisks.slice(0, 3).map((r) => <li key={r}>{r}</li>)}
              </ul>

              {onApplyCandidate && (
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn primary" onClick={() => onApplyCandidate(selected)}>
                    ↗ Target {selected.name.split(' (')[0]} &amp; Fly / Analyze
                  </button>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>

      {/* Multi-Site Comparison Table */}
      <Panel title="Multi-Site & Multi-Date Candidate Ranking Table">
        <div className="panel-body">
          <table className="table small">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Candidate Site</th>
                <th>Coords</th>
                <th>Optimal Window (UTC)</th>
                <th>Solar</th>
                <th>Earth</th>
                <th>Terrain Safety</th>
                <th>Max Dark</th>
                <th>MRI</th>
                <th>Pareto Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c) => (
                <tr
                  key={c.id}
                  className={selected?.id === c.id ? 'active' : undefined}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedId(c.id)}
                >
                  <td className="mono">#{c.overallRank}</td>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="dim" style={{ fontSize: 10.5 }}>{c.region} · {c.terrain.grade.startsWith('science') ? 'LOLA 240 m' : 'LOLA 16 ppd'}</div>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {Math.abs(c.latitude).toFixed(2)}°{c.latitude < 0 ? 'S' : 'N'}, {Math.abs(c.longitude).toFixed(2)}°{c.longitude < 0 ? 'W' : 'E'}
                  </td>
                  <td className="mono">{c.optimalLandingUtc}</td>
                  <td className="mono">{c.objectives.solarPct}%</td>
                  <td className="mono">{c.objectives.earthPct}%</td>
                  <td className="mono">{c.objectives.terrainSafetyPct}% ({c.terrain.slopeDeg}°)</td>
                  <td className="mono">{c.objectives.darknessHours}h</td>
                  <td className="mono" style={{ fontWeight: 700, color: c.mriScore >= 60 ? '#34d399' : c.mriScore >= 35 ? '#fbbf24' : '#f87171' }}>
                    {c.mriScore.toFixed(0)}
                  </td>
                  <td>
                    {c.paretoOptimal ? (
                      <Badge tone="ok">Pareto Front #1</Badge>
                    ) : c.feasible ? (
                      <Badge tone="info">Rank #{c.paretoRank}</Badge>
                    ) : (
                      <Badge tone="bad">Violates ({c.failedHardConstraints.length})</Badge>
                    )}
                  </td>
                  <td>
                    {onApplyCandidate && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyCandidate(c);
                        }}
                      >
                        Select
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note>{data.methodNote}</Note>
        </div>
      </Panel>
    </div>
  );
}
