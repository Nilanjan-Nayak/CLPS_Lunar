import { useMemo } from 'react';
import { Vector3 } from 'three';
import { useWorldStore } from '@/state/worldStore';
import { latLonToVec3 } from '@/utils/geo';

/** Unit vector from the Moon centre toward the Sun, from the subsolar point in WorldSettings. */
export function useSunDirection(): Vector3 {
  const lat = useWorldStore((s) => s.subsolarLatitudeDeg);
  const lon = useWorldStore((s) => s.subsolarLongitudeDeg);
  return useMemo(() => latLonToVec3(lat, lon, 1), [lat, lon]);
}
