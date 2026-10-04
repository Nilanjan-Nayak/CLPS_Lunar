import { useMemo } from 'react';
import { Quaternion, Vector3, Matrix4 } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { elevationResolver } from '@/lunar-world/terrain/ElevationResolver';
import { useTerrainStore } from '@/state/terrainStore';
import { useWorldStore } from '@/state/worldStore';
import { enuBasis, latLonToVec3 } from '@/utils/geo';

export interface SurfaceAnchor {
  position: Vector3;
  normal: Vector3;
  up: Vector3;
  north: Vector3;
  east: Vector3;
  /** quaternion that maps local +Y → surface normal, −Z → north (object "stands" on the surface facing north) */
  quaternion: Quaternion;
  elevationKm: number;
  slopeDeg: number;
  source: string;
}

/**
 * Landing-site coordinates → terrain-driven placement. Re-evaluates whenever the DEM/tiles change or the
 * exaggeration changes, so markers and spacecraft always sit on the same surface the terrain renders.
 */
export function useSurfaceAnchor(lat: number | null | undefined, lon: number | null | undefined, publishedElevationKm?: number | null): SurfaceAnchor | null {
  const lod0 = useTerrainStore((s) => s.lod0Ready);
  const active = useTerrainStore((s) => s.activeTileIds);
  const exaggeration = useWorldStore((s) => s.elevationExaggeration);
  return useMemo(() => {
    if (lat == null || lon == null) return null;
    const basis = enuBasis(lat, lon);
    const frame = elevationResolver.surface(lat, lon, exaggeration);
    const elevationKm = frame?.elevationKm ?? publishedElevationKm ?? 0;
    const position = frame ? frame.position.clone() : latLonToVec3(lat, lon, MOON_RADIUS_KM + elevationKm * exaggeration);
    const normal = frame ? frame.normal.clone() : basis.up.clone();
    const m = new Matrix4().makeBasis(basis.east, normal, basis.north.clone().negate());
    const quaternion = new Quaternion().setFromRotationMatrix(m);
    return { position, normal, up: basis.up, north: basis.north, east: basis.east, quaternion, elevationKm, slopeDeg: frame?.slopeDeg ?? 0, source: frame?.source ?? (publishedElevationKm != null ? 'published' : 'datum') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, publishedElevationKm, lod0, active.join('|'), exaggeration]);
}
