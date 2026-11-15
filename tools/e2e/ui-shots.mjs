// UI screenshots of the redesigned shell. Run from /tmp/pw (needs playwright + chromium):  node ui-shots.mjs [routes...]
// Every scene route is opened with ?quality=low (headless swiftshader); one page per browser context.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? '/tmp/pw';
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/space', '/missions/im-1/journey', '/missions/blue-ghost-mission-1', '/missions', '/plan', '/copilot', '/timeline', '/map',
];
const ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'];

const browser = await chromium.launch({ args: ARGS });
for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = BASE + route + (route.includes('?') ? '&' : '?') + 'quality=low';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 }).catch((e) => errors.push('goto: ' + e.message));
  const isScene = /^\/(space|moon|plan\/scene|plan\/journey|missions\/[^/]+\/(journey|scene))/.test(route) || /^\/missions\/[^/]+$/.test(route) === false && route.startsWith('/moon');
  if (isScene || route === '/space') {
    await page.waitForFunction(() => (window.__clpsFrames ?? 0) > 12, null, { timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } else {
    await page.waitForTimeout(800);
  }
  const name = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
  await page.screenshot({ path: `${OUT}/ui_${name}.png`, timeout: 120_000 });
  const overflow = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.topbar, .dock, .statusbar, .stage-strip, .panel-head, .clockbar, .envbar')) {
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className}: ${el.scrollWidth}>${el.clientWidth}`);
    }
    const tb = document.querySelector('.topbar'); if (tb) out.push(`topbar h=${tb.getBoundingClientRect().height}`);
    return out;
  });
  console.log(route, '→', `ui_${name}.png`, overflow.join(' | '), errors.length ? 'ERRORS: ' + errors.join('; ') : '');
  await ctx.close();
}
await browser.close();
