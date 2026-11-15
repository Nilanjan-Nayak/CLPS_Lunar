import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group } from 'three';
import type { SurfaceAnchor } from '@/hooks/useSurfaceFrame';
import { useWorldStore } from '@/state/worldStore';
import { useSceneStore } from '@/state/sceneStore';
import { FlightMarker } from '@/lunar-world/markers/FlightMarker';
import { useMarkerVisibility } from '@/hooks/useMarkerVisibility';

export const STATUS_COLOR: Record<string, string> = {
  success: '#5ee6a8',
  'partial-success': '#ffd166',
  'partial-failure': '#ffa64d',
  failure: '#ff6b6b',
  planned: '#8fd3ff',
  active: '#5ee6a8',
  cancelled: '#8c8c9a',
  landed: '#5ee6a8',
  'landed-tipped': '#ffd166',
  'landed-partial': '#ffa64d',
  'not-reached': '#ff6b6b',
  'planned-approx': '#8fd3ff',
  'planned-tbd': '#8fd3ff',
};

interface Props {
  anchor: SurfaceAnchor;
  label: string;
  sublabel?: string;
  color?: string;
  selected?: boolean;
  approximate?: boolean;
  onClick?: () => void;
  onHover?: (h: boolean) => void;
  /** label auto-gate distance (km); markers that must read from orbit pass a larger value */
  labelMaxDistanceKm?: number;
  /** small icon glyph rendered before the title (e.g. outcome symbol) */
  glyph?: string;
}

/**
 * LocationMarker — a surface-anchored ring + beacon + HTML label whose size follows camera distance so it stays
 * legible from orbit and unobtrusive on the surface. Dashed ring = approximate coordinates.
 */
export function LocationMarker({ anchor, label, sublabel, color = '#8fd3ff', selected, approximate, onClick, onHover, labelMaxDistanceKm = 3200, glyph }: Props) {
  const group = useRef<Group>(null);
  const showLabels = useWorldStore((s) => s.showLabels);
  // In animated flights, even selected landing-site labels must not obscure the trajectory.
  const inFlightScene = useSceneStore((s) => !!s.config?.panels.some((p) => p === 'journey' || p === 'simulation'));
  const journeyScene = useSceneStore((s) => s.config?.intent.type === 'SHOW_JOURNEY' || s.config?.intent.type === 'PLAN_JOURNEY');
  const [hovered, setHovered] = useState(false);
  const vis = useMarkerVisibility(anchor.position, anchor.up, labelMaxDistanceKm, !!selected || hovered);
  useFrame(({ camera }) => {
    if (!group.current) return;
    const d = camera.position.distanceTo(anchor.position);
    const s = Math.min(400, Math.max(0.5, d * 0.012));
    group.current.scale.setScalar(s);
  });
  return (
    <group position={anchor.position} quaternion={anchor.quaternion} visible={vis.visible}>
      <group
        ref={group}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover?.(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); onHover?.(false); document.body.style.cursor = 'auto'; }}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.55, 0.7, 48]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.95 : approximate ? 0.45 : 0.75} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.1, 0.16, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
        <mesh position={[0, 1.4, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 2.8, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} />
        </mesh>
        {showLabels && vis.label && !(journeyScene && inFlightScene) && (inFlightScene ? (
          <FlightMarker
            markerType="site" position={[0, 0.3, 0]} category="Lunar landing site" title={label}
            badge={approximate ? 'APPROXIMATE' : 'SURFACE'} color={color}
            details={[
              ...(sublabel ? [{ label: 'Site details', value: sublabel }] : []),
              { label: 'Elevation', value: `${Math.round(anchor.elevationKm * 1000).toLocaleString()} m` },
              { label: 'Terrain source', value: anchor.source },
            ]}
            note={onClick ? 'Select the marker to open site details.' : 'Terrain-anchored landing reference.'}
            onActivate={onClick}
            onHover={(h) => { setHovered(h); onHover?.(h); }}
          />
        ) : (
          <Html position={[0, 3.1, 0]} distanceFactor={undefined} zIndexRange={[10, 0]} style={{ pointerEvents: 'none', transform: 'translate(-50%, -100%)' }}>
            <div className={`marker-label${selected ? ' selected' : ''}`} style={{ borderColor: color }}>
              <span className="marker-title">{glyph ? `${glyph} ` : ''}{label}</span>
              {sublabel && <span className="marker-sub">{sublabel}</span>}
            </div>
          </Html>
        ))}
      </group>
    </group>
  );
}
