import { counts, typeOf, shuffled, label } from './core/tiles.js';
import { Match, DEFAULT_CONFIG } from './core/game.js';
import { chooseTurn, chooseResponse } from './core/ai.js';
import { parseTiles } from './core/tiles.js';
import { payments, settle } from './core/scoring.js';
import { ranking, scoreEntries } from './core/all-last.js';
import { formatEfficiencyReport } from './core/efficiency-report.js';
import { board, lobby, handPanel, resultPanel, gameAnalysis } from './ui/table.js';
import {
  newEfficiency,
  answerEfficiency,
  nextEfficiency,
  efficiencyView,
  newDefense,
  defenseView,
  newCalculator,
  calculatorAdd,
  calculatorView,
  newAllLast,
  allLastView,
} from './ui/trainers.js';
import { replayView } from './ui/replay.js';
import { esc, button, wireImages, track, copyText, download } from './ui/common.js';

const root = document.querySelector('#app');
const TABS = [
  ['game', '実', '실전 대국'],
  ['efficiency', '効', '패효율'],
  ['defense', '守', '수비 연습'],
  ['alllast', '南', '오라스'],
  ['calculator', '算', '샨텐 계산'],
  ['replay', '譜', '패보 복기'],
];
/** Storage failure must never prevent play (private mode/quota are common on
 * phones). JSON replay download remains available when autosave is unavailable. */
const readStore = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
let match = new Match(readStore('riichi.config', DEFAULT_CONFIG));
const ui = {
  tab: 'game',
  started: false,
  paused: false,
  viewer: 0,
  selected: null,
  riichi: false,
  hints: false,
  labels: readStore('riichi.labels', true),
  sort: readStore('riichi.sort', true),
  handoff: false,
  revealedFor: null,
};
let efficiency = newEfficiency(),
  defense = newDefense(),
  calculator = newCalculator(),
  alllast = newAllLast();
// Keep a report snapshot separate from the exercise; export never advances it.
let efficiencyExport = null;
const replay = { match: null, index: 0, viewer: 0, text: '' };
let aiTimer = null,
  toastTimer = null,
  worker = null,
  workerId = 0;
const jobs = new Map();
try {
  worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id);
    if (job) {
      jobs.delete(data.id);
      data.error ? job.reject(Error(data.error)) : job.resolve(data.result);
    }
  };
  worker.onerror = () => {
    for (const job of jobs.values())
      job.reject(Error('분석 작업을 실행하지 못했습니다. 페이지를 새로 열어 주세요.'));
    jobs.clear();
  };
} catch {
  /* Two-step UI reports worker support rather than freezing the main thread. */
}
/** Promise interface over a single reusable module worker. */
function analyze(task, hand, known) {
  return new Promise((resolve, reject) => {
    if (!worker)
      return reject(
        Error('이 브라우저에서는 고급 분석을 실행할 수 없습니다. HTTPS 주소로 열어 주세요.')
      );
    const id = ++workerId;
    jobs.set(id, { resolve, reject });
    worker.postMessage({ id, task, hand, known });
  });
}
/** A saved game is resumed paused, so hidden hands never advance on page load. */
try {
  const saved = readStore('riichi.match', null);
  if (saved) {
    match = Match.import(saved);
    ui.started = true;
    ui.paused = true;
  }
} catch {
  /* An obsolete or partial save cannot brick the app. */
}
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
/** Build persistent navigation once; content rerenders cannot steal focus from
 * global accessibility settings or duplicate event handlers. */
