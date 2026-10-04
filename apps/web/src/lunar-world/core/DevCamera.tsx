import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

/** Development-only free-look override: `window.__clpsLook = { dir: [x,y,z], up: [x,y,z] }` aims the camera (e2e sky checks). */
export function DevCamera() {
  const dir = new Vector3(), up = new Vector3(), target = new Vector3();
  useFrame(({ camera, scene }) => {
    const w = window as unknown as { __clpsLook?: { dir: number[]; up: number[]; fov?: number }; __clpsCamera?: unknown; __clpsScene?: unknown; __clpsFrames?: number };
    w.__clpsCamera = camera;
    w.__clpsScene = scene;
    w.__clpsFrames = (w.__clpsFrames ?? 0) + 1;
    const look = w.__clpsLook;
    if (!look) return;
    dir.set(look.dir[0], look.dir[1], look.dir[2]).normalize();
    up.set(look.up[0], look.up[1], look.up[2]).normalize();
    camera.up.copy(up);
    target.copy(camera.position).addScaledVector(dir, 1e5);
    camera.lookAt(target);
    const cam = camera as unknown as { fov?: number; updateProjectionMatrix?: () => void };
    if (look.fov && cam.fov !== look.fov) { cam.fov = look.fov; cam.updateProjectionMatrix?.(); }
  });
  return null;
}
