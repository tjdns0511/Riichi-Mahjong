import test from 'node:test';
import assert from 'node:assert/strict';
import { newEfficiency, answerEfficiency, nextEfficiency } from '../js/core/efficiency.js';
import { formatEfficiencyReport } from '../js/core/efficiency-report.js';
import { rankDiscards } from '../js/core/shanten.js';
import { counts, label, notation, parseTiles, shuffled, tileLabel } from '../js/core/tiles.js';
import { efficiencyView } from '../js/ui/trainers.js';

const at = '2026-10-08T08:00:00.000Z';
/** Build a physically valid exercise with a known hand; reports still receive
 * the real production decision records rather than a duplicate scoring model. */
function exercise(text) {
  const e = newEfficiency(100);
  e.hand = parseTiles(text);
  e.drawn = e.hand.at(-1);
  e.wall = shuffled(9).filter(id => !e.hand.includes(id));
  return e;
}
test('new report explains notation and score denominator without NaN or hidden wall access', () => {
  const e = newEfficiency(101), original = structuredClone(e);
  const guarded = new Proxy(e, { get(target, key) {
    assert.notEqual(key, 'wall', 'export must not even read the future tile pool');
    return target[key];
  } });
  const report = formatEfficiencyReport(guarded, at);
  assert.match(report, /^# 패효율 연습 기록\n/);
  assert.ok(report.includes(at) && report.includes(notation(e.hand)));
  assert.match(report, /총 타패 횟수: 0회/);
  assert.match(report, /0 \/ 0점/);
  assert.match(report, /아직 타패하지 않음/);
  assert.match(report, /최적 유효패가 0장이면 해당 순의 분모는 1점/);
  assert.match(report, /실제 패산 잔존 수나 화료 확률이 아닙니다/);
  assert.match(report, /0=적5/);
  assert.doesNotMatch(report, /NaN|undefined|Infinity/);
  assert.deepEqual(e, original);
  assert.equal(formatEfficiencyReport({ ...e, wall: [] }, at), report);
});

test('chronological report retains each original hand, public counts, alternatives and cumulative score', () => {
  const e = newEfficiency(91);
  const first = rankDiscards(e.hand).find(r => r.shanten > 0);
  answerEfficiency(e, first.t);
  const earlier = formatEfficiencyReport(e, at).split('### 1순')[1];
  nextEfficiency(e);
  const rows = rankDiscards(e.hand, 0, counts([...e.hand, ...e.river]));
  answerEfficiency(e, rows[0].t);
  const before = structuredClone(e), report = formatEfficiencyReport(e, at);
  assert.equal(report.split('### 1순')[1].split('### 2순')[0].trimEnd(), earlier.trimEnd());
  assert.equal((report.match(/^### \d+순/gm) ?? []).length, 2);
  assert.ok(report.includes(`누적 ${e.points} / ${e.maxPoints}점`));
  for (const [index, r] of e.history.entries()) {
    const section = report.split(`### ${r.turn}순`)[1].split('\n### ')[0];
    assert.ok(section.includes(notation(r.hand)));
    assert.ok(section.includes(notation(r.hand.filter(id => id !== e.river[index]))));
    assert.ok(section.includes(`최적 타패 (동률 모두): ${r.optimal.map(label).join(' · ')}`));
    for (const row of r.rows) {
      assert.ok(section.includes(`${row.tiles.length}종 / 미확인 ${row.total}장`));
      for (const t of row.tiles) assert.ok(section.includes(`${label(t.t)} ${t.left}장`));
    }
    for (let t = 0; t < 34; t++) if (r.known[t]) assert.ok(section.includes(`${label(t)} ${r.known[t]}/4`));
  }
  assert.deepEqual(e, before, 'export must not mutate or advance the exercise');
  assert.equal(formatEfficiencyReport(e, at), report, 'same snapshot is deterministic');
});

for (const [name, text, discard, shape] of [
  ['standard', '123m123789p78s22z4s', 21, '양면'],
  ['seven pairs', '1122m3344p5566s1z9m', 8, '단기'],
  ['thirteen orphans', '19m19p19s1234567z5m', 4, '국사'],
]) test(`${name} final report includes exact waits and counts`, () => {
  const e = exercise(text);
  answerEfficiency(e, discard);
  assert.ok(e.ended);
  const report = formatEfficiencyReport(e, at);
  assert.match(report, /상태: 텐파이 달성 · 종료/);
  assert.match(report, /최종 손패 \(13장\)/);
  assert.ok(report.includes(`미확인 대기패 합계: ${e.final.total}장`));
  assert.ok(report.includes(shape));
  for (const w of e.final.waits) assert.ok(report.includes(`${label(w.t)}: 미확인 ${w.left}장 · ${w.shapes.join(' / ')}`));
  assert.match(report, /대기 표시는 론\/쯔모의 합법성을 보장하지 않습니다/);
  assert.match(efficiencyView(e, report), /data-action="eff-export"/);
});

test('red fives are preserved in actual tiles while equivalent candidates share a type', () => {
  const e = exercise('123m123789p78s22z0m');
  answerEfficiency(e, 4);
  const report = formatEfficiencyReport(e, at);
  assert.equal(tileLabel(e.river[0]), '적5만');
  assert.match(report, /실제 타패: 적5만 \(0m\)/);
  assert.match(report, /1\. 적5만/);
  assert.match(report, /적5와 일반5를 같은 종류로 계산/);
  assert.doesNotMatch(report.split('타패 후 손패 (13장):')[1].split('\n')[0], /적5만/);
});

test('co-optimal choices and shanten losses are reported without comparing unrelated ukeire', () => {
  let e, rows, ties;
  for (let seed = 1; seed < 100; seed++) {
    e = newEfficiency(seed); rows = rankDiscards(e.hand);
    ties = rows.filter(r => r.shanten === rows[0].shanten && r.total === rows[0].total);
    if (ties.length > 1 && rows.some(r => r.shanten > rows[0].shanten)) break;
  }
  assert.ok(ties.length > 1);
  const good = structuredClone(e);
  answerEfficiency(good, ties.at(-1).t);
  const report = formatEfficiencyReport(good, at);
  assert.ok(report.includes(`최적 타패 (동률 모두): ${ties.map(r => label(r.t)).join(' · ')}`));
  assert.match(report, /최적 선택 횟수: 1 \/ 1회/);
  answerEfficiency(e, rows.find(r => r.shanten > rows[0].shanten).t);
  const bad = formatEfficiencyReport(e, at);
  assert.match(bad, /최적 선택 횟수: 0 \/ 1회/);
  assert.match(bad, /유효패 손실: 샨텐이 달라 직접 비교하지 않음/);
  assert.match(bad, /이번 점수: 0 \//);
});

test('preview safely escapes report text and is absent until requested', () => {
  const e = newEfficiency(2);
  assert.doesNotMatch(efficiencyView(e), /id="eff-report"/);
  const html = efficiencyView(e, '</textarea><script>bad()</script>');
  assert.match(html, /id="eff-report" readonly/);
  assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
