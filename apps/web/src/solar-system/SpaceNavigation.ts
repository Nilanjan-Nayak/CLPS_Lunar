import { Vector3 } from 'three';
import { EARTH_POSITION_KM, EARTH_RADIUS_KM, MOON_RADIUS_KM } from '@/constants/frames';

const DEFAULT_EARTH = new Vector3(...EARTH_POSITION_KM);

/**
 * Schematic navigation geometry for the Solar-System context view, anchored on the Earth's current position.
 * These are NOT mission trajectories (see lunar-world/trajectories for data-driven paths).
 */
export function earthToMoonPath(earth: Vector3 = DEFAULT_EARTH, segments = 64): Vector3[] {
  const dir = earth.clone().normalize();
  const a = earth.clone().addScaledVector(dir, -EARTH_RADIUS_KM * 1.5);
  const b = dir.clone().multiplyScalar(MOON_RADIUS_KM * 1.6);
  const side = new Vector3(0, 1, 0).cross(dir).normalize();
  const pts: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = a.clone().lerp(b, t).addScaledVector(side, Math.sin(t * Math.PI) * 26_000); // gentle arc so the line is legible
    pts.push(p);
  }
  return pts;
}

/** Circular approximation of the Moon's orbit around Earth (in the Moon-centric frame it passes through the origin). */
export function moonOrbitRing(earth: Vector3 = DEFAULT_EARTH, segments = 256): Vector3[] {
  const centre = new Vector3(earth.x, 0, earth.z);
  const r = centre.length();
  const u = centre.clone().normalize();          // Earth → Moon direction projected on the equatorial plane
  const w = new Vector3(0, 1, 0).cross(u);
  const pts: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(centre.clone().addScaledVector(u, -Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r));
  }
  return pts;
}
