import { loadColorTexture, loadElevationGrid } from '@/asset-system/TextureLoader';
import { useTerrainStore } from '@/state/terrainStore';
import type { TileEntry, TileIndex } from '@/types/domain';
import { elevationResolver } from './ElevationResolver';
import { TerrainCache, type LoadedTile } from './TerrainCache';
import { sortByDistance, tilesAround } from './TerrainLOD';

/**
 * TerrainLoader — fetches the tileset index once, then streams tiles on demand (elevation PNG + color JPG),
 * decodes them, registers grids with the ElevationResolver and keeps an LRU cache.
 */
export class TerrainLoader {
  readonly cache = new TerrainCache(18);
  private index: TileIndex | null = null;
  private indexPromise: Promise<TileIndex> | null = null;
  private inflight = new Map<string, Promise<LoadedTile | null>>();

  async ensureIndex(): Promise<TileIndex> {
    if (this.index) return this.index;
    if (!this.indexPromise) {
      this.indexPromise = fetch('/api/v1/lunar/terrain/tilesets')
        .then((r) => r.json())
        .then((idx: TileIndex) => {
          this.index = idx;
          return idx;
        });
    }
    return this.indexPromise;
  }

  get tileIndex() {
    return this.index;
  }

  availableAround(lat: number, lon: number, radiusKm: number): TileEntry[] {
    if (!this.index) return [];
    return sortByDistance(tilesAround(this.index.tiles, lat, lon, radiusKm), lat, lon);
  }

  async load(entry: TileEntry): Promise<LoadedTile | null> {
    const cached = this.cache.get(entry.id);
    if (cached) return cached;
    const running = this.inflight.get(entry.id);
    if (running) return running;
    const store = useTerrainStore.getState();
    store.setTile(entry.id, 'LOADING');
    const p = (async () => {
      try {
        const [grid, color] = await Promise.all([
          loadElevationGrid(entry.elevation.url, entry.bounds),
          entry.color ? loadColorTexture(entry.color.url, 4).then((t) => { t.flipY = false; t.needsUpdate = true; return t; }) : Promise.resolve(null),
        ]);
        const tile: LoadedTile = { entry, grid, color, lastUsed: performance.now() };
        this.cache.set(entry.id, tile);
        elevationResolver.addTile(entry.id, grid);
        store.setTile(entry.id, 'LOADED');
        return tile;
      } catch (err) {
        console.warn('tile load failed', entry.id, err);
        store.setTile(entry.id, 'FAILED');
        return null;
      } finally {
        this.inflight.delete(entry.id);
      }
    })();
    this.inflight.set(entry.id, p);
    return p;
  }

  /** Ensure a set of tiles is loaded (in order); returns the loaded ones synchronously available now. */
  ensure(entries: TileEntry[]): LoadedTile[] {
    const ready: LoadedTile[] = [];
    for (const e of entries) {
      const c = this.cache.get(e.id);
      if (c) ready.push(c);
      else this.load(e);
    }
    return ready;
  }

  async prefetchAround(lat: number, lon: number, radiusKm: number) {
    await this.ensureIndex();
    const wanted = this.availableAround(lat, lon, radiusKm);
    for (const w of wanted) useTerrainStore.getState().setTile(w.id, this.cache.has(w.id) ? 'LOADED' : 'REQUESTED');
    await Promise.all(wanted.slice(0, 6).map((e) => this.load(e)));
  }

  /** Drop far-away tiles beyond the cache capacity. */
  evict(keep: Set<string>) {
    for (const id of this.cache.evict(keep)) {
      elevationResolver.removeTile(id);
      useTerrainStore.getState().setTile(id, 'REQUESTED');
    }
  }
}

export const terrainLoader = new TerrainLoader();
