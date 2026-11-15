// Live QuickMap integration test. Requires network access to the external viewer.
// Run with Playwright installed, Vite on :5173, and SwiftShader for headless WebGL.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: [
  '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-dev-shm-usage',
] });
const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, ignoreHTTPSErrors: true });
try {
  const app = await context.newPage();
  await app.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
  await app.goto('http://127.0.0.1:5173/sources', { waitUntil: 'domcontentloaded' });
  const viewer = await context.newPage();
  const cases = [
    ['Mons Mouton', -84.79, 29.2, 27],
    ['Mare Crisium', 18.56, 61.81, 16],
    ['east dateline', 0, 179.8, 7],
    ['west dateline', 10, -179.8, 7],
    ['Schrödinger far side', -75, 132.4, 27],
    ['south pole', -90, 0, 27],
    ['north pole', 90, 20, 26],
    ['near limb', 0, 89, 16],
  ];
  for (const [name, lat, lon, expectedProjection] of cases) {
    const url = await app.evaluate(async ([lat, lon]) => {
      const { quickMapSiteUrl } = await import('/src/features/planning/challengeResources.ts');
      return quickMapSiteUrl(lat, lon);
    }, [lat, lon]);
    const parsed = new URL(url);
    assert.equal(parsed.host, 'quickmap.lroc.im-ldi.com');
    assert.equal(Number(parsed.searchParams.get('proj')), expectedProjection);
    assert.ok(parsed.searchParams.has('prjExtent'));
    await viewer.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const canvas = viewer.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 45000 });
    await viewer.waitForTimeout(3500); // viewer fetches its projection config after loading
    const announcement = viewer.getByText('Do not show again', { exact: true });
    if (await announcement.isVisible().catch(() => false)) await announcement.click();
    const box = await canvas.boundingBox();
    assert.ok(box?.width > 0 && box?.height > 0, 'QuickMap canvas rendered');
    await viewer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await viewer.waitForFunction(() => /LAT\s+-?\d+(?:\.\d+)?\s+LON\s+-?\d+(?:\.\d+)?/.test(document.body.innerText), null, { timeout: 15000 });
    const text = await viewer.locator('body').innerText();
    const match = text.match(/LAT\s+(-?\d+(?:\.\d+)?)\s+LON\s+(-?\d+(?:\.\d+)?)/);
    assert.ok(match, `${name}: visible position readout`);
    const actualLat = Number(match[1]), actualLon = Number(match[2]);
    assert.ok(Math.abs(actualLat - lat) < 0.01, `${name}: latitude ${actualLat}, expected ${lat}`);
    // Longitude is undefined at the poles; QuickMap reports east-positive 0–360° elsewhere.
    const dLon = ((actualLon - lon + 540) % 360) - 180;
    if (Math.abs(lat) !== 90) assert.ok(Math.abs(dLon) < 0.01, `${name}: longitude ${actualLon}, expected ${lon}`);
    console.log(`${name}: QuickMap centre ${actualLat}°, ${actualLon}° · projection ${expectedProjection} — PASS`);
  }
  console.log('Live QuickMap handoff: all target, dateline and pole cases passed.');
} finally {
  await context.close();
  await browser.close();
}
