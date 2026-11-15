import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  for (const width of [2048,1920,1700,1500,1440,1436,1435,1400,1391,1300,1280,1276,1275,1251,1100,800,390,320]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.addInitScript(() => localStorage.setItem('selenara_tour_seen_v1','1'));
    await page.goto('http://127.0.0.1:5173/plan?tour=0', {waitUntil:'domcontentloaded'});
    await page.waitForSelector('.brand');
    const compact = width <= 1275;
    if (compact) {
      assert(await page.locator('.nav-mobile-toggle').isVisible());
      await page.locator('.nav-mobile-toggle').click();
    }
    const info = await page.evaluate(() => {
      const n=document.querySelector('.nav').getBoundingClientRect();
      const b=document.querySelector('.brand').getBoundingClientRect();
      const t=document.querySelector('.nav-mobile-toggle').getBoundingClientRect();
      const v=[...document.querySelectorAll('.nav > a, .nav > button, .nav > .nav-menu > button')].filter(el=>getComputedStyle(el).display!=='none').map(el=>({name:el.textContent.trim(),rect:el.getBoundingClientRect().toJSON()}));
      return {nav:n.toJSON(),brand:b.toJSON(),toggle:t.toJSON(), items:v};
    });
    assert(info.nav.left >= 0 && info.nav.right <= width, `nav overflows at ${width}: ${JSON.stringify(info.nav)}`);
    assert(info.brand.right < (compact ? info.toggle.left : info.nav.left), `brand overlaps at ${width}`);
    assert(info.items.every(x=>x.rect.left>=0 && x.rect.right<=width), `item clips at ${width}`);
    await page.locator('.studio-trigger').click();
    assert(await page.locator('.nav-dropdown-studio').isVisible());
    await page.keyboard.press('Escape');
    console.log('Navbar layout', width, compact ? 'compact' : 'desktop', 'PASS');
    if(width===390) { await page.locator('.nav-mobile-toggle').click(); await page.screenshot({path:'/home/user/clps-lunar-browser/docs/screenshots/selenara-x-mobile-menu.png'}); }
    await page.close();
  }
} finally { await browser.close(); }
