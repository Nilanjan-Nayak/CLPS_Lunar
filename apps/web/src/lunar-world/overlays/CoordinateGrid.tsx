import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { Vector3 } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { latLonToVec3 } from '@/utils/geo';

/** Selenographic graticule (15° step) slightly above the highest terrain. */
export function CoordinateGrid({ visible }: { visible: boolean }) {
  const lines = useMemo(() => {
    const r = MOON_RADIUS_KM + 12;
    const out: { pts: Vector3[]; major: boolean }[] = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts: Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 3) pts.push(latLonToVec3(lat, lon, r));
      out.push({ pts, major: lat === 0 });
    }
    for (let lon = -180; lon < 180; lon += 15) {
      const pts: Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(latLonToVec3(lat, lon, r));
      out.push({ pts, major: lon === 0 });
    }
    return out;
  }, []);
  if (!visible) return null;
  return (
    <group name="coordinate-grid">
      {lines.map((l, i) => (
        <Line key={i} points={l.pts} color={l.major ? '#8fd3ff' : '#3d5570'} lineWidth={l.major ? 1.2 : 0.6} transparent opacity={l.major ? 0.7 : 0.4} />
      ))}
    </group>
  );
}
