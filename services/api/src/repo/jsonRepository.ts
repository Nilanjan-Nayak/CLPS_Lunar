import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AssetManifest,
  AssetManifestEntry,
  FlightProfile,
  LandingSite,
  LaunchSite,
  Mission,
  MissionDetail,
  MissionEvent,
  Payload,
  Provider,
  Region,
  SourceRef,
  Spacecraft,
} from '../domain/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../../..');
export const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const DATA_DIR = path.resolve(__dirname, '../data');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/**
 * Repository interface — the contract Prisma/PostGIS (Phase 8) must satisfy.
 * The frontend never sees the underlying store.
 */
export interface Repository {
  missions(): Mission[];
  mission(id: string): Mission | undefined;
  missionDetail(id: string): MissionDetail | undefined;
  providers(): Provider[];
  provider(id: string): Provider | undefined;
  spacecraft(): Spacecraft[];
  spacecraftById(id: string): Spacecraft | undefined;
  payloads(): Payload[];
  payload(id: string): Payload | undefined;
  landingSites(): LandingSite[];
  landingSite(id: string): LandingSite | undefined;
  launchSites(): LaunchSite[];
  launchSite(id: string): LaunchSite | undefined;
  flightProfile(missionId: string): FlightProfile | undefined;
  regions(): Region[];
  region(id: string): Region | undefined;
  sources(): SourceRef[];
  source(id: string): SourceRef | undefined;
  events(missionId?: string): MissionEvent[];
  assetManifest(): AssetManifest;
  asset(id: string): AssetManifestEntry | undefined;
}

export class JsonRepository implements Repository {
  private _missions: Mission[];
  private _providers: Provider[];
  private _spacecraft: Spacecraft[];
  private _payloads: Payload[];
  private _sites: LandingSite[];
  private _regions: Region[];
  private _sources: SourceRef[];
  private _events: MissionEvent[];
  private _launchSites: LaunchSite[];
  private _flightProfiles: FlightProfile[];
  private _manifest: AssetManifest;

  constructor() {
    this._missions = readJson(path.join(DATA_DIR, 'missions.json'));
    this._providers = readJson(path.join(DATA_DIR, 'providers.json'));
    this._spacecraft = readJson(path.join(DATA_DIR, 'spacecraft.json'));
    this._payloads = readJson(path.join(DATA_DIR, 'payloads.json'));
    this._sites = readJson(path.join(DATA_DIR, 'landing-sites.json'));
    this._regions = readJson(path.join(DATA_DIR, 'regions.json'));
    this._sources = readJson(path.join(DATA_DIR, 'sources.json'));
    this._events = readJson(path.join(DATA_DIR, 'events.json'));
    this._launchSites = readJson(path.join(DATA_DIR, 'launch-sites.json'));
    this._flightProfiles = readJson(path.join(DATA_DIR, 'flight-profiles.json'));
    const manifestPath = path.join(ASSETS_DIR, 'manifest.json');
    this._manifest = fs.existsSync(manifestPath)
      ? readJson(manifestPath)
      : { version: 0, generatedAt: '', baseUrl: '/assets', conventions: {}, assets: [] };
  }

  private _manifestMtime = 0;

  reloadManifest() {
    const manifestPath = path.join(ASSETS_DIR, 'manifest.json');
    if (fs.existsSync(manifestPath)) { this._manifest = readJson(manifestPath); this._manifestMtime = fs.statSync(manifestPath).mtimeMs; }
  }

  /** Pick up a rebuilt manifest (asset pipeline) without restarting — a stat per call is negligible. */
  private refreshManifestIfChanged() {
    const manifestPath = path.join(ASSETS_DIR, 'manifest.json');
    try {
      const mtime = fs.statSync(manifestPath).mtimeMs;
      if (mtime !== this._manifestMtime) this.reloadManifest();
    } catch { /* missing manifest: keep the empty one */ }
  }

  missions() { return this._missions; }
  mission(id: string) { return this._missions.find((m) => m.id === id); }
  providers() { return this._providers; }
  provider(id: string) { return this._providers.find((p) => p.id === id); }
  spacecraft() { return this._spacecraft; }
  spacecraftById(id: string) { return this._spacecraft.find((s) => s.id === id); }
  payloads() { return this._payloads; }
  payload(id: string) { return this._payloads.find((p) => p.id === id); }
  landingSites() { return this._sites; }
  landingSite(id: string) { return this._sites.find((s) => s.id === id); }
  launchSites() { return this._launchSites; }
  launchSite(id: string) { return this._launchSites.find((s) => s.id === id); }
  flightProfile(missionId: string) { return this._flightProfiles.find((f) => f.missionId === missionId); }
  regions() { return this._regions; }
  region(id: string) { return this._regions.find((r) => r.id === id); }
  sources() { return this._sources; }
  source(id: string) { return this._sources.find((s) => s.id === id); }
  events(missionId?: string) {
    const all = [...this._events].sort((a, b) => a.date.localeCompare(b.date));
    return missionId ? all.filter((e) => e.missionId === missionId) : all;
  }
  assetManifest() { this.refreshManifestIfChanged(); return this._manifest; }
  asset(id: string) { this.refreshManifestIfChanged(); return this._manifest.assets.find((a) => a.assetId === id); }

  missionDetail(id: string): MissionDetail | undefined {
    const mission = this.mission(id);
    if (!mission) return undefined;
    const landingSite = this.landingSite(mission.landingSiteId) ?? null;
    const spacecraft = mission.spacecraftRefs
      .map((ref) => {
        const sc = this.spacecraftById(ref.spacecraftId);
        if (!sc) return null;
        return { ...sc, role: ref.role, roleNote: ref.note, asset: sc.assetId ? this.asset(sc.assetId) ?? null : null };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const assets = spacecraft.map((s) => s.asset).filter((a): a is AssetManifestEntry => !!a);
    const sourceIds = new Set<string>([
      ...mission.sourceIds,
      ...(landingSite?.sourceIds ?? []),
      ...spacecraft.flatMap((s) => s.sourceIds),
    ]);
    return {
      mission,
      provider: this.provider(mission.providerId) ?? null,
      lander: this.spacecraftById(mission.landerId) ?? null,
      landingSite,
      region: landingSite ? this.region(landingSite.regionId) ?? null : null,
      payloads: mission.payloadIds.map((p) => this.payload(p)).filter((p): p is Payload => !!p),
      spacecraft,
      assets,
      events: this.events(mission.id),
      sources: [...sourceIds].map((s) => this.source(s)).filter((s): s is SourceRef => !!s),
    };
  }
}
