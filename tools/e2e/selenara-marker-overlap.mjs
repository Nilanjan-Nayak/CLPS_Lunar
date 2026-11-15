import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// The fixed launch/site marker and the spacecraft share a 3D position at departure/touchdown. Both must still be
// pointer-accessible, while the rendered route and both underlying anchor positions remain unchanged.
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
const page = await context.newPage();
const base = 'http://127.0.0.1:5173';
const screenshots = '/home/user/clps-lunar-browser/docs/screenshots';
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));

async function frames(n = 12) {
  await page.evaluate(async (n) => {
    const start = window.__clpsFrames || 0, time = Date.now();
    while ((window.__clpsFrames || 0) - start < n && Date.now() - time < 30000) await new Promise((r) => setTimeout(r, 100));
  }, n);
}
async function checkBoth(type, label) {
  const fixed = page.locator(`[data-marker-type="${type}"]`).first();
  const craft = page.locator('[data-marker-type="spacecraft"]').first();
  await fixed.locator('button').waitFor({ state: 'visible', timeout: 45000 });
  await craft.locator('button').waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForFunction((type) => {
    const a = document.querySelector(`[data-marker-type="${type}"]`), b = document.querySelector('[data-marker-type="spacecraft"]');
    if (!a || !b) return false;
    const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
    return x.width && y.width && (Math.abs((x.left + x.width / 2) - (y.left + y.width / 2)) >= 38 || Math.abs((x.top + x.height / 2) - (y.top + y.height / 2)) >= 34);
  }, type, { timeout: 45000 });
  const boxes = { fixed: await fixed.boundingBox(), spacecraft: await craft.boundingBox(), side: await fixed.getAttribute('data-offset-side') };
  console.log(label, JSON.stringify(boxes));
  for (const [name, root] of [[type, fixed], ['spacecraft', craft]]) {
    const target = root.locator('button'), card = root.locator('.flight-marker-card');
    await target.hover({ timeout: 30000 });
    await card.waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(await target.getAttribute('aria-expanded'), 'true');
    assert(!/undefined/i.test(await card.innerText()));
    if (label === 'Planned liftoff' && name === 'launch') await page.screenshot({ path: `${screenshots}/selenara-x-launch-details.png`, timeout: 120000 });
    await page.mouse.move(5, 550);
    await card.waitFor({ state: 'hidden', timeout: 20000 });
  }
  console.log(`${label}: both hover cards PASS`);
}
try {
  await page.goto(`${base}/plan/scene?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__clps?.useSimStore?.getState()?.plan && (window.__clpsFrames || 0) > 8, null, { timeout: 90000 });
  await page.locator('[data-marker-type="spacecraft"]').waitFor({ state: 'attached', timeout: 60000 });
  const surface = await page.evaluate(() => {
    const s = window.__clps.useSimStore.getState(); s.pause(); s.setFollow(true); s.setT(0);
    return s.plan.timeline.phases.find((p) => p.id === 'surface');
  });
  await frames(18);
  await checkBoth('launch', 'Planned liftoff');
  await page.evaluate(() => window.__clps.useSimStore.getState().setT(25));
  await frames(8);
  await checkBoth('launch', 'Planned early ascent');
  assert(surface, 'surface phase exists');
  await page.evaluate((t) => window.__clps.useSimStore.getState().setT(t), surface.startS + Math.min(20, surface.durationS / 2));
  await page.waitForFunction(() => window.__clps.useSimStore.getState().readout.phaseId === 'surface', null, { timeout: 60000 });
  await frames(15);
  await checkBoth('site', 'Planned touchdown');
  await page.goto(`${base}/missions/blue-ghost-mission-1/journey?quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__clps?.useJourneyStore?.getState()?.journey && (window.__clpsFrames || 0) > 8, null, { timeout: 90000 });
  await page.locator('[data-marker-type="spacecraft"]').waitFor({ state: 'attached', timeout: 60000 });
  await page.evaluate(() => { const s = window.__clps.useJourneyStore.getState(); s.pause(); s.setView('follow'); s.setT(0); });
  await frames(18);
  await checkBoth('launch', 'Blue Ghost liftoff');
  console.log('Overlapping flight/reference markers: all checks PASS');
} finally { await context.close(); await browser.close(); }
