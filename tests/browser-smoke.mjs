/** Optional browser integration test. Playwright is a CI-only dependency; no
 * external JS, build system or npm installation is used by the deployed app.
 * This starts its own static server under a repository subpath to catch Pages
 * path mistakes, then checks desktop, phone portrait and phone landscape. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { runLayoutChecks } from './browser-layout.mjs';

const root = resolve(import.meta.dirname, '..'),
  out = resolve(root, 'test-results');
await mkdir(out, { recursive: true });
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/Riichi-Mahjong/')) {
      res.writeHead(404).end();
      return;
    }
    let path = decodeURIComponent(url.pathname.slice('/Riichi-Mahjong/'.length)) || 'index.html';
    const full = resolve(root, path);
    if (!full.startsWith(root + '/')) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(full);
    res
      .writeHead(200, { 'Content-Type': types[extname(full)] ?? 'application/octet-stream' })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(8765, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true });
const sizes = [
  { name: 'desktop', width: 1440, height: 1050 },
  { name: 'galaxy-portrait', width: 384, height: 854 },
  { name: 'galaxy-landscape', width: 854, height: 384 },
  { name: 'small-phone', width: 360, height: 800 },
];
try {
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      isMobile: size.width < 900,
      hasTouch: size.width < 900,
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => { Date.now = () => 1791410000000; });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Exercise the guaranteed Unicode fallback rather than making CI depend on
    // the availability or rate limit of an external artwork host.
    await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
    await page.goto('http://127.0.0.1:8765/Riichi-Mahjong/');
    await page.getByRole('button', { name: '대국 시작', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `${size.name} lobby overflow`
    );
    await page.screenshot({ path: resolve(out, `${size.name}-lobby.png`), fullPage: true });
    // Four humans remove timing variation and verify privacy before any hand.
    for (let i = 0; i < 4; i++) await page.locator(`[name="kind${i}"]`).selectOption('human');
    await page.getByRole('button', { name: '대국 시작', exact: true }).click();
    await page.getByRole('button', { name: '내 손패 보기', exact: true }).waitFor();
    assert.equal(await page.locator('.hand .tile').count(), 0, 'hotseat curtain leaks hand');
    await page.getByRole('button', { name: '내 손패 보기', exact: true }).click();
    const first = page.locator('[data-action="discard-tile"]').first(),
      id = await first.getAttribute('data-id');
    await first.click();
    assert.equal(await page.locator('.tile.selected').count(), 1, 'first tap must select');
    await page.locator(`[data-action="discard-tile"][data-id="${id}"]`).click();
    await page.getByRole('button', { name: '내 손패 보기', exact: true }).waitFor();
    assert.equal(await page.locator('.hand .tile').count(), 0, 'next human hand must stay hidden');
    await page.getByRole('button', { name: '내 손패 보기', exact: true }).click();
    await page.screenshot({ path: resolve(out, `${size.name}-table.png`), fullPage: true });
    for (const tab of ['efficiency', 'defense', 'alllast', 'calculator', 'replay']) {
      await page.locator(`.nav-button[data-tab="${tab}"]`).click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `${size.name} ${tab} overflow`
      );
      if (tab === 'efficiency') {
        await page.locator('[data-action="eff-answer"]').first().click();
        await page.locator('.feedback').waitFor();
        await page.getByRole('button', { name: '2회 쯔모까지 분석', exact: true }).click();
        await page
          .getByRole('button', { name: '2회 쯔모 분석 완료', exact: true })
          .waitFor({ timeout: 30000 });
      } else if (tab === 'defense') {
        await page.locator('[data-action="def-answer"]').first().click();
        await page.locator('.feedback').waitFor();
      } else if (tab === 'alllast') {
        await page.getByRole('button', { name: '필요 점수 계산', exact: true }).click();
        assert.equal(await page.locator('.all-solutions article').count(), 4);
      } else if (tab === 'calculator') {
        await page.getByRole('button', { name: '국사 예제', exact: true }).click();
        assert.equal(await page.locator('.big-stat').innerText(), '텐파이');
        await page.getByRole('button', { name: '비우기', exact: true }).click();
        assert.equal(await page.locator('.calc-hand .tile').count(), 0);
      } else if (tab === 'replay') {
        await page.getByRole('button', { name: '현재 대국 가져오기', exact: true }).click();
        assert.ok(await page.locator('.replay-analysis tbody tr').count());
        await page.locator('#replay-slider').focus();
        await page.locator('#replay-slider').press('End');
        await page.locator('#replay-slider').press('Home');
        assert.equal(await page.locator('#replay-slider').inputValue(), '0');
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'JSON 다운로드', exact: true }).click();
        const file = await download,
          path = resolve(out, `${size.name}-replay.json`);
        await file.saveAs(path);
        await page.locator('summary').click();
        await page.locator('#replay-file').setInputFiles(path);
        await page.locator('.replay-layout').waitFor();
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `${size.name} ${tab} result overflow`
      );
      await page.screenshot({ path: resolve(out, `${size.name}-${tab}.png`), fullPage: true });
    }
    assert.deepEqual(errors, [], `${size.name} runtime errors`);
    console.log(
      `${size.name}: six tabs, touch selection, hotseat, worker, replay, overflow passed`
    );
    await context.close();
  }
  await runLayoutChecks(browser, out);
} finally {
  await browser.close();
  server.close();
}
