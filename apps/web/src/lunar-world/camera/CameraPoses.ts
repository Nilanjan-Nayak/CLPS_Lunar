import { Vector3 } from 'three';
import type { CameraState } from '@/constants/cameraStates';
import { MOON_RADIUS_KM } from '@/constants/frames';
import type { CameraFocus } from '@/state/cameraStore';
import { elevationResolver } from '@/lunar-world/terrain/ElevationResolver';
import { liveEphemeris } from '@/solar-system/ephemerisDriver';
import { enuBasis, latLonToVec3 } from '@/utils/geo';

export interface CameraPose { position: Vector3; target: Vector3; up: Vector3 }

/** live Earth position (Moon-centred km) — poses are built when a flight starts, so this is fresh enough */
const earthNow = () => new Vector3(...liveEphemeris.geometry.earthPosScene);
const Y = new Vector3(0, 1, 0);

/** Surface point for a focus, using the same DEM the terrain uses (falls back to the datum sphere). */
export function focusSurfacePoint(focus: CameraFocus, exaggeration = 1): { point: Vector3; up: Vector3; north: Vector3 } {
  const frame = elevationResolver.surface(focus.latitude, focus.longitude, exaggeration);
  const basis = enuBasis(focus.latitude, focus.longitude);
  if (frame) return { point: frame.position.clone(), up: basis.up, north: basis.north };
  const h = focus.elevationKm ?? 0;
  return { point: latLonToVec3(focus.latitude, focus.longitude, MOON_RADIUS_KM + h * exaggeration), up: basis.up, north: basis.north };
}

/**
 * CelestialCamera + LocationCamera poses, expressed in the Moon-centric km frame.
 * Space/Earth states ignore the focus; Moon states orbit/approach the focus meridian; surface states hover over the focus point.
 */
export function poseFor(state: CameraState, focus: CameraFocus | null, exaggeration = 1): CameraPose {
  const f = focus ?? { latitude: 0, longitude: 0 };
  const dir = latLonToVec3(f.latitude, f.longitude, 1);
  const { north } = enuBasis(f.latitude, f.longitude);
  switch (state) {
    case 'SPACE':
      return { position: new Vector3(150_000, 90_000, -560_000), target: new Vector3(192_000, 0, 0), up: Y.clone() };
    case 'EARTH': {
      const EARTH = earthNow();
      return { position: EARTH.clone().add(new Vector3(-20_000, 6_000, -20_000)), target: EARTH.clone(), up: Y.clone() };
    }
    case 'EARTH_ORBIT': {
      // ~3,100 km above the northern hemisphere, looking past the limb toward the Moon (−X): Earth fills the lower frame
      const EARTH = earthNow();
      return { position: EARTH.clone().add(new Vector3(-3_000, 8_500, -3_000)), target: EARTH.clone().add(new Vector3(-12_000, -6_500, -3_000)), up: Y.clone() };
    }
    case 'MOON_APPROACH':
      return { position: new Vector3(22_000, 6_000, -12_000), target: new Vector3(0, 0, 0), up: Y.clone() };
    case 'MOON_ORBIT': {
      // orbit pose above the focus meridian, slightly toward the equator so polar sites are not seen edge-on
      const pos = dir.clone().multiplyScalar(MOON_RADIUS_KM + 5_500);
      return { position: pos, target: new Vector3(0, 0, 0), up: Math.abs(f.latitude) > 80 ? north.clone() : Y.clone() };
    }
    case 'LUNAR_SURFACE': {
      const s = focusSurfacePoint(f, exaggeration);
      return { position: s.point.clone().addScaledVector(s.up, 700).addScaledVector(s.north, -350), target: s.point, up: s.north.clone() };
    }
    case 'LOCATION_FOCUS': {
      const s = focusSurfacePoint(f, exaggeration);
      return { position: s.point.clone().addScaledVector(s.up, 45).addScaledVector(s.north, -30), target: s.point, up: s.north.clone() };
    }
    case 'MISSION_FOCUS': {
      const s = focusSurfacePoint(f, exaggeration);
      return { position: s.point.clone().addScaledVector(s.up, 14).addScaledVector(s.north, -11), target: s.point, up: s.north.clone() };
    }
  }
}
