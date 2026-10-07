import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTiles,
  counts,
  typeOf,
  shuffled,
  nextDora,
  isRed,
  validTiles,
} from '../js/core/tiles.js';
import {
  shanten,
  shantenDetails,
  decompositions,
  waits,
  rankDiscards,
  twoStep,
} from '../js/core/shanten.js';
import { scoreHand, payments, settle } from '../js/core/scoring.js';
import { Match, furiten, playerWaits, visibleCounts } from '../js/core/game.js';
import { chooseTurn, chooseResponse, defenseRows, tileDanger } from '../js/core/ai.js';
import { solveAllLast, ranking } from '../js/core/all-last.js';

const hand = (s) => parseTiles(s),
  c = (s) => counts(hand(s));
/** Score fixtures keep the winning physical tile explicit, with red disabled. */
function score(s, { win, tsumo = false, seat = 1, round = 0, ...ctx } = {}, melds = []) {
  const h = hand(s),
    id = win === undefined ? h.at(-1) : h.find((id) => typeOf(id) === typeOf(hand(win)[0]));
  return scoreHand(h, melds, {
    winTile: id,
    tsumo,
    seat,
    round,
    dealer: seat === 0,
    aka: false,
    ...ctx,
  });
}
const names = (s) => s?.yaku.map((y) => y.name) ?? [];

