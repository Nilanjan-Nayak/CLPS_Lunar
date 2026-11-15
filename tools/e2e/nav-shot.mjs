import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:5173/navigator?latitude=18.56&longitude=61.81&landerId=blue-ghost&quality=low&run=1', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForSelector('text=SELENARA X · HYBRID MISSION NAVIGATOR', { timeout: 60000 });
await page.waitForSelector('text=360° Polar Sky-Dome', { timeout: 60000 });
await page.waitForFunction(() => {
  const s = window.__clps?.useSimStore?.getState();
  return s && s.t > 0 && (window.__clpsFrames || 0) >= 12;
}, null, { timeout: 90000 });
await page.screenshot({ path: '/tmp/pw/navigator_overview.png', timeout: 120000 });
console.log('saved navigator_overview');

await page.click('text=2 · Delay & MRI');
await page.waitForSelector('text=Schedule-Delay Simulator', { timeout: 30000 });
await page.click('button:has-text("+7d")');
await page.waitForFunction(() => {
  const f = window.__clpsFrames || 0;
  window.__f0 = window.__f0 || f;
  return f >= window.__f0 + 5;
}, null, { timeout: 60000 });
await page.screenshot({ path: '/tmp/pw/navigator_resilience.png', timeout: 120000 });
console.log('saved navigator_resilience');

await browser.close();
