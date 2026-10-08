import { shuffled, counts, typeOf, sorted, parseTiles, notation, label } from '../core/tiles.js';
import {
  rankDiscards,
  shantenDetails,
  ukeire,
  decompositions,
  waits,
  shanten,
} from '../core/shanten.js';
import { defenseRows } from '../core/ai.js';
import { scoreHand, payments, settle } from '../core/scoring.js';
import { solveAllLast, ranking } from '../core/all-last.js';
import {
  esc,
  num,
  signed,
  tile,
  tiles,
  pill,
  button,
  analysisTable,
  shantenText,
  ukeireTiles,
  field,
} from './common.js';

export { newEfficiency, answerEfficiency, nextEfficiency } from '../core/efficiency.js';
/** Keep the physical drawn tile at the right without mutating the sorted model.
 * One scoped hand component is used for active, final and historical hands. */
function efficiencyHand(hand, drawn = null, options = {}) {
 const hasDraw = hand.includes(drawn);
 const ordered = hasDraw ? [...hand.filter(id => id !== drawn), drawn] : hand;
 return `<div class="hand efficiency-hand">${ordered.map(id => tile(id, {
   ...options, classes: hasDraw && id === drawn ? 'drawn' : '',
   attrs: hasDraw && id === drawn ? 'aria-description="쯔모패"' : '',
 })).join('')}</div>`;
}
/** Final 13 tiles and historical 14-tile decisions are intentionally separate. */
export function efficiencyView(e) {
 const rows=e.rows??rankDiscards(e.hand,0,counts([...e.hand,...e.river]));
 const record=e.history.at(-1),ratio=e.maxPoints?Math.round(e.points/e.maxPoints*100):0;
 const progress=`<div class="practice-stat"><b>${e.maxPoints?ratio:'—'}<small>%</small></b><span>${e.points} / ${e.maxPoints}점</span></div>`;
 const scoring='<p class="micro">점수 = 최소 샨텐을 유지한 선택의 유효패 수 합계. 분모 = 각 순 최적 유효패 수의 합계(0장이면 1점). 샨텐이 더 높은 선택은 0점입니다. 매수는 미확인 패이며 패산 잔존 매수가 아닙니다.</p>';
 if(e.ended)return `<div class="practice-top"><div><span class="eyebrow">TENPAI · COMPLETE</span><h1>텐파이 달성!</h1><p class="muted">${e.history.length}회 타패 · 연습이 종료되었습니다.</p></div>${progress}</div>
 <section class="panel efficiency-result"><h2>최종 손패</h2>${efficiencyHand(e.hand)}
 <h3>최종 대기 · ${e.final.waits.length}종 / 미확인 ${e.final.total}장</h3><div class="wait-details">${e.final.waits.map(w=>`<div class="wait-card ${w.left?'':'exhausted'}">${tile(w.t*4+1)}<b>${label(w.t)} · ${w.left}장</b><span>${w.shapes.join('·')}</span></div>`).join('')}</div>
 ${scoring}<p>누적 ${e.points}점 / 최대 ${e.maxPoints}점 · 달성 비율 ${ratio}%</p><div class="action-row">${button('다시 연습하기','eff-new','','primary')}${button('연습 메뉴로','eff-menu')}</div></section>
 <section class="panel"><h2>개선할 수 있었던 선택</h2>${e.history.some(r=>!r.optimal.includes(r.selected))?e.history.filter(r=>!r.optimal.includes(r.selected)).map(r=>`<p>${r.turn}순 ${label(r.selected)}: ${esc(r.reason)}</p>`).join(''):'<p>모든 타패가 해당 시점의 최적 선택입니다.</p>'}</section>${efficiencyHistory(e)}`;
 const chosen=record&&e.choice!==null?record.chosen:null;
 return `<div class="practice-top"><div><span class="eyebrow">TILE EFFICIENCY</span><h1>어떤 패를 버릴까요?</h1><p class="muted">타패 후 텐파이가 되면 즉시 결과를 확인합니다.</p></div>${progress}</div>
 <section class="panel practice-hand"><div class="panel-heading"><span>${e.turn}순째 ${pill(shantenText(shanten(counts(e.hand))))}</span>${button('새 손패','eff-new')}</div>
 ${efficiencyHand(e.hand,e.drawn,{action:'eff-answer',disabled:e.choice!==null})}
 <div class="hand-footer"><span class="micro">패를 누르면 타패하고 정답과 비교합니다.</span>${button(e.show?'분석 숨기기':'분석 보기','eff-reveal')}</div>
 ${chosen?`<div class="feedback ${record.optimal.includes(e.choice)?'good':''}"><b>${esc(record.reason)}</b><span>${label(chosen.t)} → ${shantenText(chosen.shanten)} · 유효패 ${chosen.total}장 · ${record.earned}/${record.maximum}점</span>${e.wall.length?button('다음 쯔모','eff-next','','primary'):'<span>연습 패산이 소진되었습니다. 새 손패를 시작하세요.</span>'}</div>`:''}
 ${e.river.length?`<div class="training-river" data-public><span>내 버림패</span>${tiles(e.river,{small:true})}</div>`:''}</section>
 ${e.show?`<section class="panel"><div class="panel-heading"><h2>타패별 비교</h2>${button(e.busy?'계산 중…':e.twoStep?'2회 쯔모 분석 완료':'2회 쯔모까지 분석','eff-deep',e.busy?'disabled':'')}</div>${scoring}${e.twoStep?'<p class="micro">당시 미확인 패에서 상대 행동을 제외한 비복원 추출을 가정합니다. 두 번 이내 2샨텐 개선(텐파이는 화료) 확률이며 실제 패산 확률이 아닙니다.</p>':''}${analysisTable(rows,e.choice)}</section>`:''}`;
}
/** Expandable comparisons retain all co-optimal choices and public counts. */
function efficiencyHistory(e) {
 return `<section class="panel efficiency-history"><h2>타패별 분석</h2>${e.history.map(r=>`<details><summary>${r.turn}순 · ${label(r.selected)} · ${shantenText(r.chosen.shanten)} · ${r.earned}/${r.maximum}점</summary>${efficiencyHand(r.hand,r.drawn,{small:true})}<p>실제 ${label(r.selected)} / 최적 ${r.optimal.map(label).join('·')}</p><p>${esc(r.reason)}</p><p>샨텐 손실 ${r.loss.shanten} · 유효패 손실 ${r.loss.ukeire===null?'샨텐이 달라 직접 비교하지 않음':r.loss.ukeire+'장'}</p>${analysisTable(r.rows,r.selected)}</details>`).join('')}</section>`;
}
/** Construct visible scenarios from distinct physical IDs. Include a matching
 * type in the quiz hand where possible so genbutsu identification is trainable. */
