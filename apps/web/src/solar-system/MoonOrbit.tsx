import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vector3 } from 'three';
import { moonOrbitRing } from './SpaceNavigation';
import { useEphemerisStore } from './ephemerisDriver';

/** Schematic Moon-orbit ring (navigation aid). The former dashed Earth→Moon line is gone: routes are per-mission journeys (lunar-world/trajectories/Journey). */
export function NavigationPath({ visible }: { visible: boolean }) {
  // follow the live Earth, re-tessellating only when it has moved by > 500 km
  const key = useEphemerisStore((s) => s.geometry.earthPosScene.map((c) => Math.round(c / 500) * 500).join(','));
  const earth = useMemo(() => new Vector3(...(key.split(',').map(Number) as [number, number, number])), [key]);
  const ring = useMemo(() => moonOrbitRing(earth), [earth]);
  if (!visible) return null;
  return (
    <group name="navigation-schematic">
      <Line points={ring} color="#4a6f8f" lineWidth={1} dashed dashSize={9000} gapSize={9000} transparent opacity={0.45} />
    </group>
  );
}
