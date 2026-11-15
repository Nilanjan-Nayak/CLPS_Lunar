import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSceneIntent } from '@/hooks/useSceneIntent';
import { useLandingSites, usePlan, usePlanOptions, useResilience, useSiteOptimization } from '@/services/queries';
import { useClockStore } from '@/state/clockStore';
import { useSimStore } from '@/state/simStore';
import { Badge, KV, Note, Panel } from '@/ui/primitives';
import { PolarHorizonPlot } from '@/features/planning/PolarHorizonPlot';
import { PowerBudgetChart } from '@/features/planning/PowerBudgetChart';
import { ConstraintMatrix } from '@/features/planning/ConstraintMatrix';
import { parsePlanSearchParams, serializePlanInput } from '@/features/planning/MissionIntelSubnav';
import { SpaceAppsResourceBar } from '@/features/planning/SpaceAppsResourceBar';
import { ResilienceLab } from '@/features/resilience/ResilienceLab';
import { ParetoExplorer } from '@/features/optimization/ParetoExplorer';
import type { SceneIntent } from '@/scene-manager/SceneConfig';

type NavTab = 'overview' | 'resilience' | 'pareto' | 'confidence';

/**
 * NavigatorPage — Hybrid 3D + Mission Intelligence Lunar Mission Navigator (SELENARA X).
 * Runs inside SpaceLayout over the live 3D Moon/Solar System:
 *   • Left/Center: interactive 3D lunar surface, lander descent simulation, LOLA terrain & NavHud
 *   • Right Workbench: Golden Window & Power Budget, Schedule-Delay Simulator (MRI) synced with the 3D World Clock,
 *     Multi-Site Pareto Frontier Optimizer (click a site to fly the 3D camera there), and Scientific Confidence Dossier.
 */
