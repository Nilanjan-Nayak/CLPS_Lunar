import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, args: [
  '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-dev-shm-usage',
] });
try {
  for (const width of [390, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1', '1'));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE}/navigator?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=2&landingDate=2026-09-28T12%3A00%3A00Z&run=1&quality=low`, { waitUntil: 'domcontentloaded' });
    const open = page.getByRole('button', { name: /Open Mission Navigator/ });
    await open.waitFor({ timeout: 60000 });
    await open.tap();
    const workbench = page.locator('aside[aria-label="Hybrid Lunar Mission Navigator Workbench"]');
    await workbench.waitFor({ timeout: 30000 });
    const data = page.locator('.challenge-console-compact');
    await data.waitFor({ state: 'attached', timeout: 90000 });
    const rect = await workbench.boundingBox();
    const panel = await data.boundingBox();
    assert.ok(rect.width >= width - 26, `Navigator workbench is too narrow at ${width}px: ${rect.width}`);
    assert.ok(panel.width > width - 65, `Challenge workbench is too narrow at ${width}px: ${panel.width}`);
    // The WebGL marker's HTML overlay must not sit above the workbench chart.
    const chart = page.getByRole('img', { name: 'Mission power generation, load, battery SOC, and golden window chart' });
    await chart.waitFor({ state: 'attached', timeout: 60000 });
    await chart.evaluate((el) => {
      const scroller = el.closest('.hybrid-workbench');
      const bounds = el.getBoundingClientRect();
      scroller.scrollTop += bounds.top + bounds.height / 2 - window.innerHeight / 2;
    });
    await page.waitForTimeout(500);
    const chartOnTop = await chart.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el || el.contains(hit);
    });
    assert.ok(chartOnTop, `Flight markers must not cover the Navigator chart at ${width}px`);
    const jpl = page.getByRole('button', { name: 'Run JPL Horizons check' });
    await jpl.scrollIntoViewIfNeeded({ timeout: 30000 });
    await jpl.tap({ timeout: 30000 });
    await page.getByTestId('horizons-results').waitFor({ timeout: 60000 });
    // Close remains sticky and usable even after scrolling deep into the workbench.
    await page.getByRole('button', { name: 'Close mission navigator' }).tap();
    await open.waitFor();
    assert.deepEqual(errors, []);
    console.log(`${width}px touch: open, live JPL check, sticky close — PASS`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
