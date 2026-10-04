#!/usr/bin/env node
/**
 * NASA Asset Pipeline — step 3: build assets/manifest.json (the Asset Registry's source of truth).
 * Walks every metadata.json under assets/ (excluding _provenance and .cache) and merges frame/normalize info.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ASSETS = path.join(ROOT, 'assets');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '_provenance') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'metadata.json') out.push(p);
  }
  return out;
}

const entries = walk(ASSETS).map((p) => {
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  const dir = path.relative(ASSETS, path.dirname(p)).split(path.sep).join('/');
  const src = m.source || m.derivedFrom?.source;
  return {
    assetId: m.assetId,
    name: m.name,
    assetType: m.assetType,
    spacecraftType: m.spacecraftType,
    textureRole: m.textureRole,
    category: m.category,
    format: m.format,
    lod: m.lod,
    url: `/assets/${m.file}`,
    dir: `/assets/${dir}`,
    sizeBytes: m.sizeBytes,
    sha256: m.sha256 || m.derivedFrom?.sha256,
    projection: m.projection,
    encoding: m.encoding,
    stats: m.stats,
    normalize: m.normalize,
    frame: m.frame
      ? {
          boundingRadius: m.frame.boundingRadius,
          center: m.frame.center,
          poleAxisAssumed: 'y',
          uvLayout: 'baked-cube-projection',
          calibration: m.frame.calibration || 'pending',
          rotationDeg: m.frame.rotationDeg || [0, 0, 0],
        }
      : undefined,
    scientificGrade: m.scientificGrade ?? m.derivedFrom?.scientificGrade ?? null,
    source: src,
    credits: m.credits || m.derivedFrom?.credits,
    license: m.license || m.derivedFrom?.license,
    derivedFrom: m.derivedFrom ? { assetId: m.derivedFrom.assetId, sha256: m.derivedFrom.sha256 } : undefined,
    tileCount: m.tileCount,
    width: m.width,
    height: m.height,
    variants: Array.isArray(m.variants)
      ? m.variants.map((v) => ({ url: `/assets/${v.file}`, width: v.width, height: v.height, sizeBytes: v.sizeBytes, sha256: v.sha256, quality: v.quality }))
      : undefined,
    notes: m.notes,
  };
});

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  baseUrl: '/assets',
  conventions: {
    units: 'km in the Lunar World scene; models are normalized at load time via `normalize`',
    frame: 'Moon-centric, Y-up. lon 0° = +X, north = +Y, lon 90°E = −Z (three.js SphereGeometry equirectangular convention)',
  },
  assets: entries.sort((a, b) => a.assetId.localeCompare(b.assetId)),
};
fs.writeFileSync(path.join(ASSETS, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`manifest: ${entries.length} assets`);
for (const e of entries) console.log(`  ${e.assetId.padEnd(44)} ${e.assetType.padEnd(18)} ${e.url}`);
