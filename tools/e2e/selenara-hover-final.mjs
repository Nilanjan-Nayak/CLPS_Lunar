import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const context = await browser.newContext({viewport:{width:1440,height:900}});
const page = await context.newPage();
const OUT='/home/user/clps-lunar-browser/docs/screenshots';
page.on('pageerror', e=>console.error('PAGEERROR:',e.message));
async function frames(n=10){await page.evaluate(async count=>{const f=window.__clpsFrames||0,start=Date.now();while((window.__clpsFrames||0)-f<count&&Date.now()-start<30000)await new Promise(r=>setTimeout(r,100));},n);}
async function hide(card){await page.mouse.move(4,550);await card.waitFor({state:'hidden',timeout:20000});}
try {
  await page.goto('http://127.0.0.1:5173/plan/scene?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&quality=low',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__clps?.useSimStore?.getState()?.plan&&(window.__clpsFrames||0)>8,null,{timeout:90000});
  await page.locator('[data-marker-type="spacecraft"] button').waitFor({state:'attached',timeout:60000});
  const phases=await page.evaluate(()=>{const s=window.__clps.useSimStore.getState();s.pause();s.setFollow(true);s.setT(25);return s.plan.timeline.phases});
  await frames(12);
  await page.waitForFunction(()=>{const w=window.__clps,c=window.__clpsCamera,e=w?.liveEphemeris.geometry.earthPosScene;return w?.simCamera.active&&c&&e&&Math.hypot(c.position.x-e[0],c.position.y-e[1],c.position.z-e[2])<9500&&!!window.__clpsScene?.getObjectByName('earth-globe');},null,{timeout:90000});
  await frames(4);
  const root=page.locator('[data-marker-type="spacecraft"]'), target=root.locator('button'), card=root.locator('.flight-marker-card');
  await card.waitFor({state:'hidden'});
  await page.screenshot({path:`${OUT}/selenara-x-flight-clear.png`,timeout:120000});
  await target.hover({timeout:30000});await card.waitFor({state:'visible',timeout:20000});
  await page.screenshot({path:`${OUT}/selenara-x-flight-hover.png`,timeout:120000});
  // Start playback with the card open; after the pointer leaves, a running flight must not leave it stuck.
  await page.evaluate(()=>window.__clps.useSimStore.getState().play());
  await hide(card);assert.equal(await card.isVisible(),false);
  await page.evaluate(()=>window.__clps.useSimStore.getState().pause());
  const orbit=phases.find(p=>p.id==='loi');
  await page.evaluate(t=>window.__clps.useSimStore.getState().setT(t),orbit.startS+orbit.durationS*0.5);
  await page.waitForFunction(()=>window.__clps.useSimStore.getState().readout.phaseId==='loi',null,{timeout:45000});
  await frames(7); await target.hover({timeout:30000});await card.waitFor({state:'visible',timeout:20000});
  assert((await card.innerText()).includes(orbit.name));
  const box=await card.boundingBox();
  console.log('Orbit card bounds',box);assert(box.y+box.height<=805,'card should avoid bottom control dock');
  await page.screenshot({path:`${OUT}/selenara-x-orbit-hover.png`,timeout:120000});
  await hide(card);
  // The planned landing site is also compact, and its details can be inspected separately.
  const landing=phases.find(p=>p.id==='landing');
  await page.evaluate(t=>window.__clps.useSimStore.getState().setT(t),landing.startS+landing.durationS*0.92);
  await page.waitForFunction(()=>window.__clps.useSimStore.getState().readout.phaseId==='landing',null,{timeout:45000});
  await frames(7);
  const site=page.locator('[data-marker-type="site"]').filter({has:page.locator('button[aria-label^="Planned landing site"]')});
  const siteButton=site.locator('button'), siteCard=site.locator('.flight-marker-card');
  await siteButton.hover({timeout:30000});await siteCard.waitFor({state:'visible',timeout:20000});
  assert(/lunar landing site/i.test(await siteCard.innerText()));
  await hide(siteCard);
  // Exercise real mobile UI and narrow-screen card positioning, without hiding overlays in the test.
  await page.setViewportSize({width:320,height:900});
  await frames(8);
  assert(await page.locator('.hud-mobile-toggle').isVisible());
  assert.equal(await page.locator('.hud-left').isVisible(), false);
  await target.hover({timeout:30000});await card.waitFor({state:'visible',timeout:20000});
  const narrow=await card.boundingBox();const klass=await root.getAttribute('class');
  console.log('Narrow card',narrow,klass);
  assert(narrow.x>=0&&narrow.x+narrow.width<=320,'narrow card must fit screen');
  assert(klass.includes('card-centered'),'narrow card should stack above/below its marker');
  console.log('Final hover, running playback, site marker, bottom and narrow viewport checks PASS');
} finally {await context.close();await browser.close();}
