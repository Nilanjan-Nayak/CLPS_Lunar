import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import { useWorldStore } from '@/state/worldStore';
import { liveEphemeris } from './ephemerisDriver';

const EARTH = new Vector3();

/** "Earth" / "Moon" captions for the navigation views — shown only when the bodies are small on screen. */
export function BodyLabels() {
  const showLabels = useWorldStore((s) => s.showLabels);
  const [vis, setVis] = useState({ moon: true, earth: true });
  const [dist, setDist] = useState(0);
  const last = useRef(vis);
  const anchor = useRef<Group>(null);
  useFrame(({ camera }) => {
    const g = liveEphemeris.geometry;
    EARTH.set(g.earthPosScene[0], g.earthPosScene[1], g.earthPosScene[2]);
    anchor.current?.position.copy(EARTH);
    const moon = camera.position.length() > 60_000;
    const earth = camera.position.distanceTo(EARTH) > 60_000;
    const dk = Math.round(g.earthDistanceKm / 100) * 100;
    if (dk !== dist) setDist(dk);
    if (moon !== last.current.moon || earth !== last.current.earth) {
      last.current = { moon, earth };
      setVis(last.current);
    }
  });
  if (!showLabels) return null;
  return (
    <group name="body-labels">
      {vis.moon && (
        <Html position={[0, 0, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="body-label">Moon<small>R 1,737 km</small></div>
        </Html>
      )}
      <group ref={anchor}>
        {vis.earth && (
          <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className="body-label">Earth<small>{dist.toLocaleString('en-US')} km now</small></div>
          </Html>
        )}
      </group>
    </group>
  );
}
