// Run against the local explorer; see the bundle README for prerequisites.
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.EXPLORER_URL || 'http://127.0.0.1:8018';
const browser = await chromium.launch({headless: true, ...(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {}), args: ['--no-sandbox', '--disable-dev-shm-usage']});
const errors = [];
const failures = [];
const snapshots = process.env.SCREENSHOT_DIR;
if (snapshots) await mkdir(snapshots, {recursive: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}, reducedMotion: 'reduce'});
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => failures.push(request.url()));
const fmt = (value) => Number(value).toLocaleString('en-US', {maximumFractionDigits: 0});
const scalar = async (id) => (await page.locator(`#${id}`).textContent()).trim();
const setRange = async (id, value) => page.locator(`#${id}`).evaluate((input, next) => { input.value = next; input.dispatchEvent(new Event('input', {bubbles: true})); }, String(value));
const ready = async () => { await page.goto(`${base}/reuse.html`); await page.locator('#lab').waitFor({state: 'visible'}); };
const choose = async (id) => page.locator(`[data-strategy="${id}"]`).click();
const requirements = async (formats) => {
  // Select additions first so the last required format is never accidentally cleared.
  for (const format of formats) await page.locator(`.format-chip input[value="${format}"]`).check();
  for (const format of ['FP16', 'BF16', 'FP8', 'FP6', 'FP4', 'INT8', 'INT4'].filter((f) => !formats.includes(f))) await page.locator(`.format-chip input[value="${format}"]`).uncheck();
};

try {
  await ready();
  const payload = await page.evaluate(async () => (await fetch('/api/reuse-data')).json());
  const point = (id, k = 32, clk = 1410) => payload.points.find((p) => p.strategy_id === id && p.k === k && p.clk_mhz === clk);
  const area = (id, formats, k = 32, clk = 1410) => point(id, k, clk).groups.filter((g) => g.formats.some((f) => formats.includes(f))).reduce((sum, g) => sum + g.area_um2, 0);
  assert.equal(await page.locator('.strategy-row').count(), 18);
  assert.equal(await scalar('metric-area'), '53,007');
  assert.equal(await scalar('metric-saving'), '60.7%');
  assert.equal(await page.locator('#k-range').getAttribute('aria-valuetext'), 'K = 32');
  if (snapshots) await page.screenshot({path: path.join(snapshots, 'tensorforge-reuse-desktop.png')});
  await page.locator('[data-preset="s03"]').click();
  assert.equal(await scalar('metric-area'), '62,613');
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
  }
  await choose('s07');
  assert.match(await scalar('strategy-note'), /Both physical units/);
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
  assert.equal(await scalar('metric-area'), '53,007');
  await choose('s14');
  const withoutFP4 = payload.formats.filter((f) => f !== 'FP4');
  assert.equal(await scalar('metric-area'), fmt(area('s14', withoutFP4)));
  assert.equal(await page.locator('.datapath-card.removed').count(), 1);

  // Same-format LUT and arithmetic points remain distinct, traceable alternatives.
  await requirements(['FP4']);
  await choose('s18');
  assert.equal(await scalar('metric-area'), fmt(area('s18', ['FP4'])));
  assert.equal(await page.locator('.datapath-card[data-retained="true"]').count(), 1);
  assert.match(await page.locator('.datapath-card[data-retained="true"]').textContent(), /LOOKUP TABLE/);
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
  assert.match(csv, /source_rows/);
  assert.match(csv, /Whole-datapath pruning/);
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
    const html = await page.evaluate(async (url) => (await fetch(url)).text(), `/${route}`);
    assert.match(html, /href="\/reuse.html"/);
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({width, height: 1000});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow at width ${width}`);
    await page.locator('[data-scenario="low"]').click();
    assert.equal(await page.locator('.format-chip input:checked').count(), 4);
    await page.locator('#reset-lab').click();
    if (snapshots && [390, 320].includes(width)) await page.screenshot({path: path.join(snapshots, `tensorforge-reuse-${width}.png`), fullPage: true});
  }

  // Missing baseline measurements must not become an invented zero-area budget.
  await page.route('**/api/reuse-data', async (route) => {
    const incomplete = structuredClone(payload);
    const missing = incomplete.points.find((p) => p.strategy_id === 's14' && p.k === 32 && p.clk_mhz === 1410);
    missing.groups[0].available = false;
    missing.groups[0].area_um2 = null;
    missing.available = false;
    missing.area_um2 = null;
    await route.fulfill({json: incomplete});
  });
  await ready();
  assert.equal(await scalar('metric-area'), '53,007');
  assert.equal(await scalar('metric-feasible'), '—');
  assert.equal(await scalar('metric-saving'), '—');
  assert.match(await scalar('selected-budget'), /unavailable/);
  assert.match(await scalar('budget-value'), /unavailable/);
  assert.equal(await page.locator('.budget-line').count(), 0);
  await page.unroute('**/api/reuse-data');
  await page.route('**/api/reuse-data', (route) => route.fulfill({status: 500, json: {error: 'Missing fixture'}}));
  await page.goto(`${base}/reuse.html`);
  await page.locator('.lab-status.error').waitFor({state: 'visible'});
  assert.match(await scalar('load-status'), /could not be loaded/);
  assert.equal(await page.getByRole('button', {name: 'Retry', exact: true}).count(), 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log('PASS: 18 strategies, 35 operating points, whole-unit pruning, LUT, tracing, budgets, URL, CSV, keyboard, responsive layouts, missing-reference and API-error states.');
} finally { await browser.close(); }
