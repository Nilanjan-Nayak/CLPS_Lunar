import type { SceneObject } from '@/scene-manager/SceneConfig';
import { SpacecraftInstance } from './SpacecraftInstance';

/** SpacecraftSystem — renders every spacecraft object of the active SceneConfig (data-driven, registry-resolved). */
export function SpacecraftSystem({ objects, visible }: { objects: SceneObject[]; visible: boolean }) {
  if (!visible) return null;
  return (
    <group name="spacecraft">
      {objects.filter((o) => o.kind === 'lander' || o.kind === 'rover' || o.kind === 'orbiter').map((o) => <SpacecraftInstance key={o.id} object={o} />)}
    </group>
  );
}
