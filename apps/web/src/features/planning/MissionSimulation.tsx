import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import { EARTH_POSITION_KM, EARTH_RADIUS_KM, MOON_RADIUS_KM } from '@/constants/frames';
import { geometryAt } from '@/solar-system/ephemeris';
import { useClockStore, worldClock } from '@/state/clockStore';
import { useSurfaceAnchor } from '@/hooks/useSurfaceFrame';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { formatMissionTime, missionRate, phaseAt, simCamera, useSimStore } from '@/state/simStore';
import { useWorldStore } from '@/state/worldStore';
import type { EphemSample, PlanPhase, PlanResult } from '@/types/domain';

/** Linear interpolation of the research engine's ephemeris samples at mission time t (s); longitudes unwrapped. */
export function ephemerisAt(plan: PlanResult, t: number): EphemSample | null {
  const s = plan.ephemeris?.samples;
  if (!s || s.length === 0) return null;
  if (t <= (s[0].t ?? 0)) return s[0];
  let i = 0;
  while (i < s.length - 2 && (s[i + 1].t ?? 0) <= t) i++;
  const a = s[i]; const b = s[i + 1] ?? a;
  const ta = a.t ?? 0; const tb = b.t ?? ta + 1;
  const f = Math.max(0, Math.min(1, (t - ta) / (tb - ta || 1)));
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const lerpLon = (x: number, y: number) => { let d = y - x; if (d > 180) d -= 360; if (d < -180) d += 360; const v = x + d * f; return ((v + 540) % 360) - 180; };
  return {
    utc: f < 0.5 ? a.utc : b.utc, t,
    sunElevationDeg: lerp(a.sunElevationDeg, b.sunElevationDeg), sunAzimuthDeg: lerpLon(a.sunAzimuthDeg, b.sunAzimuthDeg),
    earthElevationDeg: lerp(a.earthElevationDeg, b.earthElevationDeg), earthAzimuthDeg: lerpLon(a.earthAzimuthDeg, b.earthAzimuthDeg),
    subSolarLat: lerp(a.subSolarLat, b.subSolarLat), subSolarLon: lerpLon(a.subSolarLon, b.subSolarLon),
    subEarthLat: lerp(a.subEarthLat, b.subEarthLat), subEarthLon: lerpLon(a.subEarthLon, b.subEarthLon),
    earthDistanceKm: lerp(a.earthDistanceKm, b.earthDistanceKm), sunVisible: f < 0.5 ? a.sunVisible : b.sunVisible, earthVisible: f < 0.5 ? a.earthVisible : b.earthVisible,
  };
}

/** Earth position used by the schematic transfer geometry — set per plan from the ephemeris at launch time. */
const EARTH = new Vector3(...EARTH_POSITION_KM);
const ORBIT_ALT_KM = 100;
const ORBIT_PERIOD_S = 2 * Math.PI * Math.sqrt(Math.pow((MOON_RADIUS_KM + ORBIT_ALT_KM) * 1000, 3) / 4.9028e12);
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

interface Geometry {
  e1: Vector3; e2: Vector3; rSite: number; P: Vector3;
  phiPdi: number; phiDoi: number; phiArr: number;
  L0: Vector3; L1: Vector3; L2: Vector3; A: Vector3; C: Vector3;
  orbitRing: Vector3[]; transferArc: Vector3[]; descentPath: Vector3[];
  relayDirect: boolean; relayPoints: Vector3[];
}

function ringPoint(g: Geometry, phi: number, r: number, out = new Vector3()) {
  return out.copy(g.e1).multiplyScalar(Math.cos(phi) * r).addScaledVector(g.e2, Math.sin(phi) * r);
}
function bezier(a: Vector3, c: Vector3, b: Vector3, t: number, out = new Vector3()) {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
}

