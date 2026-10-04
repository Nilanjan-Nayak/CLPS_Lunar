import { useSurfaceAnchor } from '@/hooks/useSurfaceFrame';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { LocationMarker } from '@/lunar-world/locations/LocationMarker';
import type { TerrainFeatures } from '@/types/domain';

/** PlanSite — the user's candidate landing point, placed by the same terrain-driven anchor as real sites. */
export function PlanSite({ object }: { object: SceneObject }) {
  const anchor = useSurfaceAnchor(object.placement?.latitude, object.placement?.longitude, object.placement?.elevationKm);
  const t = object.data?.terrain as TerrainFeatures | undefined;
  if (!anchor) return null;
  return (
    <LocationMarker
      anchor={anchor}
      label={object.label}
      sublabel={t ? `${t.elevationM >= 0 ? '+' : ''}${t.elevationM.toFixed(0)} m · slope ${t.slopeDeg}° · σ ${t.roughnessM} m · Sun ≤ ${t.maxSunElevationDeg}°` : 'analysing…'}
      color="#c792ff"
      selected
      labelMaxDistanceKm={6000}
    />
  );
}
