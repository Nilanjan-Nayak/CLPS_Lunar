import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { create } from 'zustand';
import { useClockStore, worldClock } from '@/state/clockStore';
import { useWorldStore } from '@/state/worldStore';
import { geometryAt, type Geometry } from './ephemeris';

/** Per-frame ephemeris (mutable, read inside useFrame by the Earth, the sky and the Sun). */
export const liveEphemeris: { geometry: Geometry } = { geometry: geometryAt(Date.now()) };

/** Same geometry published for React UI at a few Hz. */
export const useEphemerisStore = create<{ geometry: Geometry }>(() => ({ geometry: liveEphemeris.geometry }));

const PUBLISH_MS = 250;

/**
 * ClockDriver — advances the world clock every frame, recomputes the Sun/Earth/Moon geometry (≈30 µs) and, when
 * lighting follows the ephemeris, keeps WorldSettings' sub-solar point in step so every terrain shader lights the
 * Moon as it really is at that instant.
 */
export function ClockDriver() {
  const lastPublish = useRef(0);
  useFrame((_, dt) => {
    const clock = useClockStore.getState();
    if (clock.mode === 'live') worldClock.epochMs = Date.now();
    else if (clock.mode === 'fixed' && clock.rate !== 0) worldClock.epochMs += Math.min(dt, 0.25) * 1000 * clock.rate;
    // mission mode: MissionSimulation writes worldClock.epochMs itself
    const g = geometryAt(worldClock.epochMs);
    liveEphemeris.geometry = g;
    const now = performance.now();
    if (now - lastPublish.current > PUBLISH_MS) {
      lastPublish.current = now;
      clock.publish(worldClock.epochMs);
      useEphemerisStore.setState({ geometry: g });
      const world = useWorldStore.getState();
      if (world.lightingMode === 'ephemeris') {
        const lon = Math.round(g.subSolarLon * 100) / 100, lat = Math.round(g.subSolarLat * 100) / 100;
        if (Math.abs(lon - world.subsolarLongitudeDeg) > 0.02 || Math.abs(lat - world.subsolarLatitudeDeg) > 0.01) {
          world.set({ subsolarLongitudeDeg: lon, subsolarLatitudeDeg: lat });
        }
      }
    }
  });
  return null;
}
