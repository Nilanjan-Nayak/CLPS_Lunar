import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

const _v = new Vector3();

/**
 * Per-frame horizon test for surface-anchored markers (exact tangent-plane test for a sphere:
 * visible iff (camera − P) · up ≥ 0) plus a distance-based label gate. Only re-renders when a flag flips.
 */
export function useMarkerVisibility(position: Vector3, up: Vector3, labelMaxDistanceKm: number, force = false) {
  const [state, setState] = useState({ visible: true, label: false, distance: 0 });
  const last = useRef(state);
  useFrame(({ camera }) => {
    _v.copy(camera.position).sub(position);
    const distance = _v.length();
    const visible = _v.dot(up) > -0.5; // small tolerance so markers on the limb do not flicker
    const label = visible && (force || distance < labelMaxDistanceKm);
    if (visible !== last.current.visible || label !== last.current.label) {
      last.current = { visible, label, distance };
      setState(last.current);
    }
  });
  return state;
}
