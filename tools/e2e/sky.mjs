/**
 * Real-sky verification (DEV build, headless):
 *   1. aims the DevCamera (window.__clpsLook) at Orion's belt (Alnilam) with fov 40°,
 *   2. projects the RA/Dec of 10 bright stars through geometry.skyMatrixScene + the live camera,
 *   3. checks that each predicted pixel lands on a bright pixel of the rendered SVS Deep Star Map,
 *   4. writes an annotated screenshot (predicted positions circled).
 * Passing ⇒ sky un-mirrored, north up, ICRF→scene rotation and the Moon's IAU orientation are consistent.
 *
 *   node tools/e2e/sky.mjs [http://localhost:5173] [out.png]
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:5173';
const out = process.argv[3] || '/tmp/pw/sky-orion.png';
const STARS = { Betelgeuse: [88.79, 7.41], Bellatrix: [81.28, 6.35], Rigel: [78.63, -8.2], Saiph: [86.94, -9.67], Alnitak: [85.19, -1.94], Alnilam: [84.05, -1.2], Mintaka: [83.0, -0.3], Sirius: [101.29, -16.72], Procyon: [114.83, 5.22], Aldebaran: [68.98, 16.51] };

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}/space?quality=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.__clpsFrames || 0) > 10 && /assets \d+ loaded/.test(document.body.innerText), null, { timeout: 120000, polling: 1000 });
await page.waitForTimeout(3000);
const predicted = await page.evaluate(({ STARS, aim, fov }) => {
  const w = window.__clps; const M = w.liveEphemeris.geometry.skyMatrixScene; const D = Math.PI / 180;
  const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const C = (v) => [v[0], v[2], -v[1]];
  const eq = (ra, dec) => [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
  const sceneDir = (ra, dec) => apply(M, C(eq(ra, dec)));
  window.__clpsLook = { dir: sceneDir(aim[0], aim[1]), up: sceneDir(0, 90), fov };
  return new Promise((resolve) => setTimeout(() => {
    const cam = window.__clpsCamera; const V = cam.position.constructor; const res = {};
    for (const [name, [ra, dec]] of Object.entries(STARS)) {
      const d = sceneDir(ra, dec);
      const p = new V(cam.position.x + d[0] * 1e5, cam.position.y + d[1] * 1e5, cam.position.z + d[2] * 1e5).project(cam);
      res[name] = [Math.round(((p.x + 1) / 2) * 1440), Math.round(((1 - p.y) / 2) * 900)];
    }
    resolve(res);
  }, 3000));
}, { STARS, aim: [84.05, -1.2], fov: 40 });
const buf = await page.screenshot({ type: 'png' });
await browser.close();

// --- check: brightest pixel within r=6 of each prediction must be > 120 (8-bit luma); background median ~ 10 ---
const png = PNG.sync.read(buf);
const luma = (x, y) => { const i = (y * png.width + x) * 4; return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]; };
let pass = 0, total = 0;
for (const [name, [px, py]] of Object.entries(predicted)) {
  if (px < 10 || py < 10 || px > png.width - 10 || py > png.height - 10) { console.log(`  ${name.padEnd(11)} outside the viewport (${px}, ${py}) — skipped`); continue; }
  total++;
  let best = 0;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = px + dx, y = py + dy; if (x >= 0 && y >= 0 && x < png.width && y < png.height) best = Math.max(best, luma(x, y)); }
  const ok = best > 120; pass += ok;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(11)} predicted (${px}, ${py})  peak luma ${best.toFixed(0)}`);
  // annotate: circle r=9
  for (let a = 0; a < 360; a += 3) { const x = Math.round(px + 9 * Math.cos((a * Math.PI) / 180)), y = Math.round(py + 9 * Math.sin((a * Math.PI) / 180)); if (x >= 0 && y >= 0 && x < png.width && y < png.height) { const i = (y * png.width + x) * 4; png.data[i] = 255; png.data[i + 1] = 80; png.data[i + 2] = 80; } }
}
fs.writeFileSync(out, PNG.sync.write(png));
console.log(`${pass}/${total} stars on target → ${out}`);
process.exit(pass === total && total >= 6 ? 0 : 1);
