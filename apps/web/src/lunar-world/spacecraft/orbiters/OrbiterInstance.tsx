import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { FlightMarker } from '@/lunar-world/markers/FlightMarker';
import { Group, Vector3 } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { useNasaModel } from '@/hooks/useNasaModel';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { useSelectionStore } from '@/state/selectionStore';
import { useWorldStore } from '@/state/worldStore';
import { enuBasis, latLonToVec3 } from '@/utils/geo';

const PERIOD_S = 240; // visual period — not the real ~113 min orbit

/**
 * OrbiterInstance — an orbiter on a *schematic* circular polar orbit whose plane contains the focus meridian.
 * Real ephemerides are not fabricated; the HUD states the schematic nature and the display scale.
 */
export function OrbiterInstance({ object }: { object: SceneObject }) {
  const alt = object.placement?.altitudeKm ?? 100;
  const lat = object.placement?.latitude ?? 0;
  const lon = object.placement?.longitude ?? 0;
  const { model } = useNasaModel(object.assetId ?? null);
  const showLabels = useWorldStore((s) => s.showLabels);
  const select = useSelectionStore((s) => s.select);
  const ref = useRef<Group>(null);
  const r = MOON_RADIUS_KM + alt;
  const { u, v, ring } = useMemo(() => {
    // orbit plane spanned by the focus radial and the local north (polar orbit through the site meridian)
    const u = latLonToVec3(lat, lon, 1);
    const v = enuBasis(lat, lon).north.clone();
    const pts: Vector3[] = [];
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      pts.push(u.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r));
    }
    return { u, v, ring: pts };
  }, [lat, lon, r]);
  const scale = useMemo(() => {
    if (!model) return 1;
    const trueSizeM = model.asset.entry.normalize?.targetLongestAxisM ?? model.asset.sizeMax;
    return (trueSizeM / 1000 / model.asset.sizeMax) * (object.displayScale ?? 1);
  }, [model, object.displayScale]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const a = ((clock.getElapsedTime() % PERIOD_S) / PERIOD_S) * Math.PI * 2;
    ref.current.position.copy(u).multiplyScalar(Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    ref.current.lookAt(0, 0, 0);
  });
  return (
    <group name={`orbiter-${object.spacecraftId}`}>
      <Line points={ring} color="#9fb7ff" lineWidth={1} dashed dashSize={40} gapSize={30} transparent opacity={0.55} />
      <group ref={ref} onClick={(e) => { e.stopPropagation(); select({ kind: 'spacecraft', id: object.spacecraftId!, missionId: object.missionId }); }}>
        {model ? (
          <primitive object={model.scene} scale={scale} position={model.asset.center.clone().multiplyScalar(-scale)} />
        ) : (
          <mesh>
            <sphereGeometry args={[6, 12, 12]} />
            <meshBasicMaterial color="#9fb7ff" />
          </mesh>
        )}
        {showLabels && (
          <FlightMarker
            markerType="orbiter" category="Lunar orbiter" title={object.label} badge="SCHEMATIC" color="#abbaff"
            details={[
              { label: 'Orbit altitude', value: `~${alt} km` },
              { label: 'Display scale', value: `×${object.displayScale ?? 1}` },
            ]}
            note="Schematic visual orbit, not a measured ephemeris. Select for spacecraft details."
            onActivate={() => select({ kind: 'spacecraft', id: object.spacecraftId!, missionId: object.missionId })}
          />
        )}
      </group>
    </group>
  );
}
