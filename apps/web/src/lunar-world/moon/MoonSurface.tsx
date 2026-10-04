import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Mesh, ShaderMaterial } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { useWorldStore } from '@/state/worldStore';
import { useTerrainStore } from '@/state/terrainStore';
import { useSunDirection } from '@/hooks/useSunDirection';
import { elevationResolver } from '@/lunar-world/terrain/ElevationResolver';
import { buildLatLonPatch } from './MoonGeometry';
import { createMoonMaterial, demTexture, supportsFloatLinear } from './MoonMaterial';
import { loadMoonAlbedo, loadMoonGlobalElevation } from './MoonTexture';
import { terrainMasks } from '@/lunar-world/terrain/CoverageMask';

/**
 * MoonSurface — the *scientific* globe: LOD0 lat/lon grid displaced by the LOLA-derived global DEM
 * (4 px/deg) and textured with the LROC color map. Replaces the NASA GLB when the camera gets close.
 */
export function MoonSurface({ visible = true, overlay = false }: { visible?: boolean; overlay?: boolean }) {
  const gl = useThree((s) => s.gl);
  const quality = useWorldStore((s) => s.quality);
  const exaggeration = useWorldStore((s) => s.elevationExaggeration);
  const sunDir = useSunDirection();
  const [material, setMaterial] = useState<ShaderMaterial | null>(null);
  const meshRef = useRef<Mesh>(null);

  const segments = quality === 'high' ? [1024, 512] : quality === 'low' ? [360, 180] : [720, 360];
  const geometry = useMemo(() => buildLatLonPatch({ west: -180, east: 180, north: 90, south: -90 }, segments[0], segments[1], MOON_RADIUS_KM), [segments[0], segments[1]]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ texture }, { grid }] = await Promise.all([loadMoonAlbedo(quality), loadMoonGlobalElevation()]);
      if (cancelled) return;
      elevationResolver.setGlobal(grid);
      useTerrainStore.getState().setLod0Ready(true);
      const linear = supportsFloatLinear(gl.getContext());
      const dem = demTexture(grid, true, linear);
      const m = createMoonMaterial({
        dem, demSize: grid, color: texture, bounds: { west: -180, east: 180, north: 90, south: -90 },
        exaggeration, sunDir, overlay, minKm: grid.minKm, maxKm: grid.maxKm, manualBilinear: !linear,
        mask: terrainMasks.lod0.texture,
      });
      setMaterial(m);
    })().catch((e) => console.error('MoonSurface failed', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  useEffect(() => {
    if (!material) return;
    material.uniforms.uExaggeration.value = exaggeration;
    material.uniforms.uSunDir.value.copy(sunDir);
    material.uniforms.uOverlay.value = overlay ? 1 : 0;
  }, [material, exaggeration, sunDir, overlay]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!material) return null;
  return <mesh ref={meshRef} geometry={geometry} material={material} visible={visible} frustumCulled={false} name="moon-surface-lod0" />;
}
