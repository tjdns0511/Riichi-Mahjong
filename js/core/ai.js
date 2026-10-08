import { counts, typeOf, isOutside, isHonor, isRed, nextDora, label, rng } from './tiles.js';
import { shanten, rankDiscards, ukeire } from './shanten.js';
import { visibleCounts, indicators, seatWind, publicScoreContext } from './game.js';
import { analyzeWaits, previewDiscard } from './hand-analysis.js';
import { scoreHand } from './scoring.js';

/** A danger index is a ranking heuristic, NOT a calibrated deal-in probability.
 * Only genbutsu is certain against a particular opponent. Suji and walls can
 * still lose to pair, closed, edge, seven-pairs and thirteen-orphans waits. */
export function tileDanger(t, opponent, known, allRivers = []) {
  const discarded = new Set(opponent.river.map((d) => typeOf(d.id)));
  if (discarded.has(t)) return { risk: 0, reasons: ['현물 · 이 상대에게 론 방총 없음'] };
  const declaration = opponent.river.find((d) => d.riichi);
  if (declaration && allRivers.flat().some((d) => d.seq > declaration.seq && typeOf(d.id) === t))
    return { risk: 0, reasons: ['리치 이후 통과패 · 현물'] };
  const reasons = [];
  let risk = 80;
  if (isHonor(t)) {
    const ownCopies = opponent.ownVisible?.[t] ?? 0; // Optional caller metadata only.
    const visible = Math.min(3, Math.max(0, (known[t] ?? 0) - 1 - ownCopies));
    risk = [76, 49, 19, 6][visible];
    reasons.push(visible ? `자패 ${visible}장 이상 알려짐` : '생패 자패');
    return { risk, reasons };
  }
  const n = t % 9,
    base = t - n;
  const lower = n >= 3 && discarded.has(t - 3),
    upper = n <= 5 && discarded.has(t + 3);
  const suji = n <= 2 ? upper : n >= 6 ? lower : lower && upper;
  if (suji) {
    risk = 36;
    reasons.push('스지 · 양면 일부 배제');
  } else if (lower || upper) {
    risk = 57;
    reasons.push('반스지 · 반대쪽 양면 잔존');
  }
  const patterns = [];
  if (n >= 2) patterns.push([t - 2, t - 1]);
  if (n <= 6) patterns.push([t + 1, t + 2]);
  // Adjacent-number walls constrain sequence waits only, never guarantee safety.
  if (patterns.length && patterns.every((pair) => pair.some((x) => known[x] >= 4))) {
    risk = Math.min(risk, 18);
    reasons.push('노찬스 카베 · 바깥쪽 슌츠 차단');
  } else if (patterns.length && patterns.every((pair) => pair.some((x) => known[x] >= 3))) {
    risk = Math.min(risk, 43);
    reasons.push('원찬스 카베');
  }
  if (n === 0 || n === 8) {
    risk -= 9;
    reasons.push('노두패');
  }
  if (!reasons.length) reasons.push('무스지 중장패');
  return { risk: Math.max(1, risk), reasons };
}
/** Combine threats by worst opponent first. A genbutsu for one riichi may be
 * dangerous against another; every opponent receives a separate explanation. */
export function defenseRows(ids, threats, known, allRivers = []) {
  return [...new Set(ids.map(typeOf))]
    .map((t) => {
      const opponents = threats.map((p) => ({
        name: p.name,
        ...tileDanger(t, p, known, allRivers),
      }));
      const worst = Math.max(0, ...opponents.map((p) => p.risk)),
        sum = opponents.reduce((n, p) => n + p.risk, 0);
      return { t, risk: worst, combined: worst * 10 + sum, opponents };
    })
    .sort((a, b) => a.combined - b.combined || a.t - b.t);
}
/** Exposed value and number of open groups suggest a threat, never prove tenpai. */
export function threatsFor(s, seat) {
  const dora = indicators(s).map((id) => nextDora(typeOf(id)));
  return s.players.filter(
    (p, i) =>
      i !== seat &&
      (p.riichi ||
        p.melds.filter((m) => m.kind !== 'ankan').length >= 3 ||
        (p.melds.length >= 2 &&
          p.melds
            .flatMap((m) => m.tiles)
            .filter((id) => dora.includes(typeOf(id)) || isRed(id, s.config.aka)).length >= 2))
  );
}
/** Estimate value retained in a candidate, using only owned/public information.
 * The heuristic rewards actual dora, value pairs/triplets and coherent suits. */
