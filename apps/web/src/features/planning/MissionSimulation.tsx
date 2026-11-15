import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { FlightMarker, formatMarkerAltitude } from '@/lunar-world/markers/FlightMarker';
import { Group, Vector3 } from 'three';
import { EARTH_POSITION_KM, EARTH_RADIUS_KM, MOON_RADIUS_KM } from '@/constants/frames';
import { liveEphemeris } from '@/solar-system/ephemerisDriver';
import { useClockStore, worldClock } from '@/state/clockStore';
import { useSurfaceAnchor } from '@/hooks/useSurfaceFrame';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { formatMissionTime, missionRate, phaseAt, simCamera, useSimStore } from '@/state/simStore';
import { useWorldStore } from '@/state/worldStore';
import type { EphemSample, PlanResult } from '@/types/domain';

/** Linear interpolation of the research engine's ephemeris samples at mission time t (s); longitudes unwrapped. */
export function ephemerisAt(plan: PlanResult, t: number): EphemSample | null {
  const s = plan.ephemeris?.samples;
  if (!s || s.length === 0) return null;
  if (t <= (s[0].t ?? 0)) return s[0];
  let i = 0;
  while (i < s.length - 2 && (s[i + 1].t ?? 0) <= t) i++;
  const a = s[i];
  const b = s[i + 1] ?? a;
  const ta = a.t ?? 0;
  const tb = b.t ?? ta + 1;
  const f = Math.max(0, Math.min(1, (t - ta) / (tb - ta || 1)));
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const lerpLon = (x: number, y: number) => {
    let d = y - x;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const v = x + d * f;
    return ((v + 540) % 360) - 180;
  };
  return {
    utc: f < 0.5 ? a.utc : b.utc,
    t,
    sunElevationDeg: lerp(a.sunElevationDeg, b.sunElevationDeg),
    sunAzimuthDeg: lerpLon(a.sunAzimuthDeg, b.sunAzimuthDeg),
    earthElevationDeg: lerp(a.earthElevationDeg, b.earthElevationDeg),
    earthAzimuthDeg: lerpLon(a.earthAzimuthDeg, b.earthAzimuthDeg),
    subSolarLat: lerp(a.subSolarLat, b.subSolarLat),
    subSolarLon: lerpLon(a.subSolarLon, b.subSolarLon),
    subEarthLat: lerp(a.subEarthLat, b.subEarthLat),
    subEarthLon: lerpLon(a.subEarthLon, b.subEarthLon),
    earthDistanceKm: lerp(a.earthDistanceKm, b.earthDistanceKm),
    sunVisible: f < 0.5 ? a.sunVisible : b.sunVisible,
    earthVisible: f < 0.5 ? a.earthVisible : b.earthVisible,
  };
}

const ORBIT_ALT_KM = 100;
const ORBIT_PERIOD_S = 2 * Math.PI * Math.sqrt(Math.pow((MOON_RADIUS_KM + ORBIT_ALT_KM) * 1000, 3) / 4.9028e12);
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Instanced Line2 geometry handle for live vertex updates when Earth moves. */
type DynLine = {
  geometry: {
    attributes: {
      instanceStart?: { data: { array: Float32Array; needsUpdate: boolean } };
    };
  };
};

function updateLinePoints(line: DynLine | null, pts: Vector3[]) {
  const attr = line?.geometry?.attributes?.instanceStart;
  if (!attr || pts.length < 2) return;
  const arr = attr.data.array;
  const nSeg = Math.min(pts.length - 1, Math.floor(arr.length / 6));
  for (let k = 0; k < nSeg; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const idx = k * 6;
    arr[idx] = a.x;
    arr[idx + 1] = a.y;
    arr[idx + 2] = a.z;
    arr[idx + 3] = b.x;
    arr[idx + 4] = b.y;
    arr[idx + 5] = b.z;
  }
  attr.data.needsUpdate = true;
}

