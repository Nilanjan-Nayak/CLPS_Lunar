import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { useSelectionStore } from '@/state/selectionStore';
import { useMarkerVisibility } from '@/hooks/useMarkerVisibility';
import { useWorldStore } from '@/state/worldStore';
import { latLonToVec3 } from '@/utils/geo';

/** LunarRegion — geographic bounds outline (lat/lon rectangle on the datum + 6 km) with a label at the centre. */
export function LunarRegion({ object }: { object: SceneObject }) {
  const bounds = object.data?.bounds as { north: number; south: number; west: number; east: number } | undefined;
  const select = useSelectionStore((s) => s.select);
  const showLabels = useWorldStore((s) => s.showLabels);
  const { points, center } = useMemo(() => {
    if (!bounds) return { points: [] as Vector3[], center: new Vector3() };
    const r = MOON_RADIUS_KM + 6;
    const pts: Vector3[] = [];
    const n = 24;
    const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
    for (let i = 0; i <= n; i++) pts.push(latLonToVec3(bounds.north, bounds.west + ((east - bounds.west) * i) / n, r));
    for (let i = 0; i <= n; i++) pts.push(latLonToVec3(bounds.north - ((bounds.north - bounds.south) * i) / n, east, r));
    for (let i = 0; i <= n; i++) pts.push(latLonToVec3(bounds.south, east - ((east - bounds.west) * i) / n, r));
    for (let i = 0; i <= n; i++) pts.push(latLonToVec3(bounds.south + ((bounds.north - bounds.south) * i) / n, bounds.west, r));
    const c = latLonToVec3((bounds.north + bounds.south) / 2, (bounds.west + east) / 2, r + 4);
    return { points: pts, center: c };
  }, [bounds]);
  const up = useMemo(() => center.clone().normalize(), [center]);
  const vis = useMarkerVisibility(center, up, 40000);
  if (!bounds || !object.regionId) return null;
  return (
    <group name={`region-${object.regionId}`}>
      <Line points={points} color="#ffd166" lineWidth={1.2} transparent opacity={0.7} />
      {showLabels && vis.label && (
        <Html position={center} center style={{ pointerEvents: 'auto' }} zIndexRange={[5, 0]}>
          <button className="region-label" onClick={() => select({ kind: 'region', id: object.regionId! })}>{object.label}</button>
        </Html>
      )}
    </group>
  );
}
