import { create } from 'zustand';

export type TileStatus = 'REQUESTED' | 'LOADING' | 'LOADED' | 'ACTIVE' | 'FAILED';

interface TerrainStore {
  tiles: Record<string, TileStatus>;
  lod0Ready: boolean;
  activeTileIds: string[];
  imageryTileIds: string[];
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
  setImagery: (imageryTileIds) => set({ imageryTileIds }),
  setTile: (id, status) => set((s) => (s.tiles[id] === status ? s : { tiles: { ...s.tiles, [id]: status } })),
  setActive: (activeTileIds) => set({ activeTileIds }),
  setLod0Ready: (lod0Ready) => set({ lod0Ready }),
}));
