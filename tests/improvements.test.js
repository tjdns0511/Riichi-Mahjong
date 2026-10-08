import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTiles, counts, typeOf, shuffled } from '../js/core/tiles.js';
import { Match, furiten, publicScoreContext } from '../js/core/game.js';
import { analyzeWaits, previewDiscard, beforeDraw } from '../js/core/hand-analysis.js';
import { rankDiscards, shanten } from '../js/core/shanten.js';
import { chooseTurn, evaluateDiscards, evaluateCalls, evaluateKan } from '../js/core/ai.js';
import { newEfficiency, answerEfficiency, nextEfficiency } from '../js/core/efficiency.js';
import { selectionAnalysis, furitenPanel } from '../js/ui/furiten.js';
import { efficiencyView } from '../js/ui/trainers.js';

const hand = parseTiles;
function player(text, overrides = {}) {
  const h = hand(text);
  return { hand: h, melds: [], river: [], drawn: h.length % 3 === 2 ? h.at(-1) : null,
    forbidden: [], score: 25000, name: '테스트', kind: 'human', level: 'hard',
    riichi: false, tempFuriten: false, riichiFuriten: false, discards: 4, draws: 5, ...overrides };
}
function fixture(text, overrides = {}) {
  const m = new Match({}, 8842);
  m.s.players[0] = player(text, overrides); m.s.current = 0; m.s.interrupted = true;
  return m;
}
const context = { seat: 0, round: 0, dealer: true, aka: false };
const cause6 = { id: 23 * 4 + 3, called: true };
const standard = '123m123789p78s22z4s';
function preview(p, t = 21) {
  return previewDiscard(p, p.hand.find(id => typeOf(id) === t), context,
    counts([...p.hand, ...p.river.map(d => d.id)]));
}

test('4s preview: 6s cause bars BOTH 6s and 9s ron, but permits yaku tsumo', () => {
  const a = preview(player(standard, { river: [cause6] }));
  assert.deepEqual(a.waits.map(w => w.t), [23, 26]);
  assert.deepEqual(a.furiten.causeTypes, [23]);
  assert.deepEqual(a.waits.map(w => w.left), [3, 4]); assert.equal(a.total, 7);
  assert.ok(a.waits.every(w => w.ronBlocked && !w.ronAllowed && w.tsumoAllowed));
  const html = furitenPanel(a);
  assert.match(html, /론 불가능한 대기패: 6삭·9삭/);
  assert.match(html, /furiten-causes/); assert.match(html, /data-t="23"/);
  assert.equal((html.match(/쯔모 화료 가능/g) ?? []).length, 2);
});
test('prospective discard itself causes furiten', () => {
  const a = preview(player('123m123789p78s22z6s'), 23);
  assert.equal(a.transition, 'new'); assert.deepEqual(a.furiten.causeTypes, [23]);
  assert.ok(a.waits.every(w => !w.ronAllowed));
});
test('normal tenpai and non-tenpai have no spurious warnings', () => {
  const a = preview(player(standard));
  assert.equal(a.furiten.any, false); assert.ok(a.waits.every(w => w.ronAllowed));
  const b = preview(player('13579m135p248s123z'), 27);
  assert.ok(b.shanten > 0); assert.equal(furitenPanel(b), '');
});
test('multiple called-away and exhausted causes still ban all structural waits', () => {
  const p = player(standard, { river: [cause6, { id: 26 * 4 + 2 }] });
  const known = counts(p.hand); known[23] = 4; known[26] = 4;
  const a = previewDiscard(p, p.drawn, context, known);
  assert.deepEqual(a.furiten.causeTypes, [23, 26]);
  assert.equal(a.total, 0); assert.equal(a.waits.length, 2);
  assert.match(furitenPanel(a), /미확인 패 0장/);
});
test('own draw clears temporary but never riichi furiten; causes coexist', () => {
  const m = fixture('123m123789p78s22z', { drawn: null, tempFuriten: true, riichi: true, riichiFuriten: true });
  const a = analyzeWaits(m.s.players[0], context);
  assert.ok(a.furiten.temporary && a.furiten.riichi);
  assert.ok(a.waits.every(w => !w.ronAllowed && w.tsumoAllowed));
  m.draw(0);
  const f = furiten(beforeDraw(m.s.players[0]));
  assert.equal(f.temporary, false); assert.equal(f.riichi, true);
});
test('preview pure, selection updates, and actual engine result agrees', () => {
  const m = fixture(standard, { river: [cause6] }), p = m.s.players[0];
  const original = structuredClone(m.s), a = selectionAnalysis(m.s, 0, p.drawn);
  const b = selectionAnalysis(m.s, 0, p.hand[0]);
  assert.notDeepEqual(a.waits.map(w => w.t), b.waits.map(w => w.t));
  assert.deepEqual(m.s, original);
  m.dispatch({ kind: 'discard', player: 0, tile: p.drawn });
  assert.deepEqual(furiten(m.s.players[0]), a.furiten);
});
test('new and existing furiten are differentiated', () => {
  const p = player(standard, { river: [cause6] });
  assert.equal(preview(p).transition, 'continues');
  p.river = []; assert.equal(preview(p).transition, 'none');
  p.tempFuriten = true; assert.equal(preview(p).transition, 'continues');
});
test('open no-yaku tsumo is not mistaken for a legal win', () => {
  const p = player('456p789s11z78m', { melds: [{ kind: 'chi', tiles: hand('123m') }], river: [{ id: 5 * 4 + 3 }] });
  const a = analyzeWaits(p, { seat: 1, round: 0 });
  assert.ok(a.waits.length); assert.ok(a.furiten.any);
  assert.ok(a.waits.every(w => !w.tsumoAllowed && w.noTsumoYaku && w.ronBlocked));
  assert.match(furitenPanel(a), /역 없음: 쯔모 불가/);
});
test('furiten tsumo is an actual legal engine action', () => {
  const m = fixture('123m123789p78s22z6s', { river: [cause6] });
  assert.ok(m.score(0, m.s.players[0].drawn, true));
  m.dispatch({ kind: 'tsumo', player: 0 }); assert.equal(m.s.result.kind, 'win');
});

