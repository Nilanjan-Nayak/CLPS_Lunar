import { useFrame } from '@react-three/fiber';
import { sharedLightUniforms } from '@/lunar-world/moon/MoonMaterial';
import { liveEphemeris } from '@/solar-system/ephemerisDriver';
import { useWorldStore } from '@/state/worldStore';

/** Boosted earthshine strength when the night aid is on (real earthshine ≈ 1e-4 of sunlight; this is a reading aid). */
export const NIGHT_AID_EARTHSHINE = 0.16;

/**
 * NightAid — drives the shared earthshine uniforms: the Earth's live direction and a boosted intensity so the lunar
 * night side of the near side stays readable when the real Sun is below the horizon. Off = physically dark.
 */
export function NightAid() {
  useFrame(() => {
    const on = useWorldStore.getState().nightAid && useWorldStore.getState().lightingMode === 'ephemeris';
    const p = liveEphemeris.geometry.earthPosScene;
    sharedLightUniforms.uEarthDir.value.set(p[0], p[1], p[2]).normalize();
    sharedLightUniforms.uEarthshine.value = on ? NIGHT_AID_EARTHSHINE : 0;
  });
  return null;
}
