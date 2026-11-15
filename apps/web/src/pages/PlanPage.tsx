import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, KV, Note, Panel } from '@/ui/primitives';
import { useHistoricMissions, useLandingSites, usePlan, usePlanOptions, useResearchModel, useLaunchSites } from '@/services/queries';
import type { PlanInput } from '@/types/domain';
import { OUTCOME_COLOR, OUTCOME_GLYPH } from '@/features/history/HistoricLanding';
import { DescentChart } from '@/features/planning/DescentChart';
import { HorizonStrip, IlluminationChart } from '@/features/planning/IlluminationChart';
import { PolarHorizonPlot } from '@/features/planning/PolarHorizonPlot';
import { PowerBudgetChart } from '@/features/planning/PowerBudgetChart';
import { ConstraintMatrix } from '@/features/planning/ConstraintMatrix';
import { MissionIntelSubnav } from '@/features/planning/MissionIntelSubnav';
import { SpaceAppsResourceBar } from '@/features/planning/SpaceAppsResourceBar';

type Form = Required<Pick<PlanInput, 'latitude' | 'longitude' | 'landerId' | 'launchVehicleId' | 'transferId' | 'orbitDays' | 'surfaceDays' | 'dataVolumeGb' | 'downlinkMbps' | 'payloadKg'>> &
  Pick<PlanInput, 'dryMassKg' | 'propellantKg' | 'thrustN' | 'ispS' | 'minThrottle' | 'landingDate' | 'useRelay'>;
const STRING_KEYS = ['landerId', 'launchVehicleId', 'transferId', 'landingDate'];

const DEFAULTS: Form = { latitude: -84.79, longitude: 29.2, landerId: 'nova-c', launchVehicleId: 'falcon-9', transferId: 'direct', orbitDays: 1, surfaceDays: 14, dataVolumeGb: 20, downlinkMbps: 4, payloadKg: 100 };

const heatColor = (v: number) => (v < 0.5 ? `rgb(255,${Math.round(90 + 240 * v)},90)` : `rgb(${Math.round(255 - 320 * (v - 0.5))},${Math.round(210 + 60 * (v - 0.5))},${Math.round(102 + 130 * (v - 0.5))})`);

/**
 * PlanPage — "Landing Plan Studio": choose a site + lander/launch/transfer parameters, run the research engine
 * (terrain analysis, 360° polar horizon, power budget, Golden Mission Window, structured constraints, historical comparison,
 * physics budgets, descent simulation) and open the Hybrid 3D Navigator or animated 3-D simulation.
 */