function shell() {
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-symbol" aria-hidden="true">中</span><div><strong>RIICHI</strong><small>리치 마작</small></div></div><div class="nav-label">PLAY & PRACTICE</div><nav aria-label="주요 메뉴">${TABS.map(([id, icon, name]) => `<button class="nav-button" data-tab="${id}"><span class="nav-icon" aria-hidden="true">${icon}</span>${name}</button>`).join('')}</nav><div class="sidebar-footer"><p>4인 리치마작</p><p>로컬 대국 · 학습 · 분석</p><button data-tab="rules">적용 룰과 사용법</button></div></aside><main class="app-main"><header class="topbar"><span class="topbar-title">RIICHI MAHJONG / <span id="current-section">실전 대국</span></span><div class="settings"><label class="toggle"><input type="checkbox" id="labels-toggle" ${ui.labels ? 'checked' : ''}>패 이름</label><label class="toggle"><input type="checkbox" id="sort-toggle" ${ui.sort ? 'checked' : ''}>자동 리패</label><button class="button ghost" data-tab="rules" aria-label="적용 룰과 사용법">도움말</button></div></header><div id="content" class="content"></div></main></div>`;
}
/** Resolve who needs the device next, without granting view access before the
 * handoff screen is acknowledged. One-human games keep a fixed human viewpoint. */
function syncHuman() {
  const s = match.s,
    humans = s.players.flatMap((p, i) => (p.kind === 'human' ? [i] : []));
  let needed = s.phase === 'turn' && s.players[s.current].kind === 'human' ? s.current : null;
  if (s.phase === 'response')
    needed =
      Object.keys(s.pending.options)
        .map(Number)
        .find((i) => !s.pending.decisions[i] && s.players[i].kind === 'human') ?? null;
  if (humans.length <= 1) {
    ui.viewer = humans[0] ?? 0;
    ui.handoff = false;
    return;
  }
  if (needed !== null) {
    ui.viewer = needed;
    ui.handoff = ui.started && ui.revealedFor !== needed;
  } else ui.handoff = false;
}
/** Every successful engine action autosaves its reproducible command log. */
function perform(action) {
  match.dispatch(action);
  ui.selected = null;
  ui.riichi = false;
  if (action.kind === 'discard' || action.kind === 'respond') ui.revealedFor = null;
  if (action.kind === 'next') ui.revealedFor = null;
  writeStore('riichi.match', match.export());
  syncHuman();
  render();
}
/** Schedule only one AI action at a time. Switching tabs pauses scheduling but
 * does not discard game state; returning safely resumes from the same phase. */
function scheduleAI() {
  clearTimeout(aiTimer);
  if (ui.tab !== 'game' || !ui.started || ui.paused || ui.handoff) return;
  const s = match.s;
  let aiSeat = null;
  if (s.phase === 'turn' && s.players[s.current].kind === 'ai') aiSeat = s.current;
  else if (s.phase === 'response')
    aiSeat =
      Object.keys(s.pending.options)
        .map(Number)
        .find((i) => !s.pending.decisions[i] && s.players[i].kind === 'ai') ?? null;
  if (aiSeat === null) return;
  aiTimer = setTimeout(() => {
    try {
      perform(match.s.phase === 'turn' ? chooseTurn(match, aiSeat) : chooseResponse(match, aiSeat));
    } catch (error) {
      ui.paused = true;
      render();
      toast(error.message);
    }
  }, 450);
}
/** Application rules are a named profile: no single worldwide "official"
 * profile combines all requested options, so variations are explicit. */
