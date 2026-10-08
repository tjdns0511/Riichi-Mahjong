import test from 'node:test';
import assert from 'node:assert/strict';
import { newEfficiency, answerEfficiency, nextEfficiency } from '../js/core/efficiency.js';
import { formatEfficiencyReport } from '../js/core/efficiency-report.js';
import { rankDiscards } from '../js/core/shanten.js';
import { counts, parseTiles, shuffled, typeOf } from '../js/core/tiles.js';
import { efficiencyView } from '../js/ui/trainers.js';
import { handCodes, replayEfficiencyReport } from './efficiency-report-replay.mjs';

/** Fixtures still use production transition/scoring functions and a physical
 * 136-tile pool. Only the opening hand and test draw order are prescribed. */
function exercise(text) {
  const e = newEfficiency(100);
  e.hand = parseTiles(text); e.drawn = e.hand.at(-1);
  e.wall = shuffled(9).filter(id => !e.hand.includes(id));
  return e;
}
function choices(e) { return rankDiscards(e.hand, 0, counts([...e.hand, ...e.river])); }
function complete(seed, choose) {
  const e = newEfficiency(seed);
  do { answerEfficiency(e, choose(choices(e), e).t); } while (nextEfficiency(e));
  return e;
}
/** Compare every reconstructed state and all DERIVABLE candidate data with the
 * frozen engine history, rather than checking only the exported final hand. */
function verify(e) {
  const report = formatEfficiencyReport(e), replay = replayEfficiencyReport(report);
  assert.deepEqual(handCodes(replay.hand), handCodes(e.hand));
  assert.deepEqual(replay.river.map(id => handCodes([id])[0]), e.river.map(id => handCodes([id])[0]));
  assert.equal(replay.points, e.points); assert.equal(replay.maxPoints, e.maxPoints);
  assert.equal(replay.snapshots.length, e.history.length);
  for (const [i, r] of e.history.entries()) {
    const s = replay.snapshots[i];
    assert.deepEqual(handCodes(s.before), handCodes(r.hand));
    assert.deepEqual(handCodes(s.after), handCodes(r.hand.filter(id => id !== e.river[i])));
    assert.deepEqual(s.known, r.known, 'public counts must not use later draws');
    assert.deepEqual(s.rows, r.rows, 'omitted candidate details must be reproducible');
    assert.deepEqual(s.optimal, r.optimal);
    assert.equal(s.draw, handCodes([r.drawn])[0]);
  }
  return { report, replay };
}

test('new report restores initial 13 tiles and applies pending first draw only once, without wall access', () => {
  const e = newEfficiency(101), original = structuredClone(e);
  const guarded = new Proxy(e, { get(target, key) {
    assert.notEqual(key, 'wall', 'export must not read the future tile pool');
    return target[key];
  } });
  const report = formatEfficiencyReport(guarded), replay = replayEfficiencyReport(report);
  assert.equal(replay.initialCodes.length, 13);
  assert.deepEqual(replay.initialCodes, handCodes(e.hand.filter(id => id !== e.drawn)));
  assert.deepEqual(handCodes(replay.hand), handCodes(e.hand));
  assert.equal(replay.snapshots.length, 0); assert.equal(replay.points, 0);
  assert.equal(replay.maxPoints, 0); assert.equal(replay.pending, handCodes([e.drawn])[0]);
  assert.match(report, /점수: 선택·최적 샨텐이 같으면 선택 유효패, 다르면 0/);
  assert.match(report, /max\(최적 유효패,1\)/);
  assert.match(report, /타패 후 손패·누적 버림패\(이번 타패 포함\)/);
  assert.match(report, /0=적5/);
  assert.doesNotMatch(report, /NaN|undefined|Infinity/);
  assert.deepEqual(e, original);
  assert.equal(formatEfficiencyReport({ ...e, wall: [] }), report);
});