interface Geometry {
  e1: Vector3;
  e2: Vector3;
  rSite: number;
  rOrbit: number;
  rPdi: number;
  P: Vector3;
  phiPdi: number;
  phiDoi: number;
  phiArr: number;
  earthCenter: Vector3;
  dir0: Vector3;
  dir1: Vector3;
  dir2: Vector3;
  L0: Vector3;
  L1: Vector3;
  L2: Vector3;
  A: Vector3;
  C: Vector3;
  ascentArc: Vector3[];
  orbitRing: Vector3[];
  transferArc: Vector3[];
  doiCoastPath: Vector3[];
  descentPath: Vector3[];
  relayDirect: boolean;
  relayPoints: Vector3[];
}

function ringPoint(g: Geometry, phi: number, r: number, out = new Vector3()) {
  return out.copy(g.e1).multiplyScalar(Math.cos(phi) * r).addScaledVector(g.e2, Math.sin(phi) * r);
}

function bezier(a: Vector3, c: Vector3, b: Vector3, t: number, out = new Vector3()) {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
}

/** Point on the spherical ascent + LEO parking arc around `g.earthCenter` for parameter s ∈ [0, 1] (0=pad, 0.5=L1, 1=L2). */
function earthArcPoint(g: Geometry, s: number, out = new Vector3()) {
  const u = clamp01(s);
  if (u <= 0.5) {
    const k = u * 2;
    const alt = 240 * (k * k * (3 - 2 * k));
    out.copy(g.dir0).lerp(g.dir1, k).normalize().multiplyScalar(EARTH_RADIUS_KM + alt).add(g.earthCenter);
  } else {
    const k = (u - 0.5) * 2;
    const alt = 240 + 80 * k;
    out.copy(g.dir1).lerp(g.dir2, k).normalize().multiplyScalar(EARTH_RADIUS_KM + alt).add(g.earthCenter);
  }
  return out;
}

/** Sync all Earth-attached points (L0 pad, L1 parking, L2 TLI, transfer Bezier, relay link) to the live 3D Earth center. */
function syncEarthGeometry(g: Geometry, earthPos: readonly [number, number, number] | Vector3) {
  if (earthPos instanceof Vector3) g.earthCenter.copy(earthPos);
  else g.earthCenter.set(earthPos[0], earthPos[1], earthPos[2]);

  const uToMoon = g.earthCenter.clone().negate().normalize();
  const uNorth = new Vector3(0, 1, 0);
  const uEast = new Vector3().crossVectors(uNorth, uToMoon).normalize();

  // Prograde launch corridor on the sunlit/Moon-facing hemisphere of the 3D Earth sphere (radius = EARTH_RADIUS_KM)
  g.dir0.set(0, 0, 0).addScaledVector(uToMoon, 0.42).addScaledVector(uEast, -0.84).addScaledVector(uNorth, 0.34).normalize();
  g.dir1.set(0, 0, 0).addScaledVector(uToMoon, 0.78).addScaledVector(uEast, -0.53).addScaledVector(uNorth, 0.33).normalize();
  g.dir2.set(0, 0, 0).addScaledVector(uToMoon, 0.96).addScaledVector(uEast, -0.15).addScaledVector(uNorth, 0.23).normalize();

  earthArcPoint(g, 0, g.L0);
  earthArcPoint(g, 0.5, g.L1);
  earthArcPoint(g, 1.0, g.L2);

  for (let i = 0; i <= 32; i++) {
    earthArcPoint(g, i / 32, g.ascentArc[i]);
  }

  // Smooth trans-lunar transfer curve from L2 on Earth orbit to A on the 100 km lunar capture orbit
  g.C.copy(g.L2).lerp(g.A, 0.5).addScaledVector(uEast, -28_000).addScaledVector(uNorth, 14_000);
  for (let i = 0; i <= 96; i++) {
    bezier(g.L2, g.C, g.A, i / 96, g.transferArc[i]);
  }

  if (g.relayDirect) {
    g.relayPoints[0].copy(g.P);
    g.relayPoints[1].copy(g.earthCenter);
  } else {
    const relay = g.P.clone().multiplyScalar((g.rSite + 3000) / g.rSite);
    g.relayPoints[0].copy(g.P);
    g.relayPoints[1].copy(relay);
    g.relayPoints[2].copy(g.earthCenter);
  }
}