function rulesView() {
  return `<div class="rule-copy"><span class="eyebrow">RULES & HELP</span><h1>이 탁자의 규칙</h1><section class="panel"><h2>대국과 조작</h2><p>한 기기에서 1~4명이 플레이합니다. 다른 자리는 서로 다른 난이도의 AI로 지정할 수 있습니다. 손패를 한 번 누르면 선택하고, 같은 패를 다시 누르거나 ‘선택한 패 타패’를 누르면 버립니다. 여러 사람이 플레이할 때는 손패 보기 버튼을 다음 사람만 누르세요.</p><p>패 이름과 자동 리패는 위쪽에서 바꿀 수 있습니다. 손패에 마우스를 올리거나 누르면 같은 공개 패가 강조됩니다. 남은 매수는 패산 확정 매수가 아닌, 보이지 않는 모든 패의 수입니다. 학습 탭을 보는 동안 대국 진행은 멈춥니다.</p><h2>리치·후리텐·후로</h2><p>멘젠 텐파이, 1,000점 이상, 남은 생패산 4장 이상이면 리치할 수 있습니다. 더블리치는 부름 없는 자신의 첫 타패에 선언합니다. 선언패에서 론이 발생하면 공탁하지 않습니다. 잇파츠는 다음 자기 타패까지이며 모든 치·퐁·깡으로 소멸합니다.</p><p>자신의 버림패 중 대기패 하나라도 있으면 모든 론이 금지됩니다. 넘긴 화료형은 다음 자기 쯔모까지 동순 후리텐이며, 리치 후에는 영구 론 불가입니다. 쯔모 화료는 가능합니다. 울려서 없어진 버림패도 판정에 포함합니다.</p><p>론이 퐁·깡보다 우선하고, 퐁·깡이 치보다 우선합니다. 치는 상가 타패에만 가능합니다. 쿠이카에는 같은 패와 대체 가능한 반대쪽 슌츠 끝패 모두 금지합니다. 리치 후 안깡은 쯔모패로 완성한 암각이고 대기 종류가 그대로일 때만 가능합니다.</p><h2>선택한 룰 프로필</h2><ul><li>25,000점 시작, 30,000점 목표. 동풍전은 최대 남4국, 반장전은 최대 서4국까지 연장합니다. 친 텐파이 연장, 음수 토비, 오라스 이후 1위 친의 30,000점 이상 화료·텐파이 종료를 적용합니다.</li><li>적5 각 1장, 더블역만, 절상만관은 대국 시작 전 선택합니다. 기본은 적도라·더블역만 있음, 절상만관 없음입니다.</li><li>쿠이탕·후즈케 있음, 더블론 있음, 삼가화 유국. 더블론 본장·공탁은 방총자와 가까운 승자에게만 지급합니다. 종료 시 공탁은 1위에게 지급하며 동점은 최초 좌석 순입니다.</li><li>왕패 14장, 영상패 4장. 모든 깡도라는 즉시 공개합니다. 안깡 창깡은 국사무쌍에 한해 허용합니다. 네 번째 깡의 영상 화료와 뒤따르는 론 확인 후 복수 인원 사깡을 유국 처리합니다.</li><li>구종구패, 사풍연타, 사가리치, 사깡산료, 삼가화는 친 연장입니다. 황패유국 텐파이 수수는 총 3,000점입니다.</li><li>유국만관은 자신의 모든 버림패가 요구패이고 한 번도 울리지 않았을 때 성립합니다. 자기 후로는 허용하며 노텐 수수를 대체합니다. 복수 성립은 각각 만관 쯔모 정산, 친 텐파이 시 연장합니다.</li><li>연풍패 머리 4부, 치또이츠 25부, 핑후 쯔모 20부. 국사13면·사암각단기·순정구련·대사희는 옵션에 따라 더블역만. 역만은 복합, 13판 이상은 헤아림 역만입니다. 대삼원·대사희 책임지불은 해당 역만 부분에 적용합니다.</li><li>인화·팔연장·삼연각 등 로컬 역과 우마·오카는 적용하지 않습니다. 최종 순위는 점수 순입니다.</li></ul><h2>AI와 학습 분석</h2><p>초급은 샨텐 중심과 일부 쯔모기리, 중급은 샨텐·유효패와 멘젠 리치, 고급은 도라·역 가능성과 공개된 위험 신호를 사용합니다. 고급은 후리텐·역·예상 타점·대기와 상대별 위험 지수, 순목·점수 상황을 함께 비교해 공격과 수비를 선택합니다. 울기 후 최적의 합법 타패와 실제 역을 확인하며 깡은 대기 변화와 위협을 비교합니다. 상대의 숨은 손패나 패산은 보지 않습니다. 이 AI는 설명 가능한 휴리스틱이며 최적 전략을 보장하는 학습 모델은 아닙니다.</p><p>패효율은 샨텐이 낮은 타패를 우선하고 같은 샨텐에서 유효패 매수를 비교합니다. 타패 직후 텐파이면 종료하며 당시 공개 정보로 계산한 타패 기록과 공동 최적 후보를 결과에서 확인합니다. 패 선택 시 후리텐 원인 패, 대기 전체의 론 제한과 역을 갖춘 쯔모 가능 여부도 미리 보여 줍니다. 2회 쯔모 분석은 상대 행동을 제외한 비복원 추출입니다. 수비 지수는 비교용 수치이며 실제 방총 확률이 아닙니다. 현물 외 스지·카베에는 예외 대기가 있습니다.</p><h2>패보와 저장</h2><p>진행 중 대국은 이 브라우저에 자동 저장됩니다. 패보 탭에서 JSON 다운로드·복사·파일 또는 텍스트 불러오기를 사용할 수 있습니다. 버전 1 형식은 초기 시드, 좌석 설정, 모든 명령과 사건을 기록하며 불러올 때 동일 엔진으로 재생·검증합니다. 천봉·작혼 원본 파일은 지원하지 않습니다. 모든 손패와 패산이 포함되므로 대국 중 공유하면 숨은 정보도 공개됩니다.</p><h2>참고 자료</h2><p>규칙 참고: <a href="https://tenhou.net/man/" target="_blank" rel="noopener">천봉 매뉴얼</a>. 본 앱은 위에 명시한 옵션 차이가 있으며 천봉과 동일한 룰셋은 아닙니다.</p><p>패 그림: <a href="https://github.com/FluffyStuff/riichi-mahjong-tiles" target="_blank" rel="noopener">FluffyStuff / riichi-mahjong-tiles</a> · CC0 1.0. 이미지를 불러올 수 없을 때는 유니코드 패로 즉시 대체합니다.</p></section></div>`;
}
/** Render the active workspace, preserving independent training state per tab. */
function render() {
  syncHuman();
  document.body.classList.toggle('no-labels', !ui.labels);
  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === ui.tab);
    if (el.classList.contains('nav-button'))
      el.setAttribute('aria-current', el.dataset.tab === ui.tab ? 'page' : 'false');
  });
  document.querySelector('#current-section').textContent =
    TABS.find((t) => t[0] === ui.tab)?.[2] ?? '도움말';
  const content = document.querySelector('#content');
  if (ui.tab === 'game') {
    const s = match.s;
    content.innerHTML = `<div class="view-heading"><div><span class="eyebrow">THE TABLE</span><h1>실전 대국</h1></div><div class="view-actions">${ui.started ? button(ui.paused ? '계속하기' : '일시정지', 'pause') : ''}${ui.started ? button('새 대국', 'new-match') : ''}${ui.started ? button('패보 저장', 'export-download') : ''}</div></div>${ui.paused && ui.started ? '<div class="pause-strip">일시정지 중 · 계속하기를 누르면 진행됩니다.</div>' : ''}
    ${ui.handoff ? `<section class="privacy-panel"><span class="privacy-symbol">${['東', '南', '西', '北'][ui.viewer]}</span><h2>${esc(s.players[ui.viewer].name)}의 차례</h2><p class="muted">다음 사람에게 기기를 넘겨 주세요.</p>${button('내 손패 보기', 'reveal-hand', '', 'primary')}</section>` : `<div class="game-layout"><div class="game-surface">${board(s, ui.viewer, { selected: ui.selected, riichi: ui.riichi })}${handPanel(match, ui)}${resultPanel(s)}</div><aside class="game-side">${ui.started ? gameAnalysis(match, ui) : lobby(match.config)}</aside></div>`}`;
  } else if (ui.tab === 'efficiency') content.innerHTML = efficiencyView(efficiency, efficiencyExport?.text);
  else if (ui.tab === 'practice') content.innerHTML = `<h1>연습 메뉴</h1><section class="panel"><div class="action-row">${TABS.filter(t => ['efficiency', 'defense', 'alllast', 'calculator'].includes(t[0])).map(t => `<button class="button" data-tab="${t[0]}">${t[2]}</button>`).join('')}</div>${button('새 패효율 연습', 'eff-new', '', 'primary')}</section>`;
  else if (ui.tab === 'defense') content.innerHTML = defenseView(defense);
  else if (ui.tab === 'calculator') content.innerHTML = calculatorView(calculator);
  else if (ui.tab === 'alllast') content.innerHTML = allLastView(alllast);
  else if (ui.tab === 'replay') content.innerHTML = replayView(replay, ui.started);
  else content.innerHTML = rulesView();
  wireImages(content);
  const selected =
    ui.tab === 'game'
      ? ui.selected === null
        ? null
        : typeOf(ui.selected)
      : ui.tab === 'defense'
        ? defense.choice
        : ui.tab === 'efficiency'
          ? efficiency.choice
          : null;
  track(content, selected);
  scheduleAI();
}
/** Retain all newly typed all-last inputs when trying an answer before revealing
 * the solution; otherwise a form rerender would silently discard edits. */
