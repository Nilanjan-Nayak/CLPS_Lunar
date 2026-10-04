import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3, Vector4 } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { buildLatLonPatch } from '@/lunar-world/moon/MoonGeometry';
import { createMoonMaterial, supportsFloatLinear } from '@/lunar-world/moon/MoonMaterial';
import { tileDemTexture } from './DemTextures';
import type { LoadedImageryTile } from './ImageryLoader';
import type { LoadedTile } from './TerrainCache';

interface Props {
  tile: LoadedImageryTile;
  /** LOD1 tile whose DEM this patch is displaced with */
  parent: LoadedTile;
  exaggeration: number;
  sunDir: Vector3;
  overlay: boolean;
}

// LROC WAC is grayscale; a mild warm tint keeps it visually continuous with the LROC color map underneath.
const WAC_TINT = new Vector3(0.98, 0.95, 0.9);

/** LOD2 imagery patch: a small lat/lon patch draped with a 100 m/px WAC tile, displaced by the parent LOD1 DEM. */
export function ImageryTile({ tile, parent, exaggeration, sunDir, overlay }: Props) {
  const gl = useThree((s) => s.gl);
  const segs = tile.entry.z >= 8 ? 20 : tile.entry.z >= 7 ? 28 : 40;
  const geometry = useMemo(() => buildLatLonPatch(tile.entry.bounds, segs, segs, MOON_RADIUS_KM), [tile.entry.id, segs]);
  const material = useMemo(() => {
    const pb = parent.entry.bounds, b = tile.entry.bounds;
    const du = (b.east - b.west) / (pb.east - pb.west), dv = (b.north - b.south) / (pb.north - pb.south);
    const u0 = (b.west - pb.west) / (pb.east - pb.west), v0 = (pb.north - b.north) / (pb.north - pb.south);
    const linear = supportsFloatLinear(gl.getContext());
    return createMoonMaterial({
      dem: tileDemTexture(parent, gl), demSize: parent.grid, color: tile.texture, bounds: b, exaggeration, sunDir, overlay,
      minKm: parent.grid.minKm, maxKm: parent.grid.maxKm, lift: 0.035, polygonOffset: -4, manualBilinear: !linear,
      tint: WAC_TINT, demRect: new Vector4(u0, v0, du, dv),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.entry.id, parent.entry.id]);

  useEffect(() => {
    material.uniforms.uExaggeration.value = exaggeration;
    material.uniforms.uSunDir.value.copy(sunDir);
    material.uniforms.uOverlay.value = overlay ? 1 : 0;
  }, [material, exaggeration, sunDir, overlay]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  return <mesh geometry={geometry} material={material} renderOrder={3} name={`imagery-${tile.entry.id}`} />;
}