test('136 unique physical tiles and three red fives; deterministic Fisher–Yates', () => {
  const w = shuffled(9);
  assert.equal(new Set(w).size, 136);
  assert.deepEqual(counts(w), Array(34).fill(4));
  assert.equal(w.filter((id) => isRed(id)).length, 3);
  assert.deepEqual(w, shuffled(9));
  assert.notDeepEqual(w, shuffled(10));
});
test('notation rejects invalid honors, duplicate reds and fifth copies', () => {
  assert.throws(() => hand('8z'));
  assert.throws(() => hand('11111m'));
  assert.throws(() => hand('00m'));
  assert.throws(() => hand('<script>'));
  assert.equal(hand('0555m').length, 4);
});
test('dora cycles never cross suits or honor families', () => {
  assert.equal(nextDora(8), 0);
  assert.equal(nextDora(17), 9);
  assert.equal(nextDora(26), 18);
  assert.equal(nextDora(30), 27);
  assert.equal(nextDora(33), 31);
});
test('standard shanten and complete shapes', () => {
  assert.equal(shanten(c('123456m234p678s22p')), -1);
  assert.equal(shanten(c('123456m234p678s2p')), 0);
  assert.equal(shanten(c('12345m234p678s22p')), 0);
});
test('chiitoitsu needs seven distinct pairs, not a quad counted twice', () => {
  assert.equal(shantenDetails(c('1122m3344p5566s77z')).chiitoi, -1);
  assert.equal(shantenDetails(c('1111m2233p4455s66z')).chiitoi, 1);
  assert.equal(
    decompositions(c('1111m2233p4455s66z')).filter((x) => x.kind === 'chiitoi').length,
    0
  );
});
test('kokushi 13-sided wait and missing terminal wait', () => {
  assert.equal(shantenDetails(c('19m19p19s1234567z')).kokushi, 0);
  assert.equal(waits(c('19m19p19s1234567z')).length, 13);
  assert.deepEqual(waits(c('119m19p19s123456z')), [33]);
});
test('special shapes unavailable after any declared meld', () => {
  assert.equal(shantenDetails(c('1122m3344p55s'), 1).chiitoi, Infinity);
  assert.equal(shantenDetails(c('1122m3344p55s'), 1).kokushi, Infinity);
});
test('ambiguous hand preserves standard and chiitoitsu decompositions', () => {
  const d = decompositions(c('11223344556677m'));
  assert.ok(d.some((x) => x.kind === 'chiitoi'));
  assert.ok(d.filter((x) => x.kind === 'standard').length > 1);
});
test('own quadruple cannot create a fictional fifth-copy wait', () => {
  const cc = c('1111m234p567s789s');
  assert.ok(!waits(cc).includes(0));
});
test('discarded tile remains known for ukeire counts', () => {
  const h = hand('123456m234p678s22p'),
    known = counts(h),
    rows = rankDiscards(h);
  const r = rows.find((x) => x.t === 10);
  assert.equal(r.tiles.find((x) => x.t === 10).left, 1);
  assert.equal(known[10], 3);
});
test('pinfu tsumo is 20 fu; closed ron is 30 fu', () => {
  const t = score('123456m234p678s22p', { win: '6m', tsumo: true });
  assert.ok(names(t).includes('핑후'));
  assert.equal(t.fu, 20);
  const r = score('123456m234p678s22p', { win: '6m' });
  assert.equal(r.fu, 30);
  assert.equal(r.ron, 1000);
});
test('edge and closed waits reject pinfu and add fu', () => {
  const edge = score('123456m234p678s22p', { win: '3m', riichi: true });
  assert.ok(!names(edge).includes('핑후'));
  assert.equal(edge.fu, 40);
  const closed = score('123456m234p678s22p', { win: '5m', riichi: true });
  assert.equal(closed.wait, '간짱');
  assert.equal(closed.fu, 40);
});
test('double wind pair gives 4 fu', () => {
  const r = score('123456m234p678s11z', { win: '6m', seat: 0, round: 0, riichi: true });
  assert.ok(r.fuItems.some((x) => x.name === '역패 머리' && x.fu === 4));
  assert.equal(r.fu, 40);
});
test('seven pairs is always 25 fu and stacks with honroutou', () => {
  const r = score('1199m1199p1199s11z', { tsumo: true });
  assert.equal(r.fu, 25);
  assert.ok(names(r).includes('치또이츠'));
  assert.ok(names(r).includes('혼노두'));
});
test('dora alone never provides a yaku', () => {
  const h = hand('123m456p678s22z'),
    m = { kind: 'chi', tiles: hand('789m'), from: 2 };
  const r = scoreHand(h, [m], {
    winTile: h.at(-1),
    seat: 1,
    round: 0,
    doraIndicators: hand('1z'),
    aka: false,
  });
  assert.equal(r, null);
});
test('ura requires riichi; red and dora count physical meld tiles', () => {
  const a = score('123456m234p678s22p', {
    win: '6m',
    tsumo: true,
    doraIndicators: hand('1p'),
    uraIndicators: hand('3p'),
  });
  assert.ok(names(a).includes('도라'));
  assert.ok(!names(a).includes('우라도라'));
  const b = score('123456m234p678s22p', { win: '6m', riichi: true, uraIndicators: hand('3p') });
  assert.ok(names(b).includes('우라도라'));
});
test('ryanpeikou excludes iipeikou and scores best ambiguous decomposition', () => {
  const r = score('11223344556677m', { win: '7m' });
  assert.ok(names(r).includes('량페코'));
  assert.ok(!names(r).includes('이페코'));
  assert.ok(!names(r).includes('치또이츠'));
});
test('ittsu, sanshoku, chanta and junchan', () => {
  assert.ok(names(score('123456789m123p22s', { riichi: true, win: '3p' })).includes('일기통관'));
  assert.ok(names(score('123m123p123s777s22p', { riichi: true, win: '2p' })).includes('삼색동순'));
  assert.ok(names(score('123m789p111s777z11z', { riichi: true })).includes('찬타'));
  assert.ok(names(score('123789m111p999s11m', { riichi: true })).includes('준찬타'));
});
test('ron-completed triplet is open for fu and sanankou', () => {
  const r = score('111m222p333s444s55p', { win: '1m' });
  assert.ok(names(r).includes('산안커'));
  assert.ok(!r.yakuman);
  const t = score('111m222p333s444s55p', { win: '1m', tsumo: true });
  assert.ok(names(t).includes('사암각'));
  assert.equal(t.yakuman, 1);
});
test('suuankou tanki double option', () => {
  assert.equal(score('111m222p333s444s55p', { win: '5p' }).yakuman, 2);
  assert.equal(score('111m222p333s444s55p', { win: '5p', doubleYakuman: false }).yakuman, 1);
});
test('kokushi thirteen-sided and normal wait distinguish double yakuman', () => {
  assert.equal(score('119m19p19s1234567z', { win: '1m' }).yakuman, 2);
  assert.equal(score('119m19p19s1234567z', { win: '7z' }).yakuman, 1);
});
test('pure nine gates and normal nine gates', () => {
  assert.equal(score('11123455678999m', { win: '5m' }).yakuman, 2);
  assert.equal(score('11123455678999m', { win: '1m' }).yakuman, 1);
});
test('all-honors chiitoitsu yakuman', () => {
  const r = score('11223344556677z');
  assert.equal(r.yakuman, 1);
  assert.ok(names(r).includes('자일색'));
});
test('daisangen, all honors and tanki stack', () => {
  const r = score('111555666777z22z', { win: '2z' });
  assert.equal(r.yakuman, 4);
  assert.ok(names(r).includes('대삼원'));
  assert.ok(names(r).includes('자일색'));
});
test('daisuushii double, shousuushii single', () => {
  const a = score('111222333444z55m', { win: '5m' });
  assert.equal(a.yakuman, 4);
  const b = score('111222333z44z555m', { win: '5m' });
  assert.ok(names(b).includes('소사희'));
  assert.equal(b.yakuman, 1);
});
test('ryuuiisou accepts hand without hatsu', () => {
  const r = score('22233344466688s', { tsumo: true, win: '8s' });
  assert.ok(names(r).includes('녹일색'));
});
test('open triplet/quad fu and closed kan are distinct', () => {
  const h = hand('123456m11z'),
    mk = { kind: 'minkan', tiles: hand('9999p'), from: 2 },
    ak = { kind: 'ankan', tiles: hand('2222s'), from: 1 };
  const r = scoreHand(h, [mk, ak], {
    winTile: h.at(-1),
    tsumo: true,
    seat: 1,
    round: 0,
    rinshan: true,
    aka: false,
  });
  assert.ok(r.fuItems.some((f) => f.name.includes('명깡') && f.fu === 16));
  assert.ok(r.fuItems.some((f) => f.name.includes('암깡') && f.fu === 16));
});
test('score limits, independently rounded payments and kiriage', () => {
  assert.equal(payments(1, 30).ron, 1000);
  assert.equal(payments(1, 30, true).ron, 1500);
  assert.equal(payments(3, 40).ron, 5200);
  assert.equal(payments(4, 30).ron, 7700);
  assert.equal(payments(4, 30, false, false, 0, true).ron, 8000);
  assert.equal(payments(6, 30).ron, 12000);
  assert.equal(payments(8, 30).ron, 16000);
  assert.equal(payments(11, 30).ron, 24000);
  assert.equal(payments(13, 30).ron, 32000);
  assert.equal(payments(0, 0, true, false, 2).ron, 96000);
});
test('honba and deposits conserve points including bank', () => {
  const r = settle([24000, 25000, 25000, 25000], 1, 2, payments(3, 40), 0, 2, 1);
  assert.deepEqual(r.deltas, [0, 6800, -5800, 0]);
  assert.equal(
    r.scores.reduce((a, b) => a + b),
    100000
  );
});
test('all-last differentiates direct hit and third-party ron, including tie', () => {
  const r = solveAllLast({
    scores: [25000, 30000, 25000, 20000],
    winner: 0,
    dealer: 3,
    targetRank: 1,
    honba: 0,
    sticks: 0,
  });
  const direct = r.find((x) => x.loser === 1),
    other = r.find((x) => x.loser === 2);
  assert.ok(direct.minimum < other.minimum);
  assert.equal(ranking([30000, 30000, 20000, 20000])[0], 0);
});
test('genbutsu is opponent-specific; two riichi cannot use one safe tile blindly', () => {
  const a = { name: 'A', river: [{ id: 0, seq: 0, riichi: true }], riichi: true },
    b = { name: 'B', river: [{ id: 36, seq: 1, riichi: true }], riichi: true };
  assert.equal(tileDanger(0, a, Array(34).fill(0)).risk, 0);
  assert.ok(tileDanger(0, b, Array(34).fill(0)).risk > 0);
  const r = defenseRows([0, 36], [a, b], Array(34).fill(1));
  assert.ok(r.every((x) => x.risk > 0));
});

