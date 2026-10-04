import { chromium } from 'playwright';
const targets = JSON.parse(process.argv[2]);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [url, out, wait] of targets) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (!/GL Driver|React Router|DevTools|vite|ReadPixels/.test(t)) logs.push(`[${m.type()}] ${t.slice(0, 220)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => logs.push('[goto] ' + e.message));
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out });
  const text = await page.evaluate(() => document.querySelector('.statusbar')?.textContent ?? '');
  console.log(url, '\n  STATUS:', text, '\n  ', logs.slice(0, 12).join('\n   '));
  await page.close();
}
await browser.close();
