import { counts, label, notation, tileLabel } from './tiles.js';
import { shanten } from './shanten.js';

/** Plain Korean labels accompany standard notation so the same UTF-8 report is
 * readable in a text editor, Markdown viewer, or external analysis tool. */
const handText = (hand) => `${hand.map(id => tileLabel(id)).join(' · ')} (${notation(hand)})`;
const shantenText = (n) => n < 0 ? '완성형' : n === 0 ? '텐파이 (0샨텐)' : `${n}샨텐`;
const tileCounts = (tiles) => tiles.length
  ? tiles.map(t => `${label(t.t)} ${t.left}장`).join(', ') : '없음';

/** Export only the recorded decisions and currently visible tiles. Never read
 * the shuffled wall, seed, or recalculate past candidates using later draws.
 * The supplied timestamp makes a snapshot reproducible in tests and lets copy
 * and both file formats share exactly the same text. No model state is changed. */
export function formatEfficiencyReport(e, exportedAt = new Date().toISOString()) {
  const optimalCount = e.history.filter(r => r.optimal.includes(r.selected)).length;
  const remaining = 136 - e.hand.length - e.river.length;
  const state = e.ended ? '텐파이 달성 · 종료'
    : e.choice === null ? '진행 중 · 타패 대기'
      : remaining ? '진행 중 · 다음 쯔모 대기' : '패산 소진 · 종료';
  const lines = [
    '# 패효율 연습 기록', '',
    '- 보고서 형식: riichi-efficiency-report v1',
    `- 내보낸 시각 (UTC): ${exportedAt}`,
    '- 앱: Riichi Mahjong · https://tjdns0511.github.io/Riichi-Mahjong/', '',
    '## 연습 요약', '',
    `- 상태: ${state}`,
    `- 총 타패 횟수: ${e.history.length}회`,
    `- 누적 패효율 점수: ${e.points} / ${e.maxPoints}점`,
    `- 달성 비율: ${e.maxPoints ? Math.round(e.points / e.maxPoints * 100) + '%' : '— (아직 타패하지 않음)'}`,
    `- 최적 선택 횟수: ${optimalCount} / ${e.history.length}회`,
    `- 최초 손패: ${handText(e.history[0]?.hand ?? e.hand)}`,
    `- ${e.ended ? '최종' : '현재'} 손패 (${e.hand.length}장): ${handText(e.hand)}`,
    `- 현재 샨텐: ${shantenText(shanten(counts(e.hand)))}`,
    `- 현재 쯔모패: ${e.drawn === null ? '없음' : tileLabel(e.drawn)}`,
    `- 버림패 (시간순): ${e.river.length ? e.river.map((id, i) => `${i + 1}. ${tileLabel(id)}`).join(' / ') : '없음'}`, '',
    '## 계산 기준과 읽는 법', '',
    '- 일반형·치또이츠·국사무쌍 중 최소 샨텐을 사용합니다.',
    '- 후보는 타패 후 샨텐이 가장 낮은 것부터 비교하고, 같은 샨텐에서 유효패 장수가 최대인 모든 후보를 최적으로 인정합니다.',
    '- 매 순 점수: 최소 샨텐을 유지하면 선택한 후보의 유효패 장수, 더 높은 샨텐이면 0점입니다.',
    '- 최대 가능 점수(분모): 매 순 최적 후보의 유효패 장수를 합산합니다. 최적 유효패가 0장이면 해당 순의 분모는 1점입니다.',
    '- 달성 비율은 누적 점수 ÷ 최대 가능 점수 × 100을 반올림합니다.',
    '- 유효패는 샨텐을 줄이는 패입니다. 텐파이에서는 구조적으로 손패를 완성하는 대기패를 뜻합니다.',
    '- 매수는 당시 손패와 그때까지의 내 버림패를 제외한 미확인 패 수입니다. 실제 패산 잔존 수나 화료 확률이 아닙니다.',
    '- 과거 타패는 당시 저장된 정보만 사용합니다. 이후 쯔모, 미래 패산, 현재 시점의 공개 매수로 과거 평가를 바꾸지 않습니다.',
    '- 이 점수는 1회 쯔모 기준 패효율입니다. 2회 쯔모 확장 분석, 역·타점·후리텐·상대 수비는 점수에 포함하지 않습니다. 대기 표시는 론/쯔모의 합법성을 보장하지 않습니다.',
    '- 표기: m=만수, p=통수, s=삭수, z=자패(1동 2남 3서 4북 5백 6발 7중), 0=적5. 적패는 손패와 실제 타패에 표시하며, 효율 후보는 적5와 일반5를 같은 종류로 계산합니다.', '',
  ];
  if (e.ended && e.final) {
    lines.push('## 최종 구조적 대기', '',
      `- 대기 종류: ${e.final.waits.length}종`,
      `- 미확인 대기패 합계: ${e.final.total}장`);
    for (const w of e.final.waits) lines.push(
      `- ${label(w.t)}: 미확인 ${w.left}장 · ${w.shapes.join(' / ')}${w.left === 0 ? ' · 알려진 4장 모두 소진' : ''}`);
    lines.push('');
  }
  lines.push('## 개선할 수 있었던 선택', '');
  const missed = e.history.filter(r => !r.optimal.includes(r.selected));
  if (!e.history.length) lines.push('아직 기록된 타패가 없습니다.');
  else if (!missed.length) lines.push('모든 타패가 해당 시점의 공동 최적 후보에 포함됩니다.');
  else for (const r of missed) lines.push(`- ${r.turn}순 · ${label(r.selected)}: ${r.reason}`);
  lines.push('', '## 타패별 상세 기록', '');
  if (!e.history.length) lines.push('아직 기록된 타패가 없습니다.', '');
  let cumulative = 0, maximum = 0;
  for (const [index, r] of e.history.entries()) {
    const discarded = e.river[index];
    const after = r.hand.filter(id => id !== discarded);
    cumulative += r.earned;
    maximum += r.maximum;
    lines.push(`### ${r.turn}순 · ${tileLabel(discarded)} 타패`, '',
      `- 타패 전 손패 (${r.hand.length}장): ${handText(r.hand)}`,
      `- 당시 쯔모패: ${r.drawn == null ? '없음' : tileLabel(r.drawn)}`,
      `- 실제 타패: ${tileLabel(discarded)} (${notation([discarded])})`,
      `- 타패 후 손패 (${after.length}장): ${handText(after)}`,
      `- 타패 후 샨텐: ${shantenText(r.chosen.shanten)}`,
      `- 선택의 유효패: ${r.chosen.tiles.length}종 / 미확인 ${r.chosen.total}장 · ${tileCounts(r.chosen.tiles)}`,
      `- 최적 타패 (동률 모두): ${r.optimal.map(label).join(' · ')}`,
      `- 최적 결과: ${shantenText(r.best.shanten)} · 미확인 유효패 ${r.best.total}장`,
      `- 샨텐 손실: ${r.loss.shanten}`,
      `- 유효패 손실: ${r.loss.ukeire === null ? '샨텐이 달라 직접 비교하지 않음' : r.loss.ukeire + '장'}`,
      `- 평가: ${r.reason}`,
      `- 이번 점수: ${r.earned} / ${r.maximum}점 · 누적 ${cumulative} / ${maximum}점`,
      `- 당시 확인된 매수 (손패 + 이전 버림패, 생략된 종류는 0장): ${r.known.flatMap((n, t) => n ? [`${label(t)} ${n}/4`] : []).join(', ')}`, '',
      '후보별 비교 (샨텐 우선, 같은 샨텐에서 유효패 장수 순):', '');
    for (const row of r.rows) {
      const tags = [row.t === r.selected ? '실제 선택' : '', r.optimal.includes(row.t) ? '최적' : ''].filter(Boolean);
      lines.push(`- ${label(row.t)}${tags.length ? ' [' + tags.join(' · ') + ']' : ''}: ${shantenText(row.shanten)} · ${row.tiles.length}종 / 미확인 ${row.total}장`,
        `  - 유효패: ${tileCounts(row.tiles)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
