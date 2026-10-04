import { useCameraStore } from '@/state/cameraStore';
import { useSceneStore } from '@/state/sceneStore';
import { useSelectionStore } from '@/state/selectionStore';
import { useWorldStore } from '@/state/worldStore';
import { useClockStore } from '@/state/clockStore';
import { useSimStore } from '@/state/simStore';
import { useHistoryStore } from '@/state/historyStore';
import { useJourneyStore } from '@/state/journeyStore';
import type { PlanResult, HistoricMission, Journey } from '@/types/domain';
import { spacecraftResolver } from '@/lunar-world/spacecraft/SpacecraftResolver';
import { CAMERA_STATE_INDEX } from '@/constants/cameraStates';
import type { PlannerData, SceneConfig, SceneIntent } from './SceneConfig';
import { ScenePlanner } from './ScenePlanner';
import { preloadScene } from './SceneLoader';

/**
 * SceneManager — the single entry point: intent → ScenePlanner → SceneConfig → stores (scene, camera, selection) → preload.
 * React components only *read* the resulting state.
 */
export class SceneManager {
  private planner = new ScenePlanner(spacecraftResolver);

  plan(intent: SceneIntent, data: PlannerData): SceneConfig {
    return this.planner.plan(intent, data);
  }

  apply(config: SceneConfig, opts: { fly?: boolean } = {}) {
    const scene = useSceneStore.getState();
    const cam = useCameraStore.getState();
    const previous = scene.config;
    scene.setConfig(config);

    // Selection follows the scene focus.
    const sel = useSelectionStore.getState();
    if (config.focus?.missionId) sel.select({ kind: 'mission', id: config.focus.missionId });
    else if (config.focus?.landingSiteId) sel.select({ kind: 'landing-site', id: config.focus.landingSiteId });
    else if (config.intent.type === 'SHOW_REGION') sel.select({ kind: 'region', id: config.intent.regionId });
    else if (config.intent.type === 'EXPLORE_EARTH') sel.select({ kind: 'earth' });
    else if (config.intent.type === 'EXPLORE_MOON') sel.select({ kind: 'moon' });
    else sel.select(null);

    preloadScene(config);

    // Research-engine outputs travel inside the SceneConfig; the simulation/history stores only mirror them.
    const sim = config.objects.find((o) => o.kind === 'simulation');
    const simStore = useSimStore.getState();
    const nextPlan = (sim?.data?.plan as PlanResult | undefined) ?? null;
    if (nextPlan !== simStore.plan) simStore.setPlan(nextPlan);
    const journeyObj = config.objects.find((o) => o.kind === 'journey');
    const journeyStore = useJourneyStore.getState();
    const nextJourney = (journeyObj?.data?.journey as Journey | undefined) ?? null;
    if (nextJourney !== journeyStore.journey) journeyStore.setJourney(nextJourney);
    const hist = useHistoryStore.getState();
    if (config.intent.type === 'HISTORY') {
      const list = config.objects.filter((o) => o.kind === 'historic-landing').map((o) => o.data?.hist as HistoricMission | undefined).filter(Boolean) as HistoricMission[];
      if (list.length) hist.setMissions(list);
    }

    // Lighting: default = the real Sun for the world-clock time (ClockDriver). The planner's visualization lighting is
    // applied only when the user opted into 'auto'; 'manual' pins the sliders.
    const world = useWorldStore.getState();
    if (world.lightingMode === 'auto' && config.lighting) {
      world.set({ subsolarLongitudeDeg: config.lighting.subsolarLongitudeDeg, subsolarLatitudeDeg: config.lighting.subsolarLatitudeDeg });
    }
    // World clock: scenes may request a time (landing UTC) unless the user pinned the clock. A running mission
    // simulation belongs to the previous scene, so its hold on the clock is released here.
    const clock = useClockStore.getState();
    if (config.time && (!clock.pinned || clock.mode === 'mission')) {
      if (config.time.mode === 'fixed' && config.time.epochMs != null) clock.setFixed(config.time.epochMs, { rate: config.time.rate ?? 0, source: config.time.reason, pinned: false });
      else if (clock.mode !== 'live') clock.setLive();
    }

    if (opts.fly === false) return;
    const focus = config.focus ? { latitude: config.focus.latitude, longitude: config.focus.longitude, label: config.focus.label } : null;
    // Shorten the path when we're already close to the target level (avoid re-flying from orbit on small changes).
    let path = config.camera.path;
    const sameFocus = previous?.focus && focus && Math.abs(previous.focus.latitude - focus.latitude) < 1e-6 && Math.abs(previous.focus.longitude - focus.longitude) < 1e-6;
    if (sameFocus && !('journeyFromEarth' in config.intent && config.intent.journeyFromEarth)) {
      const curIdx = CAMERA_STATE_INDEX[cam.state];
      const remaining = path.filter((s) => CAMERA_STATE_INDEX[s] > curIdx);
      path = remaining.length ? remaining : [config.camera.state];
    }
    cam.requestFlight(path, focus, path.length > 4 ? 1.9 : 2.4);
  }

  run(intent: SceneIntent, data: PlannerData, opts?: { fly?: boolean }) {
    const config = this.plan(intent, data);
    this.apply(config, opts);
    return config;
  }
}

export const sceneManager = new SceneManager();
