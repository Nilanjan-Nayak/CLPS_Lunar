import { Canvas } from '@react-three/fiber';
import { Suspense, type ReactNode } from 'react';
import { useWorldStore } from '@/state/worldStore';

/**
 * WorldRenderer — the single WebGL canvas. Kilometre units with a logarithmic depth buffer so a 1 m lander foot and a
 * 384,400 km Earth share one frame without z-fighting. No tone mapping (NASA color maps are already display-referred).
 */
export function WorldRenderer({ children }: { children: ReactNode }) {
  const quality = useWorldStore((s) => s.quality);
  return (
    <Canvas
      gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance', alpha: false }}
      dpr={quality === 'high' ? [1, 2] : quality === 'low' ? 1 : [1, 1.5]}
      camera={{ fov: 45, near: 0.05, far: 5e6, position: [150_000, 90_000, -560_000] }}
      onCreated={({ gl }) => {
        gl.setClearColor('#02040a', 1);
      }}
      frameloop="always"
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}
