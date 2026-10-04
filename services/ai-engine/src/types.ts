/**
 * AI engine contracts (Phase 12).
 *
 * The engine turns free text into one of three *data* results — never into scene mutations:
 *   - `intent`  : a validated SceneIntent (same schema as apps/web/src/scene-manager/SceneConfig.ts).
 *                 The frontend hands it to the ScenePlanner exactly like a command-bar or URL intent.
 *   - `answer`  : a grounded answer assembled from catalogue facts, each with source citations.
 *   - `clarify` : the request was ambiguous / not answerable from the catalogue; options are offered.
 */

export type MissionDetailLevel = 'basic' | 'lander' | 'payloads' | 'complete';

export interface PlanInput {
  latitude: number; longitude: number; landerId?: string; dryMassKg?: number; propellantKg?: number; payloadKg?: number; thrustN?: number; ispS?: number; minThrottle?: number;
  launchVehicleId?: string; transferId?: string; orbitDays?: number; surfaceDays?: number; dataVolumeGb?: number; downlinkMbps?: number; year?: number;
  landingDate?: string; gridHalfKm?: number;
}

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
  | { type: 'PLAN_LANDING'; plan: PlanInput }
  | { type: 'HISTORY' }
  /** animated launch-site → route → arrival journey of a catalogued mission (reconstructed/projected from published anchors) */
  | { type: 'SHOW_JOURNEY'; missionId: string }
  /** Earth→Moon route computed for a user plan (research engine, precedent profile) */
  | { type: 'PLAN_JOURNEY'; plan: PlanInput; launchSiteId?: string };

export type IntentType = SceneIntent['type'];

export interface Citation { id: string; title: string; publisher?: string; url?: string }
export interface Fact { label: string; value: string }

export interface AiContext {
  /** current frontend route, e.g. "/missions/im-2/scene" — used to resolve "it / this mission" */
  route?: string;
  missionId?: string;
  landingSiteId?: string;
  regionId?: string;
  /** ISO-639 hint; the rule provider is English-only, an LLM provider may answer in the user's language */
  language?: string;
}

export interface AiTurn { role: 'user' | 'assistant'; text: string }

export interface AiRequest {
  text: string;
  context?: AiContext;
  history?: AiTurn[];
  /** force a provider (default: llm when configured, else rules) */
  provider?: 'rules' | 'llm';
}

export interface TraceStep { step: string; detail?: string; ms?: number }

interface AiResponseBase {
  provider: 'rules' | 'llm' | 'llm+rules';
  /** 0–1: how sure the engine is that the result reflects the request */
  confidence: number;
  /** provider-independent explanation, shown to the user */
  explanation: string;
  citations: Citation[];
  trace: TraceStep[];
  /** engine wall time */
  ms: number;
  /** catalogue entities the engine resolved for this turn — clients feed them back as context ("it", "this mission") */
  entities?: { missionId?: string; landingSiteId?: string; regionId?: string };
}

export interface IntentResponse extends AiResponseBase {
  kind: 'intent';
  intent: SceneIntent;
  /** facts about the resolved entities, so the UI can show what will be planned */
  facts: Fact[];
}

export interface AnswerResponse extends AiResponseBase {
  kind: 'answer';
  text: string;
  facts: Fact[];
  /** false when an LLM produced text without catalogue lookups — the UI flags it */
  grounded: boolean;
  /** an optional follow-up scene intent, e.g. "show it in 3D" */
  suggestedIntent?: SceneIntent;
}

export interface ClarifyResponse extends AiResponseBase {
  kind: 'clarify';
  text: string;
  options: Array<{ label: string; text: string }>;
}

export type AiResponse = IntentResponse | AnswerResponse | ClarifyResponse;

// ---- knowledge (subset of the API domain the engine needs; provided by the API process) ---------------------------

export interface KbSource { id: string; title: string; publisher: string; url: string; type: string; date?: string | null }
export interface KbProvider { id: string; name: string; country: string; headquarters: string; landers: string[]; website: string; sourceIds: string[] }
export interface KbSpacecraft { id: string; name: string; type: string; providerId: string | null; class: string; payloadCapacityKg?: number; assetStatus: string; assetNote?: string; dimensions?: { heightM?: number; widthM?: number } | null; sourceIds: string[] }
export interface KbPayload { id: string; name: string; acronym: string; type: string; leadOrganization: string; missionIds: string[]; summary: string }
export interface KbLandingSite { id: string; name: string; regionId: string; latitude: number | null; longitude: number | null; elevationM: number | null; precision: string; precisionNote: string; featureName: string; missionIds: string[]; status: string; sourceIds: string[] }
export interface KbRegion { id: string; name: string; center: { latitude: number; longitude: number }; description: string; scienceThemes: string[]; sourceIds: string[] }
export interface KbMission {
  id: string; name: string; shortName: string; taskOrder: string; program: string; providerId: string; landerId: string; landingSiteId: string;
  status: string; statusDetail: string;
  launch: { date: string | null; nominal?: string; vehicle: string; site: string | null };
  landing: { date: string | null; attempted: boolean; outcome?: string };
  endOfMission: string | null; payloadIds: string[]; nasaPayloadCount: number | null; commercialPayloads?: string[];
  trajectoryNote: string; sourceIds: string[];
}
export interface KbEvent { id: string; missionId: string; type: string; date: string; title: string; sourceIds: string[] }

/** Historic landing attempt from the research engine catalogue (NSSDCA). */
export interface KbHistoric {
  id: string; name: string; agency: string; country: string; missionType: string; launchDate?: string | null; eventDate?: string | null;
  site?: { latitude: number | null; longitude: number | null; precision?: string } | null; outcome: string; failureCategory?: string | null; summary?: string;
  crewed?: boolean; commercial?: boolean; massKg?: number | null; sourceIds?: string[];
}

export interface LanderPreset { id: string; name: string; confidence?: string }
export interface TransferPreset { id: string; name: string }

export interface KnowledgeSnapshot {
  missions: KbMission[]; providers: KbProvider[]; spacecraft: KbSpacecraft[]; payloads: KbPayload[]; landingSites: KbLandingSite[]; regions: KbRegion[]; sources: KbSource[]; events: KbEvent[];
}

/** Async access to the research engine (historic catalogue, ephemeris, landing windows). Implemented by the API process. */
export interface ResearchGateway {
  historic(): Promise<KbHistoric[]>;
  options(): Promise<{ landers: LanderPreset[]; transfers: TransferPreset[] }>;
  ephemeris(lat: number, lon: number, utc?: string): Promise<Record<string, unknown> | null>;
  windows(lat: number, lon: number, from?: string, count?: number): Promise<Record<string, unknown> | null>;
  terrain(lat: number, lon: number): Promise<Record<string, unknown> | null>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}