/** Interpolated spacecraft state at mission time t (position + readouts + local frame for the chase camera). */
function stateAt(plan: PlanResult, g: Geometry, t: number, out: { pos: Vector3; fwd: Vector3; radial: Vector3 }) {
  const phase = phaseAt(plan, t);
  const f = clamp01((t - phase.startS) / Math.max(phase.durationS, 1));
  let altitudeKm = 0;
  let speedMps = 0;
  let massKg = plan.budget.mass.atTliKg;
  let throttle = 0;

  switch (phase.id) {
    case 'launch': {
      const s = 0.5 * ease(f);
      earthArcPoint(g, s, out.pos);
      const ahead = earthArcPoint(g, Math.min(1, s + 0.02));
      out.fwd.copy(ahead).sub(out.pos).normalize();
      out.radial.copy(out.pos).sub(g.earthCenter).normalize();
      speedMps = 7800 * ease(f);
      altitudeKm = out.pos.distanceTo(g.earthCenter) - EARTH_RADIUS_KM;
      break;
    }
    case 'separation': {
      const s = 0.5 + 0.5 * f;
      earthArcPoint(g, s, out.pos);
      const ahead = earthArcPoint(g, Math.min(1, s + 0.02));
      out.fwd.copy(ahead).sub(out.pos).normalize();
      out.radial.copy(out.pos).sub(g.earthCenter).normalize();
      speedMps = 7800 + 3100 * f;
      altitudeKm = out.pos.distanceTo(g.earthCenter) - EARTH_RADIUS_KM;
      break;
    }
    case 'transfer': {
      const s = ease(f);
      bezier(g.L2, g.C, g.A, s, out.pos);
      const ahead = bezier(g.L2, g.C, g.A, Math.min(1, s + 0.01));
      out.fwd.copy(ahead).sub(out.pos).normalize();
      out.radial.copy(out.pos).normalize();
      speedMps = 10800 - 9800 * Math.sin((s * Math.PI) / 2) + 800;
      altitudeKm = out.pos.length() - MOON_RADIUS_KM;
      massKg = plan.budget.mass.atTliKg;
      break;
    }
    case 'loi': {
      const omega = (2 * Math.PI) / ORBIT_PERIOD_S;
      const phi = g.phiDoi - omega * (phase.endS - t);
      ringPoint(g, phi, g.rOrbit, out.pos);
      out.fwd.copy(g.e1).multiplyScalar(-Math.sin(phi)).addScaledVector(g.e2, Math.cos(phi));
      out.radial.copy(out.pos).normalize();
      speedMps = 1633;
      altitudeKm = ORBIT_ALT_KM;
      massKg = f < 0.05 ? plan.budget.mass.atTliKg : plan.budget.mass.afterLoiKg;
      break;
    }
    case 'landing': {
      const coast = plan.descent.initial.coastFromApoluneS;
      const tau = t - phase.startS;
      if (tau < coast) {
        const c = clamp01(tau / Math.max(1, coast));
        const phi = g.phiDoi + Math.PI * c;
        const r = g.rOrbit - (g.rOrbit - g.rPdi) * (1 - Math.cos(Math.PI * c)) / 2;
        ringPoint(g, phi, r, out.pos);
        out.fwd.copy(g.e1).multiplyScalar(-Math.sin(phi)).addScaledVector(g.e2, Math.cos(phi));
        out.radial.copy(out.pos).normalize();
        speedMps = 1633 + 60 * c;
        altitudeKm = r - g.rSite;
        massKg = plan.budget.mass.atPdiKg;
      } else {
        const s = plan.descent.samples;
        const td = tau - coast;
        let i = 0;
        while (i < s.length - 2 && s[i + 1].t <= td) i++;
        const a = s[i];
        const b = s[Math.min(i + 1, s.length - 1)];
        const k = b.t > a.t ? clamp01((td - a.t) / (b.t - a.t)) : 1;
        const downrange = a.downrangeM + (b.downrangeM - a.downrangeM) * k;
        const alt = a.altitudeM + (b.altitudeM - a.altitudeM) * k;
        const phi = downrange / 1000 / MOON_RADIUS_KM;
        ringPoint(g, phi, g.rSite + alt / 1000, out.pos);
        out.fwd.copy(g.e1).multiplyScalar(-Math.sin(phi)).addScaledVector(g.e2, Math.cos(phi));
        out.radial.copy(out.pos).normalize();
        speedMps = a.speedMps + (b.speedMps - a.speedMps) * k;
        altitudeKm = alt / 1000;
        massKg = a.massKg + (b.massKg - a.massKg) * k;
        throttle = a.throttle + (b.throttle - a.throttle) * k;
      }
      break;
    }
    default: // surface / relay
      out.pos.copy(g.P);
      out.fwd.copy(g.e2);
      out.radial.copy(g.e1);
      massKg = plan.budget.mass.atTouchdownKg;
      altitudeKm = 0;
  }
  return { phase, altitudeKm, speedMps, massKg, throttle };
}

