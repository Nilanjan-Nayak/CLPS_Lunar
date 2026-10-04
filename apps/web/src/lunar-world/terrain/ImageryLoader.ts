import type { Texture } from 'three';
import { loadColorTexture } from '@/asset-system/TextureLoader';
import { api } from '@/services/api';
import type { ImageryIndex, ImageryLayer } from '@/types/domain';
import { angularDistanceDeg } from '@/utils/geo';

export interface ImageryTileEntry {
  id: string;
  layer: string;
  z: number;
  y: number;
  x: number;
  bounds: { west: number; east: number; north: number; south: number };
  url: string;
}
export interface LoadedImageryTile { entry: ImageryTileEntry; texture: Texture; lastUsed: number }

const KM_PER_DEG = 30.32; // 2π·1737.4 / 360

/**
 * ImageryLoader — LOD2 surface imagery (LROC WAC 100 m/px) as WMTS tiles served/cached by the backend.
 * Pure imagery: it never changes elevation; it drapes over the LOD1 DEM tiles.
 */
export class ImageryLoader {
  private index: ImageryIndex | null = null;
  private indexPromise: Promise<ImageryIndex> | null = null;
  private cache = new Map<string, LoadedImageryTile>();
  private inflight = new Map<string, Promise<LoadedImageryTile | null>>();
  private failed = new Set<string>();
  readonly capacity = 72;

  ensureIndex() {
    if (this.index) return Promise.resolve(this.index);
    if (!this.indexPromise) this.indexPromise = api.imageryTilesets().then((i) => (this.index = i));
    return this.indexPromise;
  }

  get layer(): ImageryLayer | null {
    return this.index?.layers[0] ?? null;
  }

  /** Level for a camera altitude (km). Tile width at level z = 180/2^z degrees. */
  levelForAltitude(altitudeKm: number): number | null {
    if (altitudeKm > 900) return null;
    if (altitudeKm > 320) return 5;
    if (altitudeKm > 140) return 6;
    if (altitudeKm > 45) return 7;
    return 8;
  }

  tilesAround(lat: number, lon: number, radiusKm: number, z: number, max = 20): ImageryTileEntry[] {
    const layer = this.layer;
    if (!layer) return [];
    const deg = 180 / 2 ** z;
    const rows = 2 ** z, cols = 2 ** (z + 1);
    const dLat = radiusKm / KM_PER_DEG;
    const dLon = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
    const out: ImageryTileEntry[] = [];
    const y0 = Math.max(0, Math.floor((90 - (lat + dLat)) / deg)), y1 = Math.min(rows - 1, Math.floor((90 - (lat - dLat)) / deg));
    const x0 = Math.floor((lon - dLon + 180) / deg), x1 = Math.floor((lon + dLon + 180) / deg);
    for (let y = y0; y <= y1; y++) {
      for (let xx = x0; xx <= x1; xx++) {
        if (x1 - x0 + 1 >= cols && xx > x0 + cols - 1) break;
        const x = ((xx % cols) + cols) % cols;
        const west = -180 + x * deg, north = 90 - y * deg;
        out.push({ id: `${layer.id}/${z}/${y}/${x}`, layer: layer.id, z, y, x, bounds: { west, east: west + deg, north, south: north - deg }, url: layer.urlTemplate.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x)) });
      }
    }
    const center = (e: ImageryTileEntry) => angularDistanceDeg(lat, lon, (e.bounds.north + e.bounds.south) / 2, (e.bounds.west + e.bounds.east) / 2);
    return out.sort((a, b) => center(a) - center(b)).slice(0, max);
  }

  get(id: string) {
    const t = this.cache.get(id);
    if (t) t.lastUsed = performance.now();
    return t ?? null;
  }

  load(entry: ImageryTileEntry): Promise<LoadedImageryTile | null> {
    const c = this.get(entry.id);
    if (c) return Promise.resolve(c);
    if (this.failed.has(entry.id)) return Promise.resolve(null);
    const running = this.inflight.get(entry.id);
    if (running) return running;
    const p = loadColorTexture(entry.url, 8)
      .then((texture) => {
        texture.flipY = false;
        texture.needsUpdate = true;
        const t = { entry, texture, lastUsed: performance.now() };
        this.cache.set(entry.id, t);
        return t;
      })
      .catch(() => {
        this.failed.add(entry.id);
        return null;
      })
      .finally(() => this.inflight.delete(entry.id));
    this.inflight.set(entry.id, p);
    return p;
  }

  /** Kick off loads for `entries` (max `parallel` new requests) and return the ones already available. */
  ensure(entries: ImageryTileEntry[], parallel = 6): LoadedImageryTile[] {
    const ready: LoadedImageryTile[] = [];
    let started = 0;
    for (const e of entries) {
      const c = this.get(e.id);
      if (c) ready.push(c);
      else if (!this.failed.has(e.id) && !this.inflight.has(e.id) && started < parallel) {
        started++;
        void this.load(e);
      }
    }
    return ready;
  }

  evict(keep: Set<string>) {
    if (this.cache.size <= this.capacity) return;
    const victims = [...this.cache.values()].filter((t) => !keep.has(t.entry.id)).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const v of victims.slice(0, this.cache.size - this.capacity)) {
      v.texture.dispose();
      this.cache.delete(v.entry.id);
    }
  }
}

export const imageryLoader = new ImageryLoader();
