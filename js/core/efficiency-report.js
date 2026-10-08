import { notation } from './tiles.js';

/** Remove exactly the first drawn physical copy, not every tile of its type.
 * Both the opening 14 tiles and the draw ID already exist in the first record
 * (or live state before any discard), so no extra model fields are necessary. */
function initialHand(e) {
  const first = e.history[0] ?? e;
  const hand = [...first.hand], index = hand.indexOf(first.drawn);
  if (hand.length !== 14 || index < 0) {
    throw Error('첫 쯔모 기록이 없어 시작 13장을 정확히 복원할 수 없습니다.');
  }
  hand.splice(index, 1);
  return hand;
}

/** Serialize a compact, replayable snapshot without reading the future wall
 * or re-evaluating any choice. Physical draw/discard notation preserves red
 * fives; optimal candidates are tile TYPES, matching rankDiscards exactly.
 * A pending draw belongs after all completed rows and is never a fake discard.
 * Fixed metadata plus one six-column row per discard keeps growth linear. */
export function formatEfficiencyReport(e) {
  const start = initialHand(e);
  const optimalCount = e.history.filter(r => r.optimal.includes(r.selected)).length;
  const remaining = 136 - e.hand.length - e.river.length;
  const pending = !e.ended && e.choice === null;
  const finished = e.ended || (!pending && remaining === 0);
  const state = e.ended ? '텐파이' : finished ? '패산 소진'
    : pending ? '진행 중(타패 대기)' : '진행 중(쯔모 대기)';
  const lines = [
    'riichi-efficiency-report v2', '',
    `- 시작 손패(13장): ${notation(start)}`,
    `- 결과: ${state} / ${e.history.length}순 / ${e.points}/${e.maxPoints}점 / 최적 ${optimalCount}/${e.history.length}회`,
    `- ${finished ? '최종' : '현재'} 손패(${e.hand.length}장): ${notation(e.hand)}`,
  ];
  if (e.ended && e.final) {
    lines.push(`- 대기(구조적·미확인): ${e.final.waits.map(w => `${notation([w.t * 4 + 1])}(${w.left}장)`).join(',')}`);
  }
  lines.push('',
    '순 | 쯔모 | 타패 | 샨텐(선택/최적) | 유효패(선택/최적) | 최적 타패',
    '--- | --- | --- | --- | --- | ---');
  for (const [index, r] of e.history.entries()) {
    lines.push(`${r.turn} | ${notation([r.drawn])} | ${notation([e.river[index]])} | ${r.chosen.shanten}/${r.best.shanten} | ${r.chosen.total}/${r.best.total} | ${r.optimal.map(t => notation([t * 4 + 1])).join(',')}`);
  }
  if (pending) lines.push('', `미타패 쯔모(${e.history.length + 1}순): ${notation([e.drawn])}`);
  lines.push('',
    '진행: 시작 13장 → 각 행의 쯔모 추가 → 타패 제거. 미타패 쯔모는 모든 행 이후 한 번만 추가.',
    '기준: 타패 후 일반형·치또이츠·국사 최소 샨텐(0=텐파이) → 유효패 최대; 공동 최적 전부 표시.',
    '매수: 종류당 4장 − 타패 후 손패·누적 버림패(이번 타패 포함)의 장수. 실제 패산 잔존 수가 아님.',
    '점수: 선택·최적 샨텐이 같으면 선택 유효패, 다르면 0. 분모: 매 순 max(최적 유효패,1)의 합.',
    '표기: m=만 p=통 s=삭 z=동남서북백발중(1~7), 0=적5. 최적 후보의 5는 적5 포함.', '');
  return lines.join('\n');
}