function readAllForm() {
  const form = document.querySelector('#all-form');
  if (!form) return;
  const d = new FormData(form);
  alllast.scores = [0, 1, 2, 3].map((i) => Number(d.get('score' + i)));
  for (const k of ['winner', 'dealer', 'targetRank', 'honba', 'sticks'])
    alllast[k] = Number(d.get(k));
  if (
    alllast.scores.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000000) ||
    ![alllast.honba, alllast.sticks].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)
  )
    throw Error('점수와 본장·공탁을 확인해 주세요.');
}
/** Load a replay separately, then jump to its first discard for useful analysis. */
function openReplay(m) {
  replay.match = m;
  replay.index = Math.max(
    0,
    m.events.findIndex((e) => e.type === 'discard')
  );
  replay.viewer = m.events[replay.index]?.player ?? 0;
  ui.tab = 'replay';
  render();
}
/** Native forms give keyboard submission and proper mobile focus behavior. */
root.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === 'lobby-form') {
      const d = new FormData(form),
        config = {
          length: d.get('length'),
          aka: d.has('aka'),
          doubleYakuman: d.has('doubleYakuman'),
          kiriage: d.has('kiriage'),
          seats: [0, 1, 2, 3].map((i) => ({
            name: d.get('name' + i),
            kind: d.get('kind' + i),
            level: d.get('level' + i),
          })),
        };
      match = new Match(config);
      writeStore('riichi.config', config);
      ui.started = true;
      ui.paused = false;
      ui.revealedFor = null;
      ui.selected = null;
      writeStore('riichi.match', match.export());
      render();
    } else if (form.id === 'notation-form') {
      const ids = parseTiles(new FormData(form).get('notation'));
      if (ids.length > 14) throw Error('14장까지만 입력할 수 있습니다.');
      calculator.hand = ids;
      calculator.winId = ids.at(-1);
      render();
    } else if (form.id === 'all-form') {
      readAllForm();
      alllast.show = true;
      alllast.attempt = null;
      render();
    } else if (form.id === 'all-attempt-form') {
      readAllForm();
      const d = new FormData(form);
      alllast.han = Number(d.get('han'));
      alllast.fu = Number(d.get('fu'));
      alllast.loser = Number(d.get('loser'));
      const loser = alllast.loser === -1 ? null : alllast.loser;
      if (loser === alllast.winner) throw Error('자신에게 론할 수 없습니다.');
      const entry = scoreEntries(loser === null, alllast.winner === alllast.dealer).find(
        (e) => e.han === alllast.han && (alllast.han >= 5 || e.fu === alllast.fu)
      );
      if (!entry) throw Error('성립 가능한 판수·부수 조합을 선택하세요.');
      const r = settle(
        alllast.scores,
        alllast.winner,
        loser,
        entry,
        alllast.dealer,
        alllast.honba,
        alllast.sticks
      );
      alllast.attempt = { ...r, rank: ranking(r.scores).indexOf(alllast.winner) + 1 };
      render();
    }
  } catch (error) {
    toast(error.message);
  }
});
/** A single delegated handler survives panel updates and handles touch/keyboard
 * activation identically. No double-click event or timing threshold is needed. */
