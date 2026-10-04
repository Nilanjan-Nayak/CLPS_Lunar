import type { CameraState, SceneMode } from '@/constants/cameraStates';
import type { HistoricMission, Journey, MissionDetail, MissionSummary, LandingSite, PlanInput, PlanResult, Region, Spacecraft } from '@/types/domain';

/**
 * SceneIntent — structured requirement coming from the user (router, UI, command bar) or, later,
 * from the AI Copilot. The AI never touches the 3D scene: it emits intents, the ScenePlanner plans.
 */
export type SceneIntent =
  | { type: 'EXPLORE_SPACE' }
  | { type: 'EXPLORE_EARTH' }
  | { type: 'EXPLORE_MOON' }
  | { type: 'SHOW_REGION'; regionId: string }
  | { type: 'SHOW_LANDING_SITE'; landingSiteId: string; journeyFromEarth?: boolean }
  | { type: 'SHOW_MISSION'; missionId: string; detail: MissionDetailLevel; journeyFromEarth?: boolean }
  | { type: 'SHOW_MISSIONS'; missionIds?: string[]; regionId?: string; includeLanders?: boolean }
  | { type: 'RESEARCH'; missionId?: string; landingSiteId?: string; topic?: string }
  | { type: 'COMPARE'; missionIds: string[] }
  /** user-defined landing plan → research engine simulation (model output, never flight data) */
  | { type: 'PLAN_LANDING'; plan: PlanInput }
  /** chronological playback of historical lunar missions */
  | { type: 'HISTORY' }
  /** animated Earth-launch → Moon journey of a catalogued mission (reconstructed from published anchors, or projected) */
  | { type: 'SHOW_JOURNEY'; missionId: string }
  /** the same for a user plan: route computed by the research engine from the plan (precedent-based profile) */
  | { type: 'PLAN_JOURNEY'; plan: PlanInput; launchSiteId?: string };

export type MissionDetailLevel = 'basic' | 'lander' | 'payloads' | 'complete';

export interface SceneLayers {
  stars: boolean;
  sun: boolean;
  earth: boolean;
  moon: boolean;
  moonScientificGlobe: boolean;
  terrain: boolean;
  /** LOD2 surface imagery (LROC WAC 100 m/px) draped over the terrain when close */
  imagery: boolean;
  regions: boolean;
  landingSites: boolean;
  spacecraft: boolean;
  payloads: boolean;
  trajectories: boolean;
  navigationPath: boolean;
  overlays: { mission: boolean; payload: boolean; science: boolean; terrain: boolean; coordinateGrid: boolean };
}

export type ObjectResolution = 'nasa-asset' | 'info-marker' | 'info-only';

export interface Placement {
  latitude: number;
  longitude: number;
  /** Surface elevation (km, datum 1737.4) if known from the API; the ElevationResolver fills it otherwise. */
  elevationKm?: number | null;
  headingDeg?: number;
  /** Orbit altitude for orbiters (km above datum). */
  altitudeKm?: number;
}

export interface SceneObject {
  id: string;
  kind: 'landing-site' | 'lander' | 'rover' | 'orbiter' | 'payload' | 'region' | 'trajectory' | 'plan-site' | 'historic-landing' | 'analysis-grid' | 'simulation' | 'journey';
  label: string;
  missionId?: string;
  landingSiteId?: string;
  regionId?: string;
  spacecraftId?: string;
  placement?: Placement;
  assetId?: string | null;
  resolution: ObjectResolution;
  /** Visual scale multiplier applied to true-scale models so they remain visible (declared in the HUD). */
  displayScale?: number;
  precision?: 'measured' | 'approx' | 'region' | 'unknown';
  status?: string;
  note?: string;
  data?: Record<string, unknown>;
}

export interface SceneLighting { subsolarLongitudeDeg: number; subsolarLatitudeDeg: number; reason: string }

/**
 * World-clock request of a scene. Exploration scenes run `live` (the sky/Earth/Sun of this very moment); scenes anchored
 * to a dated event (a landing) ask for a `fixed` epoch so the site is shown under the Sun it really had. The user can
 * always override the clock (pinned) and scenes never fight a pinned clock.
 */
export interface SceneTime { mode: 'live' | 'fixed'; epochMs?: number; rate?: number; reason: string }

export type PanelKind = 'mission' | 'site' | 'region' | 'payloads' | 'sources' | 'research' | 'assets' | 'scene' | 'compare' | 'simulation' | 'history' | 'journey';

export interface SceneConfig {
  id: string;
  mode: SceneMode;
  intent: SceneIntent;
  title: string;
  subtitle?: string;
  layers: SceneLayers;
  focus: { latitude: number; longitude: number; label: string; landingSiteId?: string; missionId?: string } | null;
  terrain: { lod: 0 | 1; radiusKm: number };
  objects: SceneObject[];
  camera: { state: CameraState; path: CameraState[] };
  /** Visualization lighting suggested by the planner (applied only when WorldSettings.lightingMode === 'auto'). */
  lighting?: SceneLighting;
  /** World-clock request (applied unless the user pinned the clock). Default: live. */
  time?: SceneTime;
  panels: PanelKind[];
  /** Honesty notes shown in the HUD (e.g. "No verified trajectory data — none rendered"). */
  notes: string[];
  provenance: { sourceIds: string[] };
  createdAt: number;
}

/** Everything the planner may need. All of it comes from the backend API. */
export interface PlannerData {
  missions: MissionSummary[];
  missionDetail?: MissionDetail | null;
  missionDetails?: MissionDetail[];
  landingSites: LandingSite[];
  regions: Region[];
  spacecraft: Spacecraft[];
  /** research-engine outputs (only fetched for the intents that need them) */
  plan?: PlanResult | null;
  history?: HistoricMission[] | null;
  /** journey route for SHOW_JOURNEY / PLAN_JOURNEY (null = the API has no flight profile → nothing is drawn) */
  journey?: Journey | null;
  journeyUnavailable?: string | null;
}

export const defaultLayers = (): SceneLayers => ({
  stars: true,
  sun: true,
  earth: true,
  moon: true,
  moonScientificGlobe: true,
  terrain: false,
  imagery: true,
  regions: false,
  landingSites: false,
  spacecraft: false,
  payloads: false,
  trajectories: false,
  navigationPath: false,
  overlays: { mission: false, payload: false, science: false, terrain: false, coordinateGrid: false },
});
