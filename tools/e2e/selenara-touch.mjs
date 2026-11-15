import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await context.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
const page = await context.newPage();
try {
  await page.goto('http://127.0.0.1:5173/plan/scene?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&quality=low', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__clps?.useSimStore?.getState()?.plan && (window.__clpsFrames || 0) > 8, null, {timeout:90000});
  await page.evaluate(() => { const s=window.__clps.useSimStore.getState(); s.pause(); s.setFollow(true); s.setT(25); });
  await page.waitForFunction(() => {
    const w=window.__clps, c=window.__clpsCamera, e=w?.liveEphemeris?.geometry?.earthPosScene;
    return w?.simCamera?.active && c && e && c.position.distanceTo(w.simCamera.position)<1 && Math.hypot(c.position.x-e[0],c.position.y-e[1],c.position.z-e[2])<9000;
  }, null, {timeout:90000});
  const mobileToggle = page.locator('.hud-mobile-toggle');
  const panels = page.locator('#scene-panels');
  assert(await mobileToggle.isVisible());
  assert.equal(await panels.isVisible(), false, 'mobile scene must not be obscured by the panels');
  await mobileToggle.tap();
  assert(await panels.isVisible(), 'mission controls are accessible on mobile');
  assert.equal(await mobileToggle.getAttribute('aria-expanded'), 'true');
  await mobileToggle.tap();
  assert.equal(await panels.isVisible(), false);
  const target = page.locator('[data-marker-type="spacecraft"] .flight-marker-target');
  const card = page.locator('[data-marker-type="spacecraft"] .flight-marker-card');
  await target.tap({timeout:30000});
  await card.waitFor({state:'visible',timeout:15000});
  assert.equal(await target.getAttribute('aria-expanded'),'true');
  const box = await card.boundingBox();
  assert(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, `mobile card bounds: ${JSON.stringify(box)}`);
  await page.screenshot({path:'/home/user/clps-lunar-browser/docs/screenshots/selenara-x-mobile-scene.png', timeout:120000});
  await target.tap({timeout:30000});
  await card.waitFor({state:'hidden',timeout:15000});
  await target.tap({timeout:30000});
  await card.waitFor({state:'visible',timeout:15000});
  await page.touchscreen.tap(375, 700);
  await card.waitFor({state:'hidden',timeout:15000});
  console.log('Mobile controls and touch: tap to open, tap again to close, and outside tap to close — PASS');
} finally { await context.close(); await browser.close(); }
