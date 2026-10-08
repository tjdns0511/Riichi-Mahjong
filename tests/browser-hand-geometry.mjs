import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Capture actual border boxes and the full sizing cascade before changing CSS.
 * Custom properties retain calc() text, so bounding boxes are authoritative. */
export function handGeometry() {
  const hand = document.querySelector('.practice-hand .hand, .practice-hand .efficiency-hand');
  const properties = ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'box-sizing', 'padding', 'border-width', 'aspect-ratio', 'flex', 'flex-basis', 'flex-shrink',
    '--hand-tile-w', '--hand-tile-h', '--tile-w', '--tile-h'];
  const rect = e => {
    const r = e.getBoundingClientRect();
    return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
  };
  const tiles = [...hand.querySelectorAll(':scope > .tile')].map(e => ({
    ...rect(e), id:+e.dataset.id, drawn:e.classList.contains('drawn'),
    style:Object.fromEntries(properties.map(p => [p, getComputedStyle(e).getPropertyValue(p)])),
    inlineStyle:e.getAttribute('style'),
  }));
  return {viewport:innerWidth, hand:rect(hand), wrap:getComputedStyle(hand).flexWrap,
    gap:getComputedStyle(hand).gap, tiles,
    rows:new Set(tiles.map(t => Math.round(t.y))).size,
    overflow:document.documentElement.scrollWidth > innerWidth + 1};
}

/** Observational baseline; regression assertions are added with the fix. */
export async function runHandGeometryChecks(browser, out) {
  const report = [];
  for (const width of [320,360,390,430,700,701,768,1024,1100,1440]) {
    const context = await browser.newContext({viewport:{width,height:900},hasTouch:true,
      isMobile:width < 900,serviceWorkers:'block'});
    await context.addInitScript(() => { Date.now = () => 1791410000000; });
    const page = await context.newPage();
    await page.route('https://raw.githubusercontent.com/**',r => r.abort());
    await page.goto('http://127.0.0.1:8765/Riichi-Mahjong/');
    await page.locator('.nav-button[data-tab="efficiency"]').click();
    await page.locator('[data-action="eff-answer"]').first().waitFor();
    const row = await page.evaluate(handGeometry);
    report.push(row);
    console.log('HAND_GEOMETRY '+JSON.stringify({...row,tiles:row.tiles.slice(0,1)}));
    await page.screenshot({path:resolve(out,`efficiency-hand-${width}.png`),fullPage:true});
    await context.close();
  }
  await writeFile(resolve(out,'hand-geometry.json'),JSON.stringify(report,null,2));
}
