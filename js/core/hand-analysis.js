import { counts, typeOf } from './tiles.js';
import { waits, shanten, decompositions } from './shanten.js';
import { scoreHand, allocations } from './scoring.js';

/** Structural waits include owned melds for the four-copy limit. Unseen count
 * is intentionally NOT used here: an exhausted wait still causes furiten. */
export function playerWaits(p) {
  return waits(counts(p.hand), p.melds.length,
    counts([...p.hand, ...p.melds.flatMap(m => m.tiles)]));
}
/** Authoritative predicate shared by game, AI and UI. All waits are barred from
 * ron when ANY wait appears in the river, including called-away tiles.
 * Temporary and permanent causes can coexist. */
export function furiten(p) {
  const w = playerWaits(p);
  const causes = (p.river ?? []).filter(d => w.includes(typeOf(d.id)));
  const discard = causes.length > 0, temporary = !!p.tempFuriten, riichi = !!p.riichiFuriten;
  return { discard, temporary, riichi, any: discard || temporary || riichi,
    waits: w, causeTypes: [...new Set(causes.map(d => typeOf(d.id)))],
    causeIds: causes.map(d => d.id) };
}
/** A pre-draw 13-tile view without mutating the live hand. A call without a
 * draw has no such view, so its 14-equivalent hand has no current wait. */
export function beforeDraw(p) {
  return p.drawn == null ? p : { ...p, hand: p.hand.filter(id => id !== p.drawn) };
}
/** Score each structural wait as ron and tsumo separately. Left means UNSEEN
 * copies, including opponents/dead wall; it is not live-wall availability or
 * probability. An unused non-red representative avoids assuming a red bonus.
 * Zero-left waits retain their structural role and still cause furiten. */
export function analyzeWaits(p, context = {}, known = counts(p.hand)) {
  const f = furiten(p), c = counts(p.hand), owned = [...p.hand, ...p.melds.flatMap(m => m.tiles)];
  const rows = f.waits.map(t => {
    const id = [1, 2, 3, 0].map(k => t * 4 + k).find(x => !owned.includes(x));
    const completed = [...p.hand, id], ctx = { ...context, winTile: id };
    const ronScore = scoreHand(completed, p.melds, { ...ctx, tsumo: false });
    const tsumoScore = scoreHand(completed, p.melds, { ...ctx, tsumo: true });
    const cc = [...c]; cc[t]++;
    const shapes = [...new Set(decompositions(cc, p.melds.length)
      .flatMap(d => allocations(d, t).map(a => a.wait)))];
    return { t, left: Math.max(0, 4 - (known[t] ?? 0)), shapes, ronScore, tsumoScore,
      ronAllowed: !!ronScore && !f.any, tsumoAllowed: !!tsumoScore,
      ronBlocked: f.any, noRonYaku: !ronScore, noTsumoYaku: !tsumoScore };
  });
  return { shanten: shanten(c, p.melds.length), furiten: f, waits: rows,
    total: rows.reduce((n, w) => n + w.left, 0),
    ronTotal: rows.reduce((n, w) => n + (w.ronAllowed ? w.left : 0), 0),
    tsumoTotal: rows.reduce((n, w) => n + (w.tsumoAllowed ? w.left : 0), 0) };
}
/** Prospective discard is pure. The candidate itself is appended to the river.
 * Known counts do not decrease when a tile moves from hand to river.
 * Match remains responsible for enforcing legality. */
export function previewDiscard(p, id, context = {}, known = counts(p.hand)) {
  if (!p.hand.includes(id)) return null;
  const after = { ...p, hand: p.hand.filter(x => x !== id), drawn: null,
    river: [...(p.river ?? []), { id, preview: true }] };
  const current = furiten(beforeDraw(p)), analysis = analyzeWaits(after, context, known);
  const transition = analysis.furiten.any ? current.any ? 'continues' : 'new'
    : current.any ? 'cleared' : 'none';
  return { ...analysis, tile: id, current, transition };
}
