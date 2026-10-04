import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/GL Driver|React Router|DevTools|vite|ReadPixels/.test(t)) logs.push(`[${m.type()}] ${t.slice(0, 220)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
await page.goto('http://127.0.0.1:5173/earth', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(5000);
// EARTH_ORBIT pose check
await page.evaluate(async () => { const cam = (await import('/src/state/cameraStore.ts')).useCameraStore; cam.getState().requestFlight(['EARTH_ORBIT'], null, 0.2); });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/pw/s9_earth_orbit.png' });
// full journey to IM-2 with fast legs
await page.goto('http://127.0.0.1:5173/missions/im-2/scene?detail=complete&journey=1', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
const states = [];
const t0 = Date.now();
await page.evaluate(async () => { const cam = (await import('/src/state/cameraStore.ts')).useCameraStore; const f = cam.getState().flight; if (f) cam.getState().requestFlight(f.path, f.focus, 0.35); });
while (Date.now() - t0 < 150000) {
  const st = await page.evaluate(async () => { const c = (await import('/src/state/cameraStore.ts')).useCameraStore.getState(); return { flying: c.flying, state: c.state }; });
  if (!states.length || states[states.length - 1] !== st.state) states.push(st.state);
  if (!st.flying && st.state === 'MISSION_FOCUS') break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(15000);
await page.screenshot({ path: '/tmp/pw/s10_im2_journey.png' });
console.log('states visited:', states.join(' → '), Math.round((Date.now() - t0) / 1000) + 's');
console.log(await page.evaluate(() => document.querySelector('.statusbar')?.textContent));
console.log(logs.slice(0, 10).join('\n'));
await browser.close();