function retainedValue(ids, p, s, seat) {
  const c = counts(ids),
    dora = indicators(s).map((id) => nextDora(typeOf(id)));
  let value = ids.reduce(
    (n, id) =>
      n + (dora.filter((t) => t === typeOf(id)).length + (isRed(id, s.config.aka) ? 1 : 0)) * 3,
    0
  );
  for (const t of [31, 32, 33, 27 + seatWind(s, seat), 27 + Math.floor(s.kyoku / 4)])
    if (c[t] >= 2) value += c[t] === 3 ? 5 : 2;
  const suits = [0, 1, 2].map(
    (n) => ids.filter((id) => typeOf(id) < 27 && Math.floor(typeOf(id) / 9) === n).length
  );
  if (Math.max(...suits) >= 9) value += 3;
  value += ids.filter((id) => !isOutside(typeOf(id))).length * 0.12;
  return value;
}
/** Feasible open-yaku routes, never awarded yaku. Exact tenpai is scored by
 * scoreHand. Incompatible exposed groups and missing-tile bounds reject paths. */
export function yakuRoutes(p, context) {
  const c = counts(p.hand), groups = p.melds, all = [...p.hand, ...groups.flatMap(m => m.tiles)];
  const valueTypes = new Set([31, 32, 33, 27 + context.seat, 27 + context.round]), routes = [];
  if ([...valueTypes].some(t => c[t] >= 3 || groups.some(m => m.kind !== 'chi' && typeOf(m.tiles[0]) === t)))
    routes.push({ name: '역패 확정', strength: 1, han: 1 });
  else if ([...valueTypes].some(t => c[t] === 2)) routes.push({ name: '역패 또이츠', strength: .55, han: 1 });
  if (groups.every(m => m.tiles.every(id => !isOutside(typeOf(id))))) {
    const outside = p.hand.filter(id => isOutside(typeOf(id))).length;
    if (outside <= 2) routes.push({ name: '탕야오', strength: outside === 0 ? 1 : .6, han: 1 });
  }
  for (let suit = 0; suit < 3; suit++) {
    const fits = id => isHonor(typeOf(id)) || Math.floor(typeOf(id) / 9) === suit;
    if (groups.every(m => m.tiles.every(fits)) && p.hand.filter(id => !fits(id)).length <= 2) {
      const pure = all.every(id => !isHonor(typeOf(id)));
      routes.push({ name: pure ? '청일색' : '혼일색', strength: all.every(fits) ? 1 : .6, han: pure ? 5 : 2 });
    }
  }
  // Every chanta group, including the pair, needs an outside tile.
  const chantaGroup = m => m.kind === 'chi'
    ? [0, 6].includes(Math.min(...m.tiles.map(typeOf)) % 9)
    : isOutside(typeOf(m.tiles[0]));
  if (groups.every(chantaGroup)) {
    const middle = p.hand.filter(id => typeOf(id) < 27 && [3, 4, 5].includes(typeOf(id) % 9)).length;
    if (middle <= 1 && all.filter(id => isOutside(typeOf(id))).length >= 5)
      routes.push({ name: '찬타', strength: .55, han: 1 });
  }
  // Sanshoku allows one unrelated fourth group, but not two.
  for (let start = 0; start <= 6; start++) {
    let fixed = 0, missing = 0;
    for (let suit = 0; suit < 3; suit++) {
      const t = suit * 9 + start;
      if (groups.some(m => m.kind === 'chi' && Math.min(...m.tiles.map(typeOf)) === t)) fixed++;
      else missing += [t, t + 1, t + 2].filter(x => !c[x]).length;
    }
    if (groups.length - fixed <= 1 && missing <= 1)
      routes.push({ name: '삼색동순', strength: missing ? .6 : .9, han: 1 });
  }
  return routes;
}
/** Ordering feature, not a calibrated probabilistic EV. Ron access receives
 * separate value while furiten still retains legal tsumo value. */
