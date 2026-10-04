/** Frontend mirror of the API contract (services/api/src/domain/types.ts). The frontend never holds the CLPS database. */
export type MissionStatus = 'planned' | 'in-flight' | 'success' | 'success-partial' | 'failed-partial' | 'failed' | 'cancelled';
export type Precision = 'measured' | 'approx' | 'region' | 'unknown';

export interface SourceRef {
  id: string; title: string; publisher: string; url: string; date: string | null;
  type: 'primary' | 'secondary' | 'asset' | 'data'; retrievedAt: string; claims: string[];
}
export interface Provider { id: string; name: string; country: string; headquarters: string; landers: string[]; website: string; sourceIds: string[] }
export interface AssetEntry {
  assetId: string; name: string; assetType: string; spacecraftType?: string; textureRole?: string; category: string; format: string; lod?: number;
  url: string; dir: string; sizeBytes?: number; sha256?: string;
  projection?: Record<string, unknown>; encoding?: Record<string, unknown>; stats?: Record<string, unknown>;
  normalize?: { targetRadiusKm?: number; targetLongestAxisM?: number };
  frame?: { boundingRadius?: number; center?: number[]; poleAxisAssumed?: string; uvLayout?: string; calibration?: string; rotationDeg?: number[] };
  scientificGrade: boolean | 'derived' | null; source?: { organization?: string; title?: string; url?: string; credit?: string; fileUrl?: string };
  credits?: string; license?: { name: string; url: string }; derivedFrom?: { assetId: string; sha256: string }; tileCount?: number; notes?: string;
  width?: number; height?: number;
  /** lower-resolution renditions of the same asset (e.g. a 4k sky map for the low quality tier) */
  variants?: { url: string; width?: number; height?: number; sizeBytes?: number; sha256?: string; quality?: string }[];
}
export interface AssetManifest { version: number; generatedAt: string; baseUrl: string; conventions: Record<string, string>; assets: AssetEntry[] }
export interface Spacecraft {
  id: string; name: string; type: 'lander' | 'rover' | 'orbiter' | 'hopper'; providerId: string | null; operator?: string; class: string;
  dimensions: { heightM?: number; widthM?: number } | null; payloadCapacityKg?: number;
  orbit?: { type: string; altitudeKm: [number, number]; note: string };
  assetId: string | null; assetStatus: 'official-nasa-asset' | 'no-official-nasa-asset'; assetNote?: string; sourceIds: string[]; asset?: AssetEntry | null;
}
export interface Payload { id: string; name: string; acronym: string; type: string; leadOrganization: string; missionIds: string[]; summary: string; has3DModel: boolean }
export interface LandingSite {
  id: string; name: string; regionId: string; latitude: number | null; longitude: number | null; elevationM: number | null;
  precision: Precision; precisionNote: string; featureName: string; missionIds: string[]; status: string; sourceIds: string[]; region?: string | Region | null;
}
export interface Region {
  id: string; name: string; bounds: { north: number; south: number; west: number; east: number };
  center: { latitude: number; longitude: number }; description: string; scienceThemes: string[]; sourceIds: string[];
}
export interface SpacecraftRef { spacecraftId: string; role: 'lander' | 'rover' | 'orbiter' | 'imaging-orbiter' | 'hopper'; note?: string }
export interface TrajectoryData { frame: 'moon-centric-km' | 'earth-centric-km'; sourceId: string; samples: Array<{ t: string; x: number; y: number; z: number }> }
export interface Mission {
  id: string; name: string; shortName: string; taskOrder: string; program: string; providerId: string; landerId: string; landingSiteId: string;
  status: MissionStatus; statusDetail: string;
  launch: { date: string | null; nominal?: string; vehicle: string; site: string | null };
  landing: { date: string | null; attempted: boolean; outcome?: string };
  endOfMission: string | null; payloadIds: string[]; nasaPayloadCount: number | null; commercialPayloads?: string[];
  spacecraftRefs: SpacecraftRef[]; trajectory: TrajectoryData | null; trajectoryNote: string; sourceIds: string[]; verifiedAt: string;
}
export interface MissionSummary extends Mission {
  provider: string | null; landerName: string | null;
  landingSite: { id: string; name: string; regionId: string; latitude: number | null; longitude: number | null; precision: Precision } | null;
}
export interface MissionEvent { id: string; missionId: string; type: string; date: string; title: string; sourceIds: string[]; missionName?: string }
export interface SurfaceSample {
  elevationM: number; lod: number; source: string; slopeDeg: number; aspectDeg: number;
  normal: [number, number, number]; up: [number, number, number]; north: [number, number, number]; east: [number, number, number]; sampleStepDeg: number;
}
export interface MissionDetail {
  mission: Mission; provider: Provider | null; lander: Spacecraft | null; landingSite: LandingSite | null; region: Region | null; payloads: Payload[];
  spacecraft: Array<Spacecraft & { role: SpacecraftRef['role']; roleNote?: string; asset: AssetEntry | null }>;
  assets: AssetEntry[]; events: MissionEvent[]; sources: SourceRef[];
  terrainContext: (SurfaceSample & { tiles: string[] }) | null;
}
export interface TileEntry {
  id: string; lod: number; x: number; y: number; bounds: { west: number; east: number; north: number; south: number };
  elevation: { url: string; width: number; height: number; pixelsPerDegree: number };
  color?: { url: string; width: number; height: number; source: string };
  stats: { minElevationM: number; maxElevationM: number; meanElevationM: number };
}
export interface TileIndex {
  version: number; scheme: { type: string; tileDeg: number; cols: number; rows: number; origin: string; centerLonDeg: number };
  encoding: { type: string; formula: string; scale: number; referenceRadiusM: number; datumRadiusM: number };
  datum: { name: string; radiusKm: number };
  lods: Record<string, { source: string; pixelsPerDegree: number; url?: string; width?: number; height?: number; tilePx?: number }>;
  coverage: string; tiles: TileEntry[];
}
export interface SiteTerrain {
  siteId: string; available: boolean; reason?: string; site?: { latitude: number; longitude: number; precision: Precision; publishedElevationM: number | null };
  surface?: SurfaceSample | null; elevationDiscrepancyM?: number | null; tiles?: TileEntry[]; datum?: { name: string; radiusKm: number } | null;
  dataSource?: { assetId: string; description: string; scientificGrade: string };
}
export interface ImageryLayer {
  id: string; assetId: string; name: string;
  scheme: { type: string; tileMatrixSet: string; tileSize: number; minLevel: number; maxLevel: number; originLon: number; originLat: number };
  urlTemplate: string; grayscale: boolean; nativePixelsPerDegree: number; credit: string; sourceId: string;
}
export interface ImageryIndex { version: number; layers: ImageryLayer[] }

