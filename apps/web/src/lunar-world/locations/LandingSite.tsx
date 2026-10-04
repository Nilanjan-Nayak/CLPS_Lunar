import { useSurfaceAnchor } from '@/hooks/useSurfaceFrame';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { useSelectionStore } from '@/state/selectionStore';
import { LocationMarker, STATUS_COLOR } from './LocationMarker';

/** LandingSite — placement is driven entirely by the site's coordinates + the ElevationResolver. */
export function LandingSite({ object }: { object: SceneObject }) {
  const anchor = useSurfaceAnchor(object.placement?.latitude, object.placement?.longitude, object.placement?.elevationKm);
  const selected = useSelectionStore((s) => s.selected);
  const select = useSelectionStore((s) => s.select);
  const hover = useSelectionStore((s) => s.hover);
  if (!anchor || !object.landingSiteId) return null;
  const isSel = (selected?.kind === 'landing-site' && selected.id === object.landingSiteId) || (selected?.kind === 'mission' && selected.id === object.missionId);
  const approx = object.precision === 'approx' || object.precision === 'region';
  const missions = (object.data?.missions as string[] | undefined)?.join(', ');
  return (
    <LocationMarker
      anchor={anchor}
      label={object.label}
      sublabel={`${missions ? missions + ' · ' : ''}${approx ? 'approx. ' : ''}${anchor.elevationKm >= 0 ? '+' : ''}${(anchor.elevationKm * 1000).toFixed(0)} m`}
      color={STATUS_COLOR[object.status ?? ''] ?? '#8fd3ff'}
      selected={isSel}
      approximate={approx}
      onClick={() => select({ kind: 'landing-site', id: object.landingSiteId! })}
      onHover={(h) => hover(h ? { kind: 'landing-site', id: object.landingSiteId! } : null)}
    />
  );
}