function exercise(text) {
  const e = newEfficiency(100); e.hand = hand(text);
  e.wall = shuffled(9).filter(id => !e.hand.includes(id)); return e;
}
for (const [name, text, t] of [
  ['standard', standard, 21], ['seven pairs', '1122m3344p5566s1z9m', 8],
  ['thirteen orphans', '19m19p19s1234567z5m', 4],
]) test(name + ' trainer immediately ends at 13-tile tenpai, blocks draw/repeat', () => {
  const e = exercise(text), wall = [...e.wall];
  assert.equal(answerEfficiency(e, t), true);
  assert.equal(e.hand.length, 13); assert.equal(shanten(counts(e.hand)), 0);
  assert.ok(e.ended && e.final.waits.length); assert.deepEqual(e.wall, wall);
  const ended = structuredClone(e);
  assert.equal(nextEfficiency(e), false); assert.equal(answerEfficiency(e, t), false);
  assert.deepEqual(e, ended);
  const html = efficiencyView(e);
  assert.match(html, /텐파이 달성!/); assert.match(html, /타패별 분석/);
  assert.doesNotMatch(html, /data-action="eff-next"/);
});
test('one-shanten continues and records public counts without hindsight', () => {
  const e = exercise('123m123p78s22z3456m');
  const r = rankDiscards(e.hand).find(r => r.shanten === 1); assert.ok(r);
  const before = [...e.hand], future = [...e.wall];
  answerEfficiency(e, r.t);
  assert.equal(e.ended, false); assert.equal(e.hand.length, 13);
  assert.deepEqual(e.wall, future); assert.deepEqual(e.history[0].hand, before);
  assert.deepEqual(e.history[0].known, counts(before));
  const snapshot = structuredClone(e.history);
  assert.equal(nextEfficiency(e), true); assert.equal(e.hand.length, 14);
  assert.deepEqual(e.history, snapshot); assert.equal(nextEfficiency(e), false);
});
test('all tied optima earn equal scores, shanten losses never compare raw ukeire', () => {
  let e, rows, ties;
  for (let seed = 1; seed < 100; seed++) {
    e = newEfficiency(seed); rows = rankDiscards(e.hand);
    ties = rows.filter(r => r.shanten === rows[0].shanten && r.total === rows[0].total);
    if (ties.length > 1) break;
  }
  assert.ok(ties.length > 1);
  for (const tied of ties) {
    const copy = structuredClone(e); answerEfficiency(copy, tied.t);
    assert.deepEqual(copy.history[0].optimal, ties.map(r => r.t));
    assert.equal(copy.points, rows[0].total); assert.equal(copy.maxPoints, rows[0].total || 1);
  }
  const bad = rows.find(r => r.shanten > rows[0].shanten); assert.ok(bad);
  answerEfficiency(e, bad.t); assert.equal(e.points, 0); assert.equal(e.history[0].loss.ukeire, null);
});
test('known discards, cumulative score denominator and retry reset are correct', () => {
  const e = newEfficiency(91);
  for (let i = 0; i < 5 && !e.ended; i++) {
    const known = counts([...e.hand, ...e.river]), rows = rankDiscards(e.hand, 0, known);
    answerEfficiency(e, rows[0].t); assert.deepEqual(e.history.at(-1).known, known);
    assert.equal(e.points, e.history.reduce((n, r) => n + r.earned, 0));
    assert.equal(e.maxPoints, e.history.reduce((n, r) => n + r.maximum, 0));
    nextEfficiency(e);
  }
  const fresh = newEfficiency(91);
  assert.equal(fresh.points, 0); assert.equal(fresh.maxPoints, 0);
  assert.equal(fresh.history.length, 0); assert.equal(fresh.ended, false);
});
test('AI values normal two-sided ron access over equal furiten tsumo-only waits', () => {
  const m = fixture(standard), p = m.s.players[0], known = counts(p.hand);
  known[23] = 1; // Same public visibility: one 6s is visible in both cases.
  const normal = evaluateDiscards(m.s, 0, { known }).find(r => r.t === 21);
  p.river = [cause6];
  const f = evaluateDiscards(m.s, 0, { known }).find(r => r.t === 21);
  assert.equal(normal.analysis.ronTotal, 7); assert.equal(f.analysis.ronTotal, 0);
  assert.equal(f.analysis.tsumoTotal, 7); assert.ok(f.cost > normal.cost);
  assert.ok(Number.isFinite(f.cost));
});
test('AI handles furiten tanki and permanent riichi furiten as tsumo-only', () => {
  const m = fixture('1122m3344p5566s1z9m', { riichiFuriten: true });
  const a = evaluateDiscards(m.s, 0).find(r => r.t === 8).analysis;
  assert.equal(a.waits.length, 1); assert.ok(a.waits[0].shapes.includes('단기'));
  assert.equal(a.ronTotal, 0); assert.ok(a.tsumoTotal > 0);
});
test('Hard pushes valuable tenpai into riichi but folds weak distant hands late', () => {
  const m = fixture('234456m234p78s66p1z');
  m.s.players[1].riichi = true; m.s.dead[4] = hand('5p')[0];
  const rows = evaluateDiscards(m.s, 0, { riichiIds: m.riichiDiscards(0) });
  assert.equal(rows[0].shanten, 0); assert.equal(rows[0].mode, 'push');
  const weak = fixture('13579m135p248s123z', { discards: 14 });
  weak.s.players[1].riichi = true;
  const safe = weak.s.players[0].hand[0]; weak.s.players[1].river = [{ id: safe + 1 }];
  const fold = evaluateDiscards(weak.s, 0)[0];
  assert.equal(fold.mode, 'fold'); assert.equal(fold.danger, 0);
});
test('no-yaku calls rejected; yakuhai 1-shanten call reaches legal tenpai', () => {
  const m = fixture('456p789s11z78m45m2p'), tile = hand('9m')[0];
  m.s.phase = 'response'; m.s.pending = { source: 3, tile, options: { 0: m.callOptions(0, 3, tile) } };
  const bad = evaluateCalls(m, 0).filter(c => c.kind === 'chi');
  assert.ok(bad.length); assert.ok(bad.every(c => !c.approve));
  // 1s is an isolated tile; 9s would already complete 789s and start at tenpai.
  const n = fixture('55z123m456p78s22p1s'), call = hand('5z')[0] + 2;
  n.s.phase = 'response'; n.s.pending = { source: 3, tile: call, options: { 0: n.callOptions(0, 3, call) } };
  const good = evaluateCalls(n, 0).find(c => c.kind === 'pon' && c.approve);
  assert.ok(good); assert.equal(good.before, 1); assert.equal(good.after, 0);
  assert.ok(!n.s.pending.options[0][good.index].forbidden.includes(good.best.t));
});
test('late and illegal riichi kans are not selected', () => {
  const m = fixture('1111m234p678s22z78p'), k = m.kanOptions(0)[0]; assert.ok(k);
  m.s.live.length = 8;
  assert.equal(evaluateKan(m.s, 0, k, evaluateDiscards(m.s, 0)[0]).approve, false);
  assert.notEqual(chooseTurn(m, 0).kind, 'kan');
  m.s.players[0].riichi = true; m.s.players[0].drawn = m.s.players[0].hand.at(-1);
  assert.equal(m.kanOptions(0).length, 0); assert.notEqual(chooseTurn(m, 0).kind, 'kan');
});
test('added kan is distinguished and rejected against riichi', () => {
  const pon = hand('555z'), fourth = 31 * 4;
  const m = fixture('123m456p78s22p', { melds: [{ kind: 'pon', tiles: pon }], drawn: fourth });
  m.s.players[0].hand.push(fourth); m.s.players[1].riichi = true;
  const k = m.kanOptions(0).find(k => k.kind === 'kakan'); assert.ok(k);
  assert.equal(evaluateKan(m.s, 0, k, evaluateDiscards(m.s, 0)[0]).approve, false);
});
test('same state and seed reproduce decisions; hidden information access throws', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const m = new Match({ seats: Array.from({ length: 4 }, () => ({ kind: 'ai', level })) }, 412);
    const expected = chooseTurn(m, 0), s = m.s;
    for (let i = 1; i < 4; i++) Object.defineProperty(s.players[i], 'hand', { get() { throw Error('hidden hand'); } });
    s.live = new Proxy(s.live, { get(t, k) { if (k !== 'length') throw Error('hidden wall'); return t[k]; } });
    s.dead = new Proxy(s.dead, { get(t, k) { if (k !== '4') throw Error('hidden indicator'); return t[k]; } });
    assert.deepEqual(chooseTurn(m, 0), expected);
  }
});
test('40 fixed hands respect desktop CPU latency budget, not physical Android benchmark', () => {
  const samples = [];
  for (let seed = 1; seed <= 40; seed++) {
    const m = new Match({ seats: Array.from({ length: 4 }, () => ({ kind: 'ai', level: 'hard' })) }, seed);
    const start = performance.now(); chooseTurn(m, 0); samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  assert.ok(samples.at(-1) < 500, 'latency exceeds 500ms guard');
  console.log('AI desktop latency p95=' + samples[37].toFixed(1) + 'ms max=' + samples.at(-1).toFixed(1) + 'ms');
});

test('legal riichi ankan preserves the engine wait set and remains optional', () => {
  const m = fixture('1111m234p678s22z78p', { riichi: true });
  const p = m.s.players[0]; p.drawn = p.hand.find(id => typeOf(id) === 0);
  const legal = m.kanOptions(0); assert.ok(legal.some(k => k.kind === 'ankan'));
  const before = furiten(beforeDraw(p)).waits;
  const k = legal[0], after = { ...p, hand: p.hand.filter(id => !k.tiles.includes(id)), melds: [{ kind: 'ankan', tiles: k.tiles }], drawn: null };
  assert.deepEqual(furiten(after).waits, before);
  m.s.live.length = 3; assert.notEqual(chooseTurn(m, 0).kind, 'kan');
});
test('shared furiten predicate clears discard cause when waiting shape changes', () => {
  const p = player('123m123789p78s22z', { river: [cause6], drawn: null });
  assert.equal(furiten(p).discard, true);
  p.hand = hand('123m123789p45s22z');
  assert.deepEqual(furiten(p).waits, [20, 23]); // still includes 6s
  assert.equal(furiten(p).discard, true);
  p.hand = hand('123m123789p12s22z');
  assert.deepEqual(furiten(p).waits, [20]); assert.equal(furiten(p).discard, false);
});

test('open yakuless structural tenpai is not preferred to a viable one-shanten hand in attack', () => {
  const m = fixture('5577m789p6777s', { melds: [{ kind: 'pon', tiles: hand('444m') }], discards: 6 });
  const rows = evaluateDiscards(m.s, 0);
  assert.ok(rows.some(r => r.shanten === 0 && r.noYaku));
  assert.equal(rows[0].noYaku, false); assert.equal(rows[0].shanten, 1);
});