function waitQuality(a) {
  const usable = a.waits.filter(w => w.left && (w.ronAllowed || w.tsumoAllowed));
  const weight = usable.reduce((n, w) => n + w.left, 0);
  const value = weight ? usable.reduce((n, w) => n + w.left * Math.max(
    w.ronAllowed ? w.ronScore.total : 0, w.tsumoAllowed ? w.tsumoScore.total : 0), 0) / weight : 0;
  return { value, quality: a.ronTotal * 7 + a.tsumoTotal * 3, useful: weight };
}
/** Explainable rows use own hand and public information only. Candidate
 * red/ordinary physical copies differ in value, not in structural efficiency. */
export function evaluateDiscards(s, seat, { player = s.players[seat], known = visibleCounts(s, seat), riichiIds = [] } = {}) {
  const p = player, context = publicScoreContext(s, seat, p), threats = threatsFor(s, seat);
  const rows = rankDiscards(p.hand, p.melds.length, known, p.forbidden ?? []);
  const safety = defenseRows(p.hand, threats, known, s.players.map(x => x.river));
  const last = s.kyoku >= (s.config.length === 'east' ? 3 : 7);
  const ordered = s.players.map(x => x.score).sort((a, b) => b - a);
  const behind = last && ordered[0] - p.score >= 4000;
  const protecting = last && p.score === ordered[0] && ordered[0] - ordered[1] >= 8000;
  const evaluated = rows.flatMap(row => {
    const ids = p.hand.filter(id => typeOf(id) === row.t);
    const choices = [...new Map(ids.map(id => [isRed(id, s.config.aka), id])).values()];
    return choices.map(id => {
      const hand = p.hand.filter(x => x !== id), after = { ...p, hand };
      const routes = yakuRoutes(after, context), closed = p.melds.every(m => m.kind === 'ankan');
      const retained = retainedValue([...hand, ...p.melds.flatMap(m => m.tiles)], p, s, seat);
      let analysis = null, value = 1000 + retained * 220, quality = row.total * 4, useful = row.total, riichi = false;
      if (row.shanten === 0) {
        analysis = previewDiscard(p, id, context, known);
        let q = waitQuality(analysis);
        if (riichiIds.includes(id)) {
          const declared = previewDiscard(p, id, { ...context, riichi: true }, known);
          const rq = waitQuality(declared);
          riichi = (!protecting && (q.value < 7700 || !q.quality)) || !q.quality;
          if (riichi) { analysis = declared; q = rq; }
        }
        ({ value, quality, useful } = q);
      }
      const risks = safety.find(x => x.t === row.t)?.opponents ?? [];
      const danger = risks.reduce((n, r, i) => n + r.risk * (threats[i].riichi ? 1 : .6), 0);
      let mode = 'attack', riskWeight = 0;
      if (threats.length) {
        const strong = row.shanten === 0 && useful >= 4 && value >= (seat === s.dealer ? 2900 : 3900);
        const promising = row.shanten <= 1 && value >= 6000 && row.total >= 12;
        const mustPush = behind && row.shanten <= 1 && useful >= 3;
        mode = strong || promising || mustPush ? 'push' : row.shanten >= 2 ||
          ((p.discards >= 10 || threats.length >= 2 || protecting) && (value < 3900 || useful < 4)) ? 'fold' : 'balanced';
        riskWeight = { push: 1.3, balanced: 6, fold: 22 }[mode];
        if (s.live.length < 16 && mode !== 'push') riskWeight *= 1.2;
      }
      const noYaku = row.shanten === 0 && analysis.waits.every(w => !w.ronScore && !w.tsumoScore);
      const noRoute = !closed && !routes.length;
      const cost = p.level === 'easy' ? row.shanten * 1000 - row.total
        : row.shanten * 1000 - row.total * 4 - quality + (noYaku ? 450 : 0) + (noRoute ? 160 : 0)
          - (p.level === 'hard' ? Math.sqrt(value) * 2 + retained : 0)
          + (p.level === 'hard' ? danger * riskWeight : 0);
      return { ...row, id, cost, analysis, value: Math.round(value), quality, useful, routes,
        noYaku, closed, riichi, mode, danger, riskWeight, opponents: risks,
        reasons: [row.shanten + '샨텐 · 미확인 유효패 ' + row.total + '장',
          ...(analysis ? ['론 가능 ' + analysis.ronTotal + '장 · 쯔모 가능 ' + analysis.tsumoTotal + '장',
            analysis.furiten.any ? '후리텐: 대기 전체 론 금지' : '후리텐 없음'] : []),
          '공격·수비 ' + mode + ' · 위험 지수 ' + Math.round(danger) + ' (확률 아님)'] };
    });
  });
  return evaluated.sort((a, b) => a.cost - b.cost || Number(isRed(a.id, s.config.aka)) - Number(isRed(b.id, s.config.aka)) || a.id - b.id);
}
/** Inspect an engine-legal kan without consulting replacement/new indicator.
 * More dora is uncertain for everyone; riichi and exposed hands impose a cost.
 * Added kans additionally expose chankan. Even riichi does not force a kan. */
