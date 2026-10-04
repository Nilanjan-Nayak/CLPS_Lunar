/**
 * Domain types for the CLPS backend. These mirror prisma/schema.prisma (Phase 8) so the JSON
 * repository can be swapped for Prisma/PostGIS without touching the routes or the frontend.
 */
export type MissionStatus =
  | 'planned'
  | 'in-flight'
  | 'success'
  | 'success-partial'
  | 'failed-partial'
  | 'failed'
  | 'cancelled';

export type Precision = 'measured' | 'approx' | 'region' | 'unknown';

export interface SourceRef {
  id: string;
  title: string;
  publisher: string;
  url: string;
  date: string | null;
  type: 'primary' | 'secondary' | 'asset' | 'data';
  retrievedAt: string;
  claims: string[];
}

export interface Provider {
  id: string;
  name: string;
  country: string;
  headquarters: string;
  landers: string[];
  website: string;
  sourceIds: string[];
}

export interface Spacecraft {
  id: string;
  name: string;
  type: 'lander' | 'rover' | 'orbiter' | 'hopper';
  providerId: string | null;
  operator?: string;
  class: string;
  dimensions: { heightM?: number; widthM?: number } | null;
  payloadCapacityKg?: number;
  orbit?: { type: string; altitudeKm: [number, number]; note: string };
  assetId: string | null;
  assetStatus: 'official-nasa-asset' | 'no-official-nasa-asset';
  assetNote?: string;
  sourceIds: string[];
}

export interface Payload {
  id: string;
  name: string;
  acronym: string;
  type: string;
  leadOrganization: string;
  missionIds: string[];
  summary: string;
  has3DModel: boolean;
}

export interface LandingSite {
  id: string;
  name: string;
  regionId: string;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  precision: Precision;
  precisionNote: string;
  featureName: string;
  missionIds: string[];
  status: string;
  sourceIds: string[];
}

export interface Region {
  id: string;
  name: string;
  bounds: { north: number; south: number; west: number; east: number };
  center: { latitude: number; longitude: number };
  description: string;
  scienceThemes: string[];
  sourceIds: string[];
}

export interface SpacecraftRef {
  spacecraftId: string;
  role: 'lander' | 'rover' | 'orbiter' | 'imaging-orbiter' | 'hopper';
  note?: string;
}

export interface Mission {
  id: string;
  name: string;
  shortName: string;
  taskOrder: string;
  program: string;
  providerId: string;
  landerId: string;
  landingSiteId: string;
  status: MissionStatus;
  statusDetail: string;
  launch: { date: string | null; nominal?: string; vehicle: string; site: string | null };
  landing: { date: string | null; attempted: boolean; outcome?: string };
  endOfMission: string | null;
  payloadIds: string[];
  nasaPayloadCount: number | null;
  commercialPayloads?: string[];
  spacecraftRefs: SpacecraftRef[];
  trajectory: TrajectoryData | null;
  trajectoryNote: string;
  sourceIds: string[];
  verifiedAt: string;
}

/** A launch pad (real coordinates; the journey model launches from here). */
export interface LaunchSite {
  id: string;
  name: string;
  shortName: string;
  operator: string;
  country: string;
  latitude: number;
  longitude: number;
  altitudeM: number;
  vehicles: string[];
  sourceIds: string[];
}

/**
 * Event-anchored flight profile of a mission (published launch/TLI/LOI/DOI/PDI/landing times, transfer type,
 * phasing burns, notes). The research engine turns it into a route; the shape between anchors is a model.
 */
export interface FlightProfile {
  missionId: string;
  fidelity: 'reconstructed' | 'projected';
  profile: 'direct' | 'phasing' | 'earth-return';
  launchSiteId: string;
  launchUtc: string;
  illustrativeDate?: boolean;
  notes?: string[];
  sourceIds?: string[];
  [key: string]: unknown;
}

/** Only ever populated from a verified dataset (ephemeris/telemetry). Never synthesized. */
export interface TrajectoryData {
  frame: 'moon-centric-km' | 'earth-centric-km';
  sourceId: string;
  samples: Array<{ t: string; x: number; y: number; z: number }>;
}

export interface MissionEvent {
  id: string;
  missionId: string;
  type: string;
  date: string;
  title: string;
  sourceIds: string[];
}

export interface AssetManifestEntry {
  assetId: string;
  name: string;
  assetType: string;
  spacecraftType?: string;
  textureRole?: string;
  category: string;
  format: string;
  lod?: number;
  url: string;
  dir: string;
  sizeBytes?: number;
  sha256?: string;
  projection?: Record<string, unknown>;
  encoding?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  normalize?: { targetRadiusKm?: number; targetLongestAxisM?: number };
  frame?: Record<string, unknown>;
  scientificGrade: boolean | 'derived' | null;
  source?: Record<string, unknown>;
  credits?: string;
  license?: { name: string; url: string };
  derivedFrom?: { assetId: string; sha256: string };
  tileCount?: number;
  notes?: string;
}

export interface AssetManifest {
  version: number;
  generatedAt: string;
  baseUrl: string;
  conventions: Record<string, string>;
  assets: AssetManifestEntry[];
}

export interface MissionDetail {
  mission: Mission;
  provider: Provider | null;
  lander: Spacecraft | null;
  landingSite: LandingSite | null;
  region: Region | null;
  payloads: Payload[];
  spacecraft: Array<Spacecraft & { role: SpacecraftRef['role']; roleNote?: string; asset: AssetManifestEntry | null }>;
  assets: AssetManifestEntry[];
  events: MissionEvent[];
  sources: SourceRef[];
}
