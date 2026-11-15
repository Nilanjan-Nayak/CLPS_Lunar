import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge, KV, Note, Panel } from './primitives';
import { DescentChart } from '@/features/planning/DescentChart';
import { ephemerisAt } from '@/features/planning/MissionSimulation';
import { PHASE_SCREEN_SECONDS, formatMissionTime, useSimStore } from '@/state/simStore';
import { useSceneStore } from '@/state/sceneStore';
import { useWorldStore } from '@/state/worldStore';
import { OUTCOME_COLOR, OUTCOME_GLYPH } from '@/features/history/HistoricLanding';
import type { PlanPhase } from '@/types/domain';

const GLYPH: Record<PlanPhase['id'], string> = { launch: '↑', separation: '⇢', transfer: '⤳', loi: '◎', landing: '↓', surface: '⌂', relay: '≋' };
const fmtDur = (s: number) => (s >= 86400 ? `${(s / 86400).toFixed(1)} d` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

/** Slider ↔ mission time mapping that gives every phase the same on-screen share it has during playback. */
function useScrub(phases: PlanPhase[] | undefined) {
  return useMemo(() => {
    if (!phases) return null;
    const spans = phases.map((p) => PHASE_SCREEN_SECONDS[p.id]);
    const total = spans.reduce((a, b) => a + b, 0);
    const toT = (v: number) => {
      let acc = 0;
      const x = (v / 1000) * total;
      for (let i = 0; i < phases.length; i++) {
        if (x <= acc + spans[i]) return phases[i].startS + ((x - acc) / spans[i]) * phases[i].durationS;
        acc += spans[i];
      }
      return phases[phases.length - 1].endS;
    };
    const fromT = (t: number) => {
      let acc = 0;
      for (let i = 0; i < phases.length; i++) {
        if (t <= phases[i].endS) return ((acc + ((t - phases[i].startS) / Math.max(1, phases[i].durationS)) * spans[i]) / total) * 1000;
        acc += spans[i];
      }
      return 1000;
    };
    return { toT, fromT };
  }, [phases]);
}

/** SimulationPanel — playback controls, phase rail, live readouts and the Mission Calculation card for a landing plan. */
export function SimulationPanel() {
  const active = useSceneStore((s) => s.config?.panels.includes('simulation'));
  const plan = useSimStore((s) => s.plan);
  const t = useSimStore((s) => s.t);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const follow = useSimStore((s) => s.follow);
  const readout = useSimStore((s) => s.readout);
  const finished = useSimStore((s) => s.finished);
  const showLabels = useWorldStore((s) => s.showLabels);
  const scrub = useScrub(plan?.timeline.phases);
  if (!active) return null;
  if (!plan) return <Panel title="Mission simulation"><Note>Computing the plan in the research engine…</Note></Panel>;
  const { play, pause, restart, setT, setSpeed, setFollow } = useSimStore.getState();
  const phases = plan.timeline.phases;
  const editQuery = new URLSearchParams(Object.entries(plan.input).filter(([, v]) => typeof v !== 'object' && v != null).map(([k, v]) => [k, String(v)]));
  editQuery.set('run', '1'); editQuery.set('landerId', plan.input.lander.id); editQuery.set('launchVehicleId', plan.input.launchVehicle.id); editQuery.set('transferId', plan.input.transfer.id);
  const om = plan.outcomeModel;
  const eph = ephemerisAt(plan, t);
  const utcNow = plan.ephemeris ? new Date(new Date(plan.ephemeris.calendar.launchUtc).getTime() + t * 1000).toISOString().slice(5, 16).replace('T', ' ') + 'Z' : null;
  const playFromPhase = (phaseId: PlanPhase['id']) => {
    const phase = phases.find((item) => item.id === phaseId);
    if (!phase) return;
    setFollow(true);
    setT(phase.startS);
    play();
  };
  return (
    <>
      <Panel title={<>Mission simulation <Badge tone="warn">MODEL</Badge></>} subtitle={<span title={utcNow ? `${utcNow} (ephemeris calendar)` : undefined}><b>{formatMissionTime(t)}</b>{utcNow ? ` · ${utcNow}` : ''}</span>}>
        <div className="panel-inner">
          <div className="sim-controls">
            <button className="btn primary" onClick={() => (playing ? pause() : play())}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="btn icon" onClick={restart} title="restart">↺</button>
            <div className="seg" role="group" aria-label="playback speed">
              {[0.5, 1, 2, 4].map((x) => (
                <button key={x} className={speed === x ? 'on' : ''} onClick={() => setSpeed(x)}>{x}×</button>
              ))}
            </div>
            <button className={`chip${follow ? ' on' : ''}`} onClick={() => setFollow(!follow)} title="Chase camera follows the simulated spacecraft">follow cam</button>
          </div>
          <div className="sim-quick-actions" aria-label="Quick 3D playback">
            <span className="dim">Quick view:</span>
            <button className="btn small" onClick={() => playFromPhase('launch')}>🚀 Watch launch</button>
            <button className="btn small" onClick={() => playFromPhase('landing')}>↓ Watch landing</button>
          </div>
          <div className="flight-hover-hint"><b aria-hidden="true">◎</b>{showLabels ? 'Hover or tap a marker for details; move away to hide.' : 'Enable Labels in Scene Config to inspect markers.'}</div>
          {scrub && (
            <input className="sim-scrub" type="range" min={0} max={1000} value={Math.round(scrub.fromT(t))} onChange={(e) => { pause(); setT(scrub.toT(Number(e.target.value))); }} />
          )}
          <ol className="phase-rail">
            {phases.map((p) => (
              <li key={p.id} className={`phase${readout.phaseId === p.id ? ' active' : ''}${t >= p.endS ? ' done' : ''}`} onClick={() => { pause(); setT(p.startS); }} title={p.note}>
                <span className="phase-glyph">{GLYPH[p.id]}</span>
                <span className="phase-name">{p.name}</span>
                <span className="phase-meta">{fmtDur(p.durationS)}{p.deltaVMps ? ` · Δv ${Math.round(p.deltaVMps)} m/s` : ''}</span>
              </li>
            ))}
          </ol>
          {finished && (
            <div className="sim-banner" role="status">
              <strong>{plan.budget.mass.propellantMarginKg >= 0 ? 'MISSION COMPLETE — simulated' : 'SIMULATION COMPLETE — budget does not close'}</strong>
              <span>
                {plan.budget.mass.propellantMarginKg >= 0
                  ? `Model output for ${plan.summaryCard.landingSite}: ${plan.summaryCard.payloadMass} delivered, ${plan.summaryCard.dataDownlink}.`
                  : `With these parameters the lander is ${Math.abs(Math.round(plan.budget.mass.propellantMarginKg))} kg of propellant short (max payload ≈ ${Math.round(plan.budget.mass.maxPayloadKg)} kg) — edit the plan.`}
                {' '}Not a prediction of any real flight.
              </span>
            </div>
          )}
          {(() => { const lp = phases.find((p) => p.id === 'landing'); const inLanding = lp && t >= lp.startS && t <= lp.endS; const tSincePdi = lp ? t - (lp.endS - plan.descent.durationS) : -1;
            return inLanding ? <div style={{ margin: '8px 0 2px' }}><DescentChart plan={plan} cursorT={tSincePdi} height={120} /></div> : null; })()}
          <div className="readouts mono">
            <span>alt {readout.altitudeKm > 50 ? `${Math.round(readout.altitudeKm).toLocaleString()} km` : `${Math.round(readout.altitudeKm * 1000).toLocaleString()} m`}</span>
            <span>v {Math.round(readout.speedMps).toLocaleString()} m/s</span>
            <span>m {Math.round(readout.massKg).toLocaleString()} kg</span>
            <span>thr {readout.throttle > 0 ? `${Math.round(readout.throttle * 100)} %` : '—'}</span>
            {eph && <span title={`Sun elevation / azimuth at the site (ephemeris model${eph.sunVisible === false ? ', below terrain horizon' : ''})`}>☀ {eph.sunElevationDeg.toFixed(1)}°{eph.sunVisible === false ? '⊘' : ''}</span>}
            {eph && <span title="Earth elevation at the site (comms geometry, ephemeris model)">⊕ {eph.earthElevationDeg.toFixed(1)}°{eph.earthVisible === false ? '⊘' : ''}</span>}
          </div>
        </div>
      </Panel>
      <Panel title="Mission calculation">
        <div className="panel-inner">
          <KV k="Total mission time" v={plan.summaryCard.totalMissionTime} />
          <KV k="Launch vehicle" v={plan.summaryCard.launchVehicle} />
          <KV k="Payload mass" v={plan.summaryCard.payloadMass} />
          <KV k="Landing site" v={plan.summaryCard.landingSite} />
          <KV k="Data downlink" v={plan.summaryCard.dataDownlink} />
          <KV k="Δv chain" v={<span className="mono">LOI {Math.round(plan.budget.deltaV.loiMps)} · DOI {Math.round(plan.budget.deltaV.doiMps)} · descent {Math.round(plan.budget.deltaV.descentMps)} · total {Math.round(plan.budget.deltaV.totalMps)} m/s</span>} />
          <KV k="Propellant" v={`${Math.round(plan.budget.mass.propellantUsedKg)} kg used · margin ${Math.round(plan.budget.mass.propellantMarginKg)} kg`} />
          <KV k="Powered descent" v={`${(plan.descent.durationS / 60).toFixed(1)} min from ${plan.descent.initial.altitudeM / 1000} km · touchdown ${plan.descent.touchdownSpeedMps} m/s`} />
          <KV k="Terrain (LOLA)" v={`${plan.site.terrain.elevationM.toFixed(0)} m · slope ${plan.site.terrain.slopeDeg}° · σ ${plan.site.terrain.roughnessM} m · Sun ≤ ${plan.site.terrain.maxSunElevationDeg}°`} />
          {plan.viabilityScore != null && (
            <KV k="Viability & Power" v={<span><b>{plan.viabilityScore.toFixed(0)}/100</b>{plan.powerBudget ? ` · min SOC ${plan.powerBudget.summary.minSocPct.toFixed(0)}% · Golden ${plan.goldenWindows?.totalGoldenDays.toFixed(1) ?? '—'}d` : ''}</span>} />
          )}
          <KV k="Historical ML (exp.)" v={<span>{(om.pNominal * 100).toFixed(0)} % <span className="dim">· exploratory comparison, n={om.n}, LOO CV {(om.looCv.accuracy * 100).toFixed(0)} %</span></span>} />
          <div className="neighbours">
            {om.neighbours.map((n) => (
              <span key={n.id} className="chip" style={{ borderColor: OUTCOME_COLOR[n.outcome] }} title={`${n.year} · ${n.outcome}${n.failureCategory ? ` · ${n.failureCategory}` : ''} · slope ${n.terrain.slopeDeg}°`}>
                {OUTCOME_GLYPH[n.outcome]} {n.name} ({n.year})
              </span>
            ))}
          </div>
          {plan.flags.length > 0 && <ul className="flags">{plan.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
          <div className="btn-row">
            <Link className="btn primary" to={`/navigator?${editQuery.toString()}`}>⚡ Hybrid Navigator</Link>
            <Link className="btn" to={`/plan?${editQuery.toString()}`}>Edit plan</Link>
            <Link className="btn" to={`/plan/journey?${editQuery.toString()}`} title="Earth launch → Moon route for this plan (research engine, precedent profile)">↗ Journey</Link>
          </div>
          <Note>{plan.provenance.note}</Note>
        </div>
      </Panel>
    </>
  );
}
