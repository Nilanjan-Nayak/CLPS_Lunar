import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { MOON_RADIUS_KM, DEG } from '@/constants/frames';
import { elevationResolver } from '@/lunar-world/terrain/ElevationResolver';
import { enuBasis, vec3ToLatLon } from '@/utils/geo';

/**
 * SurfaceNav — makes free navigation near the Moon behave like standing on a planet instead of orbiting a point in
 * empty space. Applied every frame after OrbitControls has moved the camera, whenever the orbit target sits on the
 * surface (location / mission / journey views):
 *   • the camera's up vector blends from the Moon's pole (far away) to the local vertical at the target (near), so the
 *     horizon is level and dragging left/right turns you around the point instead of tumbling over it;
 *   • the camera cannot sink below the target's horizon plane (polar-angle limit) …
 *   • … nor into the terrain: the LOLA DEM under the camera sets a hard floor (20 m + a little clearance per km of
 *     distance), and an orbit target that ends up underground is lifted back onto the surface;
 *   • zooming works toward the cursor with a 30 m minimum distance, so "zoom in on that crater" does what it says.
 * Nothing here moves the data: it only constrains where the eye may go.
 */
export const SURFACE_FAR_KM = 1500; // regime starts blending in below this altitude
export const SURFACE_NEAR_KM = 400; // fully active below this altitude
const Y = new Vector3(0, 1, 0);
const upT = new Vector3();
const desiredUp = new Vector3();
const dir = new Vector3();

export interface SurfaceNavResult {
  weight: number;
  aglKm: number | null;
  groundKm: number | null;
  headingDeg: number;
  pitchDeg: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function applySurfaceNav(camera: PerspectiveCamera, controls: OrbitControlsImpl | null, exaggeration: number, enabled: boolean): SurfaceNavResult {
  const camR = camera.position.length();
  const alt = camR - MOON_RADIUS_KM;
  const cll = vec3ToLatLon(camera.position);
  const ce = elevationResolver.elevationKm(cll.latitude, cll.longitude);
  const groundKm = ce ? ce.elevationKm * exaggeration : null;
  const aglKm = groundKm == null ? null : camR - (MOON_RADIUS_KM + groundKm);

  // heading / pitch of the view in the local ENU frame at the camera sub-point
  camera.getWorldDirection(dir);
  const enu = enuBasis(cll.latitude, cll.longitude);
  const headingDeg = ((Math.atan2(dir.dot(enu.east), dir.dot(enu.north)) / DEG) + 360) % 360;
  const pitchDeg = Math.asin(Math.max(-1, Math.min(1, dir.dot(enu.up)))) / DEG;

  const target = controls?.target;
  const tr = target ? target.length() : 0;
  const weight = target && tr > MOON_RADIUS_KM * 0.5 && tr < MOON_RADIUS_KM * 1.5 ? clamp01((SURFACE_FAR_KM - alt) / (SURFACE_FAR_KM - SURFACE_NEAR_KM)) : 0;
  if (!controls || !target || !enabled || weight <= 0) {
    if (controls) {
      controls.maxPolarAngle = Math.PI;
      controls.minDistance = 0.2;
    }
    return { weight: 0, aglKm, groundKm, headingDeg, pitchDeg };
  }

  // 1. the orbit target never sits below the ground
  const tll = vec3ToLatLon(target);
  const te = elevationResolver.elevationKm(tll.latitude, tll.longitude);
  if (te) {
    const g = MOON_RADIUS_KM + te.elevationKm * exaggeration;
    if (tr < g) target.setLength(g + 0.002);
  }
  // 2. level horizon: up = local vertical at the target (blended with the pole by altitude)
  upT.copy(target).normalize();
  desiredUp.copy(Y).lerp(upT, weight).normalize();
  camera.up.copy(desiredUp);
  // 3. never below the target's horizon plane; close zoom allowed
  controls.maxPolarAngle = Math.PI - (Math.PI - 1.535) * weight; // ≈ 88° when fully near
  controls.minDistance = 0.03;
  // 4. terrain floor under the camera
  if (groundKm != null) {
    const dist = camera.position.distanceTo(target);
    const margin = 0.02 + 0.006 * Math.min(dist, 60);
    const floor = MOON_RADIUS_KM + groundKm + margin;
    if (camR < floor) {
      camera.position.setLength(floor);
      camera.lookAt(target);
    }
  }
  return { weight, aglKm, groundKm, headingDeg, pitchDeg };
}
