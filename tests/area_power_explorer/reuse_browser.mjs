// Run against the local explorer; see the bundle README for prerequisites.
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.EXPLORER_URL || 'http://127.0.0.1:8018/TensorForge').replace(/\/$/, '');
const requests = [];
const browser = await chromium.launch({headless: true, ...(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {}), args: ['--no-sandbox', '--disable-dev-shm-usage']});
const errors = [];
const failures = [];
const snapshots = process.env.SCREENSHOT_DIR;
if (snapshots) await mkdir(snapshots, {recursive: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}, reducedMotion: 'reduce'});
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', request => requests.push(request.url()));
page.on('requestfailed', (request) => failures.push(request.url()));
const fmt = (value) => Number(value).toLocaleString('en-US', {maximumFractionDigits: 0});
const scalar = async (id) => (await page.locator(`#${id}`).textContent()).trim();
const setRange = async (id, value) => page.locator(`#${id}`).evaluate((input, next) => { input.value = next; input.dispatchEvent(new Event('input', {bubbles: true})); }, String(value));
const ready = async () => { await page.goto(`${base}/reuse.html`); await page.locator('#lab').waitFor({state: 'visible'}); await page.evaluate(() => document.fonts.ready); };
const choose = async (id) => page.locator(`[data-strategy="${id}"]`).click();
const assertChineseUI = async () => {
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.match(await page.locator('h1').textContent(), /多种精度/);
  for (const name of await page.locator('.strategy-name').allTextContents()) {
    assert.match(name, /[\u4e00-\u9fff]/, `strategy description lacks Chinese: ${name}`);
  }
  assert.doesNotMatch(await page.locator('body').innerText(), /\b(?:Precision Reuse Lab|General purpose|Floating-point inference|Low-bit inference|Required precision support|Define your core|Selected area|Area saved vs\. dedicated|Retained datapaths|Strategies within budget|Inside your selected strategy|18 ways to share the silicon|Copy experiment link|Export CSV|Reset experiment|LOOKUP TABLE|Within area budget|Measurement unavailable|Both physical units)\b/);
};
const requirements = async (formats) => {
  // Select additions first so the last required format is never accidentally cleared.
  for (const format of formats) await page.locator(`.format-chip input[value="${format}"]`).check();
  for (const format of ['FP16', 'BF16', 'FP8', 'FP6', 'FP4', 'INT8', 'INT4'].filter((f) => !formats.includes(f))) await page.locator(`.format-chip input[value="${format}"]`).uncheck();
};

