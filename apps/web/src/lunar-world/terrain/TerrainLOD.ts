import { MOON_RADIUS_KM, DEG, RAD } from '@/constants/frames';
import type { TileEntry } from '@/types/domain';

/**
 * TerrainLOD — decides which LOD1 tiles are needed for a camera sub-point + altitude.
 *  far (> 4,000 km): global LOD0 only · medium: tiles within ~1,200 km · near: tiles within ~600 km · very near: ~300 km
 */
export function radiusForAltitude(altitudeKm: number): number {
  if (altitudeKm > 4000) return 0;
  if (altitudeKm > 1500) return 1200;
  if (altitudeKm > 300) return 700;
  return 400;
}

export function tilesAround(tiles: TileEntry[], lat: number, lon: number, radiusKm: number): TileEntry[] {
  if (radiusKm <= 0) return [];
  const dLat = (radiusKm / MOON_RADIUS_KM) * RAD;
  const cosLat = Math.max(Math.cos(lat * DEG), 0.05);
  const dLon = Math.min(dLat / cosLat, 180);
  const n = Math.min(lat + dLat, 90), s = Math.max(lat - dLat, -90);
  return tiles.filter((t) => {
    if (t.bounds.south > n || t.bounds.north < s) return false;
    if (dLon >= 180) return true;
    const w = lon - dLon, e = lon + dLon;
    const overlaps = (a: number, b: number) => !(t.bounds.west >= b || t.bounds.east <= a);
    if (w < -180) return overlaps(w + 360, 180) || overlaps(-180, e);
    if (e > 180) return overlaps(w, 180) || overlaps(-180, e - 360);
    return overlaps(w, e);
  });
}

/** Sort tiles so the ones nearest the focus load first. */
export function sortByDistance(tiles: TileEntry[], lat: number, lon: number): TileEntry[] {
  const d = (t: TileEntry) => {
    const cy = (t.bounds.north + t.bounds.south) / 2, cx = (t.bounds.west + t.bounds.east) / 2;
    const dx = Math.min(Math.abs(cx - lon), 360 - Math.abs(cx - lon)) * Math.cos(lat * DEG);
    return Math.hypot(cy - lat, dx);
  };
  return [...tiles].sort((a, b) => d(a) - d(b));
}
