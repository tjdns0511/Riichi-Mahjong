import { counts, typeOf, shuffled, isOutside, WINDS, validTiles } from './tiles.js';
import { waits, shanten, rankDiscards } from './shanten.js';
import { scoreHand, settle, payments } from './scoring.js';
import { playerWaits, furiten } from './hand-analysis.js';
export { playerWaits, furiten } from './hand-analysis.js';

export const DEFAULT_CONFIG = {
  length: 'hanchan',
  aka: true,
  doubleYakuman: true,
  kiriage: false,
  startingPoints: 25000,
  seats: [
    { name: '나', kind: 'human', level: 'medium' },
    { name: '하가', kind: 'ai', level: 'easy' },
    { name: '대면', kind: 'ai', level: 'medium' },
    { name: '상가', kind: 'ai', level: 'hard' },
  ],
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (test, message) => {
  if (!test) throw Error(message);
};
/** Limit external configuration to documented values, including imported logs. */
export function normalizeConfig(input = {}) {
  const seats = input.seats ?? DEFAULT_CONFIG.seats;
  assert(Array.isArray(seats) && seats.length === 4, '4개 좌석이 필요합니다.');
  return {
    length: input.length === 'east' ? 'east' : 'hanchan',
    aka: input.aka !== false,
    doubleYakuman: input.doubleYakuman !== false,
    kiriage: !!input.kiriage,
    startingPoints: 25000,
    seats: seats.map((p, i) => ({
      name: String(p.name ?? WINDS[i]).slice(0, 20),
      kind: p.kind === 'human' ? 'human' : 'ai',
      level: ['easy', 'medium', 'hard'].includes(p.level) ? p.level : 'medium',
    })),
  };
}
/** All information visible to one seat. Opponent hidden hands and wall tiles are
 * deliberately not counted; this same vector drives AI and analysis UI. */
export function visibleCounts(s, seat) {
  const ids = new Set(s.players[seat].hand);
  s.players.forEach((p) => {
    p.river.forEach((x) => ids.add(x.id));
    p.melds.forEach((m) => m.tiles.forEach((id) => ids.add(id)));
  });
  indicators(s).forEach((id) => ids.add(id));
  return counts([...ids]);
}
export const indicators = (s) => Array.from({ length: s.doraCount }, (_, i) => s.dead[4 + i * 2]);
export const uraIndicators = (s) =>
  Array.from({ length: s.doraCount }, (_, i) => s.dead[5 + i * 2]);
export const seatWind = (s, i) => (i - s.dealer + 4) % 4;
export const roundName = (s) => `${WINDS[Math.floor(s.kyoku / 4)] ?? '북'} ${(s.kyoku % 4) + 1}국`;
/** Stable public scoring context. Future wins never assume hidden ura or
 * situational bonuses (ippatsu, last tile, replacement tile). */
export function publicScoreContext(s, seat, p = s.players[seat]) {
  return { seat: seatWind(s, seat), round: Math.floor(s.kyoku / 4),
    dealer: seat === s.dealer, riichi: p.riichi, doubleRiichi: p.doubleRiichi,
    doraIndicators: indicators(s), aka: s.config.aka,
    doubleYakuman: s.config.doubleYakuman, kiriage: s.config.kiriage };
}
/** Match is a deterministic state machine. Only dispatch() changes a live game.
 * AI and UI use the same legal-action methods, so UI state cannot bypass rules.
 * Events have internal state snapshots for instant replay; exported JSON stores
 * only reproducible commands and auditable events, avoiding duplicate snapshots. */
export class Match {
  constructor(config = {}, seed = Date.now() >>> 0) {
    this.config = normalizeConfig(config);
    this.seed = seed >>> 0;
    this.actions = [];
    this.events = [];
    this.history = [];
    this.s = {
      config: this.config,
      phase: 'turn',
      kyoku: 0,
      dealer: 0,
      honba: 0,
      sticks: 0,
      serial: 0,
      current: 0,
      players: this.config.seats.map((p) => ({ ...p, score: 25000 })),
      result: null,
    };
    this.startRound();
  }
  /** Snapshots cannot mutate the authoritative state. One event == one replay step. */
  record(type, data = {}) {
    this.events.push({ seq: this.events.length, type, ...clone(data) });
    this.history.push(clone(this.s));
  }
  /** The last 14 physical IDs form a fixed dead-wall array: 4 replacement tiles,
   * then 5 indicator/ura pairs. Each kan moves one live-wall tail into filler,
   * keeping the effective dead wall at exactly 14 physical tiles. */
  startRound() {
    const s = this.s,
      wall = shuffled((this.seed + Math.imul(s.serial, 0x9e3779b9)) >>> 0);
    s.players = s.players.map((p) => ({
      ...p,
      hand: [],
      melds: [],
      river: [],
      riichi: false,
      doubleRiichi: false,
      ippatsu: false,
      tempFuriten: false,
      riichiFuriten: false,
      draws: 0,
      discards: 0,
      drawn: null,
      forbidden: [],
      pao: {},
    }));
    s.dead = wall.slice(122);
    s.live = wall.slice(0, 122);
    s.deadFill = [];
    s.rinshanUsed = 0;
    s.doraCount = 1;
    s.kanOwners = [];
    s.interrupted = false;
    s.pending = null;
    s.result = null;
    s.lastDrawRinshan = false;
    s.abortFourKans = false;
    s.phase = 'turn';
    s.current = s.dealer;
    for (let n = 0; n < 13; n++)
      for (let j = 0; j < 4; j++) s.players[(s.dealer + j) % 4].hand.push(s.live.shift());
    this.record('deal', {
      wall,
      round: s.kyoku,
      honba: s.honba,
      hands: s.players.map((p) => [...p.hand]),
    });
    this.draw(s.dealer);
  }
  /** A normal draw ends temporary furiten. Drawing a winning tile does not erase
   * discard furiten or riichi furiten; both still permit self-draw wins. */
  draw(seat, rinshan = false) {
    const s = this.s,
      p = s.players[seat];
    if (!s.live.length && !rinshan) {
      this.exhaustiveDraw();
      return;
    }
    const id = rinshan ? s.dead[s.rinshanUsed++] : s.live.shift();
    if (rinshan) s.deadFill.push(s.live.pop());
    p.hand.push(id);
    p.drawn = id;
    p.draws++;
    p.tempFuriten = false;
    p.forbidden = [];
    s.current = seat;
    s.phase = 'turn';
    s.lastDrawRinshan = rinshan;
    this.record('draw', { player: seat, tile: id, rinshan });
  }
  /** Scoring context is derived, never trusted from a UI declaration. */
  score(seat, tile, tsumo = false, chankan = false) {
    const s = this.s,
      p = s.players[seat],
      ids = tsumo ? p.hand : [...p.hand, tile];
    return scoreHand(ids, p.melds, {
      winTile: tile,
      tsumo,
      chankan,
      seat: seatWind(s, seat),
      round: Math.floor(s.kyoku / 4),
      dealer: seat === s.dealer,
      riichi: p.riichi,
      doubleRiichi: p.doubleRiichi,
      ippatsu: p.ippatsu,
      rinshan: tsumo && s.lastDrawRinshan,
      haitei: tsumo && !s.live.length && !s.lastDrawRinshan,
      houtei: !tsumo && !s.live.length && !chankan,
      tenhou: tsumo && seat === s.dealer && p.draws === 1 && !s.interrupted && p.discards === 0,
      chiihou: tsumo && seat !== s.dealer && p.draws === 1 && !s.interrupted && p.discards === 0,
      doraIndicators: indicators(s),
      uraIndicators: uraIndicators(s),
      aka: this.config.aka,
      doubleYakuman: this.config.doubleYakuman,
      kiriage: this.config.kiriage,
    });
  }
  /** A legal riichi discard must leave a real structural wait, with 1000 points
   * available, a closed hand and at least four live-wall tiles remaining. */
  riichiDiscards(seat) {
    const s = this.s,
      p = s.players[seat];
    if (
      s.phase !== 'turn' ||
      s.current !== seat ||
      p.riichi ||
      p.score < 1000 ||
      s.live.length < 4 ||
      p.melds.some((m) => m.kind !== 'ankan')
    )
      return [];
    return p.hand.filter((id) => {
      const h = p.hand.filter((x) => x !== id);
      return !p.forbidden.includes(typeOf(id)) && playerWaits({ ...p, hand: h }).length > 0;
    });
  }
  /** Enumerate only kans that can actually receive a replacement tile. After
   * riichi, the drawn tile must complete an existing concealed triplet and the
   * full wait set must be unchanged. Added kans cannot be declared after riichi. */
  kanOptions(seat) {
    const s = this.s,
      p = s.players[seat];
    if (
      s.phase !== 'turn' ||
      s.current !== seat ||
      s.rinshanUsed >= 4 ||
      !s.live.length ||
      p.drawn === null
    )
      return [];
    const c = counts(p.hand),
      out = [];
    for (let t = 0; t < 34; t++)
      if (c[t] === 4) {
        const tiles = p.hand.filter((id) => typeOf(id) === t);
        if (p.riichi) {
          if (typeOf(p.drawn) !== t) continue;
          const old = playerWaits({ ...p, hand: p.hand.filter((id) => id !== p.drawn) });
          const neo = playerWaits({
            ...p,
            hand: p.hand.filter((id) => typeOf(id) !== t),
            melds: [...p.melds, { kind: 'ankan', tiles }],
          });
          if (!same(old, neo)) continue;
        }
        out.push({ kind: 'ankan', t, tiles });
      }
    if (!p.riichi)
      p.melds.forEach((m, index) => {
        if (m.kind === 'pon') {
          const t = typeOf(m.tiles[0]),
            id = p.hand.find((id) => typeOf(id) === t);
          if (id !== undefined) out.push({ kind: 'kakan', t, tiles: [id], meldIndex: index });
        }
      });
    return out;
  }
  /** Nine different terminals/honors is a voluntary first-draw abort. */
  canKyuushu(seat) {
    const s = this.s,
      p = s.players[seat];
    return (
      s.phase === 'turn' &&
      s.current === seat &&
      !s.interrupted &&
      p.draws === 1 &&
      p.discards === 0 &&
      counts(p.hand).filter((n, t) => n && isOutside(t)).length >= 9
    );
  }
  /** Capture all competing claims before choosing priority. Explicitly retain
   * red/non-red combinations: choosing a call must not secretly consume a red. */
  callOptions(seat, source, tile, kind = 'discard') {
    const s = this.s,
      p = s.players[seat],
      t = typeOf(tile),
      out = [];
    if (!furiten(p).any && playerWaits(p).includes(t)) {
      const score = this.score(seat, tile, false, kind !== 'discard');
      if (score && (kind !== 'ankan' || score.shape.kind === 'kokushi')) out.push({ kind: 'ron' });
    }
    if (kind !== 'discard' || p.riichi || !s.live.length) return out;
    const matching = p.hand.filter((id) => typeOf(id) === t);
    for (let a = 0; a < matching.length; a++)
      for (let b = a + 1; b < matching.length; b++)
        out.push({ kind: 'pon', tiles: [matching[a], matching[b]], forbidden: [t] });
    if (matching.length === 3 && s.rinshanUsed < 4)
      out.push({ kind: 'minkan', tiles: matching, forbidden: [] });
    if (seat === (source + 1) % 4 && t < 27)
      for (
        let start = Math.max(Math.floor(t / 9) * 9, t - 2);
        start <= t && start % 9 <= 6;
        start++
      ) {
        const need = [start, start + 1, start + 2].filter((n) => n !== t);
        const sets = need.map((n) => p.hand.filter((id) => typeOf(id) === n));
        // Kuikae forbids the called tile and the opposite end of a sequence made
        // from the same two consumed tiles (123 called 1 forbids 4 as well).
        const forbidden = [t];
        if (t === start && start % 9 <= 5) forbidden.push(start + 3);
        if (t === start + 2 && start % 9 >= 1) forbidden.push(start - 1);
        for (const a of sets[0])
          for (const b of sets[1]) out.push({ kind: 'chi', tiles: [a, b], forbidden });
      }
    // A call that leaves no legal discard cannot be offered.
    return out.filter(
      (o) =>
        !o.tiles ||
        o.kind === 'minkan' ||
        p.hand.some((id) => !o.tiles.includes(id) && !o.forbidden.includes(typeOf(id)))
    );
  }
  /** Store an unresolved response window. A claim with no yaku still establishes
   * temporary furiten on a structural winning tile when that tile is passed. */
  responseWindow(source, tile, kind, extra = {}) {
    const s = this.s,
      options = {},
      decisions = {};
    for (let d = 1; d <= 3; d++) {
      const seat = (source + d) % 4;
      options[seat] = this.callOptions(seat, source, tile, kind);
      if (!options[seat].length) decisions[seat] = { kind: 'pass' };
    }
    s.pending = { source, tile, kind, options, decisions, ...extra };
    s.phase = 'response';
  }
  /** Dispatch validates commands against authoritative phase and tile identity.
   * Commands are recorded separately from derived events for deterministic import. */
  dispatch(command) {
    const a = clone(command),
      s = this.s;
    assert(a && typeof a.kind === 'string', '올바르지 않은 동작입니다.');
    if (a.kind === 'next') {
      assert(s.phase === 'ended', '다음 국으로 진행할 수 없습니다.');
      this.nextRound();
    } else if (a.kind === 'respond') {
      assert(
        s.phase === 'response' && s.pending.options[a.player] && !s.pending.decisions[a.player],
        '응답할 차례가 아닙니다.'
      );
      const choice = a.choice === -1 ? { kind: 'pass' } : s.pending.options[a.player][a.choice];
      assert(choice, '유효하지 않은 부름입니다.');
      s.pending.decisions[a.player] = clone(choice);
      this.record('response', { player: a.player, choice });
      this.resolveIfReady();
    } else {
      assert(s.phase === 'turn' && s.current === a.player, '자신의 차례에만 가능합니다.');
      const p = s.players[a.player];
      if (a.kind === 'discard') this.discard(a.player, a.tile, !!a.riichi);
      else if (a.kind === 'tsumo') {
        assert(p.drawn !== null, '쯔모 직후에만 화료할 수 있습니다.');
        const score = this.score(a.player, p.drawn, true);
        assert(score, '화료할 수 없습니다.');
        this.win([a.player], null, p.drawn, [score]);
      } else if (a.kind === 'kyuushu') {
        assert(this.canKyuushu(a.player), '구종구패 조건이 아닙니다.');
        this.abort('구종구패');
      } else if (a.kind === 'kan') {
        const o = this.kanOptions(a.player).find((o) => o.kind === a.kanKind && o.t === a.t);
        assert(o, '선언할 수 없는 깡입니다.');
        const tile =
          o.kind === 'kakan' ? o.tiles[0] : o.tiles.includes(p.drawn) ? p.drawn : o.tiles[0];
        this.responseWindow(a.player, tile, o.kind, { kan: o });
        this.record('kan-offer', { player: a.player, tile, kind: o.kind });
        this.resolveIfReady();
      } else throw Error('지원하지 않는 동작입니다.');
    }
    this.actions.push(a);
    return this.s;
  }
  /** Riichi payment waits until ron claims resolve: a declaration discard that
   * deals in costs no deposit. Tsumogiri compares physical ID, not tile type. */
  discard(seat, id, riichi = false) {
    const s = this.s,
      p = s.players[seat];
    assert(p.hand.includes(id), '손패에 없는 패입니다.');
    assert(!p.forbidden.includes(typeOf(id)), '쿠이카에로 버릴 수 없는 패입니다.');
    assert(!p.riichi || id === p.drawn, '리치 후에는 쯔모기리만 가능합니다.');
    if (riichi) assert(this.riichiDiscards(seat).includes(id), '리치 조건을 충족하지 않습니다.');
    const tsumogiri = id === p.drawn;
    if (p.riichi) p.ippatsu = false;
    p.hand.splice(p.hand.indexOf(id), 1);
    p.river.push({ id, tsumogiri, riichi, called: false, seq: this.events.length });
    p.discards++;
    p.drawn = null;
    p.forbidden = [];
    this.responseWindow(seat, id, 'discard', {
      riichiDeclaration: riichi,
      doubleCandidate: riichi && p.discards === 1 && !s.interrupted,
    });
    this.record('discard', { player: seat, tile: id, tsumogiri, riichi });
    this.resolveIfReady();
  }
  /** Only once all claimants decide can ron > pon/kan > chi be resolved. Double
   * ron is allowed; triple ron aborts. Equal-priority calls use turn proximity. */
  resolveIfReady() {
    const s = this.s,
      q = s.pending;
    if (!q || Object.keys(q.decisions).length < 3) return;
    const order = [1, 2, 3].map((d) => (q.source + d) % 4);
    const winners = order.filter((i) => q.decisions[i].kind === 'ron');
    for (const i of order)
      if (q.decisions[i].kind !== 'ron' && playerWaits(s.players[i]).includes(typeOf(q.tile))) {
        if (q.kind !== 'ankan' || this.score(i, q.tile, false, true)?.shape.kind === 'kokushi') {
          s.players[i].tempFuriten = true;
          if (s.players[i].riichi) s.players[i].riichiFuriten = true;
        }
      }
    if (winners.length === 3) {
      this.abort('삼가화');
      return;
    }
    if (winners.length) {
      this.win(
        winners,
        q.source,
        q.tile,
        winners.map((i) => this.score(i, q.tile, false, q.kind !== 'discard'))
      );
      return;
    }
    if (q.riichiDeclaration) {
      const p = s.players[q.source];
      p.riichi = true;
      p.doubleRiichi = q.doubleCandidate;
      p.ippatsu = true;
      p.score -= 1000;
      s.sticks++;
      this.record('riichi', { player: q.source, double: p.doubleRiichi });
    }
    if (q.kind !== 'discard') {
      this.completeKan(q.source, q.kan);
      return;
    }
    if (s.players.every((p) => p.riichi)) {
      this.abort('사가리치');
      return;
    }
    if (s.abortFourKans) {
      this.abort('사깡산료');
      return;
    }
    if (!s.interrupted && s.players.every((p) => p.river.length === 1)) {
      const first = s.players.map((p) => typeOf(p.river[0].id));
      if (first[0] >= 27 && first[0] <= 30 && first.every((t) => t === first[0])) {
        this.abort('사풍연타');
        return;
      }
    }
    const claims = order.filter((i) => ['pon', 'minkan', 'chi'].includes(q.decisions[i].kind));
    claims.sort(
      (a, b) => Number(q.decisions[a].kind === 'chi') - Number(q.decisions[b].kind === 'chi')
    );
    if (claims.length) {
      this.call(claims[0], q.decisions[claims[0]], q);
      return;
    }
    s.pending = null;
    this.draw((q.source + 1) % 4);
  }
  /** Any completed call cancels every ippatsu and first-turn privilege. */
  interrupt() {
    this.s.interrupted = true;
    this.s.players.forEach((p) => (p.ippatsu = false));
  }
  /** Liability is assigned to the feeder of the last exposed dragon/wind set. */
  updatePao(seat, from) {
    const p = this.s.players[seat],
      exposed = p.melds
        .filter((m) => m.kind !== 'ankan' && m.kind !== 'chi')
        .map((m) => typeOf(m.tiles[0]));
    if ([31, 32, 33].every((t) => exposed.includes(t))) p.pao['대삼원'] ??= from;
    if ([27, 28, 29, 30].every((t) => exposed.includes(t))) p.pao['대사희'] ??= from;
  }
  /** Called-away tiles remain in the river for furiten/history, but visible
   * counting deduplicates physical IDs so they are never counted twice. */
  call(seat, choice, q) {
    const s = this.s,
      p = s.players[seat];
    this.interrupt();
    p.hand = p.hand.filter((id) => !choice.tiles.includes(id));
    const meld = {
      kind: choice.kind,
      tiles: [...choice.tiles, q.tile].sort((a, b) => a - b),
      called: q.tile,
      from: q.source,
    };
    p.melds.push(meld);
    s.players[q.source].river.at(-1).called = true;
    p.forbidden = choice.forbidden;
    p.drawn = null;
    s.current = seat;
    s.pending = null;
    s.phase = 'turn';
    s.lastDrawRinshan = false;
    this.updatePao(seat, q.source);
    this.record('call', { player: seat, ...meld });
    if (choice.kind === 'minkan') this.afterKan(seat);
  }
  /** Added-kan robbery occurs BEFORE replacing the pon. A robbed fourth tile
   * must therefore never be committed to a quad or increase dora count. */
  completeKan(seat, o) {
    const s = this.s,
      p = s.players[seat];
    this.interrupt();
    p.hand = p.hand.filter((id) => !o.tiles.includes(id));
    if (o.kind === 'kakan') {
      const old = p.melds[o.meldIndex];
      p.melds[o.meldIndex] = {
        ...old,
        kind: 'kakan',
        tiles: [...old.tiles, ...o.tiles],
        added: o.tiles[0],
      };
    } else p.melds.push({ kind: 'ankan', tiles: o.tiles, from: seat, called: null });
    p.drawn = null;
    s.pending = null;
    this.record('kan', { player: seat, ...o });
    this.afterKan(seat);
  }
  /** This profile opens kan-dora immediately for every kan, including minkan.
   * Four kans by multiple seats abort AFTER the replacement draw and discard,
   * preserving the fourth rinshan win and any ron on its following discard. */
  afterKan(seat) {
    const s = this.s;
    s.kanOwners.push(seat);
    s.doraCount++;
    s.abortFourKans = s.kanOwners.length === 4 && new Set(s.kanOwners).size > 1;
    this.draw(seat, true);
  }
  /** Resolve all winners against the same source. Only the closest winner gets
   * deposits and honba. Pao covers only the liable yakuman component. */
  win(winners, loser, tile, results) {
    const s = this.s,
      before = s.players.map((p) => p.score);
    let scores = [...before];
    const wins = [];
    winners.forEach((seat, i) => {
      const result = results[i],
        p = s.players[seat],
        honba = i === 0 ? s.honba : 0,
        sticks = i === 0 ? s.sticks : 0;
      const liable = result.yakuman ? result.yaku.filter((y) => p.pao[y.name] !== undefined) : [];
      if (!liable.length)
        scores = settle(scores, seat, loser, result, s.dealer, honba, sticks).scores;
      else {
        const liableMultiple = liable.reduce((n, y) => n + y.multiple, 0),
          normal = result.yakuman - liableMultiple;
        if (normal)
          scores = settle(
            scores,
            seat,
            loser,
            payments(0, 0, seat === s.dealer, loser === null, normal),
            s.dealer,
            0,
            0
          ).scores;
        for (const y of liable) {
          const from = p.pao[y.name],
            full = payments(0, 0, seat === s.dealer, false, y.multiple).ron;
          if (loser === null || loser === from) {
            scores[from] -= full;
            scores[seat] += full;
          } else {
            scores[from] -= full / 2;
            scores[loser] -= full / 2;
            scores[seat] += full;
          }
        }
        const payer = loser === null ? p.pao[liable[0].name] : loser;
        scores[payer] -= honba * 300;
        scores[seat] += honba * 300 + sticks * 1000;
      }
      wins.push({ player: seat, score: result });
    });
    s.players.forEach((p, i) => (p.score = scores[i]));
    s.sticks = 0;
    s.pending = null;
    s.phase = 'ended';
    s.result = {
      kind: 'win',
      title: loser === null ? '쯔모' : '론',
      winners,
      loser,
      tile,
      wins,
      deltas: scores.map((n, i) => n - before[i]),
      dealerContinues: winners.includes(s.dealer),
    };
    this.record('win', s.result);
    this.checkEnd();
  }
  /** Abortive draws repeat the same dealer and carry all deposits forward. */
  abort(reason) {
    const s = this.s;
    s.pending = null;
    s.phase = 'ended';
    s.result = { kind: 'abort', title: reason, dealerContinues: true, deltas: [0, 0, 0, 0] };
    this.record('abort', s.result);
  }
  /** Nagashi replaces noten settlement. Multiple qualifiers each receive a
   * mangan tsumo settlement; a called discard disqualifies its owner. */
  exhaustiveDraw() {
    const s = this.s,
      before = s.players.map((p) => p.score),
      tenpai = s.players.map((p) => playerWaits(p).length > 0);
    const nagashi = s.players.flatMap((p, i) =>
      p.river.length && p.river.every((d) => isOutside(typeOf(d.id)) && !d.called) ? [i] : []
    );
    let scores = [...before];
    if (nagashi.length) {
      for (let k = 0; k < nagashi.length; k++) {
        const i = nagashi[k];
        scores = settle(
          scores,
          i,
          null,
          payments(5, 30, i === s.dealer, true),
          s.dealer,
          s.honba,
          k === 0 ? s.sticks : 0
        ).scores;
      }
      s.sticks = 0;
    } else {
      const n = tenpai.filter(Boolean).length;
      if (n > 0 && n < 4)
        scores = scores.map((x, i) => x + (tenpai[i] ? 3000 / n : -3000 / (4 - n)));
    }
    s.players.forEach((p, i) => (p.score = scores[i]));
    s.phase = 'ended';
    s.pending = null;
    s.result = {
      kind: 'draw',
      title: nagashi.length ? '유국만관' : '황패유국',
      tenpai,
      nagashi,
      dealerContinues: tenpai[s.dealer],
      deltas: scores.map((n, i) => n - before[i]),
    };
    this.record('draw-end', s.result);
    this.checkEnd();
  }
  /** East/south matches use 30k target, one extra wind maximum, dealer agari/
   * tenpai stop when leading, negative-point bankruptcy, initial-seat tie break. */
  checkEnd() {
    const s = this.s,
      limit = this.config.length === 'east' ? 4 : 8,
      rank = s.players
        .map((p, i) => ({ i, score: p.score }))
        .sort((a, b) => b.score - a.score || a.i - b.i);
    const atLast = s.kyoku >= limit - 1,
      lead = rank[0].score >= 30000,
      repeat = s.result.dealerContinues;
    if (
      s.players.some((p) => p.score < 0) ||
      (atLast && repeat && rank[0].i === s.dealer && lead) ||
      (atLast && !repeat && (lead || s.kyoku >= limit + 3))
    ) {
      if (s.sticks) {
        s.players[rank[0].i].score += s.sticks * 1000;
        s.sticks = 0;
      }
      s.phase = 'matchEnd';
      this.record('match-end', { ranking: rank.map((x) => x.i) });
    }
  }
  /** Dealer repeats preserve kyoku; every draw increments honba, non-dealer
   * wins reset it. Deposits survive draws and are never silently destroyed. */
  nextRound() {
    const s = this.s,
      r = s.result;
    if (r.dealerContinues) s.honba++;
    else {
      s.kyoku++;
      s.dealer = (s.dealer + 1) % 4;
      s.honba = r.kind === 'win' ? 0 : s.honba + 1;
    }
    s.serial++;
    this.startRound();
  }
  /** Versioned, deterministic, human-readable format; private hand information
   * is intentionally present so the entire game can be reconstructed offline. */
  export() {
    return JSON.stringify(
      {
        format: 'riichi-mahjong',
        version: 1,
        seed: this.seed,
        config: this.config,
        actions: this.actions,
        events: this.events,
      },
      null,
      2
    );
  }
  /** Replay files are untrusted input: cap size/actions, normalize config, run
   * legal commands from scratch and reject event tampering or unknown versions. */
  static import(text) {
    assert(
      typeof text === 'string' && text.length < 25_000_000,
      '패보는 25MB 이하만 불러올 수 있습니다.'
    );
    const data = JSON.parse(text);
    assert(
      data.format === 'riichi-mahjong' && data.version === 1,
      'Riichi Mahjong v1 패보가 아닙니다.'
    );
    assert(
      Number.isInteger(data.seed) && data.seed >= 0 && data.seed <= 0xffffffff,
      '올바르지 않은 시드입니다.'
    );
    assert(
      Array.isArray(data.actions) && data.actions.length < 12000,
      '패보 동작 수가 올바르지 않습니다.'
    );
    const match = new Match(data.config, data.seed);
    for (const a of data.actions) match.dispatch(a);
    assert(same(data.events, match.events), '패보 사건 기록이 재생 결과와 다릅니다.');
    return match;
  }
}