/** Interpolated spacecraft state at mission time t (position + readouts + local frame for the chase camera). */
function stateAt(plan: PlanResult, g: Geometry, t: number, out: { pos: Vector3; fwd: Vector3; radial: Vector3 }) {
  const phase = phaseAt(plan, t);
  const f = clamp01((t - phase.startS) / Math.max(phase.durationS, 1));
  let altitudeKm = 0, speedMps = 0, massKg = plan.budget.mass.atTliKg, throttle = 0;
  switch (phase.id) {
    case 'launch':
      out.pos.copy(g.L0).lerp(g.L1, ease(f));
      out.fwd.copy(g.L1).sub(g.L0).normalize(); out.radial.copy(out.pos).sub(EARTH).normalize();
      speedMps = 7800 * ease(f); altitudeKm = out.pos.distanceTo(EARTH) - EARTH_RADIUS_KM;
      break;
    case 'separation':
      out.pos.copy(g.L1).lerp(g.L2, f);
      out.fwd.copy(g.L2).sub(g.L1).normalize(); out.radial.copy(out.pos).sub(EARTH).normalize();
      speedMps = 7800 + 3100 * f; altitudeKm = out.pos.distanceTo(EARTH) - EARTH_RADIUS_KM;
      break;
    case 'transfer': {
      const s = ease(f);
      bezier(g.L2, g.C, g.A, s, out.pos);
      const ahead = bezier(g.L2, g.C, g.A, Math.min(1, s + 0.01));
      out.fwd.copy(ahead).sub(out.pos).normalize(); out.radial.copy(out.pos).normalize();
      speedMps = 10800 - 9800 * Math.sin((s * Math.PI) / 2) + 800; altitudeKm = out.pos.length() - MOON_RADIUS_KM;
      massKg = plan.budget.mass.atTliKg;
      break;
    }
    case 'loi': {
      const omega = (2 * Math.PI) / ORBIT_PERIOD_S;
      const phi = g.phiDoi - omega * (phase.endS - t);
      ringPoint(g, phi, MOON_RADIUS_KM + ORBIT_ALT_KM, out.pos);
      out.fwd.copy(g.e1).multiplyScalar(-Math.sin(phi)).addScaledVector(g.e2, Math.cos(phi)); out.radial.copy(out.pos).normalize();
      speedMps = 1633; altitudeKm = ORBIT_ALT_KM; massKg = f < 0.05 ? plan.budget.mass.atTliKg : plan.budget.mass.afterLoiKg;
      break;
    }
    case 'landing': {
      const coast = plan.descent.initial.coastFromApoluneS;
      const tau = t - phase.startS;
      if (tau < coast) {
        const c = tau / coast;
        const phi = g.phiDoi + Math.PI * c;
        const alt = ORBIT_ALT_KM - (ORBIT_ALT_KM - plan.descent.initial.altitudeM / 1000) * (1 - Math.cos(Math.PI * c)) / 2;
        ringPoint(g, phi, MOON_RADIUS_KM + alt, out.pos);
        out.fwd.copy(g.e1).multiplyScalar(-Math.sin(phi)).addScaledVector(g.e2, Math.cos(phi)); out.radial.copy(out.pos).normalize();
        speedMps = 1633 + 60 * c; altitudeKm = alt; massKg = plan.budget.mass.atPdiKg;
      } else {
        const s = plan.descent.samples;
        const td = tau - coast;
        let i = 0;
        while (i < s.length - 2 && s[i + 1].t <= td) i++;
        const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
        const k = b.t > a.t ? clamp01((td - a.t) / (b.t - a.t)) : 1;
        const downrange = a.downrangeM + (b.downrangeM - a.downrangeM) * k;
        const alt = a.altitudeM + (b.altitudeM - a.altitudeM) * k;
        const phi = downrange / 1000 / MOON_RADIUS_KM;
        ringPoint(g, phi, g.rSite + alt / 1000, out.pos);
        out.fwd.copy(g.e1).multiplyScalar(-Math.sin(phi)).addScaledVector(g.e2, Math.cos(phi)); out.radial.copy(out.pos).normalize();
        speedMps = a.speedMps + (b.speedMps - a.speedMps) * k; altitudeKm = alt / 1000; massKg = a.massKg + (b.massKg - a.massKg) * k; throttle = a.throttle + (b.throttle - a.throttle) * k;
      }
      break;
    }
    default: // surface / relay
      out.pos.copy(g.P);
      out.fwd.copy(g.e2); out.radial.copy(g.e1);
      massKg = plan.budget.mass.atTouchdownKg; altitudeKm = 0;
  }
  return { phase, altitudeKm, speedMps, massKg, throttle };
}

/**
 * MissionSimulation — animates the research engine's plan through the 7 phases (Launch → Separation → Transfer →
 * LOI → Landing → Surface ops → Data relay). Launch/transfer/orbit geometry is schematic; the powered descent
 * follows the integrated profile. Clearly a MODEL: it never represents a real mission's trajectory.
 */
