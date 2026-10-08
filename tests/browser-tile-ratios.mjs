import assert from 'node:assert/strict';
import { resolve } from 'node:path';

/** Read rendered border boxes, not just the custom property expression. The
 * layout box must have the common ratio even when a riichi/meld tile rotates.
 * Hidden opponent hands and closed analysis details do not occupy space. */
export function tileBoxes() {
  return [...document.querySelectorAll('.tile')].filter(e =>
    e.getClientRects().length && e.getBoundingClientRect().width > 0 &&
    !e.closest('details:not([open])')
  ).map(e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    const matrix = s.transform === 'none' ? null : new DOMMatrixReadOnly(s.transform);
    const img = e.querySelector('img');
    return {
      classes: e.className, group: e.closest('.hand,.river,.meld,.dora-rack,.concealed,.palette-row,.training-river,.wait-tile,.wait-card')?.className ?? 'analysis',
      width: r.width, height: r.height, cssWidth: parseFloat(s.width), cssHeight: parseFloat(s.height),
      sideways: !!matrix && Math.abs(matrix.a) < .001 && Math.abs(matrix.b) > .999,
      boxSizing: s.boxSizing, shrink: s.flexShrink,
      imageFit: img ? getComputedStyle(img).objectFit : null,
    };
  });
}

/** A small pixel tolerance permits fractional CSS-pixel rounding, including
 * 8px concealed tiles. Check computed AND transformed boxes to catch flex,
 * padding, borders, and mismatched fixed heights, while respecting rotation. */
export async function assertTileRatios(page, context) {
  const boxes = await page.evaluate(tileBoxes);
  assert.ok(boxes.length, `${context}: no visible tiles checked`);
  for (const t of boxes) {
    const name = `${context} / ${t.group} / ${t.classes}`;
    assert.equal(t.boxSizing, 'border-box', name);
    assert.equal(t.shrink, '0', name);
    assert.ok(Math.abs(t.cssHeight - t.cssWidth * 1.38) < .035,
      `${name}: computed ${t.cssWidth} x ${t.cssHeight}`);
    const width = t.sideways ? t.height : t.width, height = t.sideways ? t.width : t.height;
    assert.ok(Math.abs(height - width * 1.38) < .035,
      `${name}: rendered ${t.width} x ${t.height} (sideways=${t.sideways})`);
    if (t.imageFit) assert.equal(t.imageFit, 'contain', name);
  }
  return boxes;
}

/** Reproduce the reported defense-hand bug at every hand-test breakpoint.
 * Cover selection/feedback, one/two opponents, portrait/landscape changes,
 * and a fresh question without changing the production trainer model. */
export async function checkDefenseGeometry(page, out, width) {
  await page.locator('.nav-button[data-tab="defense"]').click();
  const hand = page.locator('.practice-hand .hand');
  const ids = await hand.locator('.tile').evaluateAll(els => els.map(e => e.dataset.id));
  assert.ok(ids.length >= 13);
  const boxes = await assertTileRatios(page, `defense ${width} opening`);
  const first = boxes.find(t => t.group.includes('tiles-hand'));
  console.log('DEFENSE_GEOMETRY ' + JSON.stringify({viewport: width, count: ids.length, ...first}));
  await hand.locator('.tile').first().tap();
  await page.locator('.feedback').waitFor();
  assert.ok(await hand.locator('.selected').count());
  assert.deepEqual(await hand.locator('.tile').evaluateAll(els => els.map(e => e.dataset.id)), ids,
    'a defense answer must not discard or resize the hand');
  await assertTileRatios(page, `defense ${width} selected and analysis`);
  await page.locator('#def-threats').selectOption('2');
  assert.equal(await page.locator('.defense-opponents .panel').count(), 2);
  await assertTileRatios(page, `defense ${width} two opponents`);
  await page.setViewportSize({width: 900, height: width});
  await assertTileRatios(page, `defense ${width} landscape`);
  await page.setViewportSize({width, height: 900});
  await assertTileRatios(page, `defense ${width} portrait restored`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const bounds = await hand.evaluate(e => {
    const h = e.getBoundingClientRect();
    return [...e.querySelectorAll('.tile')].every(t => {
      const b = t.getBoundingClientRect();
      return b.left >= h.left - .1 && b.right <= h.right + .1;
    });
  });
  assert.ok(bounds, `defense ${width}: hand exceeds its container`);
  await page.screenshot({path: resolve(out, `defense-hand-${width}.png`), fullPage: true});
  await page.locator('[data-action="def-new"]').tap();
  assert.equal(await page.locator('.feedback').count(), 0);
  await assertTileRatios(page, `defense ${width} next question`);
}
