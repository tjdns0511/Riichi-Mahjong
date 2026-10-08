import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handCodes, replayEfficiencyReport } from './efficiency-report-replay.mjs';

/** Exercise production event handlers, clipboard and real browser downloads.
 * The caller supplies a played exercise; no hidden wall or app global is read. */
export async function checkEfficiencyExport(page, out, tag, ended = false) {
  const visibleState = () => page.evaluate(() => ({
    hand: [...document.querySelectorAll('.practice-hand .hand .tile, .efficiency-result .hand .tile')].map(e => e.dataset.id),
    river: [...document.querySelectorAll('.training-river .tile')].map(e => e.dataset.id),
    score: document.querySelector('.practice-stat').textContent,
  }));
  const before = await visibleState();
  await page.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const preview = page.getByRole('textbox', { name: '패효율 분석 보고서', exact: true });
  const report = await preview.inputValue();
  assert.ok(await preview.evaluate(e => e.readOnly));
  const replayed = replayEfficiencyReport(report);
  assert.deepEqual(handCodes(replayed.hand), handCodes(before.hand.map(Number)));
  assert.ok(before.score.includes(`${replayed.points} / ${replayed.maxPoints}점`));
  assert.match(report, /^1 \|/m);
  assert.match(report, /샨텐\(선택\/최적\)/);
  if (ended) {
    assert.equal(replayed.state, '텐파이');
    assert.match(report, /^- 대기\(구조적·미확인\):/m);
  } else {
    assert.equal(replayed.snapshots.length, 1);
    assert.deepEqual(handCodes(replayed.river), handCodes(before.river.map(Number)));
  }
  const bounds = await page.evaluate(() => {
    const p = document.querySelector('.efficiency-export').getBoundingClientRect();
    const hand = document.querySelector('.practice-hand, .efficiency-result').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
      separate: p.top >= hand.bottom, fits: p.left >= 0 && p.right <= innerWidth + 1 };
  });
  assert.deepEqual(bounds, { overflow: false, separate: true, fits: true }, `${tag} export layout`);
  for (const [extension, name] of [['txt', '텍스트 저장 (.txt)'], ['md', 'Markdown 저장 (.md)']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const file = await download;
    assert.ok(file.suggestedFilename().startsWith('riichi-efficiency-'));
    assert.ok(file.suggestedFilename().endsWith('.' + extension));
    const path = resolve(out, `${tag}-efficiency-report.${extension}`);
    await file.saveAs(path);
    assert.equal(await readFile(path, 'utf8'), report, `${tag} ${extension} differs from preview`);
  }
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '보고서 복사', exact: true }).click();
  await page.getByText('패효율 보고서를 복사했습니다.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), report);
  // Permission-denied fallback must preserve the text and allow manual copy.
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
  }));
  await page.getByRole('button', { name: '보고서 복사', exact: true }).click();
  await page.getByText('클립보드 접근이 제한되어 보고서를 선택했습니다. 직접 복사하거나 파일로 저장하세요.', { exact: true }).waitFor();
  assert.deepEqual(await preview.evaluate(e => [e.selectionStart, e.selectionEnd]), [0, report.length]);
  await page.evaluate(() => { delete navigator.clipboard; });
  assert.deepEqual(await visibleState(), before, 'export changed exercise state');
  await page.screenshot({ path: resolve(out, `${tag}-efficiency-export.png`), fullPage: true });
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  assert.equal(await preview.count(), 0);
  console.log(`${tag}: v2 report replay, UTF-8 TXT/Markdown, clipboard/fallback, state preservation passed`);
}