export function evaluateKan(s, seat, k, baseline, known = visibleCounts(s, seat), source = null) {
  const p = s.players[seat], hand = p.hand.filter(id => !k.tiles.includes(id));
  const melds = p.melds.map(m => ({ ...m, tiles: [...m.tiles] }));
  if (k.kind === 'kakan') melds[k.meldIndex] = { ...melds[k.meldIndex], kind: 'kakan', tiles: [...melds[k.meldIndex].tiles, ...k.tiles] };
  else melds.push({ kind: k.kind, tiles: source == null ? k.tiles : [...k.tiles, source] });
  const after = { ...p, hand, melds, drawn: null }, a = analyzeWaits(after, publicScoreContext(s, seat, after), known);
  const threats = threatsFor(s, seat), q = waitQuality(a), routes = yakuRoutes(after, publicScoreContext(s, seat, after));
  const beforeShanten = baseline?.shanten ?? shanten(counts(p.hand), p.melds.length);
  const legalShape = a.shanten <= beforeShanten;
  const viable = melds.every(m => m.kind === 'ankan') || (a.shanten === 0 ? q.useful > 0 : routes.length > 0);
  const qualityLoss = baseline?.analysis && a.shanten === 0 && q.quality < baseline.quality * .75;
  const threatened = threats.length && (k.kind !== 'ankan' || a.shanten > 0 || q.value < 7700 || q.useful < 4);
  const approve = legalShape && viable && !qualityLoss && !threatened && s.live.length >= 12 &&
    (p.riichi ? q.useful >= 4 : a.shanten <= 1);
  return { approve, kind: k.kind, shanten: a.shanten, analysis: a,
    reasons: [legalShape ? '샨텐 유지/개선' : '샨텐 악화',
      qualityLoss ? '대기 품질 감소' : '대기 품질 허용',
      threatened ? '상대 위협·깡도라·창깡 부담' : '영상패 기회', '신도라·영상패 구성은 미확인'] };
}
/** Only public bonuses are needed to detect immediate tsumo. Actual payments,
 * hidden ura revelation and all action validation remain Match's responsibility. */