try {
  await ready();
  const payload = await page.evaluate(async () => {
    const {REUSE_DATA} = await import('./reuse-data.mjs');
    const {buildReusePoints} = await import('./reuse-model.mjs');
    return {...REUSE_DATA, points: buildReusePoints(REUSE_DATA)};
  });
  const point = (id, k = 32, clk = 1410) => payload.points.find((p) => p.strategy_id === id && p.k === k && p.clk_mhz === clk);
  const area = (id, formats, k = 32, clk = 1410) => point(id, k, clk).groups.filter((g) => g.formats.some((f) => formats.includes(f))).reduce((sum, g) => sum + g.area_um2, 0);
  assert.equal(await page.locator('.strategy-row').count(), 18);
  await assertChineseUI();
  assert.equal(await scalar('metric-area'), '50,095');
  assert.equal(await scalar('metric-saving'), '56.8%');
  assert.equal(await page.locator('#k-range').getAttribute('aria-valuetext'), 'K = 32');
  if (snapshots) await page.screenshot({path: path.join(snapshots, 'tensorforge-reuse-desktop.png')});
  await page.locator('[data-preset="s03"]').click();
  assert.equal(await scalar('metric-area'), '58,391');
  assert.equal(await page.locator('.datapath-card').count(), 2);
  if (snapshots) await page.screenshot({path: path.join(snapshots, 'tensorforge-reuse-hybrid.png')});
  await page.locator('[data-preset="s14"]').click();
  assert.equal(await page.locator('.datapath-card').count(), 7);
  await page.locator('[data-preset="s01"]').click();
  assert.equal(await page.locator('.datapath-card').count(), 1);

  // Every paper strategy maps to its exact measured composition.
  for (const strategy of payload.strategies) {
    await choose(strategy.id);
    assert.equal(await scalar('metric-area'), fmt(point(strategy.id).area_um2));
    assert.equal(await page.locator('.datapath-card[data-retained="true"]').count(), strategy.groups.length);
    await assertChineseUI();
  }
  await choose('s07');
  assert.match(await scalar('strategy-note'), /两个物理单元/);
  assert.equal(await page.locator('.datapath-card.traced').count(), 1);
  await page.locator('[data-trace="BF16"]').click();
  assert.equal(await page.locator('.datapath-card.traced').count(), 2);

  // Changing K and clock selects real measurements at all 35 operating points.
  await choose('s01');
  for (let i = 0; i < payload.ks.length; i++) {
    await setRange('k-range', i);
    for (const clock of payload.clocks_mhz) {
      await page.locator('#clock-select').selectOption(String(clock));
      assert.equal(await scalar('metric-area'), fmt(point('s01', payload.ks[i], clock).area_um2));
    }
  }
  await page.locator('#reset-lab').click();

  // Shared units do not shrink when an individual supported format is removed.
  await page.locator('.format-chip input[value="FP4"]').uncheck();
  assert.equal(await scalar('metric-area'), '50,095');
  await choose('s14');
  const withoutFP4 = payload.formats.filter((f) => f !== 'FP4');
  assert.equal(await scalar('metric-area'), fmt(area('s14', withoutFP4)));
  assert.equal(await page.locator('.datapath-card.removed').count(), 1);

  // Same-format LUT and arithmetic points remain distinct, traceable alternatives.
  await requirements(['FP4']);
  await choose('s18');
  assert.equal(await scalar('metric-area'), fmt(area('s18', ['FP4'])));
  assert.equal(await page.locator('.datapath-card[data-retained="true"]').count(), 1);
  assert.match(await page.locator('.datapath-card[data-retained="true"]').textContent(), /FP4 查找表/);
  await page.locator('.format-chip input[value="FP4"]').click();
  assert.equal(await page.locator('.format-chip input:checked').count(), 1);

  await page.locator('[data-scenario="low"]').click();
  assert.equal(await page.locator('.format-chip input:checked').count(), 4);
  await page.locator('[data-family="dedicated"]').click();
  assert.equal(await page.locator('.strategy-row').count(), 2);
  await setRange('budget-range', 45);
  const experiment = page.url();
  await page.reload();
  await page.locator('#lab').waitFor({state: 'visible'});
  assert.equal(page.url(), experiment);
  assert.equal(await page.locator('#budget-range').inputValue(), '45');
  assert.equal(await page.locator('.strategy-row').count(), 2);
  assert.equal(await page.locator('[data-strategy="s17"]').count(), 0); // Selected map survives a family filter.
  assert.match(await scalar('selection-badge'), /S17/);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-csv').click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  assert.equal(csv.trim().split('\r\n').length, 19);
  assert.match(csv, /来源行号/);
  assert.match(csv, /整条通路裁剪/);
  await page.locator('#reset-lab').click();
  await setRange('budget-range', 20);
  assert.equal(await scalar('metric-feasible'), '0 / 18');
  await page.locator('#reset-lab').click();
  await page.locator('#k-range').focus();
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#k-range').getAttribute('aria-valuetext'), 'K = 2');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#k-range').getAttribute('aria-valuetext'), 'K = 4');
  await page.locator('#reset-lab').click();

  // The rest of the website links to the lab and continues serving normally.
  for (const route of ['index.html', 'ppa.html', 'baseline.html', 'breakdown.html']) {
    const html = await page.evaluate(async (url) => (await fetch(url)).text(), `${base}/${route}`);
    assert.match(html, /href="\.\/reuse.html"/);
  }
  const lightBackground = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({colorScheme: 'dark'});
  assert.notEqual(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), lightBackground);
  if (snapshots) await page.screenshot({path: path.join(snapshots, 'tensorforge-reuse-dark.png')});
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({width, height: 1000});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow at width ${width}`);
    await page.locator('[data-scenario="low"]').click();
    assert.equal(await page.locator('.format-chip input:checked').count(), 4);
    await page.locator('#reset-lab').click();
    if (snapshots && [390, 320].includes(width)) await page.screenshot({path: path.join(snapshots, `tensorforge-reuse-${width}.png`), fullPage: true});
  }

  assert.ok(!requests.some(url => new URL(url).pathname.includes('/api/') || url.endsWith('.json')));
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);

  // Remove one exact static constituent to exercise a missing reference.
  await page.route('**/reuse-data.mjs', async route => {
    const incomplete = {...payload, units: payload.units.filter(unit =>
      !(unit.precision_name === 'FP16' && unit.dim_k === 32 && unit.clk_mhz === 1410))};
    delete incomplete.points;
    await route.fulfill({contentType: 'text/javascript', body: `export const REUSE_DATA = ${JSON.stringify(incomplete)};`});
  });
  await ready();
  assert.equal(await scalar('metric-area'), '50,095');
  assert.equal(await scalar('metric-feasible'), '—');
  assert.equal(await scalar('metric-saving'), '—');
  assert.match(await scalar('selected-budget'), /不可用/);
  assert.match(await scalar('budget-value'), /不可用/);
  assert.equal(await page.locator('.budget-line').count(), 0);
  await page.unroute('**/reuse-data.mjs');
  await page.route('**/reuse-data.mjs', route => route.fulfill({status: 500, contentType: 'text/javascript', body: 'Build asset missing'}));
  await page.goto(`${base}/reuse.html`);
  await page.locator('.lab-status.error').waitFor({state: 'visible'});
  assert.match(await scalar('load-status'), /加载失败/);
  assert.equal(await page.getByRole('button', {name: '重试', exact: true}).count(), 1);
  assert.deepEqual(errors, []);
  assert.ok(failures.every(url => url.endsWith('/reuse-data.mjs')), 'Only the deliberately broken module may fail');
  console.log('PASS: 18 strategies, 35 operating points, whole-unit pruning, LUT, tracing, budgets, URL, CSV, keyboard, responsive layouts, static subdirectory hosting, no API requests, missing-reference and static-module error states.');
} finally { await browser.close(); }
