/**
 * World-clock / ephemeris e2e (DEV build, headless):
 *   • /missions/im-2/scene  → clock FIXED at the landing UTC (2025-03-06T17:28:50Z), Moon phase ≈ first quarter
 *   • /earth + setFixed(2026-10-10T10:00Z) → camera follows the Earth across the clock jump; Earth ≈ full, Africa facing the Moon
 *   • /plan/scene           → playback hands the clock over to MISSION TIME; leaving the scene returns to LIVE
 *
 *   node tools/e2e/world-clock.mjs [http://localhost:5173] [shotDir]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:5173';
const dir = process.argv[3] || '/tmp/pw';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label} ${detail}`); if (!ok) failures++; };
const open = async (path) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('  pageerror', e.message.slice(0, 200)));
  await page.goto(`${base}${path}${path.includes('?') ? '&' : '?'}quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.__clpsFrames || 0) > 8, null, { timeout: 120000, polling: 1000 });
  return page;
};
const snap = (page) => page.evaluate(() => { const w = window.__clps; const c = w.useClockStore.getState(); const g = w.liveEphemeris.geometry; return { mode: c.mode, rate: c.rate, utc: g.utc, illum: g.moonIlluminatedFraction, earthKm: g.earthDistanceKm, subLunarOnEarth: g.subLunarOnEarth, bar: document.querySelector('[data-testid="world-clock"]')?.textContent?.replace(/\s+/g, ' ') }; });

// 1. mission scene pins the clock to the landing time
{
  const page = await open('/missions/im-2/scene');
  await page.waitForTimeout(4000);
  const s = await snap(page);
  check('IM-2 scene clock FIXED at landing UTC', s.mode === 'fixed' && s.utc === '2025-03-06T17:28:50Z', `(${s.mode} ${s.utc})`);
  check('Moon phase at IM-2 landing ≈ first quarter', Math.abs(s.illum - 0.5) < 0.03, `(illuminated ${(s.illum * 100).toFixed(1)}%)`);
  await page.screenshot({ path: `${dir}/im2-landing-clock.png`, timeout: 120000 });
  await page.close();
}
// 2. Earth view follows the Earth across a clock jump
{
  const page = await open('/earth');
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => new Promise((resolve) => {
    const w = window.__clps;
    w.useClockStore.getState().setFixed(Date.parse('2026-10-10T10:00:00Z'), { rate: 0, source: 'e2e' });
    setTimeout(() => { const g = w.liveEphemeris.geometry; const cam = window.__clpsCamera; const e = g.earthPosScene; resolve({ utc: g.utc, illum: g.moonIlluminatedFraction, sub: g.subLunarOnEarth, camToEarthKm: Math.hypot(e[0] - cam.position.x, e[1] - cam.position.y, e[2] - cam.position.z) }); }, 4000);
  }));
  check('clock jumped to 2026-10-10T10:00Z (new Moon → full Earth)', r.utc === '2026-10-10T10:00:00Z' && r.illum < 0.01, `(illum ${r.illum.toFixed(4)})`);
  check('Africa faces the Moon', Math.abs(r.sub.lat + 8.8) < 1 && Math.abs(r.sub.lon - 22.6) < 1, `(sub-lunar ${r.sub.lat.toFixed(1)}°, ${r.sub.lon.toFixed(1)}°)`);
  check('camera followed the Earth (EARTH pose ≈ 29,000 km)', r.camToEarthKm > 20000 && r.camToEarthKm < 40000, `(${Math.round(r.camToEarthKm)} km)`);
  await page.screenshot({ path: `${dir}/earth-full-africa.png`, timeout: 120000 });
  await page.close();
}
// 3. mission simulation hands the clock over and back
{
  const page = await open('/plan/scene?latitude=-84.79&longitude=29.2&landerId=nova-c&landingDate=2026-11-15');
  await page.waitForFunction(() => !!window.__clps.useSimStore.getState().plan, null, { timeout: 60000, polling: 1000 });
  await page.waitForTimeout(3000);
  const s0 = await snap(page);
  check('plan scene starts FIXED at the planned landing UTC', s0.mode === 'fixed' && /FIXED/.test(s0.bar), `(${s0.utc})`);
  await page.evaluate(() => { const s = window.__clps.useSimStore.getState(); const lp = s.plan.timeline.phases.find((p) => p.id === 'landing'); s.setT(lp.startS + 60); s.setSpeed(1); s.play(); });
  await page.waitForTimeout(6000);
  const s1 = await snap(page);
  check('playback switches the world clock to MISSION TIME', s1.mode === 'mission' && /MISSION TIME/.test(s1.bar), `(${s1.utc})`);
  await page.evaluate(() => { history.pushState({}, '', '/moon?quality=low'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(6000);
  const s2 = await snap(page);
  check('leaving the simulation returns to LIVE', s2.mode === 'live', `(${s2.utc})`);
  await page.close();
}
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all world-clock checks passed');
process.exit(failures ? 1 : 0);
