import { Vector3 } from 'three';
import { DEG, RAD } from '@/constants/frames';

/** lat/lon (deg) → position in the Moon-centric frame (lon0=+X, north=+Y, 90E=−Z). */
export function latLonToVec3(latDeg: number, lonDeg: number, radius: number, out = new Vector3()): Vector3 {
  const φ = latDeg * DEG, λ = lonDeg * DEG;
  const c = Math.cos(φ);
  return out.set(radius * c * Math.cos(λ), radius * Math.sin(φ), -radius * c * Math.sin(λ));
}

export function vec3ToLatLon(v: Vector3): { latitude: number; longitude: number; radius: number } {
  const r = v.length();
  return { latitude: Math.asin(v.y / r) * RAD, longitude: Math.atan2(-v.z, v.x) * RAD, radius: r };
}

export interface EnuBasis { up: Vector3; north: Vector3; east: Vector3 }

/** Local East-North-Up basis at (lat, lon). */
export function enuBasis(latDeg: number, lonDeg: number): EnuBasis {
  const φ = latDeg * DEG, λ = lonDeg * DEG;
  const up = new Vector3(Math.cos(φ) * Math.cos(λ), Math.sin(φ), -Math.cos(φ) * Math.sin(λ));
  const north = new Vector3(-Math.sin(φ) * Math.cos(λ), Math.cos(φ), Math.sin(φ) * Math.sin(λ));
  const east = new Vector3(-Math.sin(λ), 0, -Math.cos(λ));
  return { up, north, east };
}

export function wrapLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

/** Great-circle angular distance in degrees. */
export function angularDistanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = latLonToVec3(lat1, lon1, 1), b = latLonToVec3(lat2, lon2, 1);
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * RAD;
}

export function formatLatLon(lat: number, lon: number, digits = 2): string {
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(digits)}°${lon < 0 ? 'W' : 'E'}`;
}
