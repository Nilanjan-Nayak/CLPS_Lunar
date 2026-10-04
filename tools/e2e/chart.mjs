import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|ReadPixels/.test(m.text())) logs.push('[error] ' + m.text().slice(0, 200)); });
// plan page: chart + heat click
await page.goto('http://127.0.0.1:5173/plan?latitude=-84.79&longitude=29.2&landerId=nova-c&run=1', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(5000);
const svgOk = await page.evaluate(() => !!document.querySelector('svg[aria-label="Simulated powered-descent profile"] path'));
const cells = await page.$$('.heat span');
console.log('chart on plan page:', svgOk, '| heat cells:', cells.length);
await cells[5 * 32 + 20].click();
await page.waitForTimeout(300);
console.log('after heat click lat/lon:', await page.evaluate(() => [...document.querySelectorAll('input[type=number]')].slice(0, 2).map((i) => i.value)));
const card = await page.$('.plan-grid > div:nth-child(2)');
await card.screenshot({ path: '/tmp/pw/plan_card.png' });
// sim scene: landing phase with chart cursor
await page.goto('http://127.0.0.1:5173/plan/scene?latitude=-84.79&longitude=29.2&landerId=nova-c', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(22000);
await page.evaluate(async () => { const st = (await import('/src/state/simStore.ts')).useSimStore; const s = st.getState(); const lp = s.plan.timeline.phases.find((p) => p.id === 'landing'); s.pause(); s.setT(lp.endS - s.plan.descent.durationS * 0.35); });
await page.waitForTimeout(6000);
console.log('chart in sim panel:', await page.evaluate(() => document.querySelector('.hud-left svg[aria-label="Simulated powered-descent profile"] circle') ? 'cursor drawn' : 'MISSING'));
await page.screenshot({ path: '/tmp/pw/sim_chart.png' });
console.log(logs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