/** Create an isolated legal-phase fixture. Physical hand identity is retained;
 * fixtures alter only state under test and never masquerade as exported logs. */
function fixture() {
  const m = new Match({}, 19);
  m.s.players.forEach((p) => {
    p.hand = [];
    p.melds = [];
    p.river = [];
    p.drawn = null;
    p.draws = 2;
    p.discards = 1;
    p.riichi = false;
    p.tempFuriten = false;
    p.riichiFuriten = false;
  });
  m.s.interrupted = true;
  m.s.current = 0;
  m.s.phase = 'turn';
  return m;
}
test('initial wall invariant: 53 in hands, 69 live, 14 dead', () => {
  const m = new Match({}, 1),
    s = m.s;
  assert.equal(
    s.players.reduce((n, p) => n + p.hand.length, 0),
    53
  );
  assert.equal(s.live.length, 69);
  assert.equal(s.dead.length, 14);
  assert.equal(new Set([...s.players.flatMap((p) => p.hand), ...s.live, ...s.dead]).size, 136);
});
test('furiten uses the full wait and includes called-away discards', () => {
  const p = {
    hand: hand('123456m234p67s22p'),
    melds: [],
    river: [{ id: hand('5s')[0], called: true }],
    tempFuriten: false,
    riichiFuriten: false,
  };
  assert.deepEqual(playerWaits(p), [22, 25]);
  assert.ok(furiten(p).discard);
});
test('normal draw clears only temporary furiten', () => {
  const m = fixture(),
    p = m.s.players[0];
  p.tempFuriten = true;
  p.riichiFuriten = true;
  m.draw(0);
  assert.equal(p.tempFuriten, false);
  assert.equal(p.riichiFuriten, true);
});
test('passing ron after riichi causes permanent furiten', () => {
  const m = fixture(),
    p = m.s.players[1];
  p.hand = hand('123456m234p67s22p');
  p.riichi = true;
  m.responseWindow(0, hand('5s')[0], 'discard');
  const idx = m.s.pending.options[1].findIndex((x) => x.kind === 'ron');
  assert.ok(idx >= 0);
  m.dispatch({ kind: 'respond', player: 1, choice: -1 });
  assert.ok(p.riichiFuriten);
});
test('chi only from kamicha; kuikae forbids both ends', () => {
  const m = fixture();
  m.s.players[1].hand = hand('234m456p789s1122z');
  m.s.players[2].hand = hand('234m456p789s1122z');
  const tile = hand('1m')[0],
    o = m.callOptions(1, 0, tile).find((x) => x.kind === 'chi');
  assert.ok(o);
  assert.deepEqual(o.forbidden, [0, 3]);
  assert.equal(m.callOptions(2, 0, tile).filter((x) => x.kind === 'chi').length, 0);
});
test('ron takes priority over a pon decision collected earlier', () => {
  const m = fixture();
  m.s.players[1].hand = hand('55s123m456p789s11z');
  m.s.players[2].hand = hand('123456m234p67s22p');
  m.s.players[2].riichi = true;
  m.s.players[0].river = [{ id: hand('5s')[2] ?? 90 }];
  const id = hand('5s')[0];
  m.responseWindow(0, id, 'discard');
  const pon = m.s.pending.options[1].findIndex((x) => x.kind === 'pon'),
    ron = m.s.pending.options[2].findIndex((x) => x.kind === 'ron');
  assert.ok(pon >= 0 && ron >= 0);
  m.dispatch({ kind: 'respond', player: 1, choice: pon });
  m.dispatch({ kind: 'respond', player: 2, choice: ron });
  assert.equal(m.s.result.kind, 'win');
  assert.deepEqual(m.s.result.winners, [2]);
});
test('declaration discard ron costs no riichi deposit', () => {
  const m = fixture(),
    p = m.s.players[0];
  p.hand = hand('123456m234p67s22p5s');
  p.drawn = p.hand.at(-1);
  m.s.players[1].hand = hand('123456m234p67s22p');
  m.s.players[1].riichi = true;
  m.dispatch({ kind: 'discard', player: 0, tile: p.drawn, riichi: true });
  const i = m.s.pending.options[1].findIndex((o) => o.kind === 'ron');
  m.dispatch({ kind: 'respond', player: 1, choice: i });
  assert.equal(m.s.sticks, 0);
  assert.equal(p.riichi, false);
});
test('physical drawn ID determines tsumogiri and riichi forced discard', () => {
  const m = fixture(),
    p = m.s.players[0];
  p.hand = hand('1123456m234p678s');
  p.drawn = p.hand[0];
  p.riichi = true;
  assert.throws(() => m.dispatch({ kind: 'discard', player: 0, tile: p.hand[1] }));
  m.dispatch({ kind: 'discard', player: 0, tile: p.drawn });
  assert.equal(p.river.at(-1).tsumogiri, true);
});
test('ankan preserves a 14-tile effective dead wall and exposes new dora', () => {
  const m = fixture(),
    p = m.s.players[0];
  p.hand = hand('1111m234p567s1234z');
  p.drawn = p.hand[0];
  const len = m.s.live.length;
  m.dispatch({ kind: 'kan', player: 0, kanKind: 'ankan', t: 0 });
  assert.equal(m.s.rinshanUsed, 1);
  assert.equal(m.s.doraCount, 2);
  assert.equal(m.s.live.length, len - 1);
  assert.equal(m.s.dead.length - m.s.rinshanUsed + m.s.deadFill.length, 14);
  assert.equal(p.melds[0].kind, 'ankan');
});
test('riichi ankan changing wait set is forbidden', () => {
  const m = fixture(),
    p = m.s.players[0];
  p.hand = hand('111123m456p789s22p');
  p.drawn = p.hand[0];
  p.riichi = true;
  assert.equal(m.kanOptions(0).filter((x) => x.t === 0).length, 0);
});
test('all calls cancel ippatsu', () => {
  const m = fixture();
  m.s.players.forEach((p) => (p.ippatsu = true));
  m.interrupt();
  assert.ok(m.s.players.every((p) => !p.ippatsu));
});
test('noten 3000 distribution and dealer continuation', () => {
  const m = fixture();
  m.s.players.forEach((p) => (p.river = [{ id: hand('5m')[0], called: false }]));
  m.s.players[0].hand = hand('123456m234p67s22p');
  m.s.players[1].hand = hand('123456m234p67s22p');
  m.s.players[2].hand = hand('147m258p369s1234z');
  m.s.players[3].hand = hand('147m258p369s1234z');
  m.exhaustiveDraw();
  assert.deepEqual(m.s.result.deltas, [1500, 1500, -1500, -1500]);
  assert.ok(m.s.result.dealerContinues);
});
test('nagashi replaces noten payment and called discard disqualifies', () => {
  const m = fixture();
  m.s.players.forEach((p) => (p.river = [{ id: hand('5m')[0], called: false }]));
  m.s.players[0].river = [{ id: hand('1m')[0], called: false }];
  m.exhaustiveDraw();
  assert.equal(m.s.result.title, '유국만관');
  assert.deepEqual(m.s.result.deltas, [12000, -4000, -4000, -4000]);
  const n = fixture();
  n.s.players[0].river = [{ id: hand('1m')[0], called: true }];
  n.exhaustiveDraw();
  assert.equal(n.s.result.title, '황패유국');
});
test('invalid and tampered replay records are rejected', () => {
  const m = new Match({}, 1),
    text = m.export();
  assert.deepEqual(Match.import(text).s, m.s);
  const d = JSON.parse(text);
  d.events[0].wall.reverse();
  assert.throws(() => Match.import(JSON.stringify(d)));
  assert.throws(() => Match.import('{"format":"tenhou"}'));
  assert.throws(() => m.dispatch({ kind: 'discard', player: 2, tile: 1 }));
});
test('two-step tenpai has a nonzero second-draw winning probability', () => {
  const rows = twoStep(hand('123456m234p67s22p9z'.replace('9z', '7z')));
  assert.ok(rows.find((r) => r.t === 33).twoStep > 0);
});

