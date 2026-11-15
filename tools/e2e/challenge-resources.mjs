import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:5173';
const OUT = '/home/user/clps-lunar-browser/docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: [
  '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-dev-shm-usage',
] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  // Exactly the challenge tools + supporting dataset/partner are visible. Other factual
  // sources remain in the API and can still back mission-specific citations.
  await page.goto(`${BASE}/sources`, { waitUntil: 'domcontentloaded' });
  await page.locator('.challenge-resource-card').first().waitFor({ timeout: 20000 });
  const ids = await page.locator('.challenge-resource-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-resource')));
  assert.deepEqual(ids, ['quickmap', 'moon-trek', 'horizons', 'lola', 'csa']);
  assert.equal(await page.getByText('Wikipedia', { exact: false }).count(), 0);
  assert.ok((await (await page.request.get(`${BASE}/api/v1/sources`)).json()).sources.length > ids.length);
  const options = await (await page.request.get(`${BASE}/api/v1/research/options`)).json();
  assert.equal(options.challengeSites.length, 12, 'curated site references come from the research engine');
  assert.ok(options.challengeSites.every((s) => s.precision === 'approximate planning reference'));
  await page.screenshot({ path: `${OUT}/selenara-challenge-resources.png`, timeout: 120000 });
  console.log('Challenge catalogue:', ids.join(', '));

  // Landing studio: actual Moon Trek tile and coordinate-centred QuickMap link.
  await page.goto(`${BASE}/plan?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=2&landingDate=2026-09-28T12%3A00%3A00Z&run=1`, { waitUntil: 'domcontentloaded' });
  const check = page.getByRole('button', { name: 'Run JPL Horizons check' });
  await check.waitFor({ timeout: 45000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('Run JPL Horizons check'));
    return b && !b.disabled;
  }, null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('.challenge-site-image img');
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 45000 });
  const first = new URL(await page.getByTestId('quickmap-site-link').getAttribute('href'));
  assert.equal(first.host, 'quickmap.lroc.im-ldi.com');
  assert.equal(first.searchParams.get('proj'), '27', 'south-polar QuickMap projection');
  const firstExtent = first.searchParams.get('prjExtent').split(',').map(Number);
  const radius = 1737400, rad = Math.PI / 180;
  const rho = 2 * radius * Math.tan((90 - 84.79) * rad / 2);
  assert.ok(Math.abs((firstExtent[0] + firstExtent[2]) / 2 - rho * Math.sin(29.2 * rad)) < 1);
  assert.ok(Math.abs((firstExtent[1] + firstExtent[3]) / 2 - rho * Math.cos(29.2 * rad)) < 1);
  let requestUrl = null;
  page.on('request', (r) => { if (r.url().includes('/research/horizons?')) requestUrl = r.url(); });
  await check.click();
  await page.getByTestId('horizons-results').waitFor({ timeout: 60000 });
  assert.ok(requestUrl, 'Horizons button must call the backend');
  const sent = new URL(requestUrl).searchParams;
  assert.equal(sent.get('lat'), '-84.79');
  assert.equal(sent.get('lon'), '29.2');
  assert.equal(sent.get('days'), '2');
  assert.equal(sent.get('utc'), '2026-09-28T12:00Z');
  const resultText = await page.getByTestId('horizons-results').innerText();
  for (const word of ['JPL response', 'DE441', 'SUN ABOVE TERRAIN', 'EARTH ABOVE TERRAIN', 'BOTH ABOVE TERRAIN', '6h apart', 'local analytical ephemeris']) assert.ok(resultText.includes(word), word);
  await page.locator('.challenge-resource-panel').screenshot({ path: `${OUT}/selenara-challenge-workbench.png`, timeout: 120000 });
  console.log('Real Horizons + LOLA results:', resultText.slice(0, 220).replaceAll('\n', ' | '));

  // Changing the active site invalidates the previous live results and reframes QuickMap.
  await page.getByRole('button', { name: /Mare Crisium \(Blue Ghost M1\)/ }).click();
  await page.waitForFunction(() => document.querySelector('.challenge-site-coords')?.textContent?.includes('18.5600'), null, { timeout: 15000 });
  assert.equal(await page.getByTestId('horizons-results').count(), 0);
  const second = new URL(await page.getByTestId('quickmap-site-link').getAttribute('href'));
  assert.equal(second.searchParams.get('proj'), '16', 'equidistant cylindrical projection');
  const e = second.searchParams.get('prjExtent').split(',').map(Number);
  assert.ok(Math.abs((e[0] + e[2]) / 2 - radius * 61.81 * rad) < 1);
  assert.ok(Math.abs((e[1] + e[3]) / 2 - radius * 18.56 * rad) < 1);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('Run JPL Horizons check'));
    return b && !b.disabled;
  }, null, { timeout: 60000 });
  await page.route('**/api/v1/research/horizons?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'NASA JPL Horizons temporarily unavailable' }) }));
  await page.getByRole('button', { name: 'Run JPL Horizons check' }).click();
  await page.getByRole('alert').waitFor({ timeout: 10000 });
  assert.match(await page.getByRole('alert').innerText(), /local plan remains available/i);
  assert.equal(await page.getByTestId('horizons-results').count(), 0);
  await page.unroute('**/api/v1/research/horizons?*');
  // A slow result for the old site must never appear after the active target changes.
  const previousJplResult = await (await page.request.get(requestUrl)).json();
  await page.route('**/api/v1/research/horizons?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(previousJplResult) }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Run JPL Horizons check' }).click();
  await page.getByRole('button', { name: /Mons Mouton \(IM-2 Athena\)/ }).click();
  await page.waitForFunction(() => document.querySelector('.challenge-site-coords')?.textContent?.includes('-84.7900'), null, { timeout: 15000 });
  await page.waitForTimeout(2200);
  assert.equal(await page.getByTestId('horizons-results').count(), 0, 'old site must not overwrite current site');
  await page.unroute('**/api/v1/research/horizons?*');
  console.log('Site switching, race protection and honest offline/error state: PASS');

  // Polar product edge: the skyline continues on the regional DEM and says so.
  await page.getByRole('button', { name: /Schrödinger Basin \(Far Side\)/ }).click();
  await page.waitForFunction(() => document.querySelector('.challenge-site-coords')?.textContent?.includes('-75.0000'), null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('Run JPL Horizons check'));
    return b && !b.disabled;
  }, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Run JPL Horizons check' }).click();
  await page.getByTestId('horizons-results').waitFor({ timeout: 60000 });
  const mixedText = await page.getByTestId('horizons-results').innerText();
  assert.match(mixedText, /mixed \(LOLA GDR \+ regional fallback\)/);
  assert.match(mixedText, /m\/px outside polar coverage/);
  console.log('Mixed-resolution polar-boundary disclosure: PASS');

  // A 60-day plan must not imply that its 45-day JPL check covers the entire mission.
  await page.goto(`${BASE}/plan?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=60&landingDate=2026-09-28T12%3A00%3A00Z&run=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.horizons-check-top')?.textContent?.includes('Mission duration: 60 days'), null, { timeout: 60000 });
  const longMission = await page.locator('.horizons-check-top').innerText();
  assert.match(longMission, /comparison: 45 days/);
  assert.match(longMission, /limited to 45/);
  console.log('Long-mission comparison interval disclosure: PASS');
  await ctx.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
  const p = await mobile.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/sources`, { waitUntil: 'domcontentloaded' });
  await p.locator('.challenge-resource-card').first().waitFor();
  const widths = await p.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, page: document.querySelector('.page')?.scrollWidth }));
  assert.ok(widths.scroll <= widths.width, `mobile page overflows: ${JSON.stringify(widths)}`);
  await p.screenshot({ path: `${OUT}/selenara-challenge-resources-mobile.png`, timeout: 120000 });
  await p.goto(`${BASE}/plan?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=2&landingDate=2026-09-28T12%3A00%3A00Z&run=1`, { waitUntil: 'domcontentloaded' });
  await p.locator('.challenge-console').waitFor({ timeout: 30000 });
  const mobileWidth = await p.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, panel: document.querySelector('.challenge-console')?.getBoundingClientRect().width }));
  assert.ok(mobileWidth.scroll <= mobileWidth.width, `mobile plan overflows: ${JSON.stringify(mobileWidth)}`);
  await p.locator('.challenge-resource-panel').screenshot({ path: `${OUT}/selenara-challenge-workbench-mobile.png`, timeout: 120000 });
  console.log('Mobile catalogue/workbench widths:', widths, mobileWidth);
  await mobile.close();

  // Verify the compact instance is mounted in the actual 3D Navigator.
  const nav = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await nav.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
  const n = await nav.newPage();
  n.on('pageerror', (e) => errors.push(e.message));
  await n.goto(`${BASE}/navigator?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=2&landingDate=2026-09-28T12%3A00%3A00Z&run=1&quality=low`, { waitUntil: 'domcontentloaded' });
  await n.locator('.challenge-console-compact').waitFor({ timeout: 90000 });
  assert.equal(await n.getByTestId('quickmap-site-link').count(), 1);
  assert.equal(await n.getByRole('button', { name: 'Run JPL Horizons check' }).count(), 1);
  const selector = n.getByLabel('Select catalogued CLPS or notable lunar landing site');
  await n.getByRole('option', { name: /Mare Crisium \(Blue Ghost M1\)/ }).waitFor({ state: 'attached', timeout: 30000 });
  await selector.selectOption('cur:mare-crisium');
  await n.waitForFunction(() => document.querySelector('.challenge-site-coords')?.textContent?.includes('18.5600'), null, { timeout: 30000 });
  console.log('3D Navigator challenge workbench and backend site selector: PASS');
  await nav.close();
  assert.deepEqual(errors, [], 'No uncaught page errors');
  console.log('All challenge resource tests passed.');
} finally {
  await browser.close();
}