export function PlanPage() {
  const [q, setQ] = useSearchParams();
  const { data: options } = usePlanOptions();
  const { data: model } = useResearchModel();
  const { data: sites } = useLandingSites();
  const { data: history } = useHistoricMissions();
  const [form, setForm] = useState<Form>(() => {
    const f = { ...DEFAULTS } as Record<string, unknown>;
    for (const [k, v] of q.entries()) {
      if (k === 'run' || k === 'tab') continue;
      if (k === 'useRelay') f[k] = v === '1' || v === 'true';
      else f[k] = STRING_KEYS.includes(k) ? v : Number(v);
    }
    return f as Form;
  });
  const [submitted, setSubmitted] = useState<PlanInput | null>(() => clean(form));
  const { data: plan, isFetching, error } = usePlan(submitted);
  const preset = options?.landers.find((l) => l.id === form.landerId);

  useEffect(() => {
    if (q.get('run') === '1') setSubmitted(clean(form));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: STRING_KEYS.includes(k) ? (v === '' ? undefined : v) : v === '' ? undefined : Number(v) }));
  const applyPreset = (id: string) => {
    const p = options?.landers.find((l) => l.id === id);
    setForm((f) => ({ ...f, landerId: id, payloadKg: p?.payloadKg ?? f.payloadKg, dryMassKg: undefined, propellantKg: undefined, thrustN: undefined, ispS: undefined, minThrottle: undefined }));
  };
  const run = () => {
    const input = clean(form);
    setSubmitted(input);
    setQ(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v)])));
  };
  const activeInput = submitted ?? clean(form);
  const sceneUrl = useMemo(() => `/plan/scene?${new URLSearchParams(Object.entries(activeInput).map(([k, v]) => [k, String(v)])).toString()}`, [activeInput]);
  const navUrl = useMemo(() => `/navigator?${new URLSearchParams(Object.entries(activeInput).map(([k, v]) => [k, String(v)])).toString()}`, [activeInput]);
  const launchSites = useLaunchSites();
  const [launchSiteId, setLaunchSiteId] = useState(q.get('launchSiteId') ?? 'ksc-lc-39a');
  const journeyUrl = useMemo(() => `/plan/journey?${new URLSearchParams([...Object.entries(activeInput).map(([k, v]) => [k, String(v)]), ['launchSiteId', launchSiteId]]).toString()}`, [activeInput, launchSiteId]);
  const sitePresets = useMemo(() => [
    ...(sites?.landingSites.filter((s) => s.latitude != null).map((s) => ({ id: `clps:${s.id}`, name: `CLPS · ${s.name}`, lat: s.latitude!, lon: s.longitude! })) ?? []),
    ...(history?.missions.filter((m) => m.site && m.missionType !== 'impact').map((m) => ({ id: `hist:${m.id}`, name: `${m.eventDate.slice(0, 4)} · ${m.name}`, lat: m.site!.latitude, lon: m.site!.longitude })) ?? []),
  ], [sites, history]);

  return (
    <div>
      <MissionIntelSubnav input={activeInput} />
      <div className="page-head">
        <h1>Landing plan studio <Badge tone="warn">research engine · model output</Badge></h1>
        <p className="dim">
          Pick a site and a lander, and the Python research engine computes terrain features and a 360° horizon mask from the LOLA DEM, evaluates the electrical power
          budget and Golden Mission Window, checks structured engineering constraints, compares the site with
          {history ? ` ${history.missions.filter((m) => m.missionType !== 'impact').length}` : ''} historical landing attempts (NSSDCA), and runs a powered-descent simulation.
        </p>
      </div>
      <section className="mission-plan-intro" data-tour-target="plan-intro" aria-label="How to create a mission plan">
        <div className="mission-plan-intro-head">
          <div>
            <span className="mono mission-plan-kicker">BEGINNER-FRIENDLY MISSION PLANNER</span>
            <h2>Build your plan in five clear steps</h2>
            <p>Choose where to land, configure the vehicle, describe the mission, run the analysis, then execute it in 3D.</p>
          </div>
          <span className="mission-plan-status mono">INPUT → CHECK → DECIDE → EXECUTE</span>
        </div>
        <div className="mission-plan-checklist">
          <div><span>01</span><strong>Choose a site</strong><small>Coordinates or a known lunar location</small></div>
          <div><span>02</span><strong>Configure vehicle</strong><small>Lander, launcher and transfer</small></div>
          <div><span>03</span><strong>Set the mission</strong><small>Days, data and communications</small></div>
          <div><span>04</span><strong>Check the result</strong><small>Safety, power and timing</small></div>
          <div><span>05</span><strong>Execute in 3D</strong><small>Navigator, journey or simulation</small></div>
        </div>
      </section>
      <SpaceAppsResourceBar
        input={activeInput}
        plan={plan}
        onSelectSite={(s) => {
          const next = { ...form, latitude: s.latitude, longitude: s.longitude, landerId: s.landerId ?? form.landerId };
          setForm(next);
          const cleaned = clean(next);
          setSubmitted(cleaned);
          setQ(Object.fromEntries(Object.entries(cleaned).map(([k, v]) => [k, String(v)])));
        }}
      />
      <div className="plan-grid">
        <div>
          <Panel title="1 · Landing site">
            <div className="panel-body form-grid">
              <label className="wide" data-tour-target="plan-site">Preset site
                <select value="" onChange={(e) => { const p = sitePresets.find((s) => s.id === e.target.value); if (p) setForm((f) => ({ ...f, latitude: p.lat, longitude: p.lon })); }}>
                  <option value="">— choose a catalogued site or type coordinates —</option>
                  {sitePresets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.lat.toFixed(2)}, {p.lon.toFixed(2)})</option>)}
                </select>
              </label>
              <label>Latitude (°, −90..90)<input type="number" step="0.01" min={-90} max={90} value={form.latitude} onChange={(e) => set('latitude', e.target.value)} /></label>
              <label>Longitude (°, −180..180)<input type="number" step="0.01" min={-180} max={180} value={form.longitude} onChange={(e) => set('longitude', e.target.value)} /></label>
            </div>
          </Panel>
          <Panel title="2 · Lander & launch">
            <div className="panel-body form-grid">
              <label className="wide" data-tour-target="plan-vehicle">Lander class (editable approximate figures)
                <select value={form.landerId} onChange={(e) => applyPreset(e.target.value)}>
                  {options?.landers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              {preset && <div className="wide dim" style={{ fontSize: 12 }}>{preset.note} · confidence: {preset.confidence}</div>}
              <label>Dry mass (kg)<input type="number" placeholder={String(preset?.dryMassKg ?? '')} value={form.dryMassKg ?? ''} onChange={(e) => set('dryMassKg', e.target.value)} /></label>
              <label>Propellant (kg)<input type="number" placeholder={String(preset?.propellantKg ?? '')} value={form.propellantKg ?? ''} onChange={(e) => set('propellantKg', e.target.value)} /></label>
              <label>Payload (kg)<input type="number" value={form.payloadKg} onChange={(e) => set('payloadKg', e.target.value)} /></label>
              <label>Main thrust (N)<input type="number" placeholder={String(preset?.thrustN ?? '')} value={form.thrustN ?? ''} onChange={(e) => set('thrustN', e.target.value)} /></label>
              <label>Isp (s)<input type="number" placeholder={String(preset?.ispS ?? '')} value={form.ispS ?? ''} onChange={(e) => set('ispS', e.target.value)} /></label>
              <label>Min throttle (0–1)<input type="number" step="0.05" placeholder={String(preset?.minThrottle ?? '')} value={form.minThrottle ?? ''} onChange={(e) => set('minThrottle', e.target.value)} /></label>
              <label>Launch vehicle
                <select value={form.launchVehicleId} onChange={(e) => set('launchVehicleId', e.target.value)}>
                  {options?.launchVehicles.map((l) => <option key={l.id} value={l.id}>{l.name} (~{l.tliCapacityKg.toLocaleString()} kg TLI)</option>)}
                </select>
              </label>
              <label>Transfer
                <select value={form.transferId} onChange={(e) => set('transferId', e.target.value)}>
                  {options?.transfers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="wide">Launch site (for the Earth→Moon route)
                <select value={launchSiteId} onChange={(e) => setLaunchSiteId(e.target.value)}>
                  {launchSites.data?.launchSites.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.country} ({l.latitude.toFixed(2)}°, {l.longitude.toFixed(2)}°)</option>)}
                </select>
              </label>
            </div>
          </Panel>
          <Panel title="3 · Operations & Constraints">
            <div className="panel-body form-grid" data-tour-target="plan-ops">
              <label>Days in lunar orbit<input type="number" step="0.5" min={0.2} max={60} value={form.orbitDays} onChange={(e) => set('orbitDays', e.target.value)} /></label>
              <label>Surface operations (days)<input type="number" step="1" min={1} max={60} value={form.surfaceDays} onChange={(e) => set('surfaceDays', e.target.value)} /></label>
              <label>Science data volume (GB)<input type="number" step="1" value={form.dataVolumeGb} onChange={(e) => set('dataVolumeGb', e.target.value)} /></label>
              <label>Downlink rate (Mbit/s)<input type="number" step="0.5" value={form.downlinkMbps} onChange={(e) => set('downlinkMbps', e.target.value)} /></label>
              <label className="wide">Landing date (UTC, optional — default: next terrain-masked sunrise window)
                <input type="text" placeholder="YYYY-MM-DD or YYYY-MM-DDTHH:MMZ" value={form.landingDate ?? ''} onChange={(e) => set('landingDate', e.target.value)} />
              </label>
              <div className="wide btn-row" data-tour-target="plan-actions">
                <button className="btn primary" onClick={run} disabled={isFetching}>{isFetching ? 'Computing…' : 'Run analysis'}</button>
                {plan && <Link className="btn primary" to={navUrl}>⚡ Hybrid 3D Navigator</Link>}
                {plan && <Link className="btn" to={sceneUrl}>▶ Simulate in 3D</Link>}
                {plan && <Link className="btn" to={journeyUrl} title="Earth launch → Moon route computed from the precedent profile of this lander class">↗ Journey from Earth</Link>}
              </div>
              {error && <Note>Research engine error: {(error as Error).message}</Note>}
            </div>
          </Panel>
          {model && (
            <Panel title={<>Historical Outcome Model <Badge tone="warn">Exploratory · Not Reliability</Badge></>}>
              <div className="panel-body">
                <KV k="Algorithm" v={model.algorithm} />
                <KV k="Training set" v={`${model.n} landing attempts (1965–2025), ${model.positives} nominal · trained ${model.trainedAt.slice(0, 10)}`} />
                <KV k="Leave-one-out CV" v={`accuracy ${(model.looCv.accuracy * 100).toFixed(0)} % (majority baseline ${(model.majorityBaselineAccuracy * 100).toFixed(0)} %) · balanced ${(model.looCv.balancedAccuracy * 100).toFixed(0)} % · Brier ${model.looCv.brier}`} />
                <KV k="Standardized coefficients" v={<span className="mono" style={{ fontSize: 12 }}>{Object.entries(model.coefficientsStandardized).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' · ')}</span>} />
                <KV k="Terrain source" v={model.demSource} />
                <ul className="flags">{model.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            </Panel>
          )}
        </div>
        <div>
          {!plan && <Panel title="Results"><div className="panel-body"><Note>Run the analysis to see the mission calculation, terrain analysis, power budget, constraints, and descent profile.</Note></div></Panel>}
          {plan && (
            <>
              <div data-tour-target="plan-results">
              <Panel
                title={
                  <>
                    Mission calculation &amp; Constraints{' '}
                    <Badge tone={(plan.viabilityScore ?? 80) >= 70 ? 'ok' : 'warn'}>
                      Viability {(plan.viabilityScore ?? 80).toFixed(0)}/100
                    </Badge>
                  </>
                }
              >
                <div className="panel-body">
                  <KV k="Total mission time" v={`${plan.summaryCard.totalMissionTime} (${plan.timeline.totalDays} d)`} />
                  {plan.ephemeris && <KV k="Calendar (ephemeris)" v={<span className="mono" style={{ fontSize: 12 }}>launch {plan.ephemeris.calendar.launchUtc} → landing {plan.ephemeris.calendar.landingUtc} → surface ops end {plan.ephemeris.calendar.surfaceEndUtc}</span>} />}
                  {plan.ephemeris && <KV k="At landing" v={`Sun ${plan.ephemeris.atLanding.sunElevationDeg}° (az ${plan.ephemeris.atLanding.sunAzimuthDeg}°)${plan.ephemeris.atLanding.sunVisible === false ? ' — below terrain horizon' : ` · +${plan.ephemeris.atLanding.sunClearanceDeg ?? 0}° clear`} · Earth ${plan.ephemeris.atLanding.earthElevationDeg}°${plan.ephemeris.atLanding.earthVisible === false ? ' (hidden)' : ''}`} />}
                  <KV k="Launch vehicle" v={`${plan.summaryCard.launchVehicle} · stack ${plan.budget.mass.atTliKg.toLocaleString()} kg at TLI`} />
                  <KV k="Payload mass" v={plan.summaryCard.payloadMass} />
                  <KV k="Landing site" v={`${plan.summaryCard.landingSite} · Earth elevation ${plan.site.earthElevationDeg}°`} />
                  <KV k="Data downlink" v={plan.summaryCard.dataDownlink} />
                  <KV k="Δv chain" v={<span className="mono" style={{ fontSize: 12 }}>corrections {plan.budget.deltaV.transferCorrectionsMps} · LOI {Math.round(plan.budget.deltaV.loiMps)} · DOI {Math.round(plan.budget.deltaV.doiMps)} · descent {Math.round(plan.budget.deltaV.descentMps)} · reserve {plan.budget.deltaV.hoverReserveMps} = {Math.round(plan.budget.deltaV.totalMps)} m/s</span>} />
                  <KV k="Mass chain" v={<span className="mono" style={{ fontSize: 12 }}>TLI {Math.round(plan.budget.mass.atTliKg)} → after LOI {Math.round(plan.budget.mass.afterLoiKg)} → PDI {Math.round(plan.budget.mass.atPdiKg)} → touchdown {Math.round(plan.budget.mass.atTouchdownKg)} kg</span>} />
                  <KV k="Propellant margin" v={<Badge tone={plan.budget.mass.propellantMarginKg >= 0 ? 'ok' : 'bad'}>{Math.round(plan.budget.mass.propellantMarginKg)} kg · max payload ≈ {Math.round(plan.budget.mass.maxPayloadKg)} kg</Badge>} />
                  <KV k="Powered descent" v={`${(plan.descent.durationS / 60).toFixed(1)} min · PDI ${Math.abs(plan.descent.downrangeAtPdiKm).toFixed(0)} km uprange at ${plan.descent.initial.altitudeM / 1000} km · peak throttle ${Math.round(plan.descent.peakThrottle * 100)} % · touchdown ${plan.descent.touchdownSpeedMps} m/s`} />

                  {plan.constraints && (
                    <div style={{ marginTop: 10 }}>
                      <ConstraintMatrix constraints={plan.constraints} compact />
                    </div>
                  )}

                  <h4 className="card-title">Powered-descent profile (simulated)</h4>
                  <DescentChart plan={plan} />
                  <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>purple = altitude, blue dashed = speed, amber bars = throttle · closed-loop E-guidance from a {plan.descent.initial.descentOrbitKm[0]} × {plan.descent.initial.descentOrbitKm[1]} km descent orbit</div>
                  <h4 className="card-title">Phases</h4>
                  <ol className="phase-rail">
                    {plan.timeline.phases.map((p) => (
                      <li key={p.id} className="phase done" title={p.note}>
                        <span className="phase-glyph">•</span><span className="phase-name">{p.name}</span>
                        <span className="phase-meta">{p.durationS >= 86400 ? `${(p.durationS / 86400).toFixed(1)} d` : p.durationS >= 3600 ? `${(p.durationS / 3600).toFixed(1)} h` : `${Math.round(p.durationS / 60)} min`}{p.deltaVMps ? ` · Δv ${Math.round(p.deltaVMps)} m/s` : ''}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="btn-row">
                    <Link className="btn primary" to={navUrl}>⚡ Open in Hybrid 3D Navigator</Link>
                    <Link className="btn" to={sceneUrl}>▶ Simulate in 3D</Link>
                    <Link className="btn" to={journeyUrl}>↗ Journey from Earth</Link>
                  </div>
                </div>
              </Panel>
              </div>

              <Panel title={<>Terrain &amp; 360° Horizon Analysis <Badge tone={plan.site.terrain.grade?.startsWith('science') ? 'ok' : 'warn'}>{plan.site.terrain.grade?.startsWith('science') ? `LOLA GDR ${plan.site.terrain.resolutionM} m` : 'regional 16 px/deg'}</Badge></>}>
                <div className="panel-body">
                  <KV k="Data" v={<span style={{ fontSize: 12 }}>{plan.site.terrain.dataSource}{plan.site.terrain.regional ? ` · regional check: ${plan.site.terrain.regional.elevationM} m, slope ${plan.site.terrain.regional.slopeDeg}° at ${plan.site.terrain.regional.baselineM} m` : ''}</span>} />
                  <KV k="Elevation" v={`${plan.site.terrain.elevationM.toFixed(0)} m (datum 1737.4 km)`} />
                  <KV k="Slope / aspect" v={`${plan.site.terrain.slopeDeg}° / ${plan.site.terrain.aspectDeg}° at ${plan.site.terrain.baselineM} m baseline`} />
                  <KV k="Roughness σ / relief" v={`${plan.site.terrain.roughnessM} m (${plan.site.terrain.roughnessWindowM ?? '—'} m window) / ${plan.site.terrain.reliefM} m (${plan.site.terrain.reliefWindowM ?? '—'} m)`} />
                  <KV k="Max Sun elevation" v={`${plan.site.terrain.maxSunElevationDeg}° geometric${plan.site.terrain.polar ? ' · polar' : ''}`} />
                  {plan.site.horizon && (
                    <>
                      <KV k="Terrain horizon" v={`up to ${Math.max(...plan.site.horizon.elevationDeg).toFixed(1)}° (az ${plan.site.horizon.elevationDeg.indexOf(Math.max(...plan.site.horizon.elevationDeg)) * plan.site.horizon.azimuthStepDeg}°) within ${plan.site.horizon.maxKm} km`} />
                      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 12, alignItems: 'center', margin: '8px 0' }}>
                        <PolarHorizonPlot
                          horizon={plan.site.horizon}
                          atLanding={plan.ephemeris?.atLanding}
                          samples={plan.ephemeris?.samples}
                          size={230}
                        />
                        <div>
                          <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>2D Azimuth Horizon Strip (0°..360°)</div>
                          <HorizonStrip plan={plan} height={80} />
                          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>{plan.site.horizon.note}</div>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="heat" style={{ gridTemplateColumns: `repeat(${plan.analysisGrid.cols}, 1fr)` }} title="suitability heuristic ±1° around the site (green = better) — click a cell to move the site there">
                    {plan.analysisGrid.suitability.map((v, i) => {
                      const g = plan.analysisGrid; const r = Math.floor(i / g.cols); const c = i % g.cols;
                      const lat = g.bounds.north - (r + 0.5) * (g.bounds.north - g.bounds.south) / g.rows;
                      const lon = g.bounds.west + (c + 0.5) * (g.bounds.east - g.bounds.west) / g.cols;
                      const isSite = r === Math.floor(g.rows / 2) && c === Math.floor(g.cols / 2);
                      return (
                        <span key={i} className={isSite ? 'site' : undefined} style={{ background: heatColor(v) }}
                          title={`${lat.toFixed(3)}°, ${lon.toFixed(3)}° · score ${(v * 100).toFixed(0)} · slope ${g.slopeDeg[i]}° · σ ${g.roughnessM[i]} m · ${g.elevationM[i]} m`}
                          onClick={() => setForm((f) => ({ ...f, latitude: Number(lat.toFixed(3)), longitude: Number(lon.toFixed(3)) }))} />
                      );
                    })}
                  </div>
                  <div className="dim" style={{ fontSize: 11 }}>Click a greener cell to move the site there, then run the analysis again.</div>
                  <Note>{plan.analysisGrid.method}. {plan.analysisGrid.cellM ? `Cells ≈ ${plan.analysisGrid.cellM} m over ±${plan.analysisGrid.halfKm} km. ` : ''}Heuristic score, not a NASA product; {plan.analysisGrid.grade?.startsWith('science') ? 'even 240 m/px is coarser than lander-scale hazards (rocks, small craters)' : 'the regional DEM is ~1.9 km/px, far coarser than landing-hazard scales'}.</Note>
                </div>
              </Panel>

              {plan.ephemeris && (
                <Panel title={<>Illumination, Power Budget &amp; Golden Mission Window <Badge tone="info">Meeus/IAU 2009 · ≤0.6′ at 3 JPL Horizons epochs</Badge></>}>
                  <div className="panel-body">
                    {plan.powerBudget && (
                      <div style={{ marginBottom: 12 }}>
                        <h4 className="card-title" style={{ marginTop: 0 }}>Electrical Power Balance &amp; Golden Window Overlap</h4>
                        <PowerBudgetChart powerBudget={plan.powerBudget} goldenWindows={plan.goldenWindows} height={165} />
                      </div>
                    )}
                    <h4 className="card-title">Sun &amp; Earth Elevation Profile (with Terrain Masking)</h4>
                    <IlluminationChart plan={plan} />
                    <div className="dim" style={{ fontSize: 11, margin: '4px 0 8px' }}>Sun (amber) and Earth (blue) elevation at the site from launch to mission end; red ticks = Sun above the geometric horizon but behind terrain; teal band = surface operations.</div>
                    {plan.site.comms && <KV k="Surface ops" v={`sunlit ${Math.round(plan.site.comms.sunlitFraction * 100)} % of the time · Earth ${plan.site.comms.earthElevationMinDeg}–${plan.site.comms.earthElevationMaxDeg}° elevation, terrain-masked visible ${Math.round(plan.site.comms.earthVisibleFraction * 100)} %${plan.site.relayRequired ? ' → relay recommended' : ' → direct-to-Earth feasible'}`} />}
                    <h4 className="card-title">Terrain-Masked Golden Landing Opportunities (Sun rising above local terrain mask &amp; ≥ {plan.ephemeris.targetSunElevationDeg.toFixed(1)}°)</h4>
                    <table className="table small">
                      <thead><tr><th>Landing UTC</th><th>Sun @ TD</th><th>Cont. Sunlit</th><th>Peak Sun</th><th>Earth LOS (14d)</th><th>Golden Score</th><th></th></tr></thead>
                      <tbody>
                        {plan.ephemeris.windows.map((w) => (
                          <tr key={w.utc} className={w.utc === plan.ephemeris!.calendar.landingUtc ? 'active' : undefined}>
                            <td className="mono">{w.utc}</td>
                            <td>{w.sunElevationDeg}°{w.sunVisible === false ? ' ⊘' : ''}</td>
                            <td>{((w.continuousSunlitHoursAfter ?? w.sunlitHoursAfter) / 24).toFixed(1)} d</td>
                            <td>{w.peakSunElevationDeg}°</td>
                            <td>{w.earthVisibleFraction14d != null ? `${Math.round(w.earthVisibleFraction14d * 100)}% (${w.earthElevationMinDeg14d}..${w.earthElevationMaxDeg14d}°)` : `${w.earthElevationMinDeg14d}–${w.earthElevationMaxDeg14d}°`}</td>
                            <td>
                              {w.goldenScore != null ? (
                                <Badge tone={w.goldenFeasible ? 'ok' : 'warn'}>{w.goldenScore.toFixed(0)}/100</Badge>
                              ) : '—'}
                            </td>
                            <td><button className="btn small" onClick={() => { setForm((f) => ({ ...f, landingDate: w.utc })); setSubmitted(clean({ ...form, landingDate: w.utc })); }}>Use</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Note>
                      {plan.ephemeris.model}.{' '}
                      {plan.ephemeris.validation ? `${plan.ephemeris.validation.scopeNote} (Tested UTC epochs: ${plan.ephemeris.validation.testedEpochsUtc.join(', ')}).` : ''}
                    </Note>
                  </div>
                </Panel>
              )}

              <Panel title={<>Exploratory Historical Comparison <Badge tone="warn">Statistical Reference Only</Badge></>}>
                <div className="panel-body">
                  <KV k="Historical comparison" v={<span>{(plan.outcomeModel.pNominal * 100).toFixed(0)} % <span className="dim">· exploratory logistic model (n={plan.outcomeModel.n}, LOO CV {(plan.outcomeModel.looCv.accuracy * 100).toFixed(0)} %) — NOT a mission reliability metric</span></span>} />
                  <KV k="Drivers" v={<span className="mono" style={{ fontSize: 12 }}>{Object.entries(plan.outcomeModel.contributions).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' · ')}</span>} />
                  <h4 className="card-title">Most similar historical sites</h4>
                  {plan.outcomeModel.neighbours.map((n) => (
                    <div key={n.id} className="kv">
                      <span className="k" style={{ color: OUTCOME_COLOR[n.outcome] }}>{OUTCOME_GLYPH[n.outcome]} {n.year}</span>
                      <span className="v">{n.name} — {n.outcome}{n.failureCategory ? ` (${n.failureCategory})` : ''} · slope {n.terrain.slopeDeg}° · σ {n.terrain.roughnessM} m · Sun ≤ {n.terrain.maxSunElevationDeg}°</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function clean(f: Form): PlanInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v))) {
      if (k === 'latitude') out[k] = Math.min(90, Math.max(-90, Number(v)));
      else if (k === 'longitude') out[k] = Math.min(180, Math.max(-180, Number(v)));
      else out[k] = v;
    }
  }
  return out as unknown as PlanInput;
}
