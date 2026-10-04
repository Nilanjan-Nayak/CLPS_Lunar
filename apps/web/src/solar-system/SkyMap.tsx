import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, Matrix4, MeshBasicMaterial, SphereGeometry } from 'three';
import { assetRegistry } from '@/asset-system/AssetRegistry';
import { resolveByRole } from '@/asset-system/AssetResolver';
import { SKY_SPHERE_RADIUS_KM } from '@/constants/frames';
import { useNasaTexture } from '@/hooks/useNasaTexture';
import { useWorldStore } from '@/state/worldStore';
import { StarField } from './StarField';
import { liveEphemeris } from './ephemerisDriver';
import type { Mat3 } from './ephemeris';

/**
 * SkyMap — the real sky: NASA SVS "Deep Star Maps 2020" (Hipparcos-2 / Tycho-2 / Gaia DR2, ICRF/J2000 equirectangular)
 * on a camera-centred sphere rotated by the Moon's IAU orientation for the world-clock time, so Orion, the Milky Way
 * and Polaris stand where a lander at the focus site would really see them at that instant.
 *
 * Mapping: the map uses the sky-chart convention (RA increases to the LEFT, centre RA 0h). three.js maps an
 * equirectangular texture for an outside viewer (u = 0.5 → +X, increasing u → −Z); mirroring the sphere in Z turns it
 * into the inside view with RA 0h → +X, Dec +90° → +Y, RA 6h → −Z — the J2000 equatorial frame in the scene convention
 * (x, z, −y). The group's rotation (ephemeris.ts, skyMatrixScene) then maps that frame onto the Moon body-fixed scene.
 */
export function SkyMap({ visible = true }: { visible?: boolean }) {
  const quality = useWorldStore((s) => s.quality);
  const renderer = useWorldStore((s) => s.skyRenderer);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    assetRegistry.ensureLoaded().then(() => {
      const e = resolveByRole.skyMap();
      if (e) setAssetId(e.assetId); else setMissing(true);
    });
  }, []);
  // 8k (8192×4096, ~134 MB of GPU memory) only on the high tier; the 4k rendition elsewhere
  const variant = quality === 'high' ? undefined : 'low';
  const { texture, error } = useNasaTexture(renderer === 'svs' ? assetId : null, variant);

  const group = useRef<Group>(null);
  const matrix = useMemo(() => new Matrix4(), []);
  const geometry = useMemo(() => {
    const g = new SphereGeometry(SKY_SPHERE_RADIUS_KM, 96, 48);
    g.scale(1, 1, -1); // outside-view equirect → inside-view sky chart (see doc comment)
    return g;
  }, []);
  const material = useMemo(() => new MeshBasicMaterial({ side: DoubleSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false }), []);
  useEffect(() => { material.map = texture; material.needsUpdate = true; }, [material, texture]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ camera }) => {
    if (!group.current) return;
    setMatrixFromMat3(matrix, liveEphemeris.geometry.skyMatrixScene);
    matrix.setPosition(camera.position); // "infinitely far": no parallax, always inside the far plane
    group.current.matrix.copy(matrix);
    group.current.matrixWorldNeedsUpdate = true;
  });

  if (renderer === 'procedural' || missing || error) return <StarField visible={visible} />;
  return (
    <group ref={group} matrixAutoUpdate={false} visible={visible && !!texture} name="sky-map">
      <mesh geometry={geometry} material={material} renderOrder={-1000} frustumCulled={false} />
    </group>
  );
}

/** three.js Matrix4 from a row-major 3×3 rotation (Matrix4.set takes row-major arguments). */
export function setMatrixFromMat3(out: Matrix4, m: Mat3): Matrix4 {
  out.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  return out;
}