export function newDefense(threatCount = 1, seed = Date.now()) {
  const wall = shuffled(seed),
    opponents = [];
  let seq = 0;
  for (let i = 0; i < threatCount; i++) {
    const river = wall
      .splice(0, 10)
      .map((id, j) => ({ id, seq: seq++, riichi: j === 9, tsumogiri: j % 3 === 1 }));
    opponents.push({ name: i === 0 ? '하가' : '대면', riichi: true, river, melds: [] });
  }
  const hand = [];
  for (const p of opponents) {
    const safe = wall.findIndex((id) => p.river.some((d) => typeOf(d.id) === typeOf(id)));
    if (safe >= 0) hand.push(wall.splice(safe, 1)[0]);
  }
  hand.push(...wall.splice(0, 13 - hand.length));
  const known = counts([...hand, ...opponents.flatMap((p) => p.river.map((d) => d.id))]);
  return {
    hand: sorted(hand),
    opponents,
    known,
    choice: null,
    rows: defenseRows(
      hand,
      opponents,
      known,
      opponents.map((p) => p.river)
    ),
  };
}
export function defenseView(d) {
  const chosen = d.rows.find((r) => r.t === d.choice),
    best = d.rows[0];
  return `<div class="practice-top"><div><span class="eyebrow">DEFENSE</span><h1>이번 순에는 내려놓기</h1><p class="muted">리치자의 버림패를 읽고 가장 안전한 패를 고르세요.</p></div><label class="field inline"><span>리치한 상대</span><select id="def-threats"><option value="1" ${d.opponents.length === 1 ? 'selected' : ''}>1명</option><option value="2" ${d.opponents.length === 2 ? 'selected' : ''}>2명</option></select></label></div>
  <div class="defense-opponents">${d.opponents.map((p) => `<section class="panel"><div class="panel-heading"><h2>${p.name}</h2>${pill('리치', 'gold')}</div><div class="training-river" data-public>${p.river.map((x) => tile(x.id, { classes: x.riichi ? 'declaration' : x.tsumogiri ? 'tsumogiri' : 'tedashi' })).join('')}</div></section>`).join('')}</div>
  <section class="panel practice-hand"><div class="panel-heading"><h2>내 손패</h2>${button('다음 문제', 'def-new')}</div><div class="hand tiles-hand">${d.hand.map((id) => tile(id, { action: 'def-answer', selected: typeOf(id) === d.choice })).join('')}</div>${chosen ? `<div class="feedback ${chosen.combined === best.combined ? 'good' : ''}"><b>${chosen.combined === best.combined ? '현재 기준에서 가장 안전한 선택입니다.' : `${label(best.t)}이 더 안전하게 평가됩니다.`}</b>${chosen.opponents.map((p) => `<span>${p.name}: ${p.reasons.join(' · ')}</span>`).join('')}</div>` : ''}</section>
  ${chosen ? `<section class="panel"><div class="panel-heading"><h2>상대별 안전도</h2><span class="micro">낮을수록 안전</span></div><div class="table-scroll"><table class="analysis-table"><thead><tr><th>타패</th>${d.opponents.map((p) => `<th>${p.name}</th>`).join('')}<th>최대 위험 지수</th></tr></thead><tbody>${d.rows.map((r) => `<tr class="${r.t === d.choice ? 'chosen' : ''}"><td>${tile(r.t * 4 + 1, { small: true })}</td>${r.opponents.map((p) => `<td>${p.reasons.join('<br>')}</td>`).join('')}<td>${r.risk === 0 ? pill('현물', 'green') : r.risk}</td></tr>`).join('')}</tbody></table></div><p class="micro">지수는 비교용 휴리스틱이며 방총 확률이 아닙니다. 스지·카베는 간짱·쌍퐁·치또이츠·국사 대기까지 배제하지 않습니다.</p></section>` : ''}`;
}
export const newCalculator = () => ({
  hand: parseTiles('123456m234p678s22p'),
  tsumo: true,
  riichi: false,
  seat: 1,
  round: 0,
  indicator: -1,
  winId: null,
  error: '',
});
/** A palette click allocates an unused physical copy, preserving the four-copy
 * invariant even when users combine notation input, deletion and red fives. */
