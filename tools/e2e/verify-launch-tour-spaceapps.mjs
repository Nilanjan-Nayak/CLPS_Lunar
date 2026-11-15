import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = '/home/user/clps-lunar-browser/docs/screenshots';

async function waitFrames(page, n = 8) {
  await page.evaluate(async (count) => {
    const start = window.__clpsFrames || 0;
    const t0 = Date.now();
    while ((window.__clpsFrames || 0) - start < count && Date.now() - t0 < 25000) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }, n);
}

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

try {
  // 1. Re-capture Interactive First-Time User Onboarding & Mission Guide (mounted via createPortal on document.body)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/plan?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1&tour=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tour-callout', { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/selenara-guided-tour.png`, timeout: 120000 });
    console.log('Saved selenara-guided-tour.png');
    await ctx.close();
  }

  // 2. 3D Rocket Launch from Earth & Powered Descent Touchdown on Moon (/plan/scene)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('PAGEERROR 3:', e.message));
    await page.goto(`${BASE}/plan/scene?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window.__clpsFrames || 0) >= 8 && window.__clps?.useSimStore?.getState()?.plan != null, null, { timeout: 60000 });

    // Pause and scrub to t = 25s (Rocket Launching from KSC on 3D Earth)
    await page.evaluate(() => {
      const sim = window.__clps.useSimStore.getState();
      sim.pause();
      sim.setFollow(true);
      sim.setT(25);
    });
    await waitFrames(page, 10);
    await page.screenshot({ path: `${OUT}/selenara-launch-earth.png`, timeout: 120000 });
    console.log('Saved selenara-launch-earth.png');

    // Scrub to Powered Descent phase (65% through landing phase)
    const landingInfo = await page.evaluate(() => {
      const sim = window.__clps.useSimStore.getState();
      const landingPhase = sim.plan.timeline.phases.find((p) => p.id === 'landing');
      const tMid = landingPhase.startS + (landingPhase.endS - landingPhase.startS) * 0.65;
      sim.setT(tMid);
      return { startS: landingPhase.startS, endS: landingPhase.endS, tMid };
    });
    console.log('Landing phase:', landingInfo);
    await waitFrames(page, 10);
    await page.screenshot({ path: `${OUT}/selenara-landing-moon.png`, timeout: 120000 });
    console.log('Saved selenara-landing-moon.png');
    await ctx.close();
  }
} finally {
  await browser.close();
}