root.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-tab]');
  if (nav) {
    ui.tab = nav.dataset.tab;
    ui.selected = null;
    ui.riichi = false;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const action = el.dataset.action;
  try {
    if (action === 'discard-tile') {
      const id = Number(el.dataset.id);
      if (ui.selected === id) {
        perform({ kind: 'discard', player: ui.viewer, tile: id, riichi: ui.riichi });
        return;
      }
      ui.selected = id;
    } else if (action === 'inspect-tile') {
      ui.selected = Number(el.dataset.id);
      track(document.querySelector('#content'), typeOf(ui.selected));
      if (ui.tab !== 'game') return;
    } else if (action === 'cancel-selection') {
      ui.selected = null;
    } else if (action === 'confirm-discard') {
      if (ui.selected === null) return;
      perform({ kind: 'discard', player: ui.viewer, tile: ui.selected, riichi: ui.riichi });
      return;
    } else if (action === 'riichi') {
      ui.riichi = !ui.riichi;
      ui.selected = null;
    } else if (action === 'tsumo') {
      perform({ kind: 'tsumo', player: ui.viewer });
      return;
    } else if (action === 'kyuushu') {
      perform({ kind: 'kyuushu', player: ui.viewer });
      return;
    } else if (action === 'kan') {
      perform({
        kind: 'kan',
        player: ui.viewer,
        kanKind: el.dataset.kind,
        t: Number(el.dataset.tileType),
      });
      return;
    } else if (action === 'respond') {
      perform({ kind: 'respond', player: ui.viewer, choice: Number(el.dataset.choice) });
      return;
    } else if (action === 'next-round') {
      perform({ kind: 'next' });
      return;
    } else if (action === 'reveal-hand') {
      ui.revealedFor = ui.viewer;
      ui.handoff = false;
    } else if (action === 'pause') {
      ui.paused = !ui.paused;
    } else if (action === 'game-hints') {
      ui.hints = !ui.hints;
    } else if (action === 'new-match') {
      if (ui.started && match.actions.length) {
        replay.match = Match.import(match.export());
        replay.index = replay.match.events.length - 1;
      }
      match = new Match(match.config);
      ui.started = false;
      ui.paused = false;
      ui.selected = null;
      ui.revealedFor = null;
      ui.riichi = false;
    } else if (action === 'eff-answer') {
      if (answerEfficiency(efficiency, Number(el.dataset.t))) efficiencyExport = null;
    } else if (action === 'eff-menu') {
      ui.tab = 'practice';
    } else if (action === 'eff-new') {
      efficiency = newEfficiency();
      efficiencyExport = null;
      ui.tab = 'efficiency';
    } else if (action === 'eff-next') {
      if (nextEfficiency(efficiency)) efficiencyExport = null;
    } else if (action === 'eff-export') {
      const at = new Date().toISOString();
      efficiencyExport = {
        text: formatEfficiencyReport(efficiency, at),
        name: `riichi-efficiency-${at.replace(/[:.]/g, '-')}`,
      };
      render();
      document.querySelector('#eff-report').focus({ preventScroll: true });
      document.querySelector('.efficiency-export').scrollIntoView({ block: 'start' });
      return;
    } else if (action === 'eff-export-close') {
      efficiencyExport = null;
      render();
      document.querySelector('[data-action="eff-export"]').focus();
      return;
    } else if (action === 'eff-export-copy') {
      if (!efficiencyExport) return;
      try {
        await copyText(efficiencyExport.text);
        toast('패효율 보고서를 복사했습니다.');
      } catch {
        const preview = document.querySelector('#eff-report');
        preview?.focus();
        preview?.select();
        toast('클립보드 접근이 제한되어 보고서를 선택했습니다. 직접 복사하거나 파일로 저장하세요.');
      }
      return;
    } else if (action === 'eff-export-md' || action === 'eff-export-txt') {
      if (!efficiencyExport) return;
      const md = action === 'eff-export-md';
      download(`${efficiencyExport.name}.${md ? 'md' : 'txt'}`, efficiencyExport.text,
        `${md ? 'text/markdown' : 'text/plain'};charset=utf-8`);
      toast('패효율 보고서 파일을 저장했습니다.');
      return;
    } else if (action === 'eff-reveal') {
      efficiency.show = !efficiency.show;
    } else if (action === 'eff-deep') {
      const current = efficiency, revision = current.revision;
      if (current.ended || current.busy) return;
      const record = current.choice === null ? null : current.history.at(-1);
      current.busy = true;
      render();
      try {
        const rows = await analyze(
          'twoStep',
          record?.hand ?? current.hand,
          record?.known ?? counts([...current.hand, ...current.river])
        );
        if (current === efficiency && current.revision === revision && !current.ended) {
          current.rows = rows;
          current.twoStep = true;
        }
      } finally {
        current.busy = false;
      }
      render();
      return;
    } else if (action === 'def-new') {
      defense = newDefense(defense.opponents.length);
    } else if (action === 'def-answer') {
      defense.choice = Number(el.dataset.t);
    } else if (action === 'calc-add' || action === 'calc-add-red') {
      calculatorAdd(calculator, Number(el.dataset.type), action === 'calc-add-red');
    } else if (action === 'calc-remove') {
      calculator.hand = calculator.hand.filter((id) => id !== Number(el.dataset.id));
    } else if (action === 'calc-clear') {
      calculator.hand = [];
    } else if (action === 'calc-random') {
      calculator.hand = shuffled().slice(0, 14);
      calculator.winId = calculator.hand.at(-1);
    } else if (action === 'calc-example') {
      calculator.hand = parseTiles(el.dataset.example);
      calculator.winId = calculator.hand.at(-1);
    } else if (action === 'all-new') {
      const x = 500 * Math.floor(Math.random() * 17);
      alllast = { ...newAllLast(), scores: [18000 + x, 36000 - x, 26000, 20000] };
    } else if (action === 'review-current' || action === 'replay-current') {
      openReplay(Match.import(match.export()));
      return;
    } else if (action === 'export-download' || action === 'export-copy') {
      const source = ui.tab === 'replay' && replay.match ? replay.match : match,
        text = source.export();
      if (action === 'export-download') {
        download(`riichi-${new Date().toISOString().slice(0, 10)}.json`, text);
        toast('패보 파일을 저장했습니다.');
      } else {
        try {
          await copyText(text);
          toast('패보를 복사했습니다.');
        } catch {
          replay.text = text;
          ui.tab = 'replay';
          render();
          toast('클립보드 접근이 제한되어 텍스트 입력창에 패보를 넣었습니다.');
        }
      }
      return;
    } else if (action === 'replay-import') {
      replay.text = document.querySelector('#replay-json').value;
      openReplay(Match.import(replay.text));
      toast('패보를 검증하고 불러왔습니다.');
      return;
    } else if (action === 'replay-first') replay.index = 0;
    else if (action === 'replay-prev') replay.index = Math.max(0, replay.index - 1);
    else if (action === 'replay-next')
      replay.index = Math.min(replay.match.events.length - 1, replay.index + 1);
    else if (action === 'replay-last') replay.index = replay.match.events.length - 1;
    else if (action === 'replay-jump') replay.index = Number(el.dataset.index);
    render();
  } catch (error) {
    toast(error.message);
  }
});
/** Controls that change immediately use change; the timeline uses input so a
 * finger can scrub every event without waiting until the slider is released. */
