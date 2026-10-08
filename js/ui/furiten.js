import { typeOf, label } from '../core/tiles.js';
import { visibleCounts, publicScoreContext } from '../core/game.js';
import { beforeDraw, analyzeWaits, previewDiscard } from '../core/hand-analysis.js';
import { tile, tiles, esc } from './common.js';
/** Pure, shared rule analysis drives preview and own-river highlighting. */
export function selectionAnalysis(s, seat, selected = null, riichi = false) {
 const p=s.players[seat], known=visibleCounts(s,seat), ctx=publicScoreContext(s,seat);
 if(selected!==null && s.current===seat && s.phase==='turn' && p.hand.length%3===2)
  return previewDiscard(p,selected,{...ctx,riichi:p.riichi||riichi},known);
 return analyzeWaits(beforeDraw(p),ctx,known);
}
/** Show structural waits, yaku legality, furiten and unseen supply separately. */
export function furitenPanel(a) {
 if(!a || !a.waits.length) return '';
 const f=a.furiten, preview=a.tile!==undefined;
 const heading=preview
 ? `${label(typeOf(a.tile))} 타패 후 ${f.any ? a.transition==='new'?'후리텐이 발생합니다':'기존 후리텐이 유지됩니다' : a.transition==='cleared'?'타패 후리텐이 해제됩니다':'대기'}`
 : f.any?'현재 후리텐 · 대기 전체 론 금지':'현재 화료 대기';
 return `<section class="furiten-panel ${f.any?'is-furiten':''}" aria-live="polite" data-preview="${preview}">
 <h3>${esc(heading)}</h3>
 ${f.discard?`<p>버림패 후리텐: 대기 중 하나라도 내 버림패에 있으면 모든 대기로 론할 수 없습니다. 대기가 바뀌면 해제될 수 있습니다.</p><div class="furiten-causes"><b>후리텐 원인 패</b>${tiles(f.causeTypes.map(t=>t*4+1),{small:true})}<span>${f.causeTypes.map(label).join('·')}</span></div>`:''}
 ${f.temporary?'<p>동순 후리텐: 다음 자신의 쯔모까지 론할 수 없습니다.</p>':''}
 ${f.riichi?'<p>리치 후 후리텐: 이 국이 끝날 때까지 론할 수 없습니다.</p>':''}
 ${f.any?`<p class="ron-blocked-list">론 불가능한 대기패: ${a.waits.map(w=>label(w.t)).join('·')}</p>`:''}
 <div class="wait-details">${a.waits.map(w=>`<div class="wait-card ${w.ronBlocked?'ron-blocked':''} ${w.left?'':'exhausted'}" data-wait-type="${w.t}">${tile(w.t*4+1,{small:true})}<b>${label(w.t)} · 미확인 ${w.left}장</b><span>${w.shapes.join('·')}</span><span>${w.ronBlocked?'후리텐: 론 불가':w.ronAllowed?`론 가능 (${w.ronScore.yakuman ? '역만' : w.ronScore.han+'판'})`:'역 없음: 론 불가'}</span><span class="${w.tsumoAllowed?'tsumo-allowed':''}">${w.tsumoAllowed?(w.left?'쯔모 화료 가능':'쯔모 역 충족 · 미확인 0장'):'역 없음: 쯔모 불가'}</span>${w.left===0?'<span>미확인 패 0장</span>':''}</div>`).join('')}</div>
 <p class="micro">구조적 완성 대기 ${a.waits.length}종 · 미확인 ${a.total}장. 미확인 패에는 타가 손패와 왕패가 포함됩니다. 역은 현재 공개된 조건으로 검증하며 우라·잇파츠·해저·영상 등 미래의 추가 역은 가정하지 않습니다.</p>
 ${preview&&f.any?'<p class="micro">이 타패는 합법입니다. 같은 패를 다시 누르거나 타패 버튼으로 진행할 수 있습니다.</p>':''}</section>`;
}
