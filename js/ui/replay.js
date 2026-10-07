import { counts, sorted, typeOf, label } from '../core/tiles.js';
import { rankDiscards } from '../core/shanten.js';
import { visibleCounts, roundName } from '../core/game.js';
import { board } from './table.js';
import { esc, tiles, pill, button, analysisTable } from './common.js';

const EVENT_NAMES = {
  deal: '배패',
  draw: '쯔모',
  discard: '타패',
  response: '부름 응답',
  riichi: '리치',
  call: '후로',
  kan: '깡',
  'kan-offer': '깡 선언',
  win: '화료',
  abort: '도중유국',
  'draw-end': '황패유국',
  'match-end': '대국 종료',
};
/** Replay never mutates the live table. Analysis of a discard uses the preceding
 * snapshot, including only information publicly known at that decision time. */
export function replayView(r, hasGame) {
  const m = r.match,
    s = m?.history[r.index],
    ev = m?.events[r.index],
    viewer = r.viewer;
  let rows = [],
    chosen = null;
  if (m && ev.type === 'discard') {
    const previous = m.history[r.index - 1],
      p = previous?.players[ev.player];
    if (p?.hand.includes(ev.tile)) {
      rows = rankDiscards(p.hand, p.melds.length, visibleCounts(previous, ev.player), p.forbidden);
      chosen = typeOf(ev.tile);
    }
  }
  return `<div class="practice-top"><div><span class="eyebrow">REPLAY</span><h1>선택을 되짚는 시간</h1><p class="muted">패보를 불러오고, 그 순간의 다른 타패를 비교하세요.</p></div><div class="action-row">${button('현재 대국 가져오기', 'replay-current', hasGame ? '' : 'disabled')}${button('JSON 다운로드', 'export-download', hasGame || m ? '' : 'disabled')}${button('클립보드 복사', 'export-copy', hasGame || m ? '' : 'disabled')}</div></div>
  <details class="panel import-panel" ${m ? '' : 'open'}><summary>패보 불러오기</summary><p class="micro">이 앱의 Riichi Mahjong JSON v1 파일을 지원합니다. 천봉·작혼 패보 형식과는 다릅니다.</p><textarea id="replay-json" placeholder="패보 JSON을 붙여 넣으세요" rows="5" spellcheck="false">${esc(r.text ?? '')}</textarea><div class="action-row">${button('텍스트 불러오기', 'replay-import')}<label class="button file-label">JSON 파일 선택<input type="file" id="replay-file" accept=".json,application/json"></label></div></details>
  ${
    m
      ? `<section class="panel replay-controls"><div class="panel-heading"><div>${pill(roundName(s), 'green')} <b>${EVENT_NAMES[ev.type] ?? ev.type}</b> ${ev.player !== undefined ? esc(s.players[ev.player].name) : ''} ${ev.tile !== undefined ? label(typeOf(ev.tile)) : ''}</div><span>${r.index + 1} / ${m.events.length}</span></div><div class="replay-timeline">${button('처음', 'replay-first', r.index === 0 ? 'disabled' : '')}${button('이전', 'replay-prev', r.index === 0 ? 'disabled' : '')}<input type="range" id="replay-slider" min="0" max="${m.events.length - 1}" value="${r.index}" aria-label="패보 순목">${button('다음', 'replay-next', r.index >= m.events.length - 1 ? 'disabled' : '')}${button('끝', 'replay-last', r.index >= m.events.length - 1 ? 'disabled' : '')}</div><label class="field inline"><span>시점</span><select id="replay-viewer">${s.players.map((p, i) => `<option value="${i}" ${i === viewer ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></section>
  <div class="replay-layout"><div>${board(s, viewer, { replay: true })}<section class="hand-panel"><div class="hand-heading"><b>${esc(s.players[viewer].name)}의 손패</b><span class="micro">복기에서만 모든 좌석 확인 가능</span></div><div class="hand tiles-hand">${tiles(sorted(s.players[viewer].hand), { action: 'inspect-tile', aka: s.config.aka })}</div></section></div><section class="panel replay-analysis"><h2>당시의 타패 비교</h2>${rows.length ? `<p>${esc(s.players[ev.player].name)}의 선택: <b>${label(chosen)}</b></p>${analysisTable(rows, chosen)}` : '<p class="muted">타패가 기록된 시점으로 이동하면, 그때의 손패와 공개된 패만으로 유효패를 다시 계산합니다.</p>'}<div class="event-list">${m.events
    .slice(Math.max(0, r.index - 5), r.index + 6)
    .map((e, i) => {
      const index = Math.max(0, r.index - 5) + i;
      return `<button data-action="replay-jump" data-index="${index}" class="${index === r.index ? 'active' : ''}"><small>${index + 1}</small><span>${EVENT_NAMES[e.type] ?? e.type}</span><b>${e.tile !== undefined ? label(typeOf(e.tile)) : ''}</b></button>`;
    })
    .join('')}</div></section></div>`
      : '<div class="empty-replay"><span>牌譜</span><h2>한 수씩, 다시 보기</h2><p>대국을 시작하거나 저장한 패보를 불러오세요.</p></div>'
  }`;
}