export function chooseTurn(match, seat) {
  const s = match.s, p = s.players[seat];
  if (p.drawn !== null && scoreHand(p.hand, p.melds, { ...publicScoreContext(s, seat),
    winTile: p.drawn, tsumo: true, ippatsu: p.ippatsu, rinshan: s.lastDrawRinshan,
    haitei: !s.live.length && !s.lastDrawRinshan,
    tenhou: seat === s.dealer && p.draws === 1 && !s.interrupted && !p.discards,
    chiihou: seat !== s.dealer && p.draws === 1 && !s.interrupted && !p.discards }))
    return { kind: 'tsumo', player: seat };
  if (match.canKyuushu(seat) && shanten(counts(p.hand), p.melds.length) >= 4)
    return { kind: 'kyuushu', player: seat };
  const legal = p.hand.filter(id => !p.forbidden.includes(typeOf(id)));
  if (p.level === 'easy' && p.drawn !== null && legal.includes(p.drawn) &&
      rng(match.seed + s.serial * 991 + p.discards * 41 + seat * 131)() < .2)
    return { kind: 'discard', player: seat, tile: p.drawn };
  const known = visibleCounts(s, seat);
  const rows = evaluateDiscards(s, seat, { known, riichiIds: match.riichiDiscards(seat) });
  const best = p.riichi ? rows.find(r => r.t === typeOf(p.drawn)) ?? rows[0] : rows[0];
  if (p.level !== 'easy') {
    const kan = match.kanOptions(seat).find(k => evaluateKan(s, seat, k, best, known).approve);
    if (kan) return { kind: 'kan', player: seat, kanKind: kan.kind, t: kan.t };
  }
  if (p.riichi) return { kind: 'discard', player: seat, tile: p.drawn };
  return { kind: 'discard', player: seat, tile: best.id, riichi: best.riichi && best.mode !== 'fold' };
}
/** Compare staying closed with each call's best legal discard. Exact score
 * rejects yakuless tenpai; unfinished hands require a feasible route. Kuikae is
 * copied from Match's option, never independently reimplemented by the AI. */
export function evaluateCalls(match, seat) {
  const s = match.s, p = s.players[seat], q = s.pending, known = visibleCounts(s, seat);
  const before = shanten(counts(p.hand), p.melds.length), context = publicScoreContext(s, seat);
  const closed = p.melds.every(m => m.kind === 'ankan');
  return q.options[seat].flatMap((o, index) => {
    if (!o.tiles) return [];
    const hand = p.hand.filter(id => !o.tiles.includes(id));
    const after = { ...p, hand, drawn: null, forbidden: o.forbidden ?? [],
      melds: [...p.melds, { kind: o.kind, tiles: [...o.tiles, q.tile], from: q.source, called: q.tile }] };
    let best;
    if (o.kind === 'minkan') {
      const a = analyzeWaits(after, context, known), quality = waitQuality(a);
      const kan = evaluateKan(s, seat, o, { shanten: before }, known, q.tile);
      best = { shanten: a.shanten, analysis: a, noYaku: !quality.useful && a.shanten === 0,
        value: quality.value, routes: yakuRoutes(after, context), mode: kan.approve ? 'attack' : 'fold',
        total: ukeire(counts(hand), after.melds.length, known).total };
    } else best = evaluateDiscards(s, seat, { player: after, known })[0];
    if (!best) return [];
    const speed = before - best.shanten;
    const credible = best.shanten === 0 ? !best.noYaku && best.analysis.waits.some(w => w.left && (w.ronAllowed || w.tsumoAllowed))
      : best.routes.some(r => r.strength >= .55);
    const approve = speed > 0 && credible && best.mode !== 'fold' &&
      (!closed || best.shanten === 0 || best.routes.some(r => r.strength >= .9));
    return [{ index, kind: o.kind, approve, before, after: best.shanten, best,
      utility: speed * 100 + best.total + Math.sqrt(best.value) - (closed ? 40 : 0),
      reasons: [before + ' → ' + best.shanten + '샨텐', credible ? '화료 가능한 역 경로' : '역/대기 부족',
        closed ? '멘젠 가치 포기' : '기존 후로 진행'] }];
  }).sort((a, b) => b.utility - a.utility || a.index - b.index);
}
/** Lower levels keep menzen; Hard compares calls. All levels take legal ron. */
export function chooseResponse(match, seat) {
  const p = match.s.players[seat], options = match.s.pending.options[seat];
  const ron = options.findIndex(o => o.kind === 'ron');
  if (ron >= 0) return { kind: 'respond', player: seat, choice: ron };
  const calls = p.level === 'hard' ? evaluateCalls(match, seat) : [];
  return { kind: 'respond', player: seat, choice: calls.find(c => c.approve)?.index ?? -1 };
}
