import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { FlightMarker, formatMarkerAltitude } from '@/lunar-world/markers/FlightMarker';
import { Group, Matrix4, Vector3 } from 'three';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM } from '@/constants/frames';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { liveEphemeris } from '@/solar-system/ephemerisDriver';
import { setMatrixFromMat3 } from '@/solar-system/SkyMap';
import { geometryAt } from '@/solar-system/ephemeris';
import { useSurfaceAnchor, type SurfaceAnchor } from '@/hooks/useSurfaceFrame';
import { useClockStore, worldClock } from '@/state/clockStore';
import { SEGMENT_COLORS, formatJourneyTime, journeyEndS, journeyRate, segmentAt, useJourneyStore } from '@/state/journeyStore';
import { simCamera } from '@/state/simStore';
import { useWorldStore } from '@/state/worldStore';
import type { Journey as JourneyData, JourneySegment } from '@/types/domain';

/**
 * Journey — animated Earth-launch → Moon route of a mission (or of a user plan).
 *
 * Frames: the scene is Moon-centric and Moon-fixed. The research engine delivers
 *   • trans-lunar arcs: drawn as their track in the Moon-fixed frame (each sample transformed with the geometry of its
 *     own instant ≈ Earth–Moon rotating frame) so the route is a static Earth→Moon curve the spacecraft rides along;
 *     the first ~40,000 km are blended back to the Earth-relative rendering so the arc stays attached to the parking
 *     orbit / the Earth's current position;
 *   • other earth-inertial segments (geocentric ICRF km): drawn inside a group whose matrix is rebuilt every frame from the
 *     world-clock ephemeris — rotation = skyMatrixScene (ICRF → Moon-fixed scene), translation = the Earth's position —
 *     so the arcs are exactly where they belong for the *current* clock (the Moon moves toward the arrival point);
 *   • moon-fixed segments (body-fixed km): static in the scene frame.
 * The playback drives the world clock (launch UTC + T+) — the Earth's rotation, the Moon's position/phase and the Sun
 * all follow the flight. Nothing here is telemetry: fidelity (reconstructed / projected / planned) comes from the data.
 */

const toScene = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];
/** drei <Line> instance (Line2): its LineGeometry is instanced — `instanceCount` limits how many segments are drawn. */
type TrailLine = { geometry: { instanceCount: number; attributes: { instanceStart?: { data: { array: Float32Array; needsUpdate: boolean } } } }; material: { opacity: number } };

/** Overwrite the first `upto` line segments (pairs of consecutive samples) of an instanced Line2 geometry in place. */
function writeSegments(line: TrailLine, pts: Float32Array, upto: number) {
  const attr = line.geometry.attributes.instanceStart;
  if (!attr) return;
  const arr = attr.data.array;
  const m = Math.min(arr.length / 6, upto, pts.length / 3 - 1);
  for (let k = 0; k < m; k++) {
    const a = k * 6, b = k * 3;
    arr[a] = pts[b]; arr[a + 1] = pts[b + 1]; arr[a + 2] = pts[b + 2];
    arr[a + 3] = pts[b + 3]; arr[a + 4] = pts[b + 4]; arr[a + 5] = pts[b + 5];
  }
  attr.data.needsUpdate = true;
}

/** Earth-relative ↔ Moon-frame-track blend weight for the trans-lunar arc, from geocentric distance. */
const BLEND_R0 = 10_000, BLEND_R1 = 220_000;
const smooth = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };

