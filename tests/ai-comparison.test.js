import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../js/core/game.js';
import { parseTiles, counts } from '../js/core/tiles.js';
import { shanten } from '../js/core/shanten.js';
import { chooseTurn as oldTurn } from './fixtures/ai-v1.js';
import { chooseTurn, evaluateDiscards } from '../js/core/ai.js';
/** Regression against the frozen original policy, with the same public state.
 * This verifies the requested behavior, not statistical playing strength. */
test('valuable tenpai: baseline breaks it for genbutsu, new Hard can push', () => {
  const m = new Match({}, 8842), p = m.s.players[0];
  Object.assign(p, { hand: parseTiles('234456m234p78s66p1z'), level: 'hard', draws: 5, discards: 5 });
  p.drawn = p.hand.at(-1); m.s.interrupted = true;
  m.s.players[1].riichi = true; m.s.dead[4] = parseTiles('5p')[0];
  m.s.players[1].river = [{ id: parseTiles('2m')[0] + 1, seq: 0, riichi: true }];
  const old = oldTurn(m, 0), neo = chooseTurn(m, 0);
  assert.equal(old.kind, 'discard'); assert.equal(neo.kind, 'discard');
  assert.equal(shanten(counts(p.hand.filter(id => id !== old.tile))), 1);
  assert.equal(shanten(counts(p.hand.filter(id => id !== neo.tile))), 0);
  assert.equal(evaluateDiscards(m.s, 0, { riichiIds: m.riichiDiscards(0) })[0].mode, 'push');
});
