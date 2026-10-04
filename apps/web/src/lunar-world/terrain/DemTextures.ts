import type { WebGLRenderer } from 'three';
import { demTexture, supportsFloatLinear } from '@/lunar-world/moon/MoonMaterial';
import type { LoadedTile } from './TerrainCache';

/** One GPU DEM texture per loaded tile, shared by the LOD1 mesh and any LOD2 imagery patches on top of it. */
export function tileDemTexture(tile: LoadedTile, gl: WebGLRenderer) {
  if (!tile.demTexture) tile.demTexture = demTexture(tile.grid, false, supportsFloatLinear(gl.getContext()));
  return tile.demTexture;
}
