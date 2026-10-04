import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { assetRegistry } from '@/asset-system/AssetRegistry';
import { resolveByRole } from '@/asset-system/AssetResolver';
import { MOON_DEM_MAX_DISTANCE_KM, MOON_GLB_MIN_DISTANCE_KM } from '@/constants/frames';
import { useWorldStore } from '@/state/worldStore';
import { TerrainSystem } from '@/lunar-world/terrain/TerrainSystem';
import { MoonModel } from './MoonModel';
import { MoonSurface } from './MoonSurface';

/**
 * Moon — two-tier visual Moon:
 *   far  → NASA GLB (visual asset layer)
 *   near → DEM-displaced scientific globe (LRO/LOLA data layer) + streamed LOD1 terrain tiles
 * The switch is distance-driven and evaluated per frame without React re-renders.
 */
export function Moon({ scientificGlobe, terrain, imagery, terrainOverlay }: { scientificGlobe: boolean; terrain: boolean; imagery: boolean; terrainOverlay: boolean }) {
  const camera = useThree((s) => s.camera);
  const renderer = useWorldStore((s) => s.moonRenderer);
  const [glbId, setGlbId] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const [far, setFar] = useState(true);
  const lastEval = useRef(0);

  useEffect(() => {
    assetRegistry.ensureLoaded().then(() => setGlbId(resolveByRole.moonModel()?.assetId ?? null));
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (t - lastEval.current < 0.25) return;
    lastEval.current = t;
    const d = camera.position.length();
    const wantNear = renderer === 'dem-globe' || (renderer === 'auto' && d < MOON_DEM_MAX_DISTANCE_KM);
    const wantFar = renderer === 'nasa-glb' || (renderer === 'auto' && d > MOON_GLB_MIN_DISTANCE_KM);
    if (wantNear !== near) setNear(wantNear);
    if (wantFar !== far) setFar(wantFar);
  });

  return (
    <group name="moon">
      <MoonModel assetId={glbId} visible={far} />
      {scientificGlobe && <MoonSurface visible={near} overlay={terrainOverlay} />}
      {scientificGlobe && <TerrainSystem enabled={terrain && near} imagery={imagery} overlay={terrainOverlay} />}
    </group>
  );
}
