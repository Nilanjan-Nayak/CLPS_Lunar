#!/usr/bin/env node
/**
 * NASA Asset Pipeline — step 1: fetch + verify + provenance.
 *
 *   NASA Source → Asset Discovery (nasa-sources.json) → Download → Verify (size/sha256)
 *              → metadata.json + source.json + LICENSE.txt → (derive.py) → build-manifest.mjs
 *
 * Usage:
 *   node fetch.mjs            # core tier only
 *   node fetch.mjs --all      # include optional (large) assets
 *   node fetch.mjs --only nasa-lro-spacecraft-glb
 *   node fetch.mjs --force    # re-download even if present
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const SOURCES = JSON.parse(fs.readFileSync(path.join(__dirname, 'nasa-sources.json'), 'utf8'));

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const optVal = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const includeAll = flag('--all');
const force = flag('--force');
const only = optVal('--only');

const sha256File = async (file) => {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), async function* (src) {
    for await (const chunk of src) hash.update(chunk);
  });
  return hash.digest('hex');
};

const fmtBytes = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(1)} KB`);

async function download(url, dest, expectedBytes) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const res = await fetch(url, { headers: { 'User-Agent': 'clps-lunar-browser-asset-pipeline/1.0' } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length') || expectedBytes || 0);
  let received = 0;
  let lastPct = -10;
  const progress = async function* (src) {
    for await (const chunk of src) {
      received += chunk.length;
      if (total) {
        const pct = Math.floor((received / total) * 100);
        if (pct - lastPct >= 10) {
          process.stdout.write(`\r    ${pct}% (${fmtBytes(received)} / ${fmtBytes(total)})`);
          lastPct = pct;
        }
      }
      yield chunk;
    }
  };
  await pipeline(Readable.fromWeb(res.body), progress, fs.createWriteStream(tmp));
  process.stdout.write('\n');
  await fsp.rename(tmp, dest);
  return received;
}

function licenseText(asset) {
  const lic = asset.license || SOURCES.defaultLicense;
  return [
    `Asset: ${asset.name}`,
    `Asset ID: ${asset.assetId}`,
    ``,
    `Source organization: ${asset.source.organization}`,
    `Source title: ${asset.source.title}`,
    `Source URL: ${asset.source.url}`,
    `Direct file URL: ${asset.url}`,
    ``,
    `Credit (required attribution): ${asset.source.credit}`,
    asset.source.upstream ? `Upstream scientific data: ${asset.source.upstream}` : null,
    ``,
    `License: ${lic.name}`,
    `License URL: ${lic.url}`,
    ``,
    `NASA content is generally not subject to copyright in the United States and may be used for`,
    `educational or informational purposes without explicit permission. NASA requests attribution as`,
    `given above. NASA does not endorse this project. The NASA insignia/logo may not be used.`,
    `See the NASA Media Usage Guidelines for full terms.`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

async function writeProvenance(asset, filePath, bytes, sha) {
  const dir = path.dirname(filePath);
  const isCache = asset.dest.startsWith('.cache/');
  // Raw files that live in the non-persisted cache still get a provenance record next to their derived outputs
  // (derive.py copies `source.json` into each derived folder). Here we always write a record in `assets/_provenance/`.
  const provDir = isCache ? path.join(ASSETS_DIR, '_provenance', asset.assetId) : dir;
  await fsp.mkdir(provDir, { recursive: true });
  const metadata = {
    assetId: asset.assetId,
    name: asset.name,
    assetType: asset.assetType,
    spacecraftType: asset.spacecraftType,
    textureRole: asset.textureRole,
    category: asset.category,
    format: asset.format,
    tier: asset.tier,
    file: path.relative(ASSETS_DIR, filePath).split(path.sep).join('/'),
    sizeBytes: bytes,
    sha256: sha,
    projection: asset.projection,
    encoding: asset.encoding,
    normalize: asset.normalize,
    scientificGrade: asset.scientificGrade ?? null,
    downloadedAt: new Date().toISOString(),
    source: { ...asset.source, fileUrl: asset.url },
    license: asset.license || SOURCES.defaultLicense,
    credits: asset.source.credit,
    derive: asset.derive || [],
    notes: asset.notes || '',
  };
  await fsp.writeFile(path.join(provDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  await fsp.writeFile(path.join(provDir, 'source.json'), JSON.stringify({ ...asset.source, fileUrl: asset.url }, null, 2));
  await fsp.writeFile(path.join(provDir, 'LICENSE.txt'), licenseText(asset));
  return metadata;
}

async function main() {
  const selected = SOURCES.assets.filter((a) => {
    if (only) return a.assetId === only;
    if (a.fetchByDefault === false && !includeAll) return false;
    return includeAll || a.tier === 'core';
  });
  console.log(`NASA asset pipeline — fetching ${selected.length} asset(s) into ${ASSETS_DIR}\n`);
  const results = [];
  for (const asset of selected) {
    const dest = path.join(ASSETS_DIR, asset.dest);
    console.log(`▶ ${asset.assetId}`);
    console.log(`    ${asset.url}`);
    let bytes;
    if (!force && fs.existsSync(dest)) {
      bytes = (await fsp.stat(dest)).size;
      if (asset.expectedBytes && bytes !== asset.expectedBytes) {
        console.log(`    size mismatch (${bytes} vs ${asset.expectedBytes}) — re-downloading`);
        bytes = await download(asset.url, dest, asset.expectedBytes);
      } else {
        console.log(`    exists (${fmtBytes(bytes)}) — verifying`);
      }
    } else {
      bytes = await download(asset.url, dest, asset.expectedBytes);
    }
    if (asset.expectedBytes && bytes !== asset.expectedBytes) {
      console.warn(`    ⚠ size ${bytes} differs from manifest expectedBytes ${asset.expectedBytes} (NASA may have updated the file)`);
    }
    const sha = await sha256File(dest);
    const meta = await writeProvenance(asset, dest, bytes, sha);
    console.log(`    ✓ ${fmtBytes(bytes)} sha256=${sha.slice(0, 16)}…  provenance written`);
    results.push({ assetId: asset.assetId, file: meta.file, bytes, sha256: sha });
  }
  await fsp.mkdir(path.join(ASSETS_DIR, '_provenance'), { recursive: true });
  await fsp.writeFile(
    path.join(ASSETS_DIR, '_provenance', 'fetch-log.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log('\nDone. Next: python3 derive.py && node build-manifest.mjs');
}

main().catch((err) => {
  console.error('\n✗ pipeline failed:', err.message);
  process.exit(1);
});
