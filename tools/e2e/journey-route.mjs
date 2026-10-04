// Journey e2e: /missions/:id/journey renders the route, playback drives the world clock, the panel shows launch site/timing.
// Run from /tmp/pw (playwright + pngjs installed): node /home/user/clps-lunar-browser/tools/e2e/journey-route.mjs [missionId]
import { chromium } from 'playwright';
import fs from 'node:fs';

const mission = process.argv[2] ?? 'im-1';
const out = '/tmp/pw';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/GL Driver|React Router|DevTools|vite|ReadPixels|Download the React/.test(t)) logs.push(`[${m.type()}] ${t.slice(0, 220)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));

const url = `http://127.0.0.1:5173/missions/${mission}/journey?quality=low`;
console.log('open', url);
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
// wait for the journey to be in the store
const t0 = Date.now();
let info = null;
while (Date.now() - t0 < 60000) {
  info = await page.evaluate(() => {
    const w = window.__clps; if (!w) return null;
    const j = w.useJourneyStore?.getState().journey; if (!j) return { noJourney: true, frames: window.__clpsFrames || 0 };
    return { missionId: j.missionId, fidelity: j.fidelity, segs: j.segments.map((s) => s.id), totalDays: j.totalDays, launchSite: j.launchSite.name, frames: window.__clpsFrames || 0 };
  });
  if (info && !info.noJourney) break;
  await page.waitForTimeout(1000);
}
console.log('journey:', JSON.stringify(info));
const frames = async () => page.evaluate(() => window.__clpsFrames || 0);
const waitFrames = async (n, ms = 60000) => { const f0 = await frames(); const s = Date.now(); while (Date.now() - s < ms) { if ((await frames()) - f0 >= n) return true; await page.waitForTimeout(500); } return false; };
await waitFrames(3, 90000);
await page.screenshot({ path: `${out}/j0_${mission}_start.png`, timeout: 120000 });

const snap = async (label, sec) => {
  await page.evaluate((s) => { const st = window.__clps.useJourneyStore.getState(); st.pause(); st.setT(s); }, sec);
  await waitFrames(6, 90000);
  const r = await page.evaluate(() => {
    const st = window.__clps.useJourneyStore.getState();
    const c = window.__clps.useClockStore.getState();
    return { t: st.t, seg: st.readout.segmentId, alt: Math.round(st.readout.altitudeKm), near: st.readout.nearBody, v: st.readout.speedKms.toFixed(2), dE: Math.round(st.readout.distanceEarthKm), dM: Math.round(st.readout.distanceMoonKm), clock: c.mode, utc: new Date(c.epochMs).toISOString().slice(0, 16), panel: document.querySelector('.hud-left .panel .panel-title, .hud-left h3')?.textContent?.slice(0, 60) };
  });
  console.log(label, JSON.stringify(r));
  await page.screenshot({ path: `${out}/j_${mission}_${label}.png`, timeout: 120000 });
  return r;
};
const segs = await page.evaluate(() => window.__clps.useJourneyStore.getState().journey.segments.map((s) => ({ id: s.id, t0: s.samples[0][0], t1: s.samples[s.samples.length - 1][0] })));
for (const s of segs) {
  const mid = s.t0 + (s.t1 - s.t0) * (s.id === 'ascent' ? 0.7 : s.id === 'descent' ? 0.85 : 0.5);
  await snap(s.id, mid);
}
// overview view at mid-transfer
const tl = segs.find((s) => s.id === 'translunar') ?? segs[2];
await page.evaluate(() => window.__clps.useJourneyStore.getState().setView('overview'));
await snap('overview', tl.t0 + (tl.t1 - tl.t0) * 0.4);
// play for a few real seconds and verify t advances + clock in mission mode
await page.evaluate(() => { const st = window.__clps.useJourneyStore.getState(); st.setView('follow'); st.setT(0); st.play(); });
await page.waitForTimeout(6000);
const play = await page.evaluate(() => { const st = window.__clps.useJourneyStore.getState(); return { t: st.t, playing: st.playing, seg: st.readout.segmentId, clock: window.__clps.useClockStore.getState().mode }; });
console.log('after 6 s of playback:', JSON.stringify(play));
const panelText = await page.evaluate(() => Array.from(document.querySelectorAll('.hud-left .panel')).map((p) => p.textContent.replace(/\s+/g, ' ').slice(0, 400)).join('\n---\n'));
console.log('PANEL:\n' + panelText.slice(0, 1600));
console.log('logs:', logs.slice(0, 12).join('\n'));
fs.writeFileSync(`${out}/journey_${mission}.json`, JSON.stringify({ info, segs, play }, null, 1));
await browser.close();
