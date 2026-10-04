import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5173/plan/scene?latitude=-84.7906&longitude=29.1957&landerId=nova-c', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(20000);
// open scene config panel if collapsed
const hdr = await page.$('text=Scene config');
if (hdr) await hdr.click();
await page.waitForTimeout(500);
const dom = async () => page.evaluate(() => { const t = document.body.innerText; const m = t.match(/Sub-solar longitude\s*(-?[\d.]+)°/); const l = t.match(/Sub-solar latitude\s*(-?[\d.]+)°/); const mode = t.match(/(Sun from ephemeris model[^\n]*|Auto lighting[^\n]*)/); return [m?.[1], l?.[1], mode?.[1]?.slice(0, 60)]; });
console.log('at landing', JSON.stringify(await dom()));
await page.evaluate(async () => { const st = (await import('/src/state/simStore.ts')).useSimStore; const s = st.getState(); const sp = s.plan.timeline.phases.find((p) => p.id === 'surface'); s.pause(); s.setT(sp.startS + sp.durationS * 0.5); });
await page.waitForTimeout(3000);
console.log('mid surface', JSON.stringify(await dom()));
await page.screenshot({ path: '/tmp/pw/sim_surface.png' });
await browser.close();
