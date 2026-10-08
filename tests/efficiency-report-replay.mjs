import assert from 'node:assert/strict';
import { counts } from '../js/core/tiles.js';
import { rankDiscards, shanten, waits } from '../js/core/shanten.js';

/** Test-only external reader: parse the emitted TEXT, not formatter internals
 * or exercise history. Equal normal copies are interchangeable; red copies
 * remain distinct. Allocate each physical copy once across the whole record. */
function tokens(text) {
  assert.match(text, /^(?:[0-9]+[mpsz])+$/);
  return [...text.matchAll(/([0-9]+)([mpsz])/g)].flatMap(([, digits, suit]) =>
    [...digits].map(n => {
      assert.ok(suit === 'z' ? n >= '1' && n <= '7' : n >= '0' && n <= '9');
      return n + suit;
    }));
}
const type = code => 'mpsz'.indexOf(code[1]) * 9 + (code[0] === '0' ? 5 : +code[0]) - 1;
const codeOf = id => {
  const t = Math.floor(id / 4), red = [16, 52, 88].includes(id);
  return (red ? '0' : String(t % 9 + 1)) + 'mpsz'[Math.floor(t / 9)];
};
export const handCodes = hand => hand.map(codeOf).sort();

/** Independently reconstruct each visible hand, recalculate candidates through
 * the unchanged engine, and check the summary. This validates that omitted
 * per-turn hands/counts/candidate lists are in fact derivable from the export. */
export function replayEfficiencyReport(report) {
  assert.ok(report.startsWith('riichi-efficiency-report v2\n'));
  const initial = report.match(/^- 시작 손패\(13장\): (.+)$/m);
  assert.ok(initial, 'missing initial hand');
  const used = new Set();
  function allocate(code) {
    const t = type(code), five = t < 27 && t % 9 === 4;
    const copies = code[0] === '0' ? [0] : five ? [1, 2, 3] : [0, 1, 2, 3];
    const id = copies.map(n => t * 4 + n).find(n => !used.has(n));
    assert.notEqual(id, undefined, `fifth copy or duplicate red tile: ${code}`);
    used.add(id);
    return id;
  }
  const hand = tokens(initial[1]).map(allocate), river = [], snapshots = [];
  assert.equal(hand.length, 13);
  const initialCodes = handCodes(hand);
  const rawRows = report.split('\n').filter(line => /^\d+ \|/.test(line));
  let points = 0, maxPoints = 0, optimalCount = 0;
  for (const [index, line] of rawRows.entries()) {
    const cells = line.split(' | ');
    assert.equal(cells.length, 6, 'one fixed-width record per discard');
    const [turn, draw, discard, shantens, totals, bestDiscards] = cells;
    assert.equal(+turn, index + 1);
    assert.equal(hand.length, 13);
    assert.equal(tokens(draw).length, 1);
    assert.equal(tokens(discard).length, 1);
    hand.push(allocate(draw));
    assert.equal(hand.length, 14);
    const before = [...hand], known = counts([...hand, ...river]);
    const rows = rankDiscards(hand, 0, known), best = rows[0];
    const chosen = rows.find(r => r.t === type(discard));
    assert.ok(chosen, 'discard is absent from hand');
    const optimal = rows.filter(r => r.shanten === best.shanten && r.total === best.total).map(r => r.t);
    assert.deepEqual(shantens.split('/').map(Number), [chosen.shanten, best.shanten]);
    assert.deepEqual(totals.split('/').map(Number), [chosen.total, best.total]);
    const declared = bestDiscards.split(',');
    assert.ok(declared.every(c => /^[1-9][mpsz]$/.test(c)), 'optima are types, not red copies');
    assert.deepEqual(declared.map(type), optimal, 'co-optimal choices differ');
    points += chosen.shanten === best.shanten ? chosen.total : 0;
    maxPoints += Math.max(best.total, 1);
    optimalCount += Number(optimal.includes(chosen.t));
    const removed = hand.findIndex(id => codeOf(id) === discard);
    assert.ok(removed >= 0, 'wrong red/normal copy discarded');
    river.push(hand.splice(removed, 1)[0]);
    assert.equal(hand.length, 13);
    snapshots.push({ before, after: [...hand], known, rows, chosen, best, optimal, draw, discard });
  }
  const pending = [...report.matchAll(/^미타패 쯔모\((\d+)순\): (.+)$/gm)];
  assert.ok(pending.length <= 1);
  if (pending.length) {
    assert.equal(+pending[0][1], rawRows.length + 1);
    assert.equal(tokens(pending[0][2]).length, 1);
    hand.push(allocate(pending[0][2]));
  }
  const final = report.match(/^- (현재|최종) 손패\((13|14)장\): (.+)$/m);
  assert.ok(final);
  assert.equal(+final[2], hand.length);
  assert.deepEqual(tokens(final[3]).sort(), handCodes(hand));
  const summary = report.match(/^- 결과: (.+) \/ (\d+)순 \/ (\d+)\/(\d+)점 \/ 최적 (\d+)\/(\d+)회$/m);
  assert.ok(summary, 'missing summary');
  assert.deepEqual(summary.slice(2).map(Number), [rawRows.length, points, maxPoints, optimalCount, rawRows.length]);
  const state = summary[1];
  if (state === '텐파이' || state === '패산 소진') {
    assert.equal(pending.length, 0);
    assert.equal(final[1], '최종');
  } else {
    assert.equal(final[1], '현재');
    assert.equal(state, pending.length ? '진행 중(타패 대기)' : '진행 중(쯔모 대기)');
  }
  const waitLine = report.match(/^- 대기\(구조적·미확인\): (.+)$/m);
  if (state === '텐파이') {
    assert.equal(shanten(counts(hand)), 0);
    assert.ok(waitLine);
    const known = counts([...hand, ...river]);
    const expected = waits(counts(hand)).map(t => [t, Math.max(0, 4 - known[t])]);
    const actual = waitLine[1].split(',').map(s => {
      const match = s.match(/^([1-9][mpsz])\((\d+)장\)$/);
      assert.ok(match);
      return [type(match[1]), +match[2]];
    });
    assert.deepEqual(actual, expected, 'structural waits or unseen counts differ');
  } else assert.equal(waitLine, null, 'non-tenpai report invents winning waits');
  if (state === '패산 소진') {
    assert.equal(hand.length + river.length, 136);
    assert.ok(shanten(counts(hand)) > 0);
  }
  return { initialCodes, hand, river, snapshots, pending: pending[0]?.[2] ?? null,
    points, maxPoints, optimalCount, state };
}