root.addEventListener('change', async (event) => {
  const el = event.target;
  try {
    if (el.id === 'labels-toggle') {
      ui.labels = el.checked;
      writeStore('riichi.labels', ui.labels);
      document.body.classList.toggle('no-labels', !ui.labels);
      return;
    }
    if (el.id === 'sort-toggle') {
      ui.sort = el.checked;
      writeStore('riichi.sort', ui.sort);
    }
    if (el.id === 'def-threats') defense = newDefense(Number(el.value));
    const calc = {
      'calc-seat': 'seat',
      'calc-round': 'round',
      'calc-win': 'winId',
      'calc-indicator': 'indicator',
    };
    if (calc[el.id]) calculator[calc[el.id]] = Number(el.value);
    if (el.id === 'calc-tsumo') calculator.tsumo = el.value === 'true';
    if (el.id === 'calc-riichi') calculator.riichi = el.checked;
    if (el.id === 'replay-viewer') replay.viewer = Number(el.value);
    if (el.id === 'replay-file') {
      const file = el.files[0];
      if (!file) return;
      if (file.size > 25_000_000) throw Error('25MB 이하의 파일만 불러올 수 있습니다.');
      const text = await file.text();
      openReplay(Match.import(text));
      toast('패보를 불러왔습니다.');
      return;
    }
    if (el.id === 'replay-json') {
      replay.text = el.value;
      return;
    }
    // Lobby/all-last fields must not lose unsaved edits to an unrelated rerender.
    if (!el.id || el.id === 'replay-slider') return;
    render();
  } catch (error) {
    toast(error.message);
  }
});
root.addEventListener('input', (event) => {
  if (event.target.id === 'replay-slider') {
    replay.index = Number(event.target.value);
    // Keep the actively dragged range node: replacing it would lose pointer
    // capture after the first movement on Android. Update every other surface.
    const slider = event.target,
      controls = slider.closest('.replay-controls');
    const temp = document.createElement('div');
    temp.innerHTML = replayView(replay, ui.started);
    const nextControls = temp.querySelector('.replay-controls');
    controls.querySelector('.panel-heading').innerHTML =
      nextControls.querySelector('.panel-heading').innerHTML;
    const currentLayout = document.querySelector('.replay-layout');
    currentLayout.replaceWith(temp.querySelector('.replay-layout'));
    controls.querySelectorAll('[data-action]').forEach((b) => {
      const match = nextControls.querySelector(`[data-action="${b.dataset.action}"]`);
      if (match) b.disabled = match.disabled;
    });
    wireImages(document.querySelector('#content'));
  }
});
root.addEventListener('pointerover', (event) => {
  if (event.pointerType === 'touch') return;
  const el = event.target.closest('.hand .tile');
  if (el?.dataset.t) track(document.querySelector('#content'), Number(el.dataset.t));
});
root.addEventListener('pointerout', (event) => {
  if (event.pointerType === 'touch') return;
  if (event.target.closest('.hand') && !event.relatedTarget?.closest('.hand'))
    track(document.querySelector('#content'), ui.selected === null ? null : typeOf(ui.selected));
});
root.addEventListener('contextmenu', (event) => {
  if (event.target.closest('.tile')) event.preventDefault();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(aiTimer);
  else scheduleAI();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && ui.selected !== null) { ui.selected = null; render(); }
});
shell();
render();
// Cache only static application files; replay and game state remain local.
if ('serviceWorker' in navigator && location.protocol !== 'file:')
  navigator.serviceWorker
    .register(new URL('../sw.js', import.meta.url), {
      scope: new URL('../', import.meta.url).pathname,
    })
    .catch(() => {});
