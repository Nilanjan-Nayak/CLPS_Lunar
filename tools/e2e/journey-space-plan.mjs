// /space: journey index panel (no dashed Earth→Moon line); /plan/journey: a planned route computed from precedent.
// Run from /tmp/pw: node journey-space-plan.mjs
import { chromium } from 'playwright';

const out = '/tmp/pw';
const args = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'];
const frames = (page) => page.evaluate(() => window.__clpsFrames || 0);
const waitFrames = async (page, n, ms = 90000) => { const f0 = await frames(page); const s = Date.now(); while (Date.now() - s < ms) { if ((await frames(page)) - f0 >= n) return true; await page.waitForTimeout(500); } return false; };

// ---- /space ------------------------------------------------------------------------------------------------------
{
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 200)}`); });
  await page.goto('http://127.0.0.1:5173/space?quality=low', { waitUntil: 'networkidle', timeout: 90000 });
  await waitFrames(page, 3);
  await page.waitForTimeout(1500);
  const panel = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('.hud-left .panel')).map((x) => x.textContent.replace(/\s+/g, ' ').slice(0, 500));
    const links = Array.from(document.querySelectorAll('.hud-left a')).map((a) => a.getAttribute('href')).filter((h) => h && h.includes('journey'));
    return { panels: p, journeyLinks: links.slice(0, 10) };
  });
  console.log('SPACE panels:', JSON.stringify(panel, null, 1).slice(0, 1800));
  await page.screenshot({ path: `${out}/space_index.png`, timeout: 120000 });
  console.log('space logs:', logs.slice(0, 6).join('\n'));
  await browser.close();
}
// ---- /plan/journey -------------------------------------------------------------------------------------------------
{
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 200)}`); });
  const url = 'http://127.0.0.1:5173/plan/journey?latitude=-84.79&longitude=29.2&landerId=nova-c&launchSiteId=ksc-lc-39a&quality=low';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  const t0 = Date.now(); let info = null;
  while (Date.now() - t0 < 90000) {
    info = await page.evaluate(() => { const j = window.__clps?.useJourneyStore?.getState().journey; return j ? { missionId: j.missionId, fidelity: j.fidelity, profile: j.profile, totalDays: j.totalDays, launchSite: j.launchSite.shortName, segs: j.segments.map((s) => s.id), notes: j.notes.slice(0, 3) } : null; });
    if (info) break; await page.waitForTimeout(1000);
  }
  console.log('PLAN journey:', JSON.stringify(info));
  await waitFrames(page, 3);
  await page.evaluate(() => { const st = window.__clps.useJourneyStore.getState(); st.pause(); st.setView('overview'); const j = st.journey; const tl = j.segments.find((s) => s.id === 'translunar'); st.setT(tl.samples[Math.floor(tl.samples.length * 0.45)][0]); });
  await waitFrames(page, 4);
  await page.screenshot({ path: `${out}/plan_journey_overview.png`, timeout: 120000 });
  await page.evaluate(() => { const st = window.__clps.useJourneyStore.getState(); st.setView('follow'); const j = st.journey; const d = j.segments.find((s) => s.id === 'descent'); st.setT(d.samples[Math.floor(d.samples.length * 0.5)][0]); });
  await waitFrames(page, 4);
  const r = await page.evaluate(() => { const st = window.__clps.useJourneyStore.getState(); const c = window.__clps.useClockStore.getState(); return { seg: st.readout.segmentId, alt: st.readout.altitudeKm.toFixed(1), utc: new Date(c.epochMs).toISOString().slice(0, 16), mode: c.mode }; });
  console.log('PLAN descent readout:', JSON.stringify(r));
  await page.screenshot({ path: `${out}/plan_journey_descent.png`, timeout: 120000 });
  const panelText = await page.evaluate(() => Array.from(document.querySelectorAll('.hud-left .panel')).map((p) => p.textContent.replace(/\s+/g, ' ').slice(0, 600)).join('\n---\n'));
  console.log('PLAN PANEL:\n' + panelText.slice(0, 1500));
  console.log('plan logs:', logs.slice(0, 6).join('\n'));
  await browser.close();
}
