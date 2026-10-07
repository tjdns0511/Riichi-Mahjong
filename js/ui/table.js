import { typeOf, WINDS, sorted, label } from '../core/tiles.js';
import { roundName, indicators, seatWind, furiten, visibleCounts } from '../core/game.js';
import { shantenDetails, rankDiscards } from '../core/shanten.js';
import { counts } from '../core/tiles.js';
import {
  esc,
  num,
  signed,
  shantenText,
  tile,
  tiles,
  pill,
  button,
  analysisTable,
} from './common.js';

const LEVEL = { easy: '초급', medium: '중급', hard: '고급' };
/** Relative positions rotate with the human whose turn it is. The concealed
 * hands of every other seat remain backs, including local hotseat spectators. */
export function board(s, viewer = 0, { replay = false } = {}) {
  const positions = ['south', 'east', 'north', 'west'];
  return `<div class="mahjong-board" aria-label="${roundName(s)} 마작 탁자">
    <div class="board-grain"></div>
    <div class="table-center"><span class="eyebrow">${s.config.length === 'east' ? 'EAST' : 'EAST · SOUTH'}</span><strong>${roundName(s)}</strong><div class="center-count"><b>${s.live.length}</b><span>남은 패</span></div><div class="center-sticks"><span>본장 <b>${s.honba}</b></span><span>공탁 <b>${s.sticks}</b></span></div></div>
    ${positions
      .map((pos, rel) => {
        const i = (viewer + rel) % 4,
          p = s.players[i],
          wind = WINDS[seatWind(s, i)];
        return `<section class="seat ${pos} ${i === s.current && s.phase === 'turn' ? 'active' : ''}"><div class="seat-main"><span class="wind ${i === s.dealer ? 'dealer' : ''}">${wind}</span><div><span class="seat-name">${esc(p.name)} ${p.riichi ? '<em>리치</em>' : ''}</span><strong>${num(p.score)}</strong></div></div>${rel !== 0 ? `<div class="concealed">${Array.from({ length: p.hand.length }, () => tile(0, { back: true })).join('')}</div>` : ''}<div class="melds" data-public>${p.melds.map((m) => `<span class="meld" title="${m.kind}">${m.tiles.map((id, j) => (m.kind === 'ankan' && (j === 0 || j === 3) && !replay ? tile(0, { back: true }) : tile(id, { small: true, aka: s.config.aka, classes: id === m.called ? 'called-tile' : '' }))).join('')}</span>`).join('')}</div></section>
    <div class="river ${pos}" data-public aria-label="${esc(p.name)} 버림패">${p.river.map((d) => `<span class="river-cell ${d.riichi ? 'riichi-cut' : ''} ${d.called ? 'called-away' : ''}">${tile(d.id, { small: true, aka: s.config.aka, classes: d.tsumogiri ? 'tsumogiri' : 'tedashi', attrs: `data-seq="${d.seq}"` })}</span>`).join('')}</div>`;
      })
      .join('')}
    <div class="dora-rack"><span>도라 표시패</span><div data-public>${tiles(indicators(s), { small: true, aka: s.config.aka })}${Array.from({ length: 5 - s.doraCount }, () => tile(0, { back: true })).join('')}</div></div>
    <span class="table-mark">RIICHI</span>
  </div>`;
}
/** Compact lobby remains beside the table until the first deal is started. */
export function lobby(config) {
  return `<section class="panel setup-panel"><div class="panel-heading"><h2>대국 설정</h2><span class="eyebrow">4 PLAYERS</span></div><form id="lobby-form">
    <label class="field"><span>대국 길이</span><select name="length"><option value="hanchan" ${config.length === 'hanchan' ? 'selected' : ''}>반장전 · 동장 + 남장</option><option value="east" ${config.length === 'east' ? 'selected' : ''}>동풍전 · 동장</option></select></label>
    <div class="seat-settings">${config.seats
      .map(
        (p, i) =>
          `<div class="seat-setting"><span class="wind">${WINDS[i]}</span><input aria-label="${WINDS[i]} 이름" name="name${i}" value="${esc(p.name)}" maxlength="20"><select aria-label="${WINDS[i]} 주체" name="kind${i}"><option value="human" ${p.kind === 'human' ? 'selected' : ''}>사람</option><option value="ai" ${p.kind === 'ai' ? 'selected' : ''}>AI</option></select><select aria-label="${WINDS[i]} AI 난이도" name="level${i}">${Object.entries(
            LEVEL
          )
            .map(
              ([v, n]) => `<option value="${v}" ${p.level === v ? 'selected' : ''}>${n}</option>`
            )
            .join('')}</select></div>`
      )
      .join('')}</div>
    <label class="check"><input type="checkbox" name="aka" ${config.aka ? 'checked' : ''}>적도라 각 1장</label><label class="check"><input type="checkbox" name="doubleYakuman" ${config.doubleYakuman ? 'checked' : ''}>더블역만 적용</label><label class="check"><input type="checkbox" name="kiriage" ${config.kiriage ? 'checked' : ''}>절상만관</label>
    <button class="button primary full" type="submit">대국 시작</button><p class="micro">사람이 2명 이상이면 차례마다 손패를 가리고 기기를 넘깁니다.</p></form></section>`;
}
/** Render legal actions only. Riichi mode locks tile choices to legal tenpai
 * discards; selected tile is still confirmed by a second tap or explicit button. */