export function NavigatorPage() {
  const [q, setQ] = useSearchParams();
  const [tab, setTab] = useState<NavTab>(() => (q.get('tab') as NavTab) || 'overview');
  // On phones, keep the lunar view visible until the user explicitly opens the workbench.
  const [minimised, setMinimised] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches);
  const [wide, setWide] = useState(true);

  const input = useMemo(() => parsePlanSearchParams(q), [q]);
  const intent = useMemo<SceneIntent>(
    () => ({
      type: 'PLAN_LANDING',
      plan: {
        latitude: input.latitude,
        longitude: input.longitude,
        landerId: input.landerId,
        launchVehicleId: input.launchVehicleId,
        transferId: input.transferId,
        orbitDays: input.orbitDays,
        surfaceDays: input.surfaceDays,
        dataVolumeGb: input.dataVolumeGb,
        downlinkMbps: input.downlinkMbps,
        payloadKg: input.payloadKg,
        landingDate: input.landingDate,
      },
    }),
    [input],
  );
  useSceneIntent(intent);

  const simPlan = useSimStore((s) => s.plan);
  useEffect(() => {
    if (!simPlan) return;
    const st = useSimStore.getState();
    if (!st.playing && st.t === 0) {
      const surf = simPlan.timeline.phases.find((p) => p.id === 'surface');
      if (surf) st.setT(surf.startS);
    }
  }, [simPlan]);

  const { data: options } = usePlanOptions();
  const curatedSites = options?.challengeSites ?? [];
  const { data: sites } = useLandingSites();
  const { data: plan, isFetching: planLoading } = usePlan(input);
  const { data: resilience, isFetching: resLoading } = useResilience(input);
  const { data: optimization, isFetching: optLoading } = useSiteOptimization(tab === 'pareto' ? input : null);

  const updateInput = (patch: Partial<typeof input>, nextTab?: NavTab) => {
    const next = { ...input, ...patch };
    const extra: Record<string, string> = { run: '1' };
    if (nextTab || tab) extra.tab = nextTab ?? tab;
    setQ(new URLSearchParams(serializePlanInput(next, extra)));
    if (nextTab) setTab(nextTab);
  };

  const previewUtcIn3D = (utc: string) => {
    const iso = utc.endsWith('Z') && utc.length === 17 ? utc.replace('Z', ':00Z') : utc;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) {
      const st = useSimStore.getState();
      st.pause();
      const surf = st.plan?.timeline.phases.find((p) => p.id === 'surface');
      if (surf && st.t < surf.startS) st.setT(surf.startS);
      useClockStore.getState().setFixed(ms, { rate: 0, source: 'resilience-delay-preview' });
    }
  };

  const qs = serializePlanInput(input, { run: '1' });

  if (minimised) {
    return (
      <div
        className="hybrid-workbench-launch"
        style={{
          position: 'fixed',
          top: 94,
          right: 16,
          zIndex: 25,
          pointerEvents: 'auto',
        }}
      >
        <button type="button" className="btn primary" onClick={() => setMinimised(false)}>
          ⚡ Open Mission Navigator · MRI {resilience ? resilience.mri.score.toFixed(0) : '…'}
        </button>
      </div>
    );
  }

  return (
    <aside
      className="hybrid-workbench"
      aria-label="Hybrid Lunar Mission Navigator Workbench"
      style={{
        position: 'fixed',
        top: 94,
        right: 16,
        bottom: 84,
        width: wide ? 'min(660px, calc(100vw - 416px))' : 'min(460px, calc(100vw - 416px))',
        zIndex: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflowY: 'auto',
        paddingRight: 4,
        pointerEvents: 'auto',
      }}
    >
      <button type="button" className="btn small hybrid-mobile-close" onClick={() => setMinimised(true)} aria-label="Close mission navigator">
        ✕ Close navigator
      </button>
      {/* Navigator Workbench Header & Mode Switcher */}
      <div
        className="navigator-workbench-header"
        data-tour-target="navigator-header"
        style={{
          background: 'rgba(9, 14, 26, 0.90)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(143, 211, 255, 0.28)',
          borderRadius: 12,
          padding: '10px 14px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
        }}
      >
        <div className="navigator-workbench-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 13.5, letterSpacing: '0.04em', color: '#e2e8f0' }}>
                ⚡ SELENARA X · HYBRID MISSION NAVIGATOR
              </span>
              <Badge tone="info">3D + Python Intelligence</Badge>
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
              Live 3D Lunar Environment synced with Schedule Resilience (MRI), Golden Window &amp; Pareto Optimizer
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button type="button" className="btn small" onClick={() => setWide((w) => !w)} title="Toggle workbench width">
              {wide ? '⇤ Narrow' : '⇥ Wide'}
            </button>
            <button type="button" className="btn small" onClick={() => setMinimised(true)} title="Minimise workbench to inspect full 3D scene" aria-label="Minimise mission navigator">
              −
            </button>
          </div>
        </div>

        {/* Quick Site & Lander Selector */}
        <div className="navigator-workbench-selectors" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.7fr 0.7fr', gap: 6, marginBottom: 8 }}>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              const cur = curatedSites.find((x) => `cur:${x.id}` === val);
              if (cur) {
                updateInput({ latitude: cur.latitude, longitude: cur.longitude, landerId: cur.landerId ?? input.landerId, landingDate: undefined });
                return;
              }
              const s = sites?.landingSites.find((x) => x.id === val);
              if (s && s.latitude != null && s.longitude != null) {
                updateInput({ latitude: s.latitude, longitude: s.longitude, landingDate: undefined });
              }
            }}
            style={{ fontSize: 11.5, padding: '4px 6px' }}
            aria-label="Select catalogued CLPS or notable lunar landing site"
          >
            <option value="">
              Target: {Math.abs(input.latitude).toFixed(2)}°{input.latitude < 0 ? 'S' : 'N'}, {Math.abs(input.longitude).toFixed(2)}°{input.longitude < 0 ? 'W' : 'E'}
            </option>
            <optgroup label="Quick-compare reference sites (rounded)">
              {curatedSites.map((s) => (
                <option key={`cur:${s.id}`} value={`cur:${s.id}`}>
                  [{s.category}] {s.name} ({s.latitude.toFixed(2)}°, {s.longitude.toFixed(2)}°)
                </option>
              ))}
            </optgroup>
            <optgroup label="CLPS Catalogue Sites">
              {sites?.landingSites
                .filter((s) => s.latitude != null)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.latitude?.toFixed(2)}°, {s.longitude?.toFixed(2)}°)
                  </option>
                ))}
            </optgroup>
          </select>

          <select
            value={input.landerId ?? 'nova-c'}
            onChange={(e) => updateInput({ landerId: e.target.value })}
            style={{ fontSize: 11.5, padding: '4px 6px' }}
            aria-label="Select lander class"
          >
            {options?.landers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span className="dim">Days:</span>
            <input
              type="number"
              min={1}
              max={45}
              value={input.surfaceDays ?? 14}
              onChange={(e) => updateInput({ surfaceDays: Number(e.target.value) })}
              style={{ width: 52, padding: '3px 5px', fontSize: 11.5 }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!input.useRelay}
              onChange={(e) => updateInput({ useRelay: e.target.checked })}
            />
            <span>Relay sat</span>
          </label>
        </div>

        {/* 4 Workbench Tabs + Full-Screen Studio Links */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <div className="seg navigator-workbench-tabs" role="tablist" aria-label="Hybrid Navigator Tabs" data-tour-target="navigator-tabs">
            <button type="button" className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>
              1 · Golden &amp; Power
            </button>
            <button type="button" className={tab === 'resilience' ? 'on' : ''} onClick={() => setTab('resilience')}>
              2 · Delay &amp; MRI
            </button>
            <button type="button" className={tab === 'pareto' ? 'on' : ''} onClick={() => setTab('pareto')}>
              3 · Pareto Sites
            </button>
            <button type="button" className={tab === 'confidence' ? 'on' : ''} onClick={() => setTab('confidence')}>
              4 · Confidence
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link className="btn small" to={`/plan?${qs}`} title="Open full-page Landing Plan Studio">Studio ↗</Link>
            <Link className="btn small" to={`/report?${qs}`} title="Open printable Decision Report" data-tour-target="pdf-report">PDF Report ↗</Link>
          </div>
        </div>
      </div>

      {/* TAB 1: Overview, 360° Polar Horizon, Power Budget & Constraints */}
      {tab === 'overview' && (
        <>
          {(planLoading || !plan) && (
            <Panel title="Computing Mission Intelligence…">
              <div className="panel-body">
                <Note>Running LOLA terrain analysis, terrain-masked sunrise windows, power balance, and descent simulation…</Note>
              </div>
            </Panel>
          )}
          {plan && (
            <>
              <div className="navigator-workbench-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                <div style={{ background: 'rgba(9,14,26,0.85)', border: '1px solid rgba(94,234,212,0.28)', borderRadius: 10, padding: '8px 10px' }}>
                  <div className="dim" style={{ fontSize: 10 }}>VIABILITY SCORE</div>
                  <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: '#5eead4' }}>
                    {(plan.viabilityScore ?? 80).toFixed(0)}<span style={{ fontSize: 11, color: '#94a3b8' }}>/100</span>
                  </div>
                  <div className="dim" style={{ fontSize: 10 }}>Engineering physics</div>
                </div>
                <div style={{ background: 'rgba(9,14,26,0.85)', border: '1px solid rgba(143,211,255,0.25)', borderRadius: 10, padding: '8px 10px' }}>
                  <div className="dim" style={{ fontSize: 10 }}>RESILIENCE (MRI)</div>
                  <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: (resilience?.mri.score ?? 50) >= 60 ? '#34d399' : '#fbbf24' }}>
                    {resilience ? `${resilience.mri.score.toFixed(0)}/100` : '…'}
                  </div>
                  <div className="dim" style={{ fontSize: 10 }}>
                    {resilience ? `${resilience.mri.feasibleScenarios}/${resilience.mri.totalScenarios} delays pass` : 'Schedule sweep'}
                  </div>
                </div>
                <div style={{ background: 'rgba(9,14,26,0.85)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10, padding: '8px 10px' }}>
                  <div className="dim" style={{ fontSize: 10 }}>GOLDEN WINDOW</div>
                  <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: '#fbbf24' }}>
                    {plan.goldenWindows ? `${plan.goldenWindows.totalGoldenDays.toFixed(1)}d` : '—'}
                  </div>
                  <div className="dim" style={{ fontSize: 10 }}>{plan.ephemeris?.calendar.landingUtc}</div>
                </div>
                <div style={{ background: 'rgba(9,14,26,0.85)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '8px 10px' }}>
                  <div className="dim" style={{ fontSize: 10 }}>HISTORICAL ML</div>
                  <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: '#94a3b8' }}>
                    {(plan.outcomeModel.pNominal * 100).toFixed(0)}% <span style={{ fontSize: 10 }}>exploratory</span>
                  </div>
                  <div className="dim" style={{ fontSize: 10 }}>LOO CV {(plan.outcomeModel.looCv.accuracy * 100).toFixed(0)}% (n={plan.outcomeModel.n})</div>
                </div>
              </div>

              <div className="navigator-workbench-plots" style={{ display: 'grid', gridTemplateColumns: wide ? '250px 1fr' : '1fr', gap: 10 }}>
                <Panel title="360° Polar Horizon Mask">
                  <div className="panel-body">
                    <PolarHorizonPlot
                      horizon={plan.site.horizon}
                      atLanding={plan.ephemeris?.atLanding}
                      samples={plan.ephemeris?.samples}
                      size={215}
                    />
                  </div>
                </Panel>
                <Panel title="Mission Power Budget &amp; Golden Window">
                  <div className="panel-body">
                    <PowerBudgetChart powerBudget={plan.powerBudget} goldenWindows={plan.goldenWindows} height={150} />
                  </div>
                </Panel>
              </div>

              <SpaceAppsResourceBar
                compact
                input={input}
                plan={plan}
                onSelectSite={(s) => updateInput({ latitude: s.latitude, longitude: s.longitude, landerId: s.landerId ?? input.landerId, landingDate: undefined })}
              />

              <Panel title="Structured Engineering Constraints">
                <div className="panel-body">
                  <ConstraintMatrix constraints={plan.constraints} compact={!wide} />
                </div>
              </Panel>
            </>
          )}
        </>
      )}

      {/* TAB 2: Schedule-Delay Simulator & MRI (synced to 3D World Clock) */}
      {tab === 'resilience' && (
        <>
          {(resLoading || !resilience) && (
            <Panel title="Simulating Schedule Delays…">
              <div className="panel-body">
                <Note>Evaluating +0, +1, +2, +3, +5, +7, +10, +14, +21, +28 day slips in the Python research engine…</Note>
              </div>
            </Panel>
          )}
          {resilience && (
            <ResilienceLab
              data={resilience}
              compact={!wide}
              onSelectDelayUtc={(utc) => previewUtcIn3D(utc)}
              onApplyLandingDate={(utc) => {
                previewUtcIn3D(utc);
                updateInput({ landingDate: utc });
              }}
            />
          )}
        </>
      )}

      {/* TAB 3: Multi-Site Pareto Frontier Optimizer (click site -> flies 3D camera!) */}
      {tab === 'pareto' && (
        <>
          {(optLoading || !optimization) && (
            <Panel title="Computing Multi-Site Pareto Frontier…">
              <div className="panel-body">
                <Note>Evaluating candidate lunar sites across 5 objectives (Solar, Earth LOS, Terrain Safety, Darkness, MRI)…</Note>
              </div>
            </Panel>
          )}
          {optimization && (
            <ParetoExplorer
              data={optimization}
              compact={!wide}
              onApplyCandidate={(cand) => {
                previewUtcIn3D(cand.optimalLandingUtc);
                updateInput({ latitude: cand.latitude, longitude: cand.longitude, landingDate: cand.optimalLandingUtc }, 'overview');
              }}
            />
          )}
        </>
      )}

      {/* TAB 4: Scientific Confidence & Decision Summary */}
      {tab === 'confidence' && resilience && plan && (
        <Panel
          title={<>Scientific Confidence &amp; Decision Dossier <Badge tone="ok">{resilience.recommendations.verdict}</Badge></>}
          actions={<Link className="btn small primary" to={`/report?${qs}`}>🖨 Full Printable Report</Link>}
        >
          <div className="panel-body">
            <h4 className="card-title" style={{ marginTop: 0, color: '#5eead4' }}>Why {resilience.recommendations.siteLabel} is recommended</h4>
            <ul className="flags" style={{ borderColor: 'rgba(52,211,153,0.35)' }}>
              {resilience.recommendations.whyRecommended.map((w) => <li key={w}>{w}</li>)}
            </ul>
            <h4 className="card-title" style={{ color: '#fbbf24' }}>Known engineering risks &amp; limitations</h4>
            <ul className="flags">
              {resilience.recommendations.knownRisks.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <h4 className="card-title" style={{ color: '#8fd3ff' }}>Domain-Separated Data Quality &amp; Confidence</h4>
            {resilience.confidence.domains.map((d) => (
              <div key={d.id} style={{ padding: '7px 9px', borderRadius: 8, background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,163,184,0.16)', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{d.domain}</strong>
                  <Badge tone={d.confidenceLevel.startsWith('High') ? 'ok' : d.confidenceLevel.startsWith('Medium') ? 'info' : 'warn'}>
                    {d.confidenceLevel}
                  </Badge>
                </div>
                <div className="mono dim" style={{ fontSize: 10.5, marginTop: 2 }}>{d.dataset} · {d.resolution}</div>
                <div style={{ fontSize: 11, color: '#fde68a', marginTop: 3 }}>Limitation: {d.limitations}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </aside>
  );
}
