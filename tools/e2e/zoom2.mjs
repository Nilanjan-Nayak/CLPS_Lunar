import { chromium } from 'playwright';
const ARGS = ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'];
const browser = await chromium.launch({ args: ARGS });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
page.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/Shader Error|THREE\.WebGLProgram|error/i.test(t)) console.log('CONSOLE', t.slice(0, 400)); });
const route = process.argv[2] ?? '/missions/im-3/journey';
const tag = process.argv[3] ?? 'z';
await page.goto('http://localhost:5173' + route + (route.includes('?') ? '&' : '?') + 'quality=low', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => (window.__clpsFrames ?? 0) > 12, null, { timeout: 120000 });
if (route.includes('journey')) {
  await page.evaluate(() => { const s = window.__clps.useJourneyStore.getState(); s.pause(); s.setT(1e9); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__clps.useJourneyStore.getState().setView('free'); });
  await page.waitForTimeout(1500);
} else {
  await page.waitForFunction(() => window.__clps.useCameraStore.getState().flying, null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => !window.__clps.useCameraStore.getState().flying, null, { timeout: 170000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
const info = async (label) => console.log(label, JSON.stringify(await page.evaluate(() => {
  const t = window.__clps.useCameraStore.getState().telemetry; const c = window.__clpsCamera; const ctl = window.__clpsControls;
  return { alt: +t.altitudeKm.toFixed(3), agl: t.aglKm == null ? null : +t.aglKm.toFixed(3), hdg: Math.round(t.headingDeg), pitch: Math.round(t.pitchDeg), surf: t.surfaceMode, up: c.up.toArray().map(v => +v.toFixed(2)), tgtAlt: ctl ? +(ctl.target.length() - 1737.4).toFixed(3) : null, dist: +t.targetDistanceKm.toFixed(3) };
})));
await info('start');
await page.screenshot({ path: `/tmp/pw/${tag}0.png`, timeout: 120000 });
await page.mouse.move(600, 400);
for (let i = 1; i <= 3; i++) {
  for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(80); }
  await page.waitForTimeout(1200);
  await info('zoom' + i);
  await page.screenshot({ path: `/tmp/pw/${tag}${i}.png`, timeout: 120000 });
}
await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(850, 400, { steps: 12 }); await page.mouse.up();
await page.waitForTimeout(1500); await info('rotate'); await page.screenshot({ path: `/tmp/pw/${tag}_rot.png`, timeout: 120000 });
// try to push the camera under the ground: drag up (tilt toward horizon and below)
await page.mouse.move(600, 300); await page.mouse.down(); await page.mouse.move(600, 650, { steps: 14 }); await page.mouse.up();
await page.waitForTimeout(1500); await info('tilt-down'); await page.screenshot({ path: `/tmp/pw/${tag}_tilt.png`, timeout: 120000 });
await browser.close();
