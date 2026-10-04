import type { LoadedAsset } from './AssetMetadata';

/** AssetCache — holds loaded assets with reference counts; disposal happens in AssetManager.unload(). */
export class AssetCache {
  private items = new Map<string, { asset: LoadedAsset; refs: number; lastUsed: number }>();

  get(id: string) {
    const it = this.items.get(id);
    if (it) it.lastUsed = performance.now();
    return it?.asset;
  }
  set(id: string, asset: LoadedAsset) {
    this.items.set(id, { asset, refs: this.items.get(id)?.refs ?? 0, lastUsed: performance.now() });
  }
  has(id: string) {
    return this.items.has(id);
  }
  acquire(id: string) {
    const it = this.items.get(id);
    if (it) it.refs += 1;
    return it?.refs ?? 0;
  }
  release(id: string) {
    const it = this.items.get(id);
    if (it) it.refs = Math.max(0, it.refs - 1);
    return it?.refs ?? 0;
  }
  refs(id: string) {
    return this.items.get(id)?.refs ?? 0;
  }
  delete(id: string) {
    this.items.delete(id);
  }
  /** Ids with zero references, oldest first — candidates for unloading. */
  idle(): string[] {
    return [...this.items.entries()].filter(([, v]) => v.refs === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed).map(([k]) => k);
  }
  size() {
    return this.items.size;
  }
}
