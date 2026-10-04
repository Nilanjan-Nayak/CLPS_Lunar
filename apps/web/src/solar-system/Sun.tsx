import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, DirectionalLight, Group, Sprite, Vector3 } from 'three';
import { SUN_ANGULAR_DIAMETER_DEG, SUN_SPRITE_DISTANCE_KM, DEG } from '@/constants/frames';
import { useSunDirection } from '@/hooks/useSunDirection';
import { useWorldStore } from '@/state/worldStore';
import { liveEphemeris } from './ephemerisDriver';

function discTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,250,1)');
  g.addColorStop(0.42, 'rgba(255,253,240,1)');
  g.addColorStop(0.5, 'rgba(255,245,215,0.95)');
  g.addColorStop(0.58, 'rgba(255,235,190,0.25)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new CanvasTexture(c);
}
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,245,220,0.55)');
  g.addColorStop(0.25, 'rgba(255,230,180,0.18)');
  g.addColorStop(0.6, 'rgba(255,210,150,0.05)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/**
 * Sun — one directional light for every standard material plus a camera-relative disc of the true angular size (0.53°)
 * and a soft glow. Direction = the world-clock ephemeris (default) or the visualization/manual sub-solar point.
 * Drawing the disc relative to the camera makes it parallax-free (the real Sun is 1.5e8 km away) while it still
 * depth-tests against the Moon and the Earth.
 */
export function Sun({ visible = true }: { visible?: boolean }) {
  const fallbackDir = useSunDirection();
  const disc = useMemo(discTexture, []);
  const glow = useMemo(glowTexture, []);
  const light = useRef<DirectionalLight>(null);
  const sprites = useRef<Group>(null);
  const discRef = useRef<Sprite>(null);
  const dir = useRef(new Vector3(1, 0, 0));
  // the disc texture's opaque core spans ~50% of the sprite → scale the sprite to 2× the true diameter
  const discScale = 2 * SUN_SPRITE_DISTANCE_KM * Math.tan((SUN_ANGULAR_DIAMETER_DEG / 2) * DEG) * 2;
  const glowScale = discScale * 9;

  useFrame(({ camera }) => {
    if (useWorldStore.getState().lightingMode === 'ephemeris') { const d = liveEphemeris.geometry.sunDirScene; dir.current.set(d[0], d[1], d[2]); }
    else dir.current.copy(fallbackDir);
    light.current?.position.copy(dir.current).multiplyScalar(1_000_000);
    if (sprites.current) sprites.current.position.copy(camera.position).addScaledVector(dir.current, SUN_SPRITE_DISTANCE_KM);
  });

  return (
    <group name="sun">
      <directionalLight ref={light} position={[1_000_000, 0, 0]} intensity={2.6} color="#fff6e8" />
      <ambientLight intensity={0.035} />
      <group ref={sprites} visible={visible}>
        <sprite ref={discRef} scale={[discScale, discScale, 1]} renderOrder={-10}>
          <spriteMaterial map={disc} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
        </sprite>
        <sprite scale={[glowScale, glowScale, 1]} renderOrder={-11}>
          <spriteMaterial map={glow} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
        </sprite>
      </group>
    </group>
  );
}
