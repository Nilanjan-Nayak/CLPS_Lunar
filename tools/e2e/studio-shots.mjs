import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 } });
const page = await ctx.newPage();

const routes = [
  ['resilience', 'http://127.0.0.1:5173/resilience?latitude=-84.79&longitude=29.2&landerId=nova-c&run=1', 'Schedule-Delay Simulator'],
  ['optimizer', 'http://127.0.0.1:5173/optimizer?latitude=-84.79&longitude=29.2&landerId=nova-c&run=1', 'Pareto Frontier Explorer'],
  ['report', 'http://127.0.0.1:5173/report?latitude=-84.79&longitude=29.2&landerId=nova-c&run=1', 'Scientific Data-Quality'],
  ['plan', 'http://127.0.0.1:5173/plan?latitude=-84.79&longitude=29.2&landerId=nova-c&run=1', '360° Polar Sky-Dome'],
];

for (const [name, url, textWait] of routes) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector(`text=${textWait}`, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/pw/${name}.png`, fullPage: false, timeout: 60000 });
  console.log('saved', name);
}

await browser.close();
