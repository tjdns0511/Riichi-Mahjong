import test from 'node:test';
import assert from 'node:assert/strict';
import { newEfficiency, answerEfficiency, nextEfficiency } from '../js/core/efficiency.js';
import { rankDiscards } from '../js/core/shanten.js';
import { typeOf } from '../js/core/tiles.js';
import { efficiencyView } from '../js/ui/trainers.js';

/** Draw separation is presentation metadata: it must not change the hand,
 * deterministic wall, discard analysis, or physical tile conservation. */
test('efficiency draw marker follows the physical tile through discard and next draw', () => {
  const e = newEfficiency(101), original = structuredClone(e);
  assert.ok(e.hand.includes(e.drawn));
  const html = efficiencyView(e);
  assert.deepEqual(e, original, 'rendering must not sort or mutate stored state');
  const buttons = [...html.matchAll(/<button class="tile [^"]*" data-t="\d+" data-id="(\d+)"[^>]*data-action="eff-answer"[^>]*>/g)];
  assert.equal(buttons.length, 14);
  assert.equal(+buttons.at(-1)[1], e.drawn);
  assert.match(buttons.at(-1)[0], /drawn/);
  assert.match(buttons.at(-1)[0], /쯔모패/);
  const choice = rankDiscards(e.hand).find(row => row.shanten > 0);
  assert.ok(answerEfficiency(e, choice.t));
  assert.equal(e.hand.length, 13);
  assert.equal(e.drawn, null);
  assert.equal(e.history[0].drawn, original.drawn);
  const expectedDraw = e.wall[0];
  assert.ok(nextEfficiency(e));
  assert.equal(e.drawn, expectedDraw);
  assert.equal(e.hand.length, 14);
  assert.deepEqual([...e.hand, ...e.river, ...e.wall].sort((a,b) => a-b),
    [...original.hand, ...original.wall].sort((a,b) => a-b));
  assert.equal(nextEfficiency(e), false);
});

test('efficiency can discard the marked draw without making duplicate physical tiles', () => {
  const e = newEfficiency(101), drawn = e.drawn;
  assert.ok(answerEfficiency(e, typeOf(drawn)));
  assert.equal(e.drawn, null);
  assert.equal(e.river.length, 1);
  assert.equal(new Set([...e.hand, ...e.river, ...e.wall]).size, 136);
});
