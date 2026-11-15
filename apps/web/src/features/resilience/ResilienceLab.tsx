import { useState } from 'react';
import { Badge, KV, Note, Panel } from '@/ui/primitives';
import { ConstraintMatrix } from '@/features/planning/ConstraintMatrix';
import type { ResilienceResult, ResilienceScenario } from '@/types/domain';

function statusTone(status: ResilienceScenario['resultStatus']): 'ok' | 'warn' | 'bad' {
  if (status === 'Feasible') return 'ok';
  if (status === 'Marginal') return 'warn';
  return 'bad';
}

/**
 * ResilienceLab — Schedule-Delay Simulator (Feature 1), Mission Resilience Index / MRI (Feature 2),
 * Recovery Window Finder, and Deterministic Explainable Recommendations (Feature 7).
 */
export function ResilienceLab({
  data,
  compact = false,
  onSelectDelayUtc,
  onApplyLandingDate,
}: {
  data: ResilienceResult;
  compact?: boolean;
  onSelectDelayUtc?: (utc: string, delayDays: number) => void;
  onApplyLandingDate?: (utc: string) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const scenarios = data.scenarios;
  const active = scenarios[Math.min(selectedIdx, scenarios.length - 1)] ?? scenarios[0];
  const { mri, recovery, recommendations } = data;

  const selectScenario = (idx: number) => {
    setSelectedIdx(idx);
    const sc = scenarios[idx];
    if (sc && onSelectDelayUtc) {
      onSelectDelayUtc(sc.landingUtc, sc.delayDays);
    }
  };

  return (
    <div className="resilience-lab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top KPI strip: MRI Score, Scenarios, Critical Slip, Best Recovery */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(143,211,255,0.25)', borderRadius: 10, padding: '10px 12px' }}>
          <div className="dim" style={{ fontSize: 10.5, letterSpacing: '0.05em' }}>MISSION RESILIENCE INDEX (MRI)</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: mri.score >= 60 ? '#34d399' : mri.score >= 35 ? '#fbbf24' : '#f87171', marginTop: 2 }}>
            {mri.score.toFixed(0)} <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>/ 100</span>
          </div>
          <div className="dim" style={{ fontSize: 11 }}>
            weighted MRI {mri.weightedScore.toFixed(0)} · {mri.feasibleScenarios}/{mri.totalScenarios} feasible
          </div>
        </div>

        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 10, padding: '10px 12px' }}>
          <div className="dim" style={{ fontSize: 10.5, letterSpacing: '0.05em' }}>CRITICAL LAUNCH SLIP</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: mri.criticalDelayDays != null && mri.criticalDelayDays <= 3 ? '#f87171' : '#ffd166', marginTop: 4 }}>
            {mri.criticalDelayDays != null ? `+${mri.criticalDelayDays} days` : 'None (≤28d)'}
          </div>
          <div className="dim" style={{ fontSize: 11 }}>
            {mri.failedScenarios} failed scenario{mri.failedScenarios === 1 ? '' : 's'} in sweep
          </div>
        </div>

        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 10, padding: '10px 12px' }}>
          <div className="dim" style={{ fontSize: 10.5, letterSpacing: '0.05em' }}>BASELINE VIABILITY</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: scenarios[0]?.feasible ? '#5eead4' : '#f87171', marginTop: 4 }}>
            {scenarios[0]?.viabilityScore.toFixed(0)}/100 · {scenarios[0]?.resultStatus}
          </div>
          <div className="dim" style={{ fontSize: 11 }}>
            landing {data.baselineLandingUtc}
          </div>
        </div>

        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(52,211,153,0.28)', borderRadius: 10, padding: '10px 12px' }}>
          <div className="dim" style={{ fontSize: 10.5, letterSpacing: '0.05em' }}>BEST RECOVERY WINDOW</div>
          {recovery.bestRecovery ? (
            <>
              <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, color: '#34d399', marginTop: 4 }}>
                {recovery.bestRecovery.landingUtc}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span className="dim" style={{ fontSize: 10.5 }}>
                  +{recovery.bestRecovery.shiftFromBaselineDays.toFixed(1)}d · score {recovery.bestRecovery.viabilityScore.toFixed(0)}
                </span>
                {onApplyLandingDate && (
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => onApplyLandingDate(recovery.bestRecovery!.landingUtc)}
                    title="Re-target mission to this recovery landing window"
                  >
                    Apply
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="dim" style={{ marginTop: 6 }}>No recovery needed</div>
          )}
        </div>
      </div>

      {/* Interactive Schedule-Delay Scrubber */}
      <Panel
        title={<>Schedule-Delay Simulator <Badge tone="info">Python Ephemeris + LOLA Horizon + Power Engine</Badge></>}
        subtitle={
          <span>
            Active scenario: <b>{active.label}</b> · landing {active.landingUtc} ·{' '}
            <Badge tone={statusTone(active.resultStatus)}>{active.resultStatus}</Badge>
          </span>
        }
      >
        <div className="panel-body">
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
              <span>Click or scrub a launch slip to re-evaluate Sun, Earth, Power &amp; Constraints{onSelectDelayUtc ? ' (live-updates 3D Moon lighting)' : ''}:</span>
              <span className="mono" style={{ color: '#8fd3ff' }}>Delay: +{active.delayDays} days</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {scenarios.map((sc, i) => {
                const isSel = i === selectedIdx;
                const borderCol = sc.resultStatus === 'Feasible' ? '#34d399' : sc.resultStatus === 'Marginal' ? '#fbbf24' : '#f87171';
                return (
                  <button
                    key={sc.delayDays}
                    type="button"
                    onClick={() => selectScenario(i)}
                    className={`btn small${isSel ? ' primary' : ''}`}
                    style={{
                      borderLeft: `3px solid ${borderCol}`,
                      fontWeight: isSel ? 700 : 500,
                    }}
                    title={`${sc.label}: ${sc.resultStatus} (Sunlit ${Math.round(sc.sunlitFraction * 100)}%, min SOC ${sc.power.minSocPct.toFixed(0)}%)`}
                  >
                    +{sc.delayDays}d · {Math.round(sc.sunlitFraction * 100)}% ☀
                  </button>
                );
              })}
            </div>
          </div>

          <table className="table small">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Delay</th>
                <th>Landing UTC</th>
                <th>Sun @ TD</th>
                <th>Sunlit</th>
                <th>Earth LOS</th>
                <th>Min SOC</th>
                <th>Max Dark</th>
                <th>Failed Constraints</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((sc, i) => (
                <tr
                  key={sc.delayDays}
                  className={i === selectedIdx ? 'active' : undefined}
                  style={{ cursor: 'pointer' }}
                  onClick={() => selectScenario(i)}
                >
                  <td><strong>{sc.code}</strong></td>
                  <td className="mono">{sc.delayDays === 0 ? '0 days' : `+${sc.delayDays} d`}</td>
                  <td className="mono">{sc.landingUtc}</td>
                  <td className="mono">
                    {sc.sunElevationAtLandingDeg.toFixed(1)}°
                    {!sc.sunVisibleAtLanding && <span style={{ color: '#f87171' }} title="Blocked by terrain or below horizon"> ⊘</span>}
                  </td>
                  <td className="mono">{Math.round(sc.sunlitFraction * 100)}% ({sc.sunlitHours.toFixed(0)}h)</td>
                  <td className="mono">{Math.round(sc.earthVisibleFraction * 100)}%</td>
                  <td className="mono" style={{ color: sc.power.minSocPct >= 20 ? '#5eead4' : '#f87171' }}>
                    {sc.power.minSocPct.toFixed(0)}%
                  </td>
                  <td className="mono">{sc.power.maxContinuousDarknessHours.toFixed(1)}h</td>
                  <td style={{ fontSize: 11 }}>
                    {sc.failedHardConstraints.length > 0 ? (
                      <span style={{ color: '#fca5a5' }}>{sc.failedHardConstraints.join(', ')}</span>
                    ) : sc.warnConstraints.length > 0 ? (
                      <span style={{ color: '#fde68a' }}>warn: {sc.warnConstraints.join(', ')}</span>
                    ) : (
                      <span className="dim">All pass</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={statusTone(sc.resultStatus)}>{sc.resultStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Note>
            <strong>{mri.formula}</strong> → {mri.feasibleScenarios} feasible / {mri.totalScenarios} tested = <b>MRI {mri.score.toFixed(0)}</b>. {mri.note}
          </Note>
        </div>
      </Panel>

      {/* Selected Delay Scenario Constraint Breakdown + Recovery Windows */}
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.25fr 1fr', gap: 12 }}>
        <Panel title={<>Constraint Breakdown · {active.label} <Badge tone={statusTone(active.resultStatus)}>{active.viabilityScore.toFixed(0)}/100 Viability</Badge></>}>
          <div className="panel-body">
            <ConstraintMatrix constraints={active.constraints} compact={compact} />
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel title={<>Explainable Recommendations <Badge tone={recommendations.verdict.startsWith('Recommended') ? 'ok' : 'warn'}>Deterministic</Badge></>}>
            <div className="panel-body">
              <KV k="Engineering verdict" v={<strong>{recommendations.verdict}</strong>} />
              <h4 className="card-title" style={{ color: '#5eead4' }}>Why {recommendations.siteLabel} is viable</h4>
              <ul className="flags" style={{ borderColor: 'rgba(52,211,153,0.35)' }}>
                {recommendations.whyRecommended.map((w) => <li key={w}>{w}</li>)}
              </ul>
              <h4 className="card-title" style={{ color: '#fbbf24' }}>Known risks &amp; limitations</h4>
              <ul className="flags">
                {recommendations.knownRisks.map((r) => <li key={r}>{r}</li>)}
              </ul>
              {recommendations.recommendedActions.length > 0 && (
                <>
                  <h4 className="card-title" style={{ color: '#8fd3ff' }}>Recommended contingency actions</h4>
                  <ul className="flags" style={{ borderColor: 'rgba(143,211,255,0.35)' }}>
                    {recommendations.recommendedActions.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </>
              )}
              <div className="dim" style={{ fontSize: 10.5, marginTop: 4 }}>{recommendations.provenanceNote}</div>
            </div>
          </Panel>

          <Panel title="Recovery Landing Windows (if schedule slips)">
            <div className="panel-body">
              <table className="table small">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Recovery UTC</th>
                    <th>Shift</th>
                    <th>Sunlit</th>
                    <th>Min SOC</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recovery.candidates.slice(0, 5).map((rc) => (
                    <tr key={rc.landingUtc}>
                      <td className="mono">#{rc.rank}</td>
                      <td className="mono">{rc.landingUtc}</td>
                      <td className="mono">+{rc.shiftFromBaselineDays.toFixed(1)}d</td>
                      <td className="mono">{Math.round(rc.sunlitFraction * 100)}%</td>
                      <td className="mono">{rc.minSocPct.toFixed(0)}%</td>
                      <td>
                        <Badge tone={rc.feasible ? 'ok' : 'bad'}>{rc.resultStatus}</Badge>
                      </td>
                      <td>
                        {onApplyLandingDate && (
                          <button type="button" className="btn small" onClick={() => onApplyLandingDate(rc.landingUtc)}>
                            Use
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