export function calculatorAdd(c, t, red = false) {
  if (c.hand.length >= 14) throw Error('손패는 14장까지만 넣을 수 있습니다.');
  const id = (red ? [0] : [1, 2, 3, 0]).map((k) => t * 4 + k).find((id) => !c.hand.includes(id));
  if (id === undefined) throw Error(`${label(t)}은 이미 4장입니다.`);
  c.hand.push(id);
  c.winId = id;
}
/** Expose decomposition, wait and exact score, not just a scalar shanten value. */
export function calculatorView(c) {
  const count = counts(c.hand),
    valid = [13, 14].includes(c.hand.length),
    details = valid ? shantenDetails(count) : null;
  const rows = valid && c.hand.length === 14 ? rankDiscards(c.hand) : [],
    u = valid && c.hand.length === 13 ? ukeire(count) : null;
  const shapes = valid ? decompositions(count) : [],
    winId = c.hand.includes(c.winId) ? c.winId : c.hand.at(-1);
  const score = shapes.length
    ? scoreHand(c.hand, [], {
        winTile: winId,
        tsumo: c.tsumo,
        riichi: c.riichi,
        seat: c.seat,
        round: c.round,
        dealer: c.seat === 0,
        doraIndicators: c.indicator >= 0 ? [c.indicator * 4 + 1] : [],
      })
    : null;
  return `<div class="practice-top"><div><span class="eyebrow">HAND LAB</span><h1>샨텐 계산기</h1><p class="muted">패를 눌러 구성하고, 손패를 눌러 제거하세요.</p></div>${pill(`${c.hand.length} / 14장`, valid ? 'green' : '')}</div>
  <div class="calculator-layout"><section class="panel"><form id="notation-form" class="notation-form"><input aria-label="손패 기호" name="notation" value="${notation(c.hand)}" placeholder="123m456p789s11223z" autocapitalize="off" spellcheck="false"><button class="button" type="submit">입력</button></form><div class="hand tiles-hand calc-hand">${tiles(sorted(c.hand), { action: 'calc-remove' })}${c.hand.length === 0 ? '<p class="muted">아래에서 패를 추가하세요.</p>' : ''}</div><div class="action-row">${button('비우기', 'calc-clear')}${button('임의의 손패', 'calc-random')}${button('치또이츠 예제', 'calc-example', 'data-example="1122m3344p5566s1z"')}${button('국사 예제', 'calc-example', 'data-example="19m19p19s1234567z"')}</div><div class="palette">${[
    3,
  ]
    .map(
      (s) =>
        `<div class="palette-row"><span>${['만', '통', '삭', '자'][s]}</span>${Array.from(
          { length: s === 3 ? 7 : 9 },
          (_, r) => {
            const t = s * 9 + r;
            return tile(t * 4 + 1, {
              action: 'calc-add',
              disabled: count[t] >= 4 || c.hand.length >= 14,
              attrs: `data-type="${t}"`,
            });
          }
        ).join('')}</div>`
    )
    .join(
      ''
    )}<div class="palette-row"><span>적</span>${[4, 13, 22].map((t) => tile(t * 4, { action: 'calc-add-red', disabled: c.hand.includes(t * 4) || c.hand.length >= 14, attrs: `data-type="${t}"` })).join('')}</div></div><p class="micro">m 만수 · p 통수 · s 삭수 · z 자패(1동 2남 3서 4북 5백 6발 7중) · 0 적5</p></section>
  <section class="panel"><h2>현재 손패</h2>${
    details
      ? `<div class="big-stat">${shantenText(details.min)}</div><div class="metric-list">${[
          ['일반형', details.standard],
          ['치또이츠', details.chiitoi],
          ['국사무쌍', details.kokushi],
        ]
          .map(([name, n]) => `<div><span>${name}</span><b>${shantenText(n)}</b></div>`)
          .join('')}</div>`
      : '<p class="muted">13장 또는 14장으로 구성해 주세요.</p>'
  }${u ? `<h3>유효패 ${u.total}장 · ${u.tiles.length}종</h3><div class="waits">${ukeireTiles(u.tiles)}</div>${u.shanten === 0 ? `<p class="micro">대기: ${waits(count).map(label).join(', ')}</p>` : ''}` : ''}
  ${shapes.length ? `<div class="score-controls"><label>화료 방식<select id="calc-tsumo"><option value="true" ${c.tsumo ? 'selected' : ''}>쯔모</option><option value="false" ${!c.tsumo ? 'selected' : ''}>론</option></select></label><label>자풍<select id="calc-seat">${['동', '남', '서', '북'].map((n, i) => `<option value="${i}" ${c.seat === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>장풍<select id="calc-round">${['동', '남', '서', '북'].map((n, i) => `<option value="${i}" ${c.round === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>화료패<select id="calc-win">${c.hand.map((id) => `<option value="${id}" ${id === winId ? 'selected' : ''}>${label(typeOf(id))}</option>`).join('')}</select></label><label>도라 표시<select id="calc-indicator"><option value="-1">없음</option>${Array.from({ length: 34 }, (_, t) => `<option value="${t}" ${c.indicator === t ? 'selected' : ''}>${label(t)}</option>`).join('')}</select></label><label class="check"><input id="calc-riichi" type="checkbox" ${c.riichi ? 'checked' : ''}>리치</label></div>${score ? `<h3>${score.limit || `${score.han}판 ${score.fu}부`} · ${num(score.total)}점</h3><p>${score.yaku.map((y) => `${y.name} ${y.multiple ? y.multiple + '배' : y.han + '판'}`).join(' · ')}</p><div class="metric-list">${score.fuItems.map((f) => `<div><span>${f.name}</span><b>${f.fu}부</b></div>`).join('')}</div>` : '<p class="warning-text">완성형이지만 현재 조건에는 역이 없어 화료할 수 없습니다.</p>'}` : ''}</section></div>
  ${shapes.length ? `<section class="panel"><h2>완성 형태 ${shapes.length}개</h2><div class="decompositions">${shapes.map((d) => `<div>${d.kind === 'chiitoi' ? `<span>치또이츠</span>${d.pairs.map((t) => `<span class="shape-group">${tiles([t * 4 + 1, t * 4 + 2], { small: true })}</span>`).join('')}` : d.kind === 'kokushi' ? '<span>국사무쌍 · 요구패 13종과 머리 1개</span>' : `<span class="shape-group">${tiles([d.pair * 4 + 1, d.pair * 4 + 2], { small: true })}</span>${d.groups.map((g) => `<span class="shape-group">${tiles(g.kind === 'triplet' ? [g.t * 4, g.t * 4 + 1, g.t * 4 + 2] : [g.t * 4 + 1, (g.t + 1) * 4 + 1, (g.t + 2) * 4 + 1], { small: true, aka: false })}</span>`).join('')}`}</div>`).join('')}</div></section>` : ''}
  ${rows.length ? `<section class="panel"><h2>타패별 유효패</h2>${analysisTable(rows)}</section>` : ''}`;
}
export const newAllLast = () => ({
  scores: [22000, 34000, 26000, 18000],
  winner: 0,
  dealer: 3,
  targetRank: 1,
  honba: 0,
  sticks: 0,
  show: false,
  loser: 1,
  han: 3,
  fu: 40,
  attempt: null,
});
/** Questions and simulation use identical settlement, including tie priority. */
export function allLastView(a) {
  const solutions = a.show ? solveAllLast(a) : null,
    names = ['동 시작', '남 시작', '서 시작', '북 시작'];
  return `<div class="practice-top"><div><span class="eyebrow">ALL LAST · 南四局</span><h1>역전에 필요한 한 판</h1><p class="muted">직격과 쯔모의 점수 이동을 비교해 순위 조건을 계산하세요.</p></div>${button('새 문제', 'all-new')}</div>
  <section class="panel"><form id="all-form"><div class="four-fields">${a.scores.map((n, i) => field(names[i], `score${i}`, n)).join('')}</div><div class="form-grid"><label class="field"><span>내 자리</span><select name="winner">${names.map((n, i) => `<option value="${i}" ${a.winner === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label class="field"><span>현재 친</span><select name="dealer">${names.map((n, i) => `<option value="${i}" ${a.dealer === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label class="field"><span>목표 순위</span><select name="targetRank">${[1, 2, 3].map((i) => `<option value="${i}" ${a.targetRank === i ? 'selected' : ''}>${i}위 ${i > 1 ? '이상 유지' : '역전'}</option>`).join('')}</select></label>${field('본장', 'honba', a.honba, 1)}${field('공탁', 'sticks', a.sticks, 1)}</div><button class="button primary" type="submit">필요 점수 계산</button></form><p class="micro">동점은 동1국 시작 좌석 순으로 결정합니다. 표시 순위는 이번 화료 직후 기준이며, 친 연장 여부는 별도입니다.</p></section>
  <section class="panel"><h2>먼저 예상해 보기</h2><form id="all-attempt-form" class="form-grid"><label class="field"><span>화료 방식</span><select name="loser"><option value="-1">쯔모</option>${names.map((n, i) => (i === a.winner ? '' : `<option value="${i}" ${a.loser === i ? 'selected' : ''}>${n}에게 론</option>`)).join('')}</select></label>${field('판수', 'han', a.han, 1)}<label class="field"><span>부수</span><select name="fu">${[20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((n) => `<option value="${n}" ${n === a.fu ? 'selected' : ''}>${n}부</option>`).join('')}</select></label><button class="button" type="submit">결과 확인</button></form>${a.attempt ? `<div class="feedback ${a.attempt.rank <= a.targetRank ? 'good' : ''}"><b>${a.attempt.rank}위 · ${a.attempt.rank <= a.targetRank ? '목표 달성' : '점수가 더 필요합니다.'}</b><span>${a.attempt.scores.map((n, i) => `${names[i]} ${num(n)} (${signed(a.attempt.deltas[i])})`).join(' · ')}</span></div>` : ''}</section>
  ${solutions ? `<section class="panel"><h2>목표 ${a.targetRank}위의 최소 화료 조건</h2><div class="all-solutions">${solutions.map((r) => `<article><span class="eyebrow">${r.loser === null ? 'TSUMO' : 'RON'}</span><h3>${r.loser === null ? '쯔모' : names[r.loser] + ' 직격'}</h3>${r.best ? `<strong>${r.best.entry.limit || `${r.best.entry.han}판 ${r.best.entry.fu}부`}</strong><p>${r.best.entry.limit ? '기본 화료점' : r.solutions.map((s) => `${s.entry.han}판 ${s.entry.fu}부`).join(' / ')}</p><b>${num(r.minimum)}점</b>${r.loser === null ? `<p class="micro">${a.winner === a.dealer ? `${num(r.best.entry.child)}점 올` : `자 ${num(r.best.entry.child)} / 친 ${num(r.best.entry.parent)}`}</p>` : ''}<div class="mini-scores">${r.best.scores.map((n, i) => `<span>${names[i]} <b>${num(n)}</b></span>`).join('')}</div>` : '<p>단일 역만 범위로는 달성할 수 없습니다.</p>'}</article>`).join('')}</div><p class="micro">화료점에 본장·공탁을 더해 최종 점수를 계산합니다. 최소 점수가 같은 판부 조합을 함께 표시합니다. 실제 손패에 맞는 역과 부수는 별도로 성립해야 합니다.</p></section>` : ''}`;
}
