import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

/** Capture actual border boxes and the full sizing cascade before changing CSS.
 * Custom properties retain calc() text, so bounding boxes are authoritative. */
export function handGeometry(selector = '.practice-hand .efficiency-hand') {
  const hand = document.querySelector(selector);
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
    inlineStyle:e.getAttribute('style'), marginLeft:parseFloat(getComputedStyle(e).marginLeft),
    image:e.querySelector('img') ? {naturalWidth:e.querySelector('img').naturalWidth,
      naturalHeight:e.querySelector('img').naturalHeight,fit:getComputedStyle(e.querySelector('img')).objectFit} : null,
  }));
  return {viewport:innerWidth, hand:rect(hand), wrap:getComputedStyle(hand).flexWrap,
    gap:getComputedStyle(hand).gap, tiles,
    rows:new Set(tiles.map(t => Math.round(t.y))).size,
    overflow:document.documentElement.scrollWidth > innerWidth + 1};
}

/** All 14 tiles must fit the CONTENT box on one line; verify real border-box
 * ratio rather than assuming computed custom-property text proves layout. */
function assertHand(row, count) {
  assert.equal(row.tiles.length, count);
  assert.equal(row.rows, 1, `${row.viewport}: unexpected wrapping`);
  assert.equal(row.wrap, 'nowrap');
  assert.equal(row.overflow, false);
  for (const t of row.tiles) {
    assert.ok(t.width > 0 && Math.abs(t.height / t.width - 1.38) < .002,
      `${row.viewport}: distorted ${t.width} x ${t.height}`);
    assert.ok(t.x >= row.hand.x - .1 && t.right <= row.hand.right + .1,
      `${row.viewport}: tile exceeds container`);
    assert.equal(t.style['flex-shrink'], '0');
    assert.equal(t.style['box-sizing'], 'border-box');
    if (t.image) assert.equal(t.image.fit, 'contain', 'SVG artwork must not be stretched');
  }
  for (let i = 1; i < row.tiles.length; i++)
    assert.ok(row.tiles[i].x >= row.tiles[i-1].right, 'overlapping touch targets');
}

/** Record public pixels, exercise real touch events and retain the measurements
 * as a CI artifact. Includes both sides of the 700px breakpoint and rotation. */
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
    assertHand(row, 14);
    assert.equal(row.tiles.filter(t => t.drawn).length, 1);
    assert.ok(row.tiles.at(-1).drawn && row.tiles.at(-1).marginLeft > 0);
    console.log('HAND_GEOMETRY '+JSON.stringify({...row,tiles:row.tiles.slice(0,1)}));
    await page.screenshot({path:resolve(out,`efficiency-hand-${width}.png`),fullPage:true});

    // Choose a non-tenpai discard from visible tiles to exercise 14 -> 13 -> 14.
    const choice = await page.evaluate(async () => {
      const {rankDiscards} = await import('./js/core/shanten.js');
      const hand = [...document.querySelectorAll('[data-action="eff-answer"]')].map(e => +e.dataset.id);
      return rankDiscards(hand).find(r => r.shanten > 0).t;
    });
    await page.locator(`[data-action="eff-answer"][data-t="${choice}"]`).first().tap();
    await page.locator('[data-action="eff-next"]').waitFor();
    assertHand(await page.evaluate(handGeometry), 13);
    assert.equal(await page.locator('.efficiency-hand .drawn').count(), 0);
    assert.equal(await page.locator('[data-action="eff-answer"]:disabled').count(), 13);
    await page.locator('[data-action="eff-next"]').tap();
    assertHand(await page.evaluate(handGeometry), 14);
    assert.equal(await page.locator('.efficiency-hand .drawn').count(), 1);
    await page.setViewportSize({width:900,height:width});
    assertHand(await page.evaluate(handGeometry), 14);
    await page.setViewportSize({width,height:900});
    assertHand(await page.evaluate(handGeometry), 14);

    // Successful SVG loading, in addition to the unavailable-image fallback.
    // Same 300:400 intrinsic ratio as the CC0 Man1.svg, no external dependency.
    await page.unroute('https://raw.githubusercontent.com/**');
    await page.route('https://raw.githubusercontent.com/**',r => r.fulfill({
      contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="ivory"/><circle cx="150" cy="200" r="80" fill="green"/></svg>',
    }));
    await page.locator('[data-action="eff-new"]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.efficiency-hand img')]
      .every(img => img.complete && img.naturalWidth === 300));
    const images = await page.evaluate(handGeometry);
    assertHand(images, 14);
    assert.ok(images.tiles.every(t => t.image?.naturalHeight === 400));
    await page.unroute('https://raw.githubusercontent.com/**');
    await page.route('https://raw.githubusercontent.com/**',r => r.abort());

    // Final and historical hands use the same isolated component in all shapes.
    await page.goto('http://127.0.0.1:8765/Riichi-Mahjong/tests/fixtures/ui.html');
    await page.locator('.mahjong-board').waitFor();
    for (const [shape,type] of [['standard',21],['chiitoi',8],['kokushi',4]]) {
      await page.evaluate(shape => window.fixture.showTrainer(shape), shape);
      assertHand(await page.evaluate(handGeometry), 14);
      await page.locator(`[data-action="eff-answer"][data-t="${type}"]`).tap();
      await page.getByRole('heading',{name:'텐파이 달성!'}).waitFor();
      assertHand(await page.evaluate(handGeometry,'.efficiency-result .efficiency-hand'), 13);
      assert.equal(await page.locator('[data-action="eff-next"]').count(), 0);
      await page.locator('.efficiency-history summary').first().click();
      assertHand(await page.evaluate(handGeometry,'.efficiency-history .efficiency-hand'), 14);
    }
    await page.screenshot({path:resolve(out,`efficiency-result-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'다시 연습하기',exact:true}).click();
    assertHand(await page.evaluate(handGeometry), 14);
    console.log(`efficiency ${width}: 14/13/draw/touch/rotation/SVG/fallback/three tenpai results/history/restart passed`);
    await context.close();
  }
  await writeFile(resolve(out,'hand-geometry.json'),JSON.stringify(report,null,2));
}