test('chronological rows retain public evaluation across new draws, exports do not change state', () => {
  const e = newEfficiency(91);
  answerEfficiency(e, choices(e)[0].t);
  const previous = verify(e).report.split('\n').find(line => /^1 \|/.test(line));
  const frozen = structuredClone(e.history);
  assert.ok(nextEfficiency(e));
  const pending = verify(e);
  assert.match(pending.report, /미타패 쯔모\(2순\)/);
  assert.equal(pending.replay.snapshots.length, 1);
  assert.deepEqual(e.history, frozen);
  answerEfficiency(e, choices(e)[0].t);
  const original = structuredClone(e), { report } = verify(e);
  assert.equal(report.split('\n').find(line => /^1 \|/.test(line)), previous);
  assert.deepEqual(e, original);
  assert.equal(formatEfficiencyReport(e), report, 'same snapshot is deterministic');
  assert.equal((report.match(/^\d+ \|/gm) ?? []).length, 2);
  assert.doesNotMatch(report, /타패 전 손패|타패 후 손패 \(|후보별 비교|당시 확인된 매수|이번 점수/);
  e.rows = [{ total: 999999 }]; e.twoStep = true;
  assert.equal(formatEfficiencyReport(e), report, 'optional two-step view cannot rewrite the grade');
});

for (const [name, text, discard] of [
  ['standard', '123m123789p78s22z4s', 21],
  ['seven pairs', '1122m3344p5566s1z9m', 8],
  ['thirteen orphans', '19m19p19s1234567z5m', 4],
]) test(`${name} final report reproduces hand, waits and unseen counts`, () => {
  const e = exercise(text); answerEfficiency(e, discard);
  assert.ok(e.ended);
  const { report, replay } = verify(e);
  assert.equal(replay.state, '텐파이'); assert.equal(replay.pending, null);
  assert.match(report, /최종 손패\(13장\)/);
  for (const w of e.final.waits) {
    const code = handCodes([w.t * 4 + 1])[0];
    assert.ok(report.includes(`${code}(${w.left}장)`));
  }
  assert.match(efficiencyView(e, report), /data-action="eff-export"/);
});

for (const redDraw of [true, false]) test(`four identical fives: ${redDraw ? 'red' : 'normal'} first draw removes exactly one copy`, () => {
  const e = exercise('0555m123p456s11z78s');
  e.drawn = redDraw ? 16 : 18;
  const initial = verify(e).replay.initialCodes;
  assert.equal(initial.filter(code => ['0m', '5m'].includes(code)).length, 3);
  assert.equal(initial.includes('0m'), !redDraw);
  answerEfficiency(e, 4); // The engine discards the first physical copy: red 5m.
  const { report, replay } = verify(e);
  assert.equal(replay.snapshots[0].draw, redDraw ? '0m' : '5m');
  assert.equal(replay.snapshots[0].discard, '0m');
  assert.equal(handCodes(replay.hand).includes('0m'), false);
  assert.match(report, /최적 후보의 5는 적5 포함/);
});

test('co-optimal types are all emitted while a worse-shanten equal-ukeire choice earns zero', () => {
  const good = newEfficiency(91), rows = choices(good);
  const ties = rows.filter(r => r.shanten === rows[0].shanten && r.total === rows[0].total);
  assert.ok(ties.length > 1);
  answerEfficiency(good, ties.at(-1).t);
  assert.equal(verify(good).replay.optimalCount, 1);
  const e = newEfficiency(161), candidates = choices(e);
  const bad = candidates.find(r => r.shanten > candidates[0].shanten && r.total === candidates[0].total);
  assert.ok(bad, 'real equal-count counterexample must exist');
  answerEfficiency(e, bad.t);
  const { report, replay } = verify(e);
  assert.match(report, /\| 3\/2 \| 19\/19 \|/);
  assert.equal(replay.points, 0); assert.equal(replay.maxPoints, 19);
  assert.equal(replay.optimalCount, 0);
});

test('more ukeire never hides a worse-shanten grade', () => {
  const e = newEfficiency(91), rows = choices(e);
  const bad = rows.find(r => r.shanten > rows[0].shanten && r.total > rows[0].total);
  assert.ok(bad); answerEfficiency(e, bad.t);
  const { replay } = verify(e);
  assert.equal(replay.points, 0); assert.equal(replay.optimalCount, 0);
});

test('zero-left structural waits remain visible and a zero best total contributes denominator one', () => {
  const e = exercise('123m123789p47s22z6s');
  const ordered = [...e.wall.filter(id => typeOf(id) === 23),
    ...e.wall.filter(id => typeOf(id) === 26), e.wall.find(id => typeOf(id) === 25)];
  e.wall = [...ordered, ...e.wall.filter(id => !ordered.includes(id))];
  for (let turn = 0; turn < 8; turn++) {
    assert.ok(answerEfficiency(e, typeOf(e.drawn)));
    assert.equal(e.ended, false); assert.ok(nextEfficiency(e));
  }
  answerEfficiency(e, 21);
  assert.ok(e.ended); assert.equal(e.history.at(-1).best.total, 0);
  assert.equal(e.history.at(-1).maximum, 1);
  const { report } = verify(e);
  assert.match(report, /대기\(구조적·미확인\): 6s\(0장\),9s\(0장\)/);
});

test('24 fixed-seed mixed-choice exercises replay all 14/13-tile states and historical candidates', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const e = complete(seed, (rows, state) => state.turn % 4 === 0 ? rows.at(-1) : rows[0]);
    const before = structuredClone(e);
    verify(e);
    assert.deepEqual(e, before);
  }
});

test('123-turn non-tenpai wall exhaustion stays one row per turn without invented waits', () => {
  const e = complete(2, rows => rows.at(-1));
  assert.equal(e.ended, false); assert.equal(e.wall.length, 0);
  assert.equal(e.history.length, 123);
  const { report, replay } = verify(e);
  assert.equal(replay.state, '패산 소진');
  assert.equal(replay.hand.length, 13);
  assert.doesNotMatch(report, /^- 대기\(구조적|^미타패 쯔모\(/m);
  const rows = report.split('\n').filter(line => /^\d+ \|/.test(line));
  assert.equal(rows.length, e.history.length);
  assert.ok(rows.every(line => line.length < 160));
  assert.ok(report.split('\n').length <= e.history.length + 20, 'per-turn explanation growth');
});

test('a missing first draw is rejected instead of guessing the initial thirteen tiles', () => {
  const e = newEfficiency(2); e.drawn = null;
  const before = structuredClone(e);
  assert.throws(() => formatEfficiencyReport(e), /첫 쯔모 기록/);
  assert.deepEqual(e, before);
});

test('preview safely escapes report text and is absent until requested', () => {
  const e = newEfficiency(2);
  assert.doesNotMatch(efficiencyView(e), /id="eff-report"/);
  const html = efficiencyView(e, '</textarea><script>bad()</script>');
  assert.match(html, /id="eff-report" readonly/);
  assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