// ---- research engine (Python service, proxied by the API) -------------------------------------------------------
export type HistoricOutcome = 'success' | 'partial' | 'failure';
export interface HistoricMission {
  id: string; name: string; agency: string; country: string;
  missionType: 'impact' | 'lander' | 'rover' | 'sample-return';
  launchDate: string; eventDate: string;
  site: { latitude: number; longitude: number; precision: 'published' | 'approx' | 'none' } | null;
  outcome: HistoricOutcome; failureCategory: string | null; summary: string;
  hazardAvoidance: boolean; crewed: boolean; commercial: boolean; massKg: number | null; massNote: string | null; sourceIds: string[];
}
export interface HistoricCatalog { version: number; generatedAt: string; note: string; missions: HistoricMission[]; sources: { id: string; title: string; publisher: string; url: string; kind: string }[] }
export interface LanderPreset { id: string; name: string; dryMassKg: number; propellantKg: number; payloadKg: number; thrustN: number; ispS: number; minThrottle: number; power: string; note: string; confidence: string }
export interface PlanOptions { landers: LanderPreset[]; launchVehicles: { id: string; name: string; tliCapacityKg: number; note: string }[]; transfers: { id: string; name: string; cruiseDays: number; vInfKms: number; extraDeltaVMps: number; carrierDoesLoi?: boolean; note: string }[] }
export interface PlanInput {
  latitude: number; longitude: number; landerId?: string; dryMassKg?: number; propellantKg?: number; payloadKg?: number; thrustN?: number; ispS?: number; minThrottle?: number;
  launchVehicleId?: string; transferId?: string; orbitDays?: number; surfaceDays?: number; dataVolumeGb?: number; downlinkMbps?: number; year?: number;
  /** ISO date or datetime (UTC). Date-only → first landing window (Sun rising through the target elevation) on/after that day. */
  landingDate?: string; gridHalfKm?: number;
}
export interface TerrainFeatures {
  elevationM: number; slopeDeg: number; aspectDeg: number; roughnessM: number; reliefM: number; baselineM: number; maxSunElevationDeg: number; polar: boolean; dataSource: string;
  /** 'science (LOLA GDR)' when a PDS polar DEM (240 m) covers the site, else 'regional (…16 px/deg)'. */
  grade?: string; resolutionM?: number; roughnessWindowM?: number; reliefWindowM?: number;
  /** the 16 px/deg values (training scale of the outcome model) when `grade` is science */
  regional?: Pick<TerrainFeatures, 'elevationM' | 'slopeDeg' | 'aspectDeg' | 'roughnessM' | 'reliefM' | 'baselineM' | 'dataSource'>;
}
export interface TerrainHorizon { azimuthStepDeg: number; elevationDeg: number[]; maxKm: number; dataSource: string; note: string }
export interface EphemSample {
  utc: string; t?: number; sunElevationDeg: number; sunAzimuthDeg: number; earthElevationDeg: number; earthAzimuthDeg: number;
  subSolarLat: number; subSolarLon: number; subEarthLat: number; subEarthLon: number; earthDistanceKm: number; sunVisible?: boolean; earthVisible?: boolean;
}
export interface LandingWindow extends EphemSample { dayHoursAfter: number; sunlitHoursAfter: number; peakSunElevationDeg: number; earthElevationMinDeg14d: number; earthElevationMaxDeg14d: number; targetSunElevationDeg: number }
export interface PlanEphemeris {
  model: string; atLanding: EphemSample; windows: LandingWindow[]; targetSunElevationDeg: number; samples: EphemSample[];
  calendar: { launchUtc: string; landingUtc: string; surfaceEndUtc: string; missionEndUtc: string; requestedLandingDate: string | null };
}
export interface DescentSample { t: number; downrangeM: number; altitudeM: number; vxMps: number; vzMps: number; speedMps: number; massKg: number; throttle: number }
export interface PlanPhase { id: 'launch' | 'separation' | 'transfer' | 'loi' | 'landing' | 'surface' | 'relay'; name: string; startS: number; endS: number; durationS: number; deltaVMps?: number; note?: string; startUtc?: string; endUtc?: string }
export interface HistoricNeighbour { id: string; name: string; year: number; outcome: HistoricOutcome; failureCategory: string | null; latitude: number; longitude: number; precision: string; distance: number; terrain: Record<string, number> }
export interface PlanResult {
  kind: 'simulation';
  input: { latitude: number; longitude: number; lander: { id: string; name: string; dryMassKg: number; propellantKg: number; payloadKg: number; thrustN: number; ispS: number; minThrottle: number }; launchVehicle: PlanOptions['launchVehicles'][number]; transfer: PlanOptions['transfers'][number]; orbitDays: number; surfaceDays: number; dataVolumeGb: number; downlinkMbps: number; year: number; landingDate?: string | null };
  site: {
    latitude: number; longitude: number; terrain: TerrainFeatures; terrainRegional?: TerrainFeatures; horizon?: TerrainHorizon | null; earthElevationDeg: number; relayRequired: boolean;
    comms?: { earthElevationMinDeg: number; earthElevationMaxDeg: number; earthVisibleFraction: number; sunlitFraction: number };
  };
  ephemeris?: PlanEphemeris;
  analysisGrid: { bounds: { north: number; south: number; west: number; east: number }; rows: number; cols: number; slopeDeg: number[]; roughnessM: number[]; elevationM: number[]; suitability: number[]; dataSource: string; method: string; halfKm?: number; cellM?: number; grade?: string };
  outcomeModel: { pNominal: number; logit: number; contributions: Record<string, number>; modelVersion: number; looCv: { accuracy: number; balancedAccuracy: number; brier: number }; n: number; neighbours: HistoricNeighbour[] };
  budget: { deltaV: { transferCorrectionsMps: number; loiMps: number; doiMps: number; descentMps: number; hoverReserveMps: number; totalMps: number }; mass: { atTliKg: number; afterLoiKg: number; atPdiKg: number; atTouchdownKg: number; propellantUsedKg: number; propellantMarginKg: number; maxPayloadKg: number }; exhaustVelocityMps: number };
  descent: { tgoS: number; durationS: number; deltaVMps: number; propellantKg: number; finalMassKg: number; peakThrottle: number; secondsBelowMinThrottle: number; touchdownSpeedMps: number; downrangeAtPdiKm: number; initial: { altitudeM: number; speedMps: number; descentOrbitKm: number[]; coastFromApoluneS: number }; samples: DescentSample[] };
  approachAzimuthDeg: number;
  timeline: { phases: PlanPhase[]; totalDays: number; totalMissionTimeText: string };
  summaryCard: { totalMissionTime: string; launchVehicle: string; payloadMass: string; landingSite: string; dataDownlink: string };
  flags: string[];
  provenance: { sourceIds: string[]; note: string };
}
export interface ModelInfo { version: number; trainedAt: string; algorithm: string; target: string; n: number; positives: number; majorityBaselineAccuracy: number; featureNames: string[]; coefficientsStandardized: Record<string, number>; looCv: { accuracy: number; balancedAccuracy: number; brier: number; confusion: Record<string, number> }; demSource: string; caveats: string[] }

