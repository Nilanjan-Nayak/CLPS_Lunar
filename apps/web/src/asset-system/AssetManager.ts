import { Material, Mesh, Texture } from 'three';
import { useAssetStore } from '@/state/assetStore';
import type { AssetEntry } from '@/types/domain';
import { AssetCache } from './AssetCache';
import { assetRegistry, AssetRegistry } from './AssetRegistry';
import type { LoadedAsset } from './AssetMetadata';
import { loadModel } from './ModelLoader';
import { loadColorTexture, loadElevationGrid } from './TextureLoader';

/**
 * AssetManager — resolve() · load() · preload() · acquire()/release() · unload().
 * Nothing is loaded at startup; scenes request what they need and idle assets are evicted.
 */
export class AssetManager {
  readonly cache = new AssetCache();
  private inflight = new Map<string, Promise<LoadedAsset>>();
  private store = useAssetStore;
  maxIdle = 6;

  constructor(private registry: AssetRegistry = assetRegistry) {}

  resolve(assetId: string): AssetEntry | undefined {
    return this.registry.get(assetId);
  }

  /** cache/lifecycle key: `assetId` or `assetId@variant` (e.g. the 4k rendition of the sky map) */
  static key(assetId: string, variant?: string) { return variant ? `${assetId}@${variant}` : assetId; }

  async load(assetId: string, variant?: string): Promise<LoadedAsset> {
    const key = AssetManager.key(assetId, variant);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const running = this.inflight.get(key);
    if (running) return running;

    this.store.getState().update(key, { assetId, status: 'RESOLVING', progress: 0 });
    await this.registry.ensureLoaded();
    const entry = this.registry.get(assetId);
    if (!entry) {
      this.store.getState().update(key, { status: 'FAILED', error: 'not in manifest' });
      throw new Error(`asset '${assetId}' not in manifest`);
    }
    const rendition = variant ? entry.variants?.find((v) => v.quality === variant) : undefined;
    if (variant && !rendition) {
      this.store.getState().update(key, { status: 'FAILED', error: `no '${variant}' variant` });
      throw new Error(`asset '${assetId}' has no '${variant}' variant`);
    }
    const p = this.doLoad(entry, key, rendition?.url)
      .then((asset) => {
        this.cache.set(key, asset);
        this.inflight.delete(key);
        this.store.getState().update(key, { status: 'LOADED', progress: 1, bytes: rendition?.sizeBytes ?? entry.sizeBytes });
        return asset;
      })
      .catch((err) => {
        this.inflight.delete(key);
        this.store.getState().update(key, { status: 'FAILED', error: String(err?.message ?? err) });
        throw err;
      });
    this.inflight.set(key, p);
    this.store.getState().update(key, { status: 'LOADING' });
    return p;
  }

  private async doLoad(entry: AssetEntry, key: string, urlOverride?: string): Promise<LoadedAsset> {
    const onProgress = (p: number) => this.store.getState().update(key, { progress: p });
    const url = urlOverride ?? entry.url;
    switch (entry.assetType) {
      case 'planet-model':
      case 'moon-model':
      case 'spacecraft-model': {
        const m = await loadModel(entry, onProgress);
        return { kind: 'model', entry, ...m };
      }
      case 'texture':
      case 'planet-texture':
      case 'sky-map':
      case 'elevation-preview': {
        // colour maps are sRGB; single-channel data maps (e.g. cloud cover) stay linear
        const texture = await loadColorTexture(url, entry.assetType === 'sky-map' ? 8 : 4, entry.encoding?.colorSpace === 'linear');
        return { kind: 'texture', entry, texture };
      }
      case 'elevation': {
        const grid = await loadElevationGrid(entry.url, { west: -180, east: 180, north: 90, south: -90 }, entry);
        return { kind: 'elevation', entry, grid };
      }
      default: {
        const data = await fetch(entry.url).then((r) => r.json());
        return { kind: 'json', entry, data };
      }
    }
  }

  preload(assetIds: string[]) {
    for (const id of assetIds) {
      if (!this.cache.has(id) && !this.inflight.has(id)) {
        this.store.getState().update(id, { status: 'REQUESTED' });
        this.load(id).catch(() => undefined);
      }
    }
  }

  acquire(assetId: string, variant?: string) {
    const key = AssetManager.key(assetId, variant);
    const refs = this.cache.acquire(key);
    this.store.getState().update(key, { status: 'ACTIVE', refs });
  }

  release(assetId: string, variant?: string) {
    const key = AssetManager.key(assetId, variant);
    const refs = this.cache.release(key);
    this.store.getState().update(key, { status: refs === 0 ? 'HIDDEN' : 'ACTIVE', refs });
    this.evictIdle();
  }

  unload(assetId: string) {
    const asset = this.cache.get(assetId);
    if (!asset) return;
    if (asset.kind === 'model') {
      asset.scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof Texture) v.dispose();
            (mat as Material).dispose();
          }
        }
      });
    } else if (asset.kind === 'texture') {
      asset.texture.dispose();
    }
    this.cache.delete(assetId);
    this.store.getState().update(assetId, { status: 'UNLOADED', refs: 0 });
  }

  /** Keep memory bounded: unload the oldest idle assets beyond `maxIdle` (planet/moon models are kept). */
  private evictIdle() {
    const idle = this.cache.idle().filter((id) => {
      const e = this.registry.get(id.split('@')[0]);
      return e && e.assetType !== 'planet-model' && e.assetType !== 'moon-model' && e.assetType !== 'elevation';
    });
    while (idle.length > this.maxIdle) this.unload(idle.shift()!);
  }

  get(assetId: string, variant?: string) {
    return this.cache.get(AssetManager.key(assetId, variant));
  }
}

export const assetManager = new AssetManager();
