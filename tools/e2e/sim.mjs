import { chromium } from 'playwright';
const [url, prefix, ...rest] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/GL Driver|React Router|DevTools|vite|ReadPixels/.test(t)) logs.push(`[${m.type()}] ${t.slice(0, 220)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => logs.push('[goto] ' + e.message));
await page.waitForTimeout(Number(rest[0] ?? 20000));
const info = await page.evaluate(async () => {
  const sim = (await import('/src/state/simStore.ts')).useSimStore.getState();
  return { hasPlan: !!sim.plan, phases: sim.plan?.timeline.phases.map((p) => [p.id, p.startS, p.durationS]) };
});
console.log(JSON.stringify(info));
const shots = [['launch', 0.5], ['transfer', 0.55], ['loi', 0.5], ['landing', 0.93], ['landing', 0.995], ['surface', 0.3]];
for (const [pid, frac] of shots) {
  await page.evaluate(async ([pid, frac]) => {
    const store = (await import('/src/state/simStore.ts')).useSimStore;
    const s = store.getState(); const p = s.plan.timeline.phases.find((x) => x.id === pid);
    s.pause(); s.setT(p.startS + frac * p.durationS);
  }, [pid, frac]);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${prefix}_${pid}_${String(frac).replace('.', '')}.png` });
  const ro = await page.evaluate(async () => (await import('/src/state/simStore.ts')).useSimStore.getState().readout);
  console.log(pid, frac, JSON.stringify(ro));
}
console.log(await page.evaluate(() => document.querySelector('.statusbar')?.textContent));
console.log(logs.slice(0, 12).join('\n'));
await browser.close();