export function MissionSimulation({ object }: { object: SceneObject }) {
  const plan = object.data?.plan as PlanResult | undefined;
  const anchor = useSurfaceAnchor(object.placement?.latitude, object.placement?.longitude);
  const showLabels = useWorldStore((s) => s.showLabels);
  const marker = useRef<Group>(null);
  const tRef = useRef(0);
  const lastPush = useRef(0);
  const camPos = useRef(new Vector3());
  const camTarget = useRef(new Vector3());
  const camInit = useRef(false);
  const [label, setLabel] = useState<{ phase: string; time: string } | null>(null);
  const scratch = useMemo(() => ({ pos: new Vector3(), fwd: new Vector3(), radial: new Vector3(), tmp: new Vector3(), tmp2: new Vector3() }), []);

  const launchMs = plan?.ephemeris ? Date.parse(plan.ephemeris.calendar.launchUtc) : NaN;
  const geom = useMemo<Geometry | null>(() => {
    if (!plan || !anchor) return null;
    // anchor the schematic Earth-departure geometry on the Earth's real position at the planned launch epoch
    if (!isNaN(launchMs)) EARTH.set(...geometryAt(launchMs).earthPosScene); else EARTH.set(...EARTH_POSITION_KM);
    const P = anchor.position.clone();
    const e1 = P.clone().normalize();
    const az = (plan.approachAzimuthDeg * Math.PI) / 180;
    const e2 = anchor.north.clone().multiplyScalar(Math.cos(az)).addScaledVector(anchor.east, Math.sin(az)).normalize();
    e2.addScaledVector(e1, -e2.dot(e1)).normalize();
    const rSite = P.length();
    const phiPdi = plan.descent.downrangeAtPdiKm / MOON_RADIUS_KM;
    const phiDoi = phiPdi - Math.PI;
    const orbitPhase = plan.timeline.phases.find((p) => p.id === 'loi')!;
    const phiArr = phiDoi - ((2 * Math.PI) / ORBIT_PERIOD_S) * orbitPhase.durationS;
    const g: Geometry = {
      e1, e2, rSite, P, phiPdi, phiDoi, phiArr,
      // schematic launch site on the sunlit, Moon-facing quarter of Earth (visualization lighting comes from −Z)
      L0: EARTH.clone().add(new Vector3(-0.55, 0.12, -0.83).normalize().multiplyScalar(EARTH_RADIUS_KM)),
      L1: EARTH.clone().add(new Vector3(-0.75, 0.2, -0.62).normalize().multiplyScalar(EARTH_RADIUS_KM + 300)),
      L2: EARTH.clone().add(new Vector3(-0.9, 0.25, -0.35).normalize().multiplyScalar(EARTH_RADIUS_KM + 300)),
      A: new Vector3(), C: new Vector3(), orbitRing: [], transferArc: [], descentPath: [], relayDirect: !plan.site.relayRequired, relayPoints: [],
    };
    ringPoint(g, phiArr, MOON_RADIUS_KM + ORBIT_ALT_KM, g.A);
    g.C.copy(g.L2).lerp(g.A, 0.5).add(new Vector3(0, 18_000, -48_000));
    for (let i = 0; i <= 128; i++) g.orbitRing.push(ringPoint(g, (i / 128) * Math.PI * 2, MOON_RADIUS_KM + ORBIT_ALT_KM));
    for (let i = 0; i <= 96; i++) g.transferArc.push(bezier(g.L2, g.C, g.A, i / 96));
    for (const s of plan.descent.samples) g.descentPath.push(ringPoint(g, s.downrangeM / 1000 / MOON_RADIUS_KM, rSite + s.altitudeM / 1000 + 0.01));
    g.descentPath.push(P.clone());
    if (g.relayDirect) g.relayPoints = [P.clone(), EARTH.clone()];
    else {
      const relay = P.clone().multiplyScalar((rSite + 3000) / rSite);
      g.relayPoints = [P.clone(), relay, EARTH.clone()];
    }
    return g;
  }, [plan, anchor, launchMs]);

  // scrubbing while paused
  const pushedT = useRef(-1);
  // external time changes (scrub slider, phase click, restart) — ignore the loop's own 10 Hz pushes
  useEffect(() => useSimStore.subscribe((s, prev) => { if (s.t !== prev.t && s.t !== pushedT.current) { tRef.current = s.t; camInit.current = false; } }), []);
  // release the world clock when the simulation goes away (a new scene has usually re-set it already)
  useEffect(() => () => { simCamera.active = false; const c = useClockStore.getState(); if (c.mode === 'mission') c.setLive(); }, []);

  useFrame((_, dt) => {
    if (!plan || !geom) return;
    const store = useSimStore.getState();
    let t = tRef.current;
    const total = plan.timeline.phases[plan.timeline.phases.length - 1].endS;
    if (store.playing) {
      const phase = phaseAt(plan, t);
      t = Math.min(total, t + Math.min(dt, 0.1) * missionRate(phase, store.speed));
      tRef.current = t;
      if (t >= total) { pushedT.current = t; useSimStore.setState({ playing: false, finished: true, t }); }
    }
    // World clock hand-over: once playback starts (or the user scrubs), the environment runs at mission time
    // (launch UTC + t) — the ClockDriver derives the Sun, the Earth's rotation/phase and the sky from it.
    if (!isNaN(launchMs) && (store.playing || t > 0)) {
      worldClock.epochMs = launchMs + t * 1000;
      const c = useClockStore.getState();
      if (c.mode !== 'mission') c.setMission(worldClock.epochMs, 'mission simulation (launch UTC + t)');
    }
    const st = stateAt(plan, geom, t, scratch);
    if (marker.current) {
      marker.current.position.copy(scratch.pos);
      const d = scratch.pos.distanceTo(simCamera.active ? simCamera.position : camPos.current);
      marker.current.scale.setScalar(Math.max(0.05, Math.min(3000, d * 0.014)));
    }
    // --- chase camera -----------------------------------------------------------------------------------------
    if (store.follow && (store.playing || store.t > 0)) {
      const { pos, fwd, radial, tmp, tmp2 } = scratch;
      const ph = st.phase.id;
      const desired = tmp, target = tmp2;
      if (ph === 'launch' || ph === 'separation') {
        desired.copy(pos).addScaledVector(radial, 1500).add(new Vector3(-1200, 900, -4200));
        target.copy(pos);
      } else if (ph === 'transfer') {
        const D = Math.min(40_000, Math.max(2_500, pos.length() * 0.06));
        const right = new Vector3().crossVectors(fwd, radial).normalize();
        desired.copy(pos).addScaledVector(fwd, -D).addScaledVector(radial, D * 0.3).addScaledVector(right, D * 0.35);
        target.copy(pos).addScaledVector(fwd, D * 2.5);
      } else if (ph === 'loi') {
        desired.copy(pos).addScaledVector(radial, 700).addScaledVector(fwd, -1600);
        target.copy(pos).addScaledVector(fwd, 900);
      } else if (ph === 'landing') {
        const alt = st.altitudeKm;
        const back = alt > 20 ? 900 : 4 + alt * 0.6, up = alt > 20 ? 400 : 1.6 + alt * 0.35;
        desired.copy(pos).addScaledVector(fwd, -back).addScaledVector(radial, up);
        target.copy(pos).addScaledVector(fwd, alt > 20 ? 600 : 1.5);
      } else {
        desired.copy(geom.P).addScaledVector(anchor!.up, 14).addScaledVector(anchor!.north, -11);
        target.copy(geom.P);
      }
      const k = camInit.current ? 1 - Math.exp(-3.2 * Math.min(dt, 0.1)) : 1;
      camPos.current.lerp(desired, k);
      camTarget.current.lerp(target, k);
      camInit.current = true;
      simCamera.position.copy(camPos.current);
      simCamera.target.copy(camTarget.current);
      simCamera.up.copy(ph === 'launch' || ph === 'separation' || ph === 'transfer' ? new Vector3(0, 1, 0) : radial);
      simCamera.active = true;
    } else if (simCamera.active) {
      simCamera.active = false;
      camInit.current = false;
    }
    // --- HUD (10 Hz) -------------------------------------------------------------------------------------------
    const now = performance.now();
    if (now - lastPush.current > 100) {
      lastPush.current = now;
      if (store.playing) { pushedT.current = t; useSimStore.setState({ t }); }
      store.setReadout({ phaseId: st.phase.id, altitudeKm: st.altitudeKm, speedMps: st.speedMps, massKg: st.massKg, throttle: st.throttle, distanceToMoonKm: scratch.pos.length() - MOON_RADIUS_KM });
      setLabel({ phase: st.phase.name, time: formatMissionTime(t) });
    }
  });

  if (!plan || !geom) return null;
  return (
    <group name="mission-simulation">
      <Line points={geom.transferArc} color="#8fd3ff" lineWidth={1} dashed dashSize={5000} gapSize={3500} transparent opacity={0.55} />
      <Line points={geom.orbitRing} color="#8fd3ff" lineWidth={1} transparent opacity={0.5} />
      <Line points={geom.descentPath} color="#c792ff" lineWidth={2} transparent opacity={0.95} />
      <Line points={geom.relayPoints} color="#ffd166" lineWidth={1} dashed dashSize={3000} gapSize={2000} transparent opacity={0.6} />
      <group ref={marker}>
        <mesh>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshBasicMaterial color="#c792ff" />
        </mesh>
        <mesh>
          <ringGeometry args={[0.6, 0.72, 40]} />
          <meshBasicMaterial color="#c792ff" transparent opacity={0.8} depthWrite={false} side={2} />
        </mesh>
        {showLabels && label && (
          <Html position={[0, 1.6, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div className="marker-label selected" style={{ borderColor: '#c792ff' }}>
              <span className="marker-title">Simulated lander · {label.phase}</span>
              <span className="marker-sub">{label.time} · model output, not flight data</span>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

export type { PlanPhase };
