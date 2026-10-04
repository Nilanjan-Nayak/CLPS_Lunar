import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|ReadPixels/.test(m.text())) logs.push('[error] ' + m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:5173/copilot', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1500);
const ask = async (t) => { await page.fill('.copilot .command-bar input', t); await page.press('.copilot .command-bar input', 'Enter'); await page.waitForFunction(() => !document.body.innerText.includes('thinking…'), null, { timeout: 30000 }); await page.waitForTimeout(400); const b = await page.$$('.bubble.assistant'); const last = b[b.length - 1]; return (await last.innerText()).replace(/\n+/g, ' | ').slice(0, 260); };
console.log('1', await ask('where did IM-1 land?'));
console.log('2', await ask('show its payloads'));
console.log('3', await ask('when did Apollo 11 land?'));
console.log('4', await ask('plan a landing at 84.79 S, 29.2 E with Nova-C on 2026-11-17'));
console.log('5', await ask('make the moon purple'));
await page.screenshot({ path: '/tmp/pw/copilot.png', fullPage: false });
// Run in 3D on the plan intent → should navigate to /plan/scene…
const runBtns = await page.$$('.bubble.intent .btn.primary');
await runBtns[runBtns.length - 1].click();
await page.waitForTimeout(1500);
console.log('after Run in 3D →', page.url());
// command bar handoff: unknown text → /copilot?q=
await page.goto('http://127.0.0.1:5173/moon', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(2000);
await page.fill('.command-bar input', 'who built Peregrine?');
await page.press('.command-bar input', 'Enter');
await page.waitForTimeout(2500);
console.log('command bar handoff →', page.url(), '|', (await page.evaluate(() => document.querySelector('.bubble.assistant')?.innerText.replace(/\n+/g, ' | ').slice(0, 160))));
console.log(logs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
