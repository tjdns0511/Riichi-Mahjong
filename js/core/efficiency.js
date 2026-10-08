import { shuffled, counts, typeOf, sorted, label } from './tiles.js';
import { shanten, rankDiscards } from './shanten.js';
import { analyzeWaits } from './hand-analysis.js';

/** Real tile pool and reproducible exercise; analysis never reads its future. */
export function newEfficiency(seed = Date.now()) {
  let wall, hand;
  for (let i = 0; i < 30; i++) {
    wall = shuffled(seed + i); hand = wall.splice(0, 14);
    if (shanten(counts(hand)) <= 3) break;
  }
  return { hand: sorted(hand), wall, river: [], rows: null, choice: null, show: false,
    points: 0, maxPoints: 0, turn: 1, twoStep: false, busy: false,
    ended: false, history: [], final: null, revision: 0 };
}
/** Commit discard immediately, then test all three 13-tile tenpai shapes.
 * Score preserves the original lexicographic rule: chosen ukeire only at minimum
 * shanten; maximum is best ukeire (or 1 if exhausted). All tied optima count.
 * Historical records contain only what was known BEFORE that choice. */
export function answerEfficiency(e, t) {
  if (e.ended || e.choice !== null || e.hand.length !== 14) return false;
  const hand = [...e.hand], known = counts([...e.hand, ...e.river]);
  const rows = rankDiscards(hand, 0, known), best = rows[0];
  const chosen = rows.find(r => r.t === t);
  if (!chosen) return false;
  const optimal = rows.filter(r => r.shanten === best.shanten && r.total === best.total).map(r => r.t);
  const earned = chosen.shanten === best.shanten ? chosen.total : 0, maximum = best.total || 1;
  const loss = { shanten: chosen.shanten - best.shanten,
    ukeire: chosen.shanten === best.shanten ? best.total - chosen.total : null };
  const reason = optimal.includes(t) ? '최소 샨텐과 최대 유효패를 유지한 최적 선택입니다.'
    : loss.shanten ? optimal.map(label).join('·') + '보다 ' + loss.shanten + '샨텐 느립니다. 다른 샨텐의 유효패 수를 직접 비교하지 않습니다.'
    : optimal.map(label).join('·') + '보다 미확인 유효패가 ' + loss.ukeire + '장 적습니다.';
  e.history.push({ turn: e.turn, hand, known, selected: t, chosen, optimal, best, rows,
    loss, reason, earned, maximum });
  const id = e.hand.find(id => typeOf(id) === t);
  e.hand = e.hand.filter(x => x !== id); e.river.push(id);
  e.rows = rows; e.choice = t; e.show = true; e.points += earned; e.maxPoints += maximum;
  e.twoStep = false; e.busy = false; e.revision++;
  if (shanten(counts(e.hand)) === 0) {
    e.ended = true;
    e.final = analyzeWaits({ hand: e.hand, melds: [], river: e.river.map(id => ({ id })) },
      {}, counts([...e.hand, ...e.river]));
  }
  return true;
}
/** Drawing is separate, impossible after completion, and idempotent on repeat. */
export function nextEfficiency(e) {
  if (e.ended || e.choice === null || !e.wall.length || e.hand.length !== 13) return false;
  e.hand = sorted([...e.hand, e.wall.shift()]); e.choice = null; e.rows = null;
  e.show = false; e.turn++; e.twoStep = false; e.busy = false; e.revision++;
  return true;
}
