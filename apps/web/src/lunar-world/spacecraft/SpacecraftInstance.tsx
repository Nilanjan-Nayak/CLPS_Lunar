import { useSurfaceAnchor } from '@/hooks/useSurfaceFrame';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { InfoMarkerLander } from './landers/InfoMarkerLander';
import { ModelLander } from './landers/ModelLander';
import { OrbiterInstance } from './orbiters/OrbiterInstance';

/**
 * SpacecraftInstance — one scene object → one renderer, chosen by the *resolution* the ScenePlanner/SpacecraftResolver
 * produced (nasa-asset | info-marker | info-only). No mission-specific model mapping lives here.
 */
export function SpacecraftInstance({ object }: { object: SceneObject }) {
  const anchor = useSurfaceAnchor(object.placement?.latitude, object.placement?.longitude, object.placement?.elevationKm);
  if (object.kind === 'orbiter') return object.resolution === 'info-only' && !object.assetId ? null : <OrbiterInstance object={object} />;
  if (!anchor) return null;
  if (object.resolution === 'nasa-asset' && object.assetId) return <ModelLander object={object} anchor={anchor} />;
  if (object.resolution === 'info-marker') return <InfoMarkerLander object={object} anchor={anchor} />;
  return null;
}
