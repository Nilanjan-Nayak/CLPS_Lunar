import type { DataTexture, Texture } from 'three';
import type { ElevationGrid } from '@/asset-system/AssetMetadata';
import type { TileEntry } from '@/types/domain';

export interface LoadedTile {
  entry: TileEntry;
  grid: ElevationGrid;
  color: Texture | null;
  /** shared R32F DEM texture (created lazily by the first mesh that needs it) */
  demTexture?: DataTexture;
  lastUsed: number;
}

/** TerrainCache — LRU cache of decoded tiles (elevation grid + color texture). */
export class TerrainCache {
  private items = new Map<string, LoadedTile>();
  constructor(public capacity = 18) {}

  get(id: string) {
    const t = this.items.get(id);
    if (t) t.lastUsed = performance.now();
    return t;
  }
  has(id: string) {
    return this.items.has(id);
  }
  set(id: string, tile: LoadedTile) {
    this.items.set(id, tile);
  }
  keys() {
    return [...this.items.keys()];
  }
  /** Evict least-recently-used tiles that are not in `keep`; returns evicted ids. */
  evict(keep: Set<string>): string[] {
    const evicted: string[] = [];
    if (this.items.size <= this.capacity) return evicted;
    const candidates = [...this.items.entries()].filter(([id]) => !keep.has(id)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (this.items.size > this.capacity && candidates.length) {
      const [id, tile] = candidates.shift()!;
      tile.color?.dispose();
      tile.demTexture?.dispose();
      this.items.delete(id);
      evicted.push(id);
    }
    return evicted;
  }
}
