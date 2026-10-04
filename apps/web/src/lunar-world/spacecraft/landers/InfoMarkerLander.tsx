import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group, Mesh } from 'three';
import type { SurfaceAnchor } from '@/hooks/useSurfaceFrame';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { useSelectionStore } from '@/state/selectionStore';
import { useWorldStore } from '@/state/worldStore';
import { STATUS_COLOR } from '@/lunar-world/locations/LocationMarker';
import { useMarkerVisibility } from '@/hooks/useMarkerVisibility';

/**
 * InfoMarkerLander — honest stand-in used when NO official NASA 3D model exists for a spacecraft.
 * It is deliberately abstract (octahedron + pulsing ring) so nobody mistakes it for the real vehicle;
 * the real information lives in the panel it opens.
 */
export function InfoMarkerLander({ object, anchor }: { object: SceneObject; anchor: SurfaceAnchor }) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const showLabels = useWorldStore((s) => s.showLabels);
  const select = useSelectionStore((s) => s.select);
  const selected = useSelectionStore((s) => s.selected);
  const isSel = selected?.kind === 'spacecraft' && selected.id === object.spacecraftId;
  const color = STATUS_COLOR[object.status ?? ''] ?? '#e8f1ff';
  const vis = useMarkerVisibility(anchor.position, anchor.up, 900, isSel);
  useFrame(({ camera, clock }) => {
    if (!group.current) return;
    const d = camera.position.distanceTo(anchor.position);
    group.current.scale.setScalar(Math.min(120, Math.max(0.12, d * 0.02)));
    if (ring.current) {
      const p = (clock.getElapsedTime() % 2) / 2;
      ring.current.scale.setScalar(1 + p * 1.6);
      (ring.current.material as import('three').MeshBasicMaterial).opacity = (1 - p) * 0.7;
    }
  });
  return (
    <group position={anchor.position} quaternion={anchor.quaternion} visible={vis.visible}>
      <group ref={group} onClick={(e) => { e.stopPropagation(); select({ kind: 'spacecraft', id: object.spacecraftId!, missionId: object.missionId }); }}>
        <mesh position={[0, 0.16, 0]}>
          <octahedronGeometry args={[0.11, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSel ? 1.2 : 0.5} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.14, 0.17, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} />
        </mesh>
        {showLabels && vis.label && (
          <Html position={[0, 0.45, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`marker-label lander${isSel ? ' selected' : ''}`} style={{ borderColor: color }}>
              <span className="marker-title">{object.label}</span>
              <span className="marker-sub">info marker · no official NASA model</span>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
