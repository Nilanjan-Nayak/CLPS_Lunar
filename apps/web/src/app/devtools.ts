import { useClockStore, worldClock } from '@/state/clockStore';
import { useWorldStore } from '@/state/worldStore';
import { useSimStore, simCamera } from '@/state/simStore';
import { useJourneyStore } from '@/state/journeyStore';
import { useSceneStore } from '@/state/sceneStore';
import { useCameraStore } from '@/state/cameraStore';
import { useTerrainStore } from '@/state/terrainStore';
import { useEphemerisStore, liveEphemeris } from '@/solar-system/ephemerisDriver';
import { geometryAt } from '@/solar-system/ephemeris';

/**
 * Dev/e2e handle (development builds only): the same store instances the app uses, so Playwright checks and manual
 * debugging never hit a second module instance. Also honours `?quality=low|medium|high` for constrained machines.
 */
export function installDevTools() {
  if (!import.meta.env.DEV) return;
  const q = new URLSearchParams(window.location.search).get('quality');
  if (q === 'low' || q === 'medium' || q === 'high') useWorldStore.getState().set({ quality: q });
  (window as unknown as { __clps?: unknown }).__clps = { useClockStore, worldClock, useWorldStore, useSimStore, simCamera, useJourneyStore, useSceneStore, useCameraStore, useTerrainStore, useEphemerisStore, liveEphemeris, geometryAt };
}