interface Prepared {
  seg: JourneySegment;
  /** sample times (s since launch) */
  times: Float64Array;
  /** raw frame coordinates, scene axis convention (x, z, −y) — inertial segments still need the per-frame matrix */
  pts: Float32Array;
  /** stable flat copy for drei <Line points> (keeps the line geometry from being rebuilt on every React render) */
  flat: number[];
  inertial: boolean;
  /**
   * Trans-lunar arcs only: the arc as a *track in the Moon-fixed scene frame* — every sample transformed with the
   * Earth/Moon geometry of its own instant (≈ the Earth–Moon rotating frame, so the curve starts at the Earth and
   * ends on the lunar orbit and the spacecraft rides along a static curve). `w` blends the near-Earth end back to the
   * Earth-relative inertial rendering so the arc stays attached to the parking orbit; `blend` is the per-frame result.
   */
  track?: Float32Array;
  w?: Float32Array;
  blend?: Float32Array;
  /** number of leading samples whose blend weight < 1 (only these are rewritten each frame) */
  blendCount: number;
  /** sample index farthest from the segment's frame origin (apogee of Earth-centred loops) */
  apoIdx: number;
  t0: number;
  t1: number;
  color: string;
}

function prepare(j: JourneyData, launchMs: number, siteAnchor: SurfaceAnchor | null): Prepared[] {
  return j.segments.map((seg) => {
    const n = seg.samples.length;
    const times = new Float64Array(n);
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = seg.samples[i];
      times[i] = s[0];
      const p = toScene(s[1], s[2], s[3]);
      pts[i * 3] = p[0]; pts[i * 3 + 1] = p[1]; pts[i * 3 + 2] = p[2];
    }
    // Anchor powered descent touchdown to the exact client LOLA DEM surface marker position
    if (seg.kind === 'descent' && siteAnchor && n >= 2) {
      const last = (n - 1) * 3;
      const dx = siteAnchor.position.x - pts[last];
      const dy = siteAnchor.position.y - pts[last + 1];
      const dz = siteAnchor.position.z - pts[last + 2];
      const tSpan = Math.max(1, times[n - 1] - times[0]);
      for (let i = 0; i < n; i++) {
        const w = Math.pow(Math.max(0, Math.min(1, (times[i] - times[0]) / tSpan)), 1.5);
        pts[i * 3] += dx * w;
        pts[i * 3 + 1] += dy * w;
        pts[i * 3 + 2] += dz * w;
      }
    }
    const inertial = seg.frame === 'earth-inertial';
    let apoIdx = 0, apoR = -1;
    for (let i = 0; i < n; i++) { const r = Math.hypot(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]); if (r > apoR) { apoR = r; apoIdx = i; } }
    const out: Prepared = { seg, times, pts, flat: Array.from(pts), inertial, blendCount: 0, apoIdx, t0: times[0], t1: times[n - 1], color: SEGMENT_COLORS[seg.kind] ?? '#8fd3ff' };
    if (inertial && seg.kind === 'translunar' && !isNaN(launchMs)) {
      const track = new Float32Array(n * 3), w = new Float32Array(n);
      let blendCount = 0;
      for (let i = 0; i < n; i++) {
        const g = geometryAt(launchMs + times[i] * 1000);
        const m = g.skyMatrixScene, e = g.earthPosScene;
        const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        track[i * 3] = m[0] * x + m[1] * y + m[2] * z + e[0];
        track[i * 3 + 1] = m[3] * x + m[4] * y + m[5] * z + e[1];
        track[i * 3 + 2] = m[6] * x + m[7] * y + m[8] * z + e[2];
        w[i] = smooth((Math.hypot(x, y, z) - BLEND_R0) / (BLEND_R1 - BLEND_R0));
        if (w[i] < 1) blendCount = i + 1;
      }
      out.track = track; out.w = w; out.blend = track.slice(); out.blendCount = blendCount; out.flat = Array.from(track);
    }
    return out;
  });
}

/** index i with times[i] ≤ t < times[i+1] (clamped) */
function bracket(times: Float64Array, t: number) {
  let lo = 0, hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return Math.max(0, hi - 1);
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
  return lo;
}

const scratch = {
  raw: new Vector3(), rawNext: new Vector3(), pos: new Vector3(), fwd: new Vector3(), earth: new Vector3(), radial: new Vector3(), right: new Vector3(),
  desired: new Vector3(), target: new Vector3(), camPos: new Vector3(), camTarget: new Vector3(), up: new Vector3(0, 1, 0), tmp: new Vector3(), tang: new Vector3(),
};
const Y = new Vector3(0, 1, 0);

