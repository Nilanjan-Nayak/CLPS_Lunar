import { useEffect, useMemo } from 'react';
import { Euler, MeshStandardMaterial, Mesh } from 'three';
import { MOON_RADIUS_KM, MOON_MIN_ELEVATION_KM, DEG } from '@/constants/frames';
import { useNasaModel } from '@/hooks/useNasaModel';
import { useSelectionStore } from '@/state/selectionStore';

/**
 * MoonModel — NASA SVS `moon_small.glb` (LRO color map on a smooth sphere), normalized to the lunar datum minus the
 * global minimum elevation so the DEM globe always sits on top of it wherever both are visible.
 */
export function MoonModel({ assetId, visible }: { assetId: string | null; visible: boolean }) {
  const { model } = useNasaModel(assetId);
  const select = useSelectionStore((s) => s.select);
  const scale = useMemo(() => (model ? (MOON_RADIUS_KM + MOON_MIN_ELEVATION_KM - 3) / model.asset.boundingRadius : 1), [model]);
  const rotation = useMemo(() => {
    const r = model?.asset.entry.frame?.rotationDeg ?? [0, 0, 0];
    return new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG);
  }, [model]);

  useEffect(() => {
    model?.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as MeshStandardMaterial).isMeshStandardMaterial) {
        const mat = m.material as MeshStandardMaterial;
        mat.roughness = 1;
        mat.metalness = 0;
      }
    });
  }, [model]);

  if (!model) return null;
  return (
    <group visible={visible} name="moon-nasa-glb" onClick={(e) => { e.stopPropagation(); select({ kind: 'moon' }); }}>
      <primitive object={model.scene} scale={scale} rotation={rotation} position={model.asset.center.clone().multiplyScalar(-scale)} />
    </group>
  );
}
