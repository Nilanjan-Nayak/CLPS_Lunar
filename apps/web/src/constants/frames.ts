/**
 * Scene frame & units.
 *
 * One scene, Moon-centric, units = kilometres. Everything (Earth, Sun sprite, terrain, spacecraft)
 * lives in this frame; the Solar-System layer and the Lunar World are code layers, not coordinate frames.
 *
 * Convention (matches three.js SphereGeometry equirectangular mapping and the API):
 *   lon 0° = +X (sub-Earth point), north = +Y, lon 90°E = −Z.
 */
export const SCENE_UNIT = 'km' as const;
export const MOON_RADIUS_KM = 1737.4;
export const EARTH_RADIUS_KM = 6371.0;
export const EARTH_MOON_MEAN_DISTANCE_KM = 384_400; // mean distance — schematic fallback; the live Earth uses the ephemeris distance
/** The Sun disc/glow is drawn camera-relative at this distance (parallax-free stand-in for 1.5e8 km) with its true 0.53° angular size. */
export const SUN_SPRITE_DISTANCE_KM = 2.5e6;
export const SUN_ANGULAR_DIAMETER_DEG = 0.533;
export const STARFIELD_RADIUS_KM = 4.0e6;
/** Camera-centred sky sphere radius (must stay inside the camera far plane, 5e6 km). */
export const SKY_SPHERE_RADIUS_KM = 1.0e6;

/** Mean Earth position on the Moon's +X axis — schematic default; solar-system/ephemeris.ts supplies the live position
 *  (within ±8° longitude / ±7° latitude of +X because of libration, 356,000–407,000 km). */
export const EARTH_POSITION_KM: [number, number, number] = [EARTH_MOON_MEAN_DISTANCE_KM, 0, 0];

export const MOON_MIN_ELEVATION_KM = -9.2; // LOLA global minimum ≈ −9.1 km
export const MOON_MAX_ELEVATION_KM = 10.8;

/** Distance thresholds (km from Moon centre) that switch the visual Moon between the NASA GLB and the DEM globe. */
export const MOON_GLB_MIN_DISTANCE_KM = 45_000;
export const MOON_DEM_MAX_DISTANCE_KM = 70_000;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