export function Journey({ object }: { object: SceneObject }) {
  const journey = object.data?.journey as JourneyData | undefined;
  const launchMs = journey ? Date.parse(journey.launchUtc) : NaN;
  const siteAnchor = useSurfaceAnchor(journey?.landingSite?.latitude, journey?.landingSite?.longitude);
  const prepared = useMemo(() => (journey ? prepare(journey, launchMs, siteAnchor) : []), [journey, launchMs, siteAnchor]);
  const endS = journey ? journeyEndS(journey) : 0;
  const showLabels = useWorldStore((s) => s.showLabels);
  const { camera } = useThree();
  const inertialGroup = useRef<Group>(null);
  const earthGroup = useRef<Group>(null);
  const marker = useRef<Group>(null);
  const trails = useRef<(TrailLine | null)[]>([]);
  const paths = useRef<(TrailLine | null)[]>([]);
  const matrix = useMemo(() => new Matrix4(), []);
  const tRef = useRef(0);
  const pushedT = useRef(-1);
  const lastPush = useRef(0);
  /** frames left in which the chase camera snaps instead of easing (2 after a scrub: the ephemeris geometry lags one frame behind a time jump) */
  const snapFrames = useRef(2);
  const [label, setLabel] = useState<{ seg: string; time: string; altitudeKm: number; body: string; speedKms: number; utc: string } | null>(null);

  // Launch pad anchored directly to the first ascent sample (in inertialGroup) so the pad marker and ascent origin never separate
  const pad = useMemo(() => {
    if (!journey) return null;
    const asc = prepared.find((p) => p.seg.kind === 'ascent') ?? prepared[0];
    if (asc && asc.pts.length >= 3) {
      return new Vector3(asc.pts[0], asc.pts[1], asc.pts[2]);
    }
    const la = (journey.launchSite.latitude * Math.PI) / 180, lo = (journey.launchSite.longitude * Math.PI) / 180;
    const r = EARTH_RADIUS_KM + (journey.launchSite.altitudeM ?? 0) / 1000;
    return new Vector3(...toScene(r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)));
  }, [journey, prepared]);

  // external time changes (scrub, event click, restart) — ignore the loop's own 10 Hz pushes
  useEffect(() => useJourneyStore.subscribe((s, prev) => { if (s.t !== prev.t && s.t !== pushedT.current) { tRef.current = s.t; snapFrames.current = 2; } }), []);
  useEffect(() => useJourneyStore.subscribe((s, prev) => { if (s.view !== prev.view) snapFrames.current = 2; }), []);
  useEffect(() => { tRef.current = useJourneyStore.getState().t; }, [journey]);
  // release the chase camera and the world clock when the journey goes away
  useEffect(() => () => { simCamera.active = false; const c = useClockStore.getState(); if (c.mode === 'mission') c.setLive(); }, []);

  useFrame((_, dt) => {
    if (!journey || prepared.length === 0) return;
    const store = useJourneyStore.getState();
    let t = tRef.current;
    if (store.playing) {
      const seg = segmentAt(journey, t);
      t = Math.min(endS, t + Math.min(dt, 0.1) * journeyRate(seg, store.speed));
      tRef.current = t;
      if (t >= endS) { pushedT.current = t; useJourneyStore.setState({ playing: false, finished: true, t }); }
    }
    // --- world clock: the environment runs at the journey's real UTC ---------------------------------------------
    if (!isNaN(launchMs)) {
      worldClock.epochMs = launchMs + t * 1000;
      const c = useClockStore.getState();
      if (c.mode !== 'mission') c.setMission(worldClock.epochMs, `${journey.mission?.shortName ?? journey.missionId} journey (launch UTC + T+)`);
    }
    const g = liveEphemeris.geometry;
    const { raw, rawNext, pos, fwd, earth, radial, right, desired, target, camPos, camTarget, up, tmp } = scratch;
    earth.set(g.earthPosScene[0], g.earthPosScene[1], g.earthPosScene[2]);
    // --- frames ---------------------------------------------------------------------------------------------------
    if (inertialGroup.current) {
      setMatrixFromMat3(matrix, g.skyMatrixScene);
      matrix.setPosition(earth);
      inertialGroup.current.matrix.copy(matrix);
      inertialGroup.current.matrixWorldNeedsUpdate = true;
    }
    if (earthGroup.current) {
      setMatrixFromMat3(matrix, g.earthMatrixScene);
      matrix.setPosition(earth);
      earthGroup.current.matrix.copy(matrix);
      earthGroup.current.matrixWorldNeedsUpdate = true;
    }
    // --- trans-lunar tracks: re-blend the near-Earth end onto the current Earth position ---------------------------
    const im = inertialGroup.current?.matrix;
    for (let k = 0; k < prepared.length; k++) {
      const p = prepared[k];
      if (!p.track || !p.w || !p.blend || !im) continue;
      for (let s = 0; s < p.blendCount; s++) {
        tmp.set(p.pts[s * 3], p.pts[s * 3 + 1], p.pts[s * 3 + 2]).applyMatrix4(im);
        const wv = p.w[s];
        p.blend[s * 3] = tmp.x + (p.track[s * 3] - tmp.x) * wv;
        p.blend[s * 3 + 1] = tmp.y + (p.track[s * 3 + 1] - tmp.y) * wv;
        p.blend[s * 3 + 2] = tmp.z + (p.track[s * 3 + 2] - tmp.z) * wv;
      }
      const path = paths.current[k], trail = trails.current[k];
      if (path) writeSegments(path, p.blend, p.blendCount);
      if (trail) writeSegments(trail, p.blend, p.blendCount);
    }
    // --- spacecraft state at t ------------------------------------------------------------------------------------
    let cur = prepared.find((p) => t >= p.t0 && t <= p.t1) ?? (t < prepared[0].t0 ? prepared[0] : prepared[prepared.length - 1]);
    const i = bracket(cur.times, t);
    const ta = cur.times[i], tb = cur.times[i + 1] ?? ta + 1;
    const f = Math.max(0, Math.min(1, (t - ta) / (tb - ta || 1)));
    raw.set(cur.pts[i * 3], cur.pts[i * 3 + 1], cur.pts[i * 3 + 2]);
    rawNext.set(cur.pts[(i + 1) * 3] ?? raw.x, cur.pts[(i + 1) * 3 + 1] ?? raw.y, cur.pts[(i + 1) * 3 + 2] ?? raw.z);
    const speedKms = rawNext.distanceTo(raw) / Math.max(1e-6, tb - ta); // frame-relative speed (inertial or Moon-fixed)
    raw.lerp(rawNext, f);
    if (cur.blend && i + 1 < cur.times.length) {
      // ride the blended Moon-frame track (the same curve that is drawn)
      pos.set(cur.blend[i * 3], cur.blend[i * 3 + 1], cur.blend[i * 3 + 2]);
      fwd.set(cur.blend[(i + 1) * 3], cur.blend[(i + 1) * 3 + 1], cur.blend[(i + 1) * 3 + 2]);
      pos.lerp(fwd, f);
      fwd.sub(pos).normalize();
    } else if (cur.inertial && im) { pos.copy(raw).applyMatrix4(im); fwd.copy(rawNext).applyMatrix4(im).sub(pos).normalize(); }
    else { pos.copy(raw); fwd.copy(rawNext).sub(pos).normalize(); }
    if (!(fwd.lengthSq() > 0)) fwd.set(1, 0, 0);
    const dEarth = pos.distanceTo(earth), dMoon = pos.length();
    const nearEarth = dEarth - EARTH_RADIUS_KM < dMoon - MOON_RADIUS_KM;
    radial.copy(nearEarth ? tmp.copy(pos).sub(earth) : pos).normalize();
    if (marker.current) {
      marker.current.position.copy(pos);
      const d = pos.distanceTo(simCamera.active ? simCamera.position : camera.position);
      marker.current.scale.setScalar(Math.max(0.05, Math.min(6000, d * 0.014)));
    }
    // --- flown trail (instanced line segments: draw the first n) -------------------------------------------------
    // Near the ground the dozens of lunar-orbit passes overhead would read as a cage across the sky, so every route
    // line except the powered descent fades out below ~150 km camera altitude (fully gone under 25 km).
    const camAlt = (simCamera.active ? simCamera.position : camera.position).length() - MOON_RADIUS_KM;
    const fade = Math.max(0, Math.min(1, (camAlt - 25) / 125));
    for (let k = 0; k < prepared.length; k++) {
      const line = trails.current[k];
      const p = prepared[k];
      const keep = p.seg.kind === 'descent' || p.seg.kind === 'ascent';
      const path = paths.current[k];
      if (path) path.material.opacity = 0.28 * (keep ? 1 : fade);
      if (!line) continue;
      line.material.opacity = 0.95 * (keep ? 1 : fade);
      const n = p.times.length - 1;
      const count = t >= p.t1 ? n : t <= p.t0 ? 0 : Math.min(n, bracket(p.times, t) + 1);
      line.geometry.instanceCount = count;
    }
    // --- camera ----------------------------------------------------------------------------------------------------
    const view = store.view;
    if (view !== 'free') {
      if (view === 'follow') {
        const kind = cur.seg.kind;
        // orthonormal chase basis: horizontal direction of motion (fwd minus its radial part), local up, right
        const tang = scratch.tang.copy(fwd).addScaledVector(radial, -fwd.dot(radial));
        if (tang.lengthSq() < 1e-6) tang.crossVectors(radial, Y); // vertical flight (early ascent): any horizontal
        tang.normalize();
        if (kind === 'ascent' || kind === 'parking' || kind === 'phasing') {
          right.crossVectors(tang, radial).normalize();
          if (kind === 'phasing') {
            // long elliptical loops: watch from outside the orbit plane so the loops read as loops (Earth in frame)
            const D = Math.min(90_000, Math.max(6_000, (dEarth - EARTH_RADIUS_KM) * 0.5 + 6_000));
            desired.copy(pos).addScaledVector(right, D * 0.85).addScaledVector(radial, D * 0.35).addScaledVector(tang, -D * 0.45);
            target.copy(pos).addScaledVector(tang, D * 0.1);
          } else {
            const D = 1_850;
            desired.copy(pos).addScaledVector(tang, -D * 0.8).addScaledVector(radial, D * 0.44).addScaledVector(right, D * 0.5);
            target.copy(pos).addScaledVector(tang, D * 0.2).addScaledVector(radial, -D * 0.26);
          }
          up.copy(radial);
        } else if (kind === 'translunar' || kind === 'return') {
          const D = Math.min(45_000, Math.max(2_500, Math.min(dEarth - EARTH_RADIUS_KM, dMoon - MOON_RADIUS_KM) * 0.08));
          right.crossVectors(fwd, Y).normalize();
          desired.copy(pos).addScaledVector(fwd, -D * 1.1).addScaledVector(Y, D * 0.35).addScaledVector(right, D * 0.15);
          target.copy(pos).addScaledVector(fwd, D * 1.0);
          up.copy(Y);
        } else if (kind === 'lunar-orbit' || kind === 'descent-orbit') {
          right.crossVectors(tang, radial).normalize();
          desired.copy(pos).addScaledVector(radial, 650).addScaledVector(tang, -1500).addScaledVector(right, 250);
          target.copy(pos).addScaledVector(tang, 900);
          up.copy(radial);
        } else {
          const alt = dMoon - MOON_RADIUS_KM;
          if (t >= endS) {
            // landed: settle on the lander itself (horizontal stand-off, so the hand-over to free orbiting starts on the ground)
            const tang = scratch.tang.copy(fwd).addScaledVector(radial, -fwd.dot(radial));
            if (tang.lengthSq() < 1e-6) tang.crossVectors(radial, Y);
            tang.normalize();
            desired.copy(pos).addScaledVector(tang, -3.2).addScaledVector(radial, 1.1);
            target.copy(pos);
          } else {
            const back = alt > 20 ? 900 : 4 + alt * 0.6, upK = alt > 20 ? 400 : 1.6 + alt * 0.35;
            desired.copy(pos).addScaledVector(fwd, -back).addScaledVector(radial, upK);
            target.copy(pos).addScaledVector(fwd, alt > 20 ? 600 : 1.5);
          }
          up.copy(radial);
        }
      } else {
        // overview: both bodies and the route in frame, camera above the Earth–Moon line (composition shifted so the
        // side HUD panels do not cover the bodies)
        const L = earth.length();
        const ret = journey.profile === 'earth-return' ? prepared.find((p) => p.seg.kind === 'return') : undefined;
        if (ret && im) {
          // Earth-return profile: frame the Earth and the loop's apogee instead of the Earth–Moon line
          const a = ret.apoIdx, b = a + 1 < ret.times.length ? a + 1 : a - 1;
          rawNext.set(ret.pts[a * 3], ret.pts[a * 3 + 1], ret.pts[a * 3 + 2]).applyMatrix4(im);
          radial.set(ret.pts[b * 3], ret.pts[b * 3 + 1], ret.pts[b * 3 + 2]).applyMatrix4(im).sub(rawNext); // velocity direction at apogee
          const span = Math.max(50_000, rawNext.distanceTo(earth));
          target.copy(earth).lerp(rawNext, 0.58);
          // look down the orbit normal (the loop is a thin ellipse — seen face-on), tilted a little toward the Y axis
          tmp.crossVectors(radial, right.copy(rawNext).sub(earth)).normalize();
          if (tmp.y < 0) tmp.negate();
          tmp.addScaledVector(Y, 0.35).normalize();
          desired.copy(target).addScaledVector(tmp, span * 1.55);
        } else {
          target.copy(earth).multiplyScalar(0.31);
          right.crossVectors(earth, Y).normalize();
          tmp.copy(right).multiplyScalar(Math.cos(0.42)).addScaledVector(Y, Math.sin(0.42)).normalize();
          desired.copy(target).addScaledVector(tmp, L * 2.4);
        }
        up.copy(Y);
      }
      const k = snapFrames.current > 0 ? 1 : 1 - Math.exp(-3.0 * Math.min(dt, 0.1));
      if (snapFrames.current > 0) snapFrames.current--;
      camPos.lerp(desired, k);
      camTarget.lerp(target, k);
      simCamera.position.copy(camPos);
      simCamera.target.copy(camTarget);
      simCamera.up.copy(up);
      simCamera.active = true;
    } else if (simCamera.active) {
      simCamera.active = false;
      snapFrames.current = 2;
    }
    // --- HUD (10 Hz) ------------------------------------------------------------------------------------------------
    const now = performance.now();
    if (now - lastPush.current > 100) {
      lastPush.current = now;
      if (store.playing) { pushedT.current = t; useJourneyStore.setState({ t }); }
      store.setReadout({
        segmentId: cur.seg.id, segmentLabel: cur.seg.label,
        altitudeKm: nearEarth ? dEarth - EARTH_RADIUS_KM : dMoon - MOON_RADIUS_KM, nearBody: nearEarth ? 'earth' : 'moon',
        speedKms, distanceEarthKm: dEarth, distanceMoonKm: dMoon, utc: isNaN(launchMs) ? '' : new Date(launchMs + t * 1000).toISOString().slice(0, 19) + 'Z',
      });
      setLabel({
        seg: cur.seg.label, time: formatJourneyTime(t),
        altitudeKm: nearEarth ? dEarth - EARTH_RADIUS_KM : dMoon - MOON_RADIUS_KM,
        body: nearEarth ? 'Earth' : 'Moon', speedKms,
        utc: isNaN(launchMs) ? '—' : new Date(launchMs + t * 1000).toISOString().slice(0, 19).replace('T', ' ') + 'Z',
      });
    }
  });

  if (!journey || prepared.length === 0) return null;
  const name = journey.mission?.shortName ?? (journey.fidelity === 'planned' ? 'Planned mission' : journey.missionId);
  const fidelityWord = journey.fidelity === 'reconstructed' ? 'reconstructed route' : journey.fidelity === 'projected' ? 'projected route' : 'planned route (model)';
  return (
    <group name="journey">
      {/* Earth-centred inertial segments (ascent, parking, phasing, Earth return) + Launch Pad anchor: rebuilt frame pose every frame */}
      <group ref={inertialGroup} matrixAutoUpdate={false} name="journey-earth-inertial">
        {prepared.map((p, k) => p.inertial && !p.track ? (
          <Line key={`${p.seg.id}-path`} ref={(el) => { paths.current[k] = el as unknown as TrailLine | null; }} points={p.flat} color={p.color} lineWidth={1} transparent opacity={0.28} depthWrite={false} />
        ) : null)}
        {prepared.map((p, k) => p.inertial && !p.track ? (
          <Line key={`${p.seg.id}-trail`} ref={(el) => { trails.current[k] = el as unknown as TrailLine | null; }} points={p.flat} color={p.color} lineWidth={2.2} transparent opacity={0.95} depthWrite={false} />
        ) : null)}
        {pad && (
          <group position={pad} name="journey-launch-pad">
            <mesh>
              <sphereGeometry args={[12, 12, 12]} />
              <meshBasicMaterial color="#ffb454" />
            </mesh>
            {showLabels && (
              <FlightMarker
                markerType="launch" category="Earth departure" title={journey.launchSite.shortName ?? journey.launchSite.name}
                badge="LAUNCH" color="#ffbf72"
                details={[
                  { label: 'Coordinates', value: `${journey.launchSite.latitude.toFixed(3)}°, ${journey.launchSite.longitude.toFixed(3)}°` },
                  { label: 'Vehicle', value: journey.vehicle ?? 'Not specified' },
                  { label: 'Launch UTC', value: journey.launchUtc.replace('T', ' ').slice(0, 16) + 'Z' },
                ]}
                note={`${fidelityWord} · model, not live flight telemetry.`}
              />
            )}
          </group>
        )}
      </group>
      {/* Moon-fixed segments (lunar orbit, descent) and the trans-lunar track (drawn in the Moon-fixed frame) */}
      {prepared.map((p, k) => !p.inertial || p.track ? (
        <Line key={`${p.seg.id}-path`} ref={(el) => { paths.current[k] = el as unknown as TrailLine | null; }} points={p.flat} color={p.color} lineWidth={1} transparent opacity={0.28} depthWrite={false} frustumCulled={false} />
      ) : null)}
      {prepared.map((p, k) => !p.inertial || p.track ? (
        <Line key={`${p.seg.id}-trail`} ref={(el) => { trails.current[k] = el as unknown as TrailLine | null; }} points={p.flat} color={p.color} lineWidth={2.2} transparent opacity={0.95} depthWrite={false} frustumCulled={false} />
      ) : null)}
      <group ref={earthGroup} matrixAutoUpdate={false} name="journey-earth-fixed" />
      {/* spacecraft marker (unit size, scaled per frame with camera distance) */}
      <group ref={marker} name="journey-marker">
        <mesh>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh>
          <ringGeometry args={[0.6, 0.72, 40]} />
          <meshBasicMaterial color="#8fd3ff" transparent opacity={0.85} depthWrite={false} side={2} />
        </mesh>
        {showLabels && label && (
          <FlightMarker
            markerType="spacecraft" category="Mission journey" title={name} badge={journey.fidelity} color="#91ddff"
            details={[
              { label: 'Phase', value: label.seg },
              { label: 'Mission time', value: label.time },
              { label: `Altitude · ${label.body}`, value: formatMarkerAltitude(label.altitudeKm) },
              { label: 'Speed', value: `${label.speedKms.toFixed(2)} km/s` },
              { label: 'UTC', value: label.utc },
              { label: 'Destination', value: journey.landingSite?.name ?? (journey.profile === 'earth-return' ? 'Earth return' : 'Lunar orbit') },
            ]}
            note={`${fidelityWord} · model, not live flight telemetry.`}
          />
        )}
      </group>
    </group>
  );
}
