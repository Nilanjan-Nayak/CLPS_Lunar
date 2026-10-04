import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { buildLatLonPatch } from '@/lunar-world/moon/MoonGeometry';
import { createMoonMaterial, supportsFloatLinear } from '@/lunar-world/moon/MoonMaterial';
import { tileDemTexture } from './DemTextures';
import { terrainMasks } from './CoverageMask';
import type { LoadedTile } from './TerrainCache';

interface Props {
  tile: LoadedTile;
  fallbackColor: import('three').Texture | null;
  exaggeration: number;
  sunDir: Vector3;
  overlay: boolean;
  segments: number;
}

/** One 22.5° LOD1 tile: 16 px/deg LOLA-derived elevation + LROC color, rendered with the shared terrain shader. */
export function TerrainTile({ tile, fallbackColor, exaggeration, sunDir, overlay, segments }: Props) {
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(() => buildLatLonPatch(tile.entry.bounds, segments, segments, MOON_RADIUS_KM), [tile.entry.id, segments]);
  const material = useMemo(() => {
    const linear = supportsFloatLinear(gl.getContext());
    const dem = tileDemTexture(tile, gl);
    const color = tile.color ?? fallbackColor!;
    const m = createMoonMaterial({
      dem, demSize: tile.grid, color, bounds: tile.entry.bounds, exaggeration, sunDir, overlay,
      minKm: tile.grid.minKm, maxKm: tile.grid.maxKm, lift: 0.02, polygonOffset: true, manualBilinear: !linear,
      mask: terrainMasks.forTile(tile.entry.id, tile.entry.bounds).texture,
    });
    if (!tile.color && fallbackColor) {
      // fallback: sample the global albedo with a uv remap (rare — only if a color tile is missing)
      m.uniforms.uColor.value = fallbackColor;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.entry.id]);

  useEffect(() => {
    material.uniforms.uExaggeration.value = exaggeration;
    material.uniforms.uSunDir.value.copy(sunDir);
    material.uniforms.uOverlay.value = overlay ? 1 : 0;
  }, [material, exaggeration, sunDir, overlay]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose(); // the DEM texture is owned by the TerrainCache
    },
    [geometry, material],
  );

  return <mesh geometry={geometry} material={material} renderOrder={2} frustumCulled name={`tile-${tile.entry.id}`} />;
}