export function handPanel(match, ui) {
  const s = match.s,
    p = s.players[ui.viewer],
    onTurn = s.phase === 'turn' && s.current === ui.viewer && p.kind === 'human' && ui.started,
    ownTurn = onTurn && !ui.paused;
  const f = furiten({
      ...p,
      hand: p.drawn === null ? p.hand : p.hand.filter((id) => id !== p.drawn),
    }),
    riichiIds = ui.riichi ? match.riichiDiscards(ui.viewer) : [];
  let hand = ui.sort
    ? sorted(p.hand.filter((id) => id !== p.drawn))
    : p.hand.filter((id) => id !== p.drawn);
  if (p.drawn !== null) hand.push(p.drawn);
  return `<section class="hand-panel"><div class="hand-heading"><div><span class="wind">${WINDS[seatWind(s, ui.viewer)]}</span><b>${esc(p.name)}</b> ${onTurn ? pill('타패 선택', 'green') : ''}</div><div class="hand-badges">${f.discard ? pill('타패 후리텐', 'warning') : ''}${f.temporary ? pill('동순 후리텐', 'warning') : ''}${f.riichi ? pill('리치 후 후리텐', 'warning') : ''}${p.riichi ? pill(p.doubleRiichi ? '더블리치' : '리치', 'gold') : ''}</div></div>
    <div class="hand tiles-hand ${hand.length > 11 ? 'full-hand' : ''}">${hand.map((id) => tile(id, { action: ownTurn ? 'discard-tile' : 'inspect-tile', selected: id === ui.selected, aka: s.config.aka, disabled: ownTurn && (p.forbidden.includes(typeOf(id)) || (p.riichi && id !== p.drawn) || (ui.riichi && !riichiIds.includes(id))), classes: id === p.drawn ? 'drawn' : '' })).join('')}</div>
    <div class="hand-footer"><span class="micro">${ui.riichi ? '리치할 패를 선택한 뒤 한 번 더 누르세요.' : ownTurn ? '한 번 선택 · 같은 패를 다시 누르면 타패' : '패를 누르면 공개된 같은 패를 강조합니다.'}</span>${ownTurn && ui.selected !== null ? button('선택한 패 타패', 'confirm-discard', '', 'primary') : ''}</div>
    ${
      ownTurn
        ? `<div class="action-row">${p.drawn !== null && match.score(ui.viewer, p.drawn, true) ? button('쯔모', 'tsumo', '', 'primary') : ''}${match.riichiDiscards(ui.viewer).length ? button(ui.riichi ? '리치 취소' : '리치', 'riichi', '', ui.riichi ? 'gold' : '') : ''}${match
            .kanOptions(ui.viewer)
            .map((k) =>
              button(
                `${k.kind === 'ankan' ? '안깡' : '가깡'} ${label(k.t)}`,
                'kan',
                `data-kind="${k.kind}" data-tile-type="${k.t}"`
              )
            )
            .join(
              ''
            )}${match.canKyuushu(ui.viewer) ? button('구종구패 유국', 'kyuushu') : ''}</div>`
        : ''
    }
    ${s.phase === 'response' && s.pending.options[ui.viewer]?.length && !s.pending.decisions[ui.viewer] ? `<div class="call-window"><b>${esc(s.players[s.pending.source].name)}의 ${label(typeOf(s.pending.tile))}</b><div class="action-row">${s.pending.options[ui.viewer].map((o, index) => button(`<span>${{ ron: '론', pon: '퐁', chi: '치', minkan: '밍깡' }[o.kind]}</span>${o.tiles ? `<span class="call-tiles">${tiles(o.tiles, { small: true, aka: s.config.aka })}</span>` : ''}`, 'respond', `data-choice="${index}"`, o.kind === 'ron' ? 'primary' : '')).join('')}${button('넘기기', 'respond', 'data-choice="-1"')}</div></div>` : ''}
  </section>`;
}
/** Show derived match results and the exact fu/yaku breakdown. */
export function resultPanel(s) {
  const r = s.result;
  if (!r) return '';
  const standings = s.players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i);
  return `<section class="panel result-panel"><span class="eyebrow">${s.phase === 'matchEnd' ? 'MATCH COMPLETE' : 'ROUND COMPLETE'}</span><h2>${r.title}</h2>${r.wins?.map((w) => `<div class="winner"><h3>${esc(s.players[w.player].name)} <span>${w.score.limit || `${w.score.han}판 ${w.score.fu}부`}</span></h3><div class="hand mini-hand">${tiles([...s.players[w.player].hand, ...(r.loser !== null ? [r.tile] : [])], { small: true, aka: s.config.aka })}</div><p>${w.score.yaku.map((y) => `${y.name} ${y.multiple ? `${y.multiple}배` : y.han + '판'}`).join(' · ')}</p><details><summary>부수 계산</summary>${w.score.fuItems.map((f) => `<p>${f.name}<b>${f.fu}부</b></p>`).join('') || '<p>역만은 부수 계산을 하지 않습니다.</p>'}</details></div>`).join('') ?? ''}
    <div class="score-results">${(s.phase === 'matchEnd' ? standings : s.players.map((p, i) => ({ p, i }))).map(({ p, i }, rank) => `<div><span>${s.phase === 'matchEnd' ? `${rank + 1}위 ` : ''}${esc(p.name)}</span><b>${num(p.score)}</b><em class="${r.deltas[i] > 0 ? 'positive' : r.deltas[i] < 0 ? 'negative' : ''}">${signed(r.deltas[i])}</em>${r.tenpai ? pill(r.tenpai[i] ? '텐파이' : '노텐') : ''}</div>`).join('')}</div><div class="action-row">${s.phase === 'ended' ? button('다음 국', 'next-round', '', 'primary') : button('새 대국 설정', 'new-match', '', 'primary')}${button('이 대국 복기', 'review-current')}</div></section>`;
}
/** Learning assistance uses only public tiles and the viewed player's hand. */
export function gameAnalysis(match, ui) {
  const s = match.s,
    p = s.players[ui.viewer],
    d = shantenDetails(counts(p.hand), p.melds.length),
    known = visibleCounts(s, ui.viewer),
    selected = ui.selected === null ? null : typeOf(ui.selected);
  return `<section class="panel"><div class="panel-heading"><h2>손패 분석</h2>${pill(shantenText(d.min), d.min <= 0 ? 'green' : '')}</div><div class="shanten-mini"><span>일반형 <b>${shantenText(d.standard)}</b></span><span>치또이츠 <b>${Number.isFinite(d.chiitoi) ? shantenText(d.chiitoi) : '—'}</b></span><span>국사무쌍 <b>${Number.isFinite(d.kokushi) ? shantenText(d.kokushi) : '—'}</b></span></div>${selected !== null ? `<div class="selected-info">${tile(ui.selected, { aka: s.config.aka })}<div><b>${label(selected)}</b><span>알려진 패 ${known[selected]}장</span><span>보이지 않는 패 ${Math.max(0, 4 - known[selected])}장</span></div></div>` : '<p class="muted">패를 선택하면 버림패와 부름패의 같은 패를 찾아 줍니다.</p>'}<p class="micro">보이지 않는 패에는 타가 손패와 왕패도 포함됩니다.</p>${button(ui.hints ? '추천 숨기기' : '추천 타패 보기', 'game-hints', '', 'full')}${ui.hints && p.hand.length % 3 === 2 ? analysisTable(rankDiscards(p.hand, p.melds.length, known, p.forbidden).slice(0, 4)) : ''}</section>
  <section class="panel legend-panel"><h2>탁자 읽기</h2><p><span class="legend-mark tedashi-mark"></span>테다시 · 손패에서 버림</p><p><span class="legend-mark tsumogiri-mark"></span>쯔모기리 · 뽑은 패를 바로 버림</p><p><span class="legend-mark riichi-mark"></span>리치 선언패</p><p class="micro">울린 버림패는 옅게 남습니다. 후리텐 판정에는 계속 포함됩니다.</p></section>`;
}
