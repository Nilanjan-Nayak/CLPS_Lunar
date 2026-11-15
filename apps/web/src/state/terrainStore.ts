import { create } from 'zustand';

export type TileStatus = 'REQUESTED' | 'LOADING' | 'LOADED' | 'ACTIVE' | 'FAILED';

interface TerrainStore {
  tiles: Record<string, TileStatus>;
  lod0Ready: boolean;
  activeTileIds: string[];
  imageryTileIds: string[];
  /** current micro-detail strength 0..1 (published by the terrain system for the HUD) */
  detailStrength: number;
  setDetailStrength: (v: number) => void;
  /** current display exposure multiplier applied to the lunar surface (1 = none) */
  exposure: number;
  setExposure: (v: number) => void;
  setImagery: (ids: string[]) => void;
  setTile: (id: string, status: TileStatus) => void;
  setActive: (ids: string[]) => void;
  setLod0Ready: (ready: boolean) => void;
}

export const useTerrainStore = create<TerrainStore>((set) => ({
  tiles: {},
  lod0Ready: false,
  activeTileIds: [],
  imageryTileIds: [],
  detailStrength: 0,
  setDetailStrength: (detailStrength) => set({ detailStrength }),
  exposure: 1,
  setExposure: (exposure) => set({ exposure }),
  setImagery: (imageryTileIds) => set({ imageryTileIds }),
  setTile: (id, status) => set((s) => (s.tiles[id] === status ? s : { tiles: { ...s.tiles, [id]: status } })),
  setActive: (activeTileIds) => set({ activeTileIds }),
  setLod0Ready: (lod0Ready) => set({ lod0Ready }),
}));
