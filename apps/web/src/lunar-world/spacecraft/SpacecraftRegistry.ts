import type { AssetEntry, Spacecraft } from '@/types/domain';

/**
 * SpacecraftRegistry — knows which visual asset (if any) represents a spacecraft.
 * Populated from the backend (/api/v1/spacecraft + /api/v1/assets). Never hard-coded in components.
 */
export interface SpacecraftAssetBinding {
  spacecraftId: string;
  assetId: string | null;
  assetStatus: Spacecraft['assetStatus'];
  assetNote?: string;
  asset?: AssetEntry | null;
  /** True-scale longest axis in metres (from the asset's normalize block). */
  trueSizeM?: number;
}

export class SpacecraftRegistry {
  private bindings = new Map<string, SpacecraftAssetBinding>();
  private assets = new Map<string, AssetEntry>();

  loadAssets(entries: AssetEntry[]) {
    for (const a of entries) this.assets.set(a.assetId, a);
  }

  loadSpacecraft(list: Spacecraft[]) {
    for (const sc of list) {
      const asset = sc.assetId ? this.assets.get(sc.assetId) ?? sc.asset ?? null : null;
      this.bindings.set(sc.id, {
        spacecraftId: sc.id,
        assetId: asset ? asset.assetId : null,
        assetStatus: sc.assetStatus,
        assetNote: sc.assetNote,
        asset,
        trueSizeM: asset?.normalize?.targetLongestAxisM,
      });
    }
  }

  get(spacecraftId: string) {
    return this.bindings.get(spacecraftId);
  }

  asset(assetId: string) {
    return this.assets.get(assetId);
  }

  all() {
    return [...this.bindings.values()];
  }
}

export const spacecraftRegistry = new SpacecraftRegistry();
