import type { AssetEntry } from '@/types/domain';
export type { AssetEntry };

export type LoadedAsset =
  | { kind: 'model'; entry: AssetEntry; scene: import('three').Group; boundingRadius: number; center: import('three').Vector3; sizeMax: number }
  | { kind: 'texture'; entry: AssetEntry; texture: import('three').Texture }
  | { kind: 'elevation'; entry: AssetEntry; grid: ElevationGrid }
  | { kind: 'json'; entry: AssetEntry; data: unknown };

export interface ElevationGrid {
  width: number;
  height: number;
  /** elevation in km relative to the 1737.4 km datum */
  data: Float32Array;
  bounds: { west: number; east: number; north: number; south: number };
  minKm: number;
  maxKm: number;
}
