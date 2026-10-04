/**
 * Terrain service — samples LOLA-derived elevation (CGI Moon Kit uint16 DEM, RGB-encoded PNG tiles)
 * to answer: elevation at (lat, lon), local surface normal/slope, and which tiles a landing site needs.
 *
 * Scientific note: elevation is LOLA-derived via the NASA CGI Moon Kit resampling. Science-grade
 * work must use the PDS LOLA GDR products (see the LICENSE.txt files under assets/_provenance and sources).
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ASSETS_DIR } from '../repo/jsonRepository.js';

export interface TileIndex {
  version: number;
  scheme: { type: string; tileDeg: number; cols: number; rows: number; origin: string; centerLonDeg: number };
  encoding: { type: string; formula: string; scale: number; referenceRadiusM: number; datumRadiusM: number };
  datum: { name: string; radiusKm: number };
  lods: Record<string, { source: string; pixelsPerDegree: number; url?: string; width?: number; height?: number; tilePx?: number }>;
  coverage: string;
  tiles: TileEntry[];
}

export interface TileEntry {
  id: string;
  lod: number;
  x: number;
  y: number;
  bounds: { west: number; east: number; north: number; south: number };
  elevation: { url: string; width: number; height: number; pixelsPerDegree: number };
  color?: { url: string; width: number; height: number; source: string };
  stats: { minElevationM: number; maxElevationM: number; meanElevationM: number };
}

interface Grid {
  width: number;
  height: number;
  data: Uint16Array;
  west: number;
  north: number;
  degPerPx: number;
}

const MOON_RADIUS_M = 1_737_400;

function decodePng(file: string): Grid | null {
  if (!fs.existsSync(file)) return null;
  const png = PNG.sync.read(fs.readFileSync(file));
  const out = new Uint16Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) out[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1];
  return { width: png.width, height: png.height, data: out, west: -180, north: 90, degPerPx: 360 / png.width };
}

export class TerrainService {
  private index: TileIndex | null = null;
  private lod0: Grid | null = null;
  private tileCache = new Map<string, Grid>();

  constructor() {
    const idx = path.join(ASSETS_DIR, 'lunar/terrain/tiles/index.json');
    if (fs.existsSync(idx)) this.index = JSON.parse(fs.readFileSync(idx, 'utf8'));
    this.lod0 = decodePng(path.join(ASSETS_DIR, 'lunar/elevation/ldem-4-global/ldem_4_rgb.png'));
  }

  tileIndex() {
    return this.index;
  }

  private tileFor(lat: number, lon: number): TileEntry | undefined {
    if (!this.index) return undefined;
    return this.index.tiles.find(
      (t) => lat <= t.bounds.north && lat >= t.bounds.south && lon >= t.bounds.west && lon < t.bounds.east,
    );
  }

  private loadTile(t: TileEntry): Grid | null {
    if (this.tileCache.has(t.id)) return this.tileCache.get(t.id)!;
    const g = decodePng(path.join(ASSETS_DIR, t.elevation.url.replace(/^\/assets\//, '')));
    if (g) {
      g.west = t.bounds.west;
      g.north = t.bounds.north;
      g.degPerPx = (t.bounds.east - t.bounds.west) / g.width;
      this.tileCache.set(t.id, g);
    }
    return g;
  }

  private sampleGrid(g: Grid, lat: number, lon: number): number {
    // bilinear sample; returns elevation in metres relative to the 1737.4 km datum
    const fx = (lon - g.west) / g.degPerPx - 0.5;
    const fy = (g.north - lat) / g.degPerPx - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const at = (x: number, y: number) => {
      const xx = ((x % g.width) + g.width) % g.width;
      const yy = Math.min(Math.max(y, 0), g.height - 1);
      return g.data[yy * g.width + xx];
    };
    const v =
      at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
    return v * 0.5 + 1_727_400 - 1_737_400;
  }

  /** Elevation (m, datum 1737.4 km) using the best available LOD at that location. */
  elevationAt(lat: number, lon: number): { elevationM: number; lod: number; source: string } | null {
    lon = ((lon + 540) % 360) - 180;
    const t = this.tileFor(lat, lon);
    if (t) {
      const g = this.loadTile(t);
      if (g) return { elevationM: this.sampleGrid(g, lat, lon), lod: t.lod, source: t.id };
    }
    if (this.lod0) return { elevationM: this.sampleGrid(this.lod0, lat, lon), lod: 0, source: 'ldem-4-global' };
    return null;
  }

  /**
   * Surface normal in the Moon-centric frame (lon0=+X, north=+Y, 90E=−Z) plus slope, from finite differences.
   * Step is in degrees; LOD1 (~1.9 km/px) resolves regional slope only — not the 1 km crater at IM-1's site.
   */
  surfaceAt(lat: number, lon: number, stepDeg = 0.0625) {
    const e0 = this.elevationAt(lat, lon);
    if (!e0) return null;
    const eN = this.elevationAt(Math.min(lat + stepDeg, 90), lon)!.elevationM;
    const eS = this.elevationAt(Math.max(lat - stepDeg, -90), lon)!.elevationM;
    const eE = this.elevationAt(lat, lon + stepDeg)!.elevationM;
    const eW = this.elevationAt(lat, lon - stepDeg)!.elevationM;
    const r = MOON_RADIUS_M + e0.elevationM;
    const dLat = (stepDeg * 2 * Math.PI) / 180 * r; // metres
    const dLon = (stepDeg * 2 * Math.PI) / 180 * r * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
    const gradN = (eN - eS) / dLat; // rise per metre northward
    const gradE = (eE - eW) / dLon; // rise per metre eastward
    const slopeDeg = (Math.atan(Math.hypot(gradN, gradE)) * 180) / Math.PI;
    const aspectDeg = ((Math.atan2(gradE, gradN) * 180) / Math.PI + 360) % 360; // direction of steepest ascent, cw from north

    // Build local ENU basis at (lat, lon) in the app frame.
    const φ = (lat * Math.PI) / 180, λ = (lon * Math.PI) / 180;
    const up = [Math.cos(φ) * Math.cos(λ), Math.sin(φ), -Math.cos(φ) * Math.sin(λ)];
    const north = [-Math.sin(φ) * Math.cos(λ), Math.cos(φ), Math.sin(φ) * Math.sin(λ)];
    const east = [-Math.sin(λ), 0, -Math.cos(λ)];
    // normal = normalize(up - gradN*north - gradE*east)
    const n = [0, 1, 2].map((i) => up[i] - gradN * north[i] - gradE * east[i]);
    const len = Math.hypot(n[0], n[1], n[2]);
    return {
      elevationM: e0.elevationM,
      lod: e0.lod,
      source: e0.source,
      slopeDeg,
      aspectDeg,
      normal: n.map((v) => v / len) as [number, number, number],
      up: up as [number, number, number],
      north: north as [number, number, number],
      east: east as [number, number, number],
      sampleStepDeg: stepDeg,
    };
  }

  /** Tiles needed to render a focus area around (lat, lon) with the given radius in km. */
  tilesAround(lat: number, lon: number, radiusKm: number): TileEntry[] {
    if (!this.index) return [];
    const dLat = (radiusKm / (MOON_RADIUS_M / 1000)) * (180 / Math.PI);
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
    const dLon = Math.min(dLat / cosLat, 180);
    const n = Math.min(lat + dLat, 90), s = Math.max(lat - dLat, -90);
    return this.index.tiles.filter((t) => {
      if (t.bounds.south > n || t.bounds.north < s) return false;
      if (dLon >= 180) return true;
      let w = lon - dLon, e = lon + dLon;
      const overlaps = (a: number, b: number) => !(t.bounds.west >= b || t.bounds.east <= a);
      if (w < -180) return overlaps(w + 360, 180) || overlaps(-180, e);
      if (e > 180) return overlaps(w, 180) || overlaps(-180, e - 360);
      return overlaps(w, e);
    });
  }
}