/** Integration coverage: real AI commands pass through the same legality checks
 * as humans, preserving physical tiles and all 100,000 points plus deposits. */
test('24 seeded AI rounds preserve tiles, scores and exact replay', { timeout: 60000 }, () => {
  for (let seed = 1; seed <= 24; seed++) {
    const levels = ['easy', 'medium', 'hard', 'hard'];
    const m = new Match(
      { seats: levels.map((level, i) => ({ name: 'AI' + i, kind: 'ai', level })) },
      seed * 919
    );
    let steps = 0;
    while (!['ended', 'matchEnd'].includes(m.s.phase) && steps++ < 500) {
      if (m.s.phase === 'turn') m.dispatch(chooseTurn(m, m.s.current));
      else {
        const i = Object.keys(m.s.pending.options).find((i) => !m.s.pending.decisions[i]);
        m.dispatch(chooseResponse(m, Number(i)));
      }
      const s = m.s,
        ids = new Set([...s.live, ...s.dead.slice(s.rinshanUsed), ...s.deadFill]);
      const add = (id) => {
        assert.ok(!ids.has(id), 'physical tile duplicated');
        ids.add(id);
      };
      for (const p of s.players) {
        p.hand.forEach(add);
        p.melds.flatMap((m) => m.tiles).forEach(add);
        p.river.filter((d) => !d.called).forEach((d) => add(d.id));
      }
      assert.equal(ids.size, 136);
      assert.equal(s.players.reduce((n, p) => n + p.score, 0) + s.sticks * 1000, 100000);
    }
    assert.ok(steps < 500);
    assert.deepEqual(Match.import(m.export()).s, m.s);
  }
});
