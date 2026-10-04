import { create } from 'zustand';

/** Object lifecycle — REQUESTED → RESOLVING → LOADING → LOADED → ACTIVE → HIDDEN → UNLOADED (or FAILED). */
export type AssetLifecycle = 'REQUESTED' | 'RESOLVING' | 'LOADING' | 'LOADED' | 'ACTIVE' | 'HIDDEN' | 'UNLOADED' | 'FAILED';

export interface AssetRecord {
  assetId: string;
  status: AssetLifecycle;
  progress: number; // 0..1
  refs: number;
  bytes?: number;
  error?: string;
  updatedAt: number;
}

interface AssetStore {
  records: Record<string, AssetRecord>;
  /** keyed by `assetId` or `assetId@variant` */
  update: (key: string, patch: Partial<AssetRecord>) => void;
  remove: (assetId: string) => void;
}

export const useAssetStore = create<AssetStore>((set) => ({
  records: {},
  update: (key, patch) =>
    set((s) => ({
      records: {
        ...s.records,
        [key]: { ...({ assetId: key.split('@')[0], status: 'REQUESTED', progress: 0, refs: 0 } as AssetRecord), ...s.records[key], ...patch, updatedAt: performance.now() },
      },
    })),
  remove: (assetId) =>
    set((s) => {
      const next = { ...s.records };
      delete next[assetId];
      return { records: next };
    }),
}));
