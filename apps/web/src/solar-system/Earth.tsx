import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Group, Matrix4, SphereGeometry, Vector3 } from 'three';
import { assetRegistry } from '@/asset-system/AssetRegistry';
import { resolveByRole } from '@/asset-system/AssetResolver';
import { EARTH_RADIUS_KM } from '@/constants/frames';
import { useNasaModel } from '@/hooks/useNasaModel';
import { useNasaTexture } from '@/hooks/useNasaTexture';
import { useSelectionStore } from '@/state/selectionStore';
import { useWorldStore } from '@/state/worldStore';
import { createAtmosphereMaterial, createEarthMaterial } from './EarthMaterial';
import { liveEphemeris } from './ephemerisDriver';
import { setMatrixFromMat3 } from './SkyMap';
import { useSunDirection } from '@/hooks/useSunDirection';

/**
 * Earth — placed at the ephemeris position (Moon-centred, live distance and libration offset) and spun by the Earth
 * Rotation Angle, so the hemisphere that really faces the Moon and the real day/night terminator are shown.
 *
 *   textures  NASA Visible Earth Blue Marble NG (day) · Black Marble 2016 (night lights) · Blue Marble cloud cover on a
 *             geographic sphere (lon 0° = Greenwich → +X of the mesh) — orientation is exact by construction
 *   nasa-glb  NASA VTAD "Earth with Clouds" model (baked static clouds; orientation image-calibrated to Blue Marble, see asset metadata)
 *
 * Context/navigation layer only — no Earth science data attached.
 */
export function Earth({ visible = true }: { visible?: boolean }) {
  const renderer = useWorldStore((s) => s.earthRenderer);
  const select = useSelectionStore((s) => s.select);
  const group = useRef<Group>(null);
  const matrix = useMemo(() => new Matrix4(), []);

  // The group carries position + ERA/IAU orientation every frame; children are expressed in the Earth-fixed frame.
  useFrame(() => {
    if (!group.current) return;
    const g = liveEphemeris.geometry;
    setMatrixFromMat3(matrix, g.earthMatrixScene);
    matrix.setPosition(g.earthPosScene[0], g.earthPosScene[1], g.earthPosScene[2]);
    group.current.matrix.copy(matrix);
    group.current.matrixWorldNeedsUpdate = true;
  });

  return (
    <group ref={group} matrixAutoUpdate={false} visible={visible} name="earth" onClick={(e) => { e.stopPropagation(); select({ kind: 'earth' }); }}>
      {renderer === 'nasa-glb' ? <EarthGlb /> : <EarthTextured />}
    </group>
  );
}

/** Blue Marble / Black Marble / clouds on an analytic sphere; the mesh frame *is* the Earth-fixed frame. */
function EarthTextured() {
  const quality = useWorldStore((s) => s.quality);
  const [ids, setIds] = useState<{ day: string | null; night: string | null; clouds: string | null } | null>(null);
  useEffect(() => {
    assetRegistry.ensureLoaded().then(() =>
      setIds({ day: resolveByRole.earthDay()?.assetId ?? null, night: resolveByRole.earthNight()?.assetId ?? null, clouds: resolveByRole.earthClouds()?.assetId ?? null }),
    );
  }, []);
  const day = useNasaTexture(ids?.day, quality === 'low' ? 'low' : undefined);
  const night = useNasaTexture(ids?.night);
  const clouds = useNasaTexture(ids?.clouds);
  const sunDir = useSunDirection();

  const segments = quality === 'low' ? 48 : 96;
  const geometry = useMemo(() => new SphereGeometry(EARTH_RADIUS_KM, segments, segments / 2), [segments]);
  const glowGeometry = useMemo(() => new SphereGeometry(EARTH_RADIUS_KM * 1.018, segments, segments / 2), [segments]);
  const material = useMemo(() => (day.texture ? createEarthMaterial(day.texture, night.texture, clouds.texture) : null), [day.texture, night.texture, clouds.texture]);
  const glow = useMemo(() => createAtmosphereMaterial(), []);
  useEffect(() => () => { material?.dispose(); }, [material]);
  useEffect(() => () => { geometry.dispose(); glowGeometry.dispose(); glow.dispose(); }, [geometry, glowGeometry, glow]);

  const sun = useRef(new Vector3());
  useFrame(() => {
    // light direction: the world-clock Sun in 'ephemeris' mode, otherwise whatever WorldSettings say (auto/manual)
    const mode = useWorldStore.getState().lightingMode;
    if (mode === 'ephemeris') { const d = liveEphemeris.geometry.sunDirScene; sun.current.set(d[0], d[1], d[2]); } else sun.current.copy(sunDir);
    if (material) (material.uniforms.uSunDir.value as Vector3).copy(sun.current);
    (glow.uniforms.uSunDir.value as Vector3).copy(sun.current);
  });

  if (!material) return <EarthPlaceholder />;
  return (
    <>
      <mesh geometry={geometry} material={material} name="earth-globe" />
      <mesh geometry={glowGeometry} material={glow} name="earth-atmosphere" renderOrder={2} />
    </>
  );
}

/** Untextured stand-in while the maps stream in (a few MB). */
function EarthPlaceholder() {
  return (
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS_KM, 32, 16]} />
      <meshStandardMaterial color="#2a4d7a" roughness={0.9} />
    </mesh>
  );
}

/**
 * NASA VTAD glTF, normalized to the mean radius. Its cube-projected baked texture was calibrated against Blue Marble
 * (asset metadata `frame.rotationDeg`, three.js Euler order XYZ) so lon 0 → +X, north → +Y, lon 90°E → −Z like the
 * textured sphere; the group above then applies the ephemeris orientation. Clouds are baked in (static).
 */
function EarthGlb() {
  const [assetId, setAssetId] = useState<string | null>(null);
  const { model } = useNasaModel(assetId);
  useEffect(() => {
    assetRegistry.ensureLoaded().then(() => setAssetId(resolveByRole.earthModel()?.assetId ?? null));
  }, []);
  const scale = useMemo(() => (model ? EARTH_RADIUS_KM / model.asset.boundingRadius : 1), [model]);
  const rotation = useMemo(() => {
    const r = model?.asset.entry.frame?.rotationDeg ?? [0, 0, 0];
    return new Euler((r[0] * Math.PI) / 180, (r[1] * Math.PI) / 180, (r[2] * Math.PI) / 180, 'XYZ');
  }, [model]);
  if (!model) return <EarthPlaceholder />;
  return (
    <group rotation={rotation}>
      <primitive object={model.scene} scale={scale} position={model.asset.center.clone().multiplyScalar(-scale)} />
    </group>
  );
}
