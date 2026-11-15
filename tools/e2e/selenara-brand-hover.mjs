import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:5173';
const OUT = '/home/user/clps-lunar-browser/docs/screenshots';
const browser = await chromium.launch({ headless: true, args: [
  '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage',
] });
const contexts = [];
async function newPage(width = 1440, height = 900, touch = false) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  contexts.push(context);
  await context.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  return page;
}
async function frames(page, n = 10) {
  await page.evaluate(async (count) => {
    const start = window.__clpsFrames || 0;
    const startTime = Date.now();
    while ((window.__clpsFrames || 0) - start < count && Date.now() - startTime < 30000) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }, n);
}
async function hoverCard(page, expectedText, capture) {
  const root = page.locator('[data-marker-type="spacecraft"]');
  const card = root.locator('.flight-marker-card');
  const target = root.locator('.flight-marker-target');
  await target.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await card.isVisible(), false, 'flight card must be hidden before hover');
  await target.hover({ timeout: 30000 });
  await card.waitFor({ state: 'visible', timeout: 15000 });
  const text = await card.innerText();
  assert(text.includes(expectedText), `expected ${expectedText} in ${text}`);
  assert(!text.includes('undefined'), `incomplete card: ${text}`);
  assert.equal(await target.getAttribute('aria-expanded'), 'true');
  console.log('Hover card:', text.replace(/\s+/g, ' | '));
  if (capture) await page.screenshot({ path: `${OUT}/${capture}`, timeout: 120000 });
  await page.mouse.move(5, 550);
  await card.waitFor({ state: 'hidden', timeout: 15000 });
  assert.equal(await card.isVisible(), false, 'flight card must hide when mouse leaves');
}
try {
  // Desktop sizing and distinct category styling, including the intermediate 1280px case.
  for (const width of [1440, 1280]) {
    const page = await newPage(width, 900);
    await page.goto(`${BASE}/plan?tour=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.nav-navigator-btn');
    const nav = await page.evaluate(() => {
      const bar = document.querySelector('.nav').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.nav > a, .nav > .nav-menu > button')];
      return { right: bar.right, width: innerWidth, title: document.title,
        brand: document.querySelector('.brand').innerText,
        colors: buttons.map((e) => getComputedStyle(e).backgroundImage) };
    });
    assert(nav.right <= nav.width - 5, `navigation clips at ${width}: ${nav.right}`);
    assert(nav.brand.includes('SELENARA X') && nav.brand.includes('A MODIFIED LUNAR LANDING SITE NAVIGATOR'));
    assert(nav.title.includes('SELENARA X'));
    assert(new Set(nav.colors).size >= 5, 'category colors are not distinct');
    await page.locator('.studio-trigger').click();
    assert(await page.locator('.nav-dropdown-studio').isVisible());
    await page.locator('.data-trigger').click();
    const bounds = await page.locator('.nav-dropdown-data').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'data dropdown is clipped');
    await page.keyboard.press('Escape');
    if (width === 1440) await page.screenshot({ path: `${OUT}/selenara-x-nav.png` });
    console.log('Navigation passes at', width, nav.right);
    await page.context().close();
  }
  // Compact navigation opens, dropdown works, Escape closes it.
  {
    const page = await newPage(800, 900);
    await page.goto(`${BASE}/plan?tour=0`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.nav').isVisible(), false);
    await page.locator('.nav-mobile-toggle').click();
    assert(await page.locator('.nav').isVisible());
    await page.locator('.studio-trigger').click();
    assert(await page.locator('.nav-dropdown-studio').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.nav').isVisible(), false);
    console.log('Compact navigation passes');
    await page.context().close();
  }
  // User-created mission: launch, orbit and powered descent all use the same unobstructed/interactive marker.
  {
    const page = await newPage();
    await page.goto(`${BASE}/plan/scene?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window.__clpsFrames || 0) >= 8 && window.__clps?.useSimStore?.getState()?.plan, null, { timeout: 90000 });
    await page.locator('[data-marker-type="spacecraft"] button').waitFor({ state: 'attached', timeout: 60000 });
    const phases = await page.evaluate(() => {
      const sim = window.__clps.useSimStore.getState();
      sim.pause(); sim.setFollow(true); sim.setT(25);
      return sim.plan.timeline.phases;
    });
    await frames(page, 12);
    // Wait for the chase camera and streamed Earth texture, not merely for the first few loading frames.
    await page.waitForFunction(() => {
      const w = window.__clps, c = window.__clpsCamera, e = w?.liveEphemeris?.geometry?.earthPosScene;
      return w?.simCamera?.active && c && e &&
        Math.hypot(c.position.x - e[0], c.position.y - e[1], c.position.z - e[2]) < 9500 &&
        !!window.__clpsScene?.getObjectByName('earth-globe');
    }, null, { timeout: 90000 });
    await frames(page, 3);
    console.log('Simulation markers:', await page.locator('.flight-marker').evaluateAll((es) => es.map((e) => ({ type: e.dataset.markerType, rect: e.getBoundingClientRect().toJSON() }))));
    await page.screenshot({ path: `${OUT}/selenara-x-flight-clear.png`, timeout: 120000 });
    await hoverCard(page, 'Simulated spacecraft', 'selenara-x-flight-hover.png');
    const target = page.locator('[data-marker-type="spacecraft"] .flight-marker-target');
    await target.focus();
    const focusedCard = page.locator('[data-marker-type="spacecraft"] .flight-marker-card');
    await focusedCard.waitFor({ state: 'visible', timeout: 15000 });
    await page.keyboard.press('Escape');
    await focusedCard.waitFor({ state: 'hidden', timeout: 15000 });
    for (const id of ['transfer', 'loi', 'landing']) {
      const ph = phases.find((p) => p.id === id);
      await page.mouse.move(5, 550);
      await page.evaluate((t) => window.__clps.useSimStore.getState().setT(t), ph.startS + ph.durationS * (id === 'landing' ? 0.92 : 0.5));
      await page.waitForFunction((phaseId) => window.__clps.useSimStore.getState().readout.phaseId === phaseId, id, { timeout: 45000 });
      await frames(page, 12);
      await hoverCard(page, ph.name, id === 'loi' ? 'selenara-x-orbit-hover.png' : id === 'landing' ? 'selenara-x-landing-hover.png' : null);
      console.log('Simulation phase passes:', id);
    }
    // The labels toggle still controls the interactive annotations.
    await page.evaluate(() => window.__clps.useWorldStore.getState().set({ showLabels: false }));
    await page.waitForFunction(() => !document.querySelector('[data-marker-type="spacecraft"]'), null, { timeout: 15000 });
    assert.equal(await page.locator('[data-marker-type="spacecraft"]').count(), 0);
    await page.evaluate(() => window.__clps.useWorldStore.getState().set({ showLabels: true }));
    await page.context().close();
  }
  // A real mission's reconstructed journey (launch, lunar orbit and descent).
  {
    const page = await newPage();
    await page.goto(`${BASE}/missions/blue-ghost-mission-1/journey?quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window.__clpsFrames || 0) >= 8 && window.__clps?.useJourneyStore?.getState()?.journey, null, { timeout: 90000 });
    const segments = await page.evaluate(() => {
      const s = window.__clps.useJourneyStore.getState();
      s.pause(); s.setView('follow');
      return s.journey.segments;
    });
    for (const kind of ['ascent', 'lunar-orbit', 'descent']) {
      const seg = segments.find((s) => s.kind === kind);
      assert(seg, `missing ${kind}`);
      await page.mouse.move(5, 550);
      await page.evaluate((t) => window.__clps.useJourneyStore.getState().setT(t), (seg.samples[0][0] + seg.samples[seg.samples.length - 1][0]) / 2);
      await page.waitForFunction((id) => window.__clps.useJourneyStore.getState().readout.segmentId === id, seg.id, { timeout: 45000 });
      await frames(page, 12);
      await hoverCard(page, seg.label, kind === 'lunar-orbit' ? 'selenara-x-journey-hover.png' : null);
      console.log('Journey segment passes:', kind);
    }
    await page.context().close();
  }
  console.log('All SELENARA X navigation and hover-marker checks passed.');
} finally {
  await Promise.all(contexts.map((c) => c.close().catch(() => {})));
  await browser.close();
}