/**
 * MissionSimulation — animates the research engine's plan through the 7 phases (Launch → Separation → Transfer →
 * LOI → Landing → Surface ops → Data relay).
 *
 * Key physical/visual guarantees:
 * 1. The Launch Pad (`L0`), LEO parking arc (`L0 → L1 → L2`), trans-lunar curve (`L2 → C → A`), and Earth relay link
 *    are dynamically locked every frame to `liveEphemeris.geometry.earthPosScene` — the exact 3D Earth globe position.
 * 2. The lunar capture orbit (`rOrbit`), DOI→PDI descent coast (`doiCoastPath`), and powered descent (`descentPath`)
 *    form a single continuous curve terminating at `anchor.position` (`P`) on the LOLA DEM surface.
 */
export function MissionSimulation({ object }: { object: SceneObject }) {
  const plan = object.data?.plan as PlanResult | undefined;
  const anchor = useSurfaceAnchor(
    object.placement?.latitude,
    object.placement?.longitude,
    object.placement?.elevationKm ?? (plan ? plan.site.terrain.elevationM / 1000 : null),
  );
  const showLabels = useWorldStore((s) => s.showLabels);
  const marker = useRef<Group>(null);
  const padMarker = useRef<Group>(null);
  const ascentLine = useRef<DynLine | null>(null);
  const transferLine = useRef<DynLine | null>(null);
  const relayLine = useRef<DynLine | null>(null);
  const lastEarthPos = useRef(new Vector3(NaN, NaN, NaN));
  const tRef = useRef(useSimStore.getState().t);
  const lastPush = useRef(0);
  const camPos = useRef(new Vector3());
  const camTarget = useRef(new Vector3());
  const camInit = useRef(false);
  const [label, setLabel] = useState<{ phase: string; time: string; altitudeKm: number; body: string; speedMps: number; massKg: number; throttle: number; utc: string } | null>(null);
  const scratch = useMemo(
    () => ({
      pos: new Vector3(),
      fwd: new Vector3(),
      radial: new Vector3(),
      tang: new Vector3(),
      right: new Vector3(),
      tmp: new Vector3(),
      tmp2: new Vector3(),
    }),
    [],
  );

  const launchMs = plan?.ephemeris ? Date.parse(plan.ephemeris.calendar.launchUtc) : NaN;
  const geom = useMemo<Geometry | null>(() => {
    if (!plan || !anchor) return null;
    const P = anchor.position.clone();
    const e1 = P.clone().normalize();
    const az = (plan.approachAzimuthDeg * Math.PI) / 180;
    const e2 = anchor.north.clone().multiplyScalar(Math.cos(az)).addScaledVector(anchor.east, Math.sin(az)).normalize();
    e2.addScaledVector(e1, -e2.dot(e1)).normalize();
    const rSite = P.length();
    const rOrbit = MOON_RADIUS_KM + ORBIT_ALT_KM;
    const rPdi = rSite + plan.descent.initial.altitudeM / 1000;
    const phiPdi = plan.descent.downrangeAtPdiKm / MOON_RADIUS_KM;
    const phiDoi = phiPdi - Math.PI;
    const orbitPhase = plan.timeline.phases.find((p) => p.id === 'loi')!;
    const phiArr = phiDoi - ((2 * Math.PI) / ORBIT_PERIOD_S) * orbitPhase.durationS;

    const g: Geometry = {
      e1,
      e2,
      rSite,
      rOrbit,
      rPdi,
      P,
      phiPdi,
      phiDoi,
      phiArr,
      earthCenter: new Vector3(...(liveEphemeris.geometry.earthPosScene ?? EARTH_POSITION_KM)),
      dir0: new Vector3(),
      dir1: new Vector3(),
      dir2: new Vector3(),
      L0: new Vector3(),
      L1: new Vector3(),
      L2: new Vector3(),
      A: new Vector3(),
      C: new Vector3(),
      ascentArc: Array.from({ length: 33 }, () => new Vector3()),
      orbitRing: [],
      transferArc: Array.from({ length: 97 }, () => new Vector3()),
      doiCoastPath: [],
      descentPath: [],
      relayDirect: !plan.site.relayRequired,
      relayPoints: !plan.site.relayRequired
        ? [new Vector3(), new Vector3()]
        : [new Vector3(), new Vector3(), new Vector3()],
    };

    ringPoint(g, phiArr, rOrbit, g.A);
    for (let i = 0; i <= 128; i++) {
      g.orbitRing.push(ringPoint(g, (i / 128) * Math.PI * 2, rOrbit));
    }
    // DOI → PDI elliptic descent coast (connects 100 km orbitRing at phiDoi seamlessly to 15 km PDI at phiPdi)
    for (let i = 0; i <= 64; i++) {
      const c = i / 64;
      const phi = phiDoi + Math.PI * c;
      const r = rOrbit - (rOrbit - rPdi) * (1 - Math.cos(Math.PI * c)) / 2;
      g.doiCoastPath.push(ringPoint(g, phi, r));
    }
    // PDI → Touchdown powered descent (ends at P on the LOLA DEM surface)
    for (const s of plan.descent.samples) {
      g.descentPath.push(ringPoint(g, s.downrangeM / 1000 / MOON_RADIUS_KM, rSite + s.altitudeM / 1000));
    }
    g.descentPath.push(P.clone());

    syncEarthGeometry(g, liveEphemeris.geometry.earthPosScene ?? EARTH_POSITION_KM);
    lastEarthPos.current.set(NaN, NaN, NaN);
    return g;
  }, [plan, anchor]);

  const pushedT = useRef(-1);
  // External time changes (scrub slider, phase click, restart) — also release any delay-preview clock lock when the user scrubs/clicks a phase
  useEffect(
    () =>
      useSimStore.subscribe((s, prev) => {
        if (s.t !== prev.t && s.t !== pushedT.current) {
          tRef.current = s.t;
          camInit.current = false;
          if (!isNaN(launchMs)) {
            worldClock.epochMs = launchMs + s.t * 1000;
            useClockStore.getState().setMission(worldClock.epochMs, 'mission simulation (launch UTC + t)');
          }
        }
      }),
    [launchMs],
  );

  useEffect(
    () => () => {
      simCamera.active = false;
      const c = useClockStore.getState();
      if (c.mode === 'mission') c.setLive();
    },
    [],
  );

  useFrame((_, dt) => {
    if (!plan || !geom) return;
    const store = useSimStore.getState();
    let t = tRef.current;
    const total = plan.timeline.phases[plan.timeline.phases.length - 1].endS;
    if (store.playing) {
      const phase = phaseAt(plan, t);
      t = Math.min(total, t + Math.min(dt, 0.1) * missionRate(phase, store.speed));
      tRef.current = t;
      if (t >= total) {
        pushedT.current = t;
        useSimStore.setState({ playing: false, finished: true, t });
      }
    } else if (t !== store.t) {
      t = store.t;
      tRef.current = t;
      camInit.current = false;
    }

    // Drive world clock during playback or whenever not overriding via Resilience delay preview
    if (!isNaN(launchMs) && (store.playing || useClockStore.getState().source !== 'resilience-delay-preview')) {
      worldClock.epochMs = launchMs + t * 1000;
      const c = useClockStore.getState();
      if (c.mode !== 'mission') c.setMission(worldClock.epochMs, 'mission simulation (launch UTC + t)');
    }

    // Keep L0 (Launch Pad), L1, L2, transferArc & relayPoints locked to the live 3D Earth position every frame
    const ep = liveEphemeris.geometry.earthPosScene;
    if (
      Math.abs(ep[0] - lastEarthPos.current.x) > 0.5 ||
      Math.abs(ep[1] - lastEarthPos.current.y) > 0.5 ||
      Math.abs(ep[2] - lastEarthPos.current.z) > 0.5
    ) {
      lastEarthPos.current.set(ep[0], ep[1], ep[2]);
      syncEarthGeometry(geom, ep);
      updateLinePoints(ascentLine.current, geom.ascentArc);
      updateLinePoints(transferLine.current, geom.transferArc);
      updateLinePoints(relayLine.current, geom.relayPoints);
      if (padMarker.current) padMarker.current.position.copy(geom.L0);
    }

    const st = stateAt(plan, geom, t, scratch);
    if (marker.current) {
      marker.current.position.copy(scratch.pos);
      const d = scratch.pos.distanceTo(simCamera.active ? simCamera.position : camPos.current);
      marker.current.scale.setScalar(Math.max(0.05, Math.min(3000, d * 0.014)));
    }

    // --- Chase Camera -----------------------------------------------------------------------------------------
    if (store.follow) {
      const { pos, fwd, radial, tang, right, tmp, tmp2 } = scratch;
      const ph = st.phase.id;
      const desired = tmp;
      const target = tmp2;

      if (ph === 'launch' || ph === 'separation') {
        // Orthonormal horizon frame on the 3D Earth: frames the Earth globe, Launch Pad L0, and ascending rocket together
        tang.copy(fwd).addScaledVector(radial, -fwd.dot(radial));
        if (tang.lengthSq() < 1e-6) tang.set(0, 1, 0);
        tang.normalize();
        right.crossVectors(tang, radial).normalize();
        const dist = ph === 'launch' ? 1_450 : 2_100;
        desired
          .copy(pos)
          .addScaledVector(tang, -dist * 0.75)
          .addScaledVector(radial, dist * 0.42)
          .addScaledVector(right, dist * 0.55);
        target.copy(pos).addScaledVector(tang, dist * 0.18).addScaledVector(radial, -dist * 0.28);
      } else if (ph === 'transfer') {
        const D = Math.min(40_000, Math.max(2_500, pos.length() * 0.06));
        right.crossVectors(fwd, radial).normalize();
        desired.copy(pos).addScaledVector(fwd, -D).addScaledVector(radial, D * 0.3).addScaledVector(right, D * 0.35);
        target.copy(pos).addScaledVector(fwd, D * 2.5);
      } else if (ph === 'loi') {
        desired.copy(pos).addScaledVector(radial, 700).addScaledVector(fwd, -1600);
        target.copy(pos).addScaledVector(fwd, 900);
      } else if (ph === 'landing') {
        const alt = st.altitudeKm;
        const back = alt > 20 ? 900 : 4 + alt * 0.6;
        const up = alt > 20 ? 400 : 1.6 + alt * 0.35;
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
      simCamera.up.copy(ph === 'transfer' ? new Vector3(0, 1, 0) : radial);
      simCamera.active = true;
    } else if (simCamera.active) {
      simCamera.active = false;
      camInit.current = false;
    }

    // --- HUD (10 Hz) -------------------------------------------------------------------------------------------
    const now = performance.now();
    if (now - lastPush.current > 100) {
      lastPush.current = now;
      if (store.playing) {
        pushedT.current = t;
        useSimStore.setState({ t });
      }
      store.setReadout({
        phaseId: st.phase.id,
        altitudeKm: st.altitudeKm,
        speedMps: st.speedMps,
        massKg: st.massKg,
        throttle: st.throttle,
        distanceToMoonKm: scratch.pos.length() - MOON_RADIUS_KM,
      });
      setLabel({
        phase: st.phase.name, time: formatMissionTime(t), altitudeKm: st.altitudeKm,
        body: st.phase.id === 'launch' || st.phase.id === 'separation' ? 'Earth' : 'Moon',
        speedMps: st.speedMps, massKg: st.massKg, throttle: st.throttle,
        utc: Number.isFinite(launchMs) ? new Date(launchMs + t * 1000).toISOString().slice(0, 19).replace('T', ' ') + 'Z' : '—',
      });
    }
  });

  if (!plan || !geom) return null;
  return (
    <group name="mission-simulation">
      {/* Earth Launch & LEO Parking Arc (attached to the live 3D Earth sphere) */}
      <Line
        ref={(el) => {
          ascentLine.current = el as unknown as DynLine | null;
        }}
        points={geom.ascentArc}
        color="#ffb454"
        lineWidth={2.2}
        transparent
        opacity={0.92}
        frustumCulled={false}
      />
      {/* Trans-Lunar Transfer Arc (L2 on Earth → A on Lunar Orbit) */}
      <Line
        ref={(el) => {
          transferLine.current = el as unknown as DynLine | null;
        }}
        points={geom.transferArc}
        color="#8fd3ff"
        lineWidth={1.4}
        dashed
        dashSize={5000}
        gapSize={3500}
        transparent
        opacity={0.65}
        frustumCulled={false}
      />
      {/* 100 km Circular Lunar Capture Orbit */}
      <Line points={geom.orbitRing} color="#8fd3ff" lineWidth={1.1} transparent opacity={0.5} />
      {/* DOI → PDI Elliptic Descent Orbit Coast */}
      <Line
        points={geom.doiCoastPath}
        color="#c792ff"
        lineWidth={1.4}
        dashed
        dashSize={60}
        gapSize={40}
        transparent
        opacity={0.75}
      />
      {/* PDI → Lunar Surface Touchdown Powered Descent */}
      <Line points={geom.descentPath} color="#ff7ad9" lineWidth={2.4} transparent opacity={0.96} />
      {/* Direct-to-Earth / Relay Downlink Beam */}
      <Line
        ref={(el) => {
          relayLine.current = el as unknown as DynLine | null;
        }}
        points={geom.relayPoints}
        color="#ffd166"
        lineWidth={1}
        dashed
        dashSize={8000}
        gapSize={6000}
        transparent
        opacity={0.35}
        frustumCulled={false}
      />
      {/* Launch Pad Marker on the 3D Earth Surface */}
      <group ref={padMarker} position={geom.L0} name="simulation-launch-pad">
        <mesh>
          <sphereGeometry args={[12, 14, 14]} />
          <meshBasicMaterial color="#ffb454" />
        </mesh>
        {showLabels && (
          <FlightMarker
            markerType="launch" category="Earth departure" title="Launch reference" badge="SCHEMATIC" color="#ffbf72"
            details={[
              { label: 'Vehicle', value: plan.input.launchVehicle.name },
              { label: 'Launch UTC', value: plan.ephemeris ? plan.ephemeris.calendar.launchUtc.replace('T', ' ').slice(0, 16) + 'Z' : '—' },
            ]}
            note="Illustrative Earth departure point; not a surveyed launch pad."
          />
        )}
      </group>
      {/* Spacecraft Marker (scales with camera distance) */}
      <group ref={marker} name="simulation-marker">
        <mesh>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh>
          <ringGeometry args={[0.6, 0.72, 40]} />
          <meshBasicMaterial color="#c792ff" transparent opacity={0.85} depthWrite={false} side={2} />
        </mesh>
        {showLabels && label && (
          <FlightMarker
            markerType="spacecraft" category="Mission simulation" title="Simulated spacecraft" badge="MODEL" color="#c9a2ff"
            details={[
              { label: 'Phase', value: label.phase },
              { label: 'Mission time', value: label.time },
              { label: `Altitude · ${label.body}`, value: formatMarkerAltitude(label.altitudeKm) },
              { label: 'Speed', value: `${Math.round(label.speedMps).toLocaleString()} m/s` },
              { label: 'Mass', value: `${Math.round(label.massKg).toLocaleString()} kg` },
              { label: 'Throttle', value: label.throttle > 0 ? `${Math.round(label.throttle * 100)}%` : '—' },
              { label: 'UTC', value: label.utc },
              { label: 'Target', value: `${plan.site.latitude.toFixed(2)}°, ${plan.site.longitude.toFixed(2)}°` },
            ]}
            note="Calculated visualization · model output, not flight telemetry."
          />
        )}
      </group>
    </group>
  );
}
