import { useMemo } from 'react';
import type { SurfaceAnchor } from '@/hooks/useSurfaceFrame';
import { useNasaModel } from '@/hooks/useNasaModel';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { useSelectionStore } from '@/state/selectionStore';
import { InfoMarkerLander } from './InfoMarkerLander';

/**
 * ModelLander — generic renderer for ANY surface asset resolved through the AssetManager
 * (true size from the asset's normalize metadata × declared display scale). Falls back to the info marker
 * until the model is loaded or if loading fails.
 */
export function ModelLander({ object, anchor }: { object: SceneObject; anchor: SurfaceAnchor }) {
  const { model, error } = useNasaModel(object.assetId ?? null);
  const select = useSelectionStore((s) => s.select);
  const scale = useMemo(() => {
    if (!model) return 1;
    const trueSizeM = model.asset.entry.normalize?.targetLongestAxisM ?? model.asset.sizeMax;
    const kmPerUnit = trueSizeM / 1000 / model.asset.sizeMax;
    return kmPerUnit * (object.displayScale ?? 1);
  }, [model, object.displayScale]);
  if (!model || error) return <InfoMarkerLander object={object} anchor={anchor} />;
  return (
    <group position={anchor.position} quaternion={anchor.quaternion} onClick={(e) => { e.stopPropagation(); select({ kind: 'spacecraft', id: object.spacecraftId!, missionId: object.missionId }); }}>
      <primitive object={model.scene} scale={scale} position={model.asset.center.clone().multiplyScalar(-scale)} />
    </group>
  );
}