// ---- AI engine (Phase 12) — responses are data; only the ScenePlanner turns intents into scenes ---------------------
export interface AiCitation { id: string; title: string; publisher?: string; url?: string }
export interface AiFact { label: string; value: string }
export interface AiTraceStep { step: string; detail?: string; ms?: number }
export interface AiContext { route?: string; missionId?: string; landingSiteId?: string; regionId?: string; language?: string }
export interface AiTurn { role: 'user' | 'assistant'; text: string }
export interface AiRequest { text: string; context?: AiContext; history?: AiTurn[]; provider?: 'rules' | 'llm' }
interface AiResponseBase { provider: 'rules' | 'llm' | 'llm+rules'; confidence: number; explanation: string; citations: AiCitation[]; trace: AiTraceStep[]; ms: number; entities?: { missionId?: string; landingSiteId?: string; regionId?: string } }
/** `intent` is typed loosely here; the scene-manager SceneIntent type is the contract and the engine validated it server-side */
export interface AiIntentResponse extends AiResponseBase { kind: 'intent'; intent: { type: string } & Record<string, unknown>; facts: AiFact[] }
export interface AiAnswerResponse extends AiResponseBase { kind: 'answer'; text: string; facts: AiFact[]; grounded: boolean; suggestedIntent?: { type: string } & Record<string, unknown> }
export interface AiClarifyResponse extends AiResponseBase { kind: 'clarify'; text: string; options: Array<{ label: string; text: string }> }
export type AiResponse = AiIntentResponse | AiAnswerResponse | AiClarifyResponse;
export interface AiCapabilities {
  providers: Array<'rules' | 'llm'>; llmModel: string | null; intentTypes: string[]; examples: string[]; rules: string[];
  catalogue: { missions: number; landingSites: number; regions: number; payloads: number; sources: number; landerPresets: string[] };
}

