import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|ReadPixels/.test(m.text())) logs.push('[error] ' + m.text().slice(0, 200)); });
// 1. command bar intent → plan scene
await page.goto('http://127.0.0.1:5173/moon', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(8000);
await page.fill('.commandbar input, input[placeholder^="Where to"]', 'plan a blue ghost landing at 18.56 N, 61.81 E');
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
console.log('url after intent:', page.url());
// 2. jump to end of the simulation → banner
await page.waitForTimeout(20000);
await page.evaluate(async () => { const st = (await import('/src/state/simStore.ts')).useSimStore; const s = st.getState(); s.setT(s.plan.timeline.totalS - 20); s.play(); });
await page.waitForTimeout(12000);
const banner = await page.evaluate(() => document.querySelector('.sim-banner')?.textContent ?? 'NO BANNER');
console.log('banner:', banner.slice(0, 160));
await page.screenshot({ path: '/tmp/pw/final_end.png' });
// 3. history intent
await page.fill('.commandbar input, input[placeholder^="Where to"]', 'landing history');
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
console.log('url after history intent:', page.url());
// 4. plan page from Edit plan link
await page.goto('http://127.0.0.1:5173/plan?latitude=18.56&longitude=61.81&landerId=blue-ghost&transferId=phasing&run=1', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(5000);
console.log('plan page margin:', await page.evaluate(() => [...document.querySelectorAll('.kv')].map((e) => e.textContent).find((t) => t.includes('Propellant margin'))?.slice(0, 120)));
await page.screenshot({ path: '/tmp/pw/final_plan.png', fullPage: true });
console.log(logs.slice(0, 8).join('\n') || 'no page errors');
await browser.close();
