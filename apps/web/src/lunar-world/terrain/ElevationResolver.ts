import { Vector3 } from 'three';
import { MOON_RADIUS_KM, DEG } from '@/constants/frames';
import { enuBasis, latLonToVec3, wrapLon } from '@/utils/geo';
import type { ElevationGrid } from '@/asset-system/AssetMetadata';

export interface SurfaceFrame {
  elevationKm: number;
  /** Surface point at true scale (radius = datum + elevation × exaggeration). */
  position: Vector3;
  normal: Vector3;
  up: Vector3;
  north: Vector3;
  east: Vector3;
  slopeDeg: number;
  lod: number;
  source: string;
}

interface GridRef { id: string; lod: number; grid: ElevationGrid }

/**
 * ElevationResolver — answers "how high is the surface at (lat, lon)?" from the best loaded LOD.
 * LOD0 = global 4 px/deg grid; LOD1 = 16 px/deg tiles as they stream in. Used for every placement.
 */
export class ElevationResolver {
  private lod0: GridRef | null = null;
  private tiles = new Map<string, GridRef>();

  setGlobal(grid: ElevationGrid) {
    this.lod0 = { id: 'ldem-4-global', lod: 0, grid };
  }
  addTile(id: string, grid: ElevationGrid) {
    this.tiles.set(id, { id, lod: 1, grid });
  }
  removeTile(id: string) {
    this.tiles.delete(id);
  }
  get ready() {
    return !!this.lod0;
  }

  private best(lat: number, lon: number): GridRef | null {
    for (const t of this.tiles.values()) {
      const b = t.grid.bounds;
      if (lat <= b.north && lat >= b.south && lon >= b.west && lon < b.east) return t;
    }
    return this.lod0;
  }

  private sample(ref: GridRef, lat: number, lon: number): number {
    const g = ref.grid;
    const b = g.bounds;
    const dppX = (b.east - b.west) / g.width;
    const dppY = (b.north - b.south) / g.height;
    const fx = (lon - b.west) / dppX - 0.5;
    const fy = (b.north - lat) / dppY - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const wrap = ref.lod === 0;
    const at = (x: number, y: number) => {
      let xx = x;
      if (wrap) xx = ((x % g.width) + g.width) % g.width;
      else xx = Math.min(Math.max(x, 0), g.width - 1);
      const yy = Math.min(Math.max(y, 0), g.height - 1);
      return g.data[yy * g.width + xx];
    };
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
  }

  elevationKm(lat: number, lon: number): { elevationKm: number; lod: number; source: string } | null {
    lon = wrapLon(lon);
    const ref = this.best(lat, lon);
    if (!ref) return null;
    return { elevationKm: this.sample(ref, lat, lon), lod: ref.lod, source: ref.id };
  }

  /** Surface frame with normal from finite differences (step ≈ 1 texel of the best LOD). */
  surface(lat: number, lon: number, exaggeration = 1): SurfaceFrame | null {
    const e0 = this.elevationKm(lat, lon);
    if (!e0) return null;
    const step = e0.lod === 1 ? 1 / 16 : 1 / 4;
    const eN = this.elevationKm(Math.min(lat + step, 90), lon)!.elevationKm;
    const eS = this.elevationKm(Math.max(lat - step, -90), lon)!.elevationKm;
    const eE = this.elevationKm(lat, lon + step)!.elevationKm;
    const eW = this.elevationKm(lat, lon - step)!.elevationKm;
    const r = MOON_RADIUS_KM + e0.elevationKm;
    const dLat = 2 * step * DEG * r;
    const dLon = 2 * step * DEG * r * Math.max(Math.cos(lat * DEG), 1e-6);
    const gradN = ((eN - eS) / dLat) * exaggeration;
    const gradE = ((eE - eW) / dLon) * exaggeration;
    const { up, north, east } = enuBasis(lat, lon);
    const normal = up.clone().addScaledVector(north, -gradN).addScaledVector(east, -gradE).normalize();
    const slopeDeg = Math.atan(Math.hypot(gradN, gradE)) / DEG;
    const position = latLonToVec3(lat, lon, MOON_RADIUS_KM + e0.elevationKm * exaggeration);
    return { elevationKm: e0.elevationKm, position, normal, up, north, east, slopeDeg, lod: e0.lod, source: e0.source };
  }
}

export const elevationResolver = new ElevationResolver();
