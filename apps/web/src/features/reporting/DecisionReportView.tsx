import { Badge, KV, Note, Panel } from '@/ui/primitives';
import { ConstraintMatrix } from '@/features/planning/ConstraintMatrix';
import { PolarHorizonPlot } from '@/features/planning/PolarHorizonPlot';
import { PowerBudgetChart } from '@/features/planning/PowerBudgetChart';
import type { DecisionReportResult } from '@/types/domain';

/**
 * DecisionReportView — Feature 8: Scientific Data-Quality Panel & Downloadable/Printable Mission Decision Report.
 * Separates confidence and limitations across Terrain, Ephemeris, Power, Communications, and Exploratory ML.
 */
export function DecisionReportView({
  report,
  onSelectSite,
}: {
  report: DecisionReportResult;
  onSelectSite?: (lat: number, lon: number, landingUtc?: string) => void;
}) {
  const { plan, resilience, optimization } = report;
  const rec = resilience.recommendations;
  const bestRecovery = resilience.recovery.bestRecovery;
  const paretoFront = optimization.candidates.filter((c) => c.paretoOptimal);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selenara-mission-report-${plan.site.latitude.toFixed(2)}_${plan.site.longitude.toFixed(2)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="decision-report" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Executive Header & Export Bar */}
      <Panel
        title={
          <>
            Mission Decision &amp; Scientific Confidence Report{' '}
            <Badge tone={rec.verdict.startsWith('Recommended') ? 'ok' : 'warn'}>{rec.verdict}</Badge>
          </>
        }
        subtitle={
          <span>
            Generated {report.generatedAtUtc} · Target {plan.summaryCard.landingSite} · Lander {plan.input.lander.name}
          </span>
        }
        actions={
          <div className="btn-row no-print" style={{ margin: 0 }}>
            <button type="button" className="btn small primary" onClick={() => window.print()} title="Print or Save as PDF">
              🖨 Export PDF / Print Report
            </button>
            <button type="button" className="btn small" onClick={exportJson} title="Download complete machine-readable JSON report">
              ⬇ Export JSON
            </button>
          </div>
        }
      >
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, padding: '8px 11px' }}>
              <div className="dim" style={{ fontSize: 10 }}>ENGINEERING VIABILITY</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: '#5eead4' }}>
                {(plan.viabilityScore ?? 80).toFixed(0)} / 100
              </div>
              <div className="dim" style={{ fontSize: 10.5 }}>Deterministic physics &amp; constraint score</div>
            </div>
            <div style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, padding: '8px 11px' }}>
              <div className="dim" style={{ fontSize: 10 }}>SCHEDULE RESILIENCE (MRI)</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: resilience.mri.score >= 60 ? '#34d399' : '#fbbf24' }}>
                {resilience.mri.score.toFixed(0)} / 100
              </div>
              <div className="dim" style={{ fontSize: 10.5 }}>{resilience.mri.feasibleScenarios}/{resilience.mri.totalScenarios} delay scenarios feasible</div>
            </div>
            <div style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, padding: '8px 11px' }}>
              <div className="dim" style={{ fontSize: 10 }}>GOLDEN MISSION WINDOW</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: '#ffd166' }}>
                {plan.goldenWindows ? `${plan.goldenWindows.totalGoldenDays.toFixed(1)} days` : '—'}
              </div>
              <div className="dim" style={{ fontSize: 10.5 }}>Landing {plan.ephemeris?.calendar.landingUtc}</div>
            </div>
            <div style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, padding: '8px 11px' }}>
              <div className="dim" style={{ fontSize: 10 }}>HISTORICAL ML COMPARISON</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8' }}>
                {(plan.outcomeModel.pNominal * 100).toFixed(0)}% <span style={{ fontSize: 11, fontWeight: 400 }}>(exploratory)</span>
              </div>
              <div className="dim" style={{ fontSize: 10.5 }}>n={plan.outcomeModel.n}, LOO CV {(plan.outcomeModel.looCv.accuracy * 100).toFixed(1)}% — not reliability</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <KV k="Recommended site" v={`${plan.summaryCard.landingSite} (${plan.site.terrain.elevationM.toFixed(0)} m, slope ${plan.site.terrain.slopeDeg}°)`} />
              <KV k="Baseline window" v={`Launch ${plan.ephemeris?.calendar.launchUtc} → Touchdown ${plan.ephemeris?.calendar.landingUtc} → End ${plan.ephemeris?.calendar.surfaceEndUtc}`} />
              <KV k="Launch & transfer" v={`${plan.summaryCard.launchVehicle} · ${plan.input.transfer.name} · Propellant margin ${Math.round(plan.budget.mass.propellantMarginKg)} kg`} />
              <KV k="Contingency recovery" v={bestRecovery ? `${bestRecovery.landingUtc} (+${bestRecovery.shiftFromBaselineDays.toFixed(1)} d shift, viability ${bestRecovery.viabilityScore.toFixed(0)}/100)` : 'Baseline resilient'} />
            </div>
            <div>
              <h4 className="card-title" style={{ marginTop: 0, color: '#5eead4' }}>Why this configuration is recommended</h4>
              <ul className="flags" style={{ borderColor: 'rgba(52,211,153,0.35)' }}>
                {rec.whyRecommended.map((w) => <li key={w}>{w}</li>)}
              </ul>
              <h4 className="card-title" style={{ color: '#fbbf24' }}>Known engineering risks</h4>
              <ul className="flags">
                {rec.knownRisks.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </Panel>

      {/* Domain-by-Domain Scientific Data-Quality & Confidence Assessment */}
      <Panel
        title={<>Scientific Data-Quality, Assumptions &amp; Domain Confidence <Badge tone="info">5 Separate Domains</Badge></>}
        subtitle="Confidence and limitations are reported separately for Topography, Ephemeris, Power, Communications, and Historical ML"
      >
        <div className="panel-body">
          <table className="table small">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Confidence &amp; Grade</th>
                <th>Dataset &amp; Resolution</th>
                <th>Model Assumptions</th>
                <th>Known Limitations &amp; Uncertainty</th>
              </tr>
            </thead>
            <tbody>
              {resilience.confidence.domains.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.domain}</strong></td>
                  <td>
                    <Badge tone={d.confidenceLevel.startsWith('High') ? 'ok' : d.confidenceLevel.startsWith('Medium') ? 'info' : 'warn'}>
                      {d.confidenceLevel}
                    </Badge>
                    <div className="dim" style={{ fontSize: 10.5, marginTop: 3 }}>{d.grade}</div>
                  </td>
                  <td style={{ fontSize: 11.5 }}>
                    <div>{d.dataset}</div>
                    <div className="mono dim" style={{ fontSize: 10.5 }}>{d.resolution}</div>
                  </td>
                  <td className="dim" style={{ fontSize: 11 }}>{d.assumptions}</td>
                  <td style={{ fontSize: 11, color: '#fde68a' }}>
                    {d.limitations}
                    {d.testedEpochsUtc && (
                      <div className="mono dim" style={{ fontSize: 10, marginTop: 3 }}>
                        Tested epochs: {d.testedEpochsUtc.join(' · ')}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Visual Evidence: 360° Polar Horizon + Power Budget + Constraints */}
      <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 12 }}>
        <Panel title="360° Horizon & Sky Geometry">
          <div className="panel-body">
            <PolarHorizonPlot
              horizon={plan.site.horizon}
              atLanding={plan.ephemeris?.atLanding}
              samples={plan.ephemeris?.samples}
              size={240}
            />
          </div>
        </Panel>
        <Panel title="Electrical Power Budget & Golden Window Profile">
          <div className="panel-body">
            <PowerBudgetChart powerBudget={plan.powerBudget} goldenWindows={plan.goldenWindows} height={160} />
          </div>
        </Panel>
      </div>

      {/* Constraint Results & Pareto Alternative Scenarios */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 12 }}>
        <Panel title="Baseline Engineering Constraint Matrix">
          <div className="panel-body">
            <ConstraintMatrix constraints={plan.constraints} />
          </div>
        </Panel>

        <Panel title={<>Pareto-Optimal Alternative Scenarios <Badge tone="ok">{paretoFront.length} Frontier Sites</Badge></>}>
          <div className="panel-body">
            <table className="table small">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Window (UTC)</th>
                  <th>Solar</th>
                  <th>Earth</th>
                  <th>Terrain</th>
                  <th>MRI</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {optimization.candidates.slice(0, 6).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name.split(' (')[0]}</strong>
                      {c.paretoOptimal && <span style={{ color: '#ffd166', marginLeft: 4 }}>★</span>}
                      <div className="dim" style={{ fontSize: 10 }}>{c.tradeoffSummary}</div>
                    </td>
                    <td className="mono">{c.optimalLandingUtc}</td>
                    <td className="mono">{c.objectives.solarPct}%</td>
                    <td className="mono">{c.objectives.earthPct}%</td>
                    <td className="mono">{c.objectives.terrainSafetyPct}%</td>
                    <td className="mono">{c.mriScore.toFixed(0)}</td>
                    <td className="no-print">
                      {onSelectSite && (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => onSelectSite(c.latitude, c.longitude, c.optimalLandingUtc)}
                        >
                          Load
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Note>★ denotes non-dominated Rank-1 Pareto Frontier candidates across Solar, Earth Comms, Terrain Safety, Darkness Survival, and MRI.</Note>
          </div>
        </Panel>
      </div>
    </div>
  );
}