// ---- Mission journeys (Earth launch → Moon) — event-anchored two-body model from the research engine ----------------
export interface LaunchSite {
  id: string; name: string; shortName: string; operator: string; country: string; latitude: number; longitude: number; altitudeM: number; vehicles: string[]; sourceIds: string[];
}
export type JourneyFidelity = 'reconstructed' | 'projected' | 'planned';
export type JourneySegmentKind = 'ascent' | 'parking' | 'phasing' | 'translunar' | 'lunar-orbit' | 'descent-orbit' | 'descent' | 'return';
export interface JourneySegment {
  id: string; kind: JourneySegmentKind; label: string;
  /** earth-inertial: geocentric ICRF/J2000 km · moon-fixed: Moon body-fixed (IAU) km */
  frame: 'earth-inertial' | 'moon-fixed';
  startUtc: string; endUtc: string; durationS: number;
  /** [tSec since launch, x, y, z] */
  samples: number[][];
  note: string; stats: Record<string, unknown>;
}
export interface JourneyEvent { id: string; type: string; utc: string; tSec: number; title: string; source: string; note?: string }
export interface Journey {
  kind: 'journey'; missionId: string; fidelity: JourneyFidelity; profile: 'direct' | 'phasing' | 'earth-return'; frame: string;
  launchUtc: string; endUtc: string; totalDays: number;
  launchSite: { id?: string; name: string; shortName?: string; latitude: number; longitude: number; altitudeM?: number };
  landingSite: { id?: string; name: string; latitude: number | null; longitude: number | null } | null;
  vehicle: string | null; segments: JourneySegment[]; events: JourneyEvent[];
  /** Moon geocentric ICRF track during the journey: [tSec, x, y, z] km */
  moonTrack: number[][];
  stats: Record<string, number | undefined>; notes: string[];
  sources: Array<SourceRef | string>;
  mission?: { id: string; name: string; shortName: string; status: string };
}
/** `journey` is null when the API has no flight profile for the mission (nothing is invented). */
export interface JourneyResponse { journey: Journey | null; reason?: string; detail?: string }
export interface JourneyIndexEntry {
  missionId: string; name: string; shortName: string; status: string; available: boolean; fidelity: JourneyFidelity | null; profile: Journey['profile'] | null;
  launchSiteId: string | null; launchSite: string | null; launchUtc: string | null; illustrativeDate: boolean; landingSiteId: string;
}
