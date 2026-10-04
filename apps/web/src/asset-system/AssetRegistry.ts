import type { AssetEntry, AssetManifest } from '@/types/domain';

/** AssetRegistry — in-memory index of the asset manifest (built by tools/asset-pipeline, served by the API). */
export class AssetRegistry {
  private entries = new Map<string, AssetEntry>();
  manifest: AssetManifest | null = null;
  private loading: Promise<AssetManifest> | null = null;

  async ensureLoaded(): Promise<AssetManifest> {
    if (this.manifest) return this.manifest;
    if (!this.loading) {
      this.loading = fetch('/api/v1/assets')
        .then((r) => r.json())
        .then((m: AssetManifest) => {
          this.manifest = m;
          for (const e of m.assets) this.entries.set(e.assetId, e);
          return m;
        });
    }
    return this.loading;
  }

  register(entry: AssetEntry) {
    this.entries.set(entry.assetId, entry);
  }

  get(assetId: string): AssetEntry | undefined {
    return this.entries.get(assetId);
  }

  byType(type: string): AssetEntry[] {
    return [...this.entries.values()].filter((e) => e.assetType === type);
  }

  all(): AssetEntry[] {
    return [...this.entries.values()];
  }
}

export const assetRegistry = new AssetRegistry();
