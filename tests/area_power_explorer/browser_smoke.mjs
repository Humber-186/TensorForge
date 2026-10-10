// Real-browser checks without npm dependencies. Requires Node 24 and Chrome.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const site = resolve(option('--site-dir', 'tensorforge_site_bundle/artifacts/area_power_explorer/site'));
const screenshots = option('--screenshots', null);
const profile = await mkdtemp(join(tmpdir(), 'tensorforge-chrome-'));
const requests = [];
const missingAssets = [];
const exceptions = [];
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  requests.push(path);
  if (path === '/favicon.ico') { response.writeHead(204).end(); return; }
  const file = path.slice('/TensorForge/'.length) || 'index.html';
  try {
    if (!path.startsWith('/TensorForge/') || file.includes('..')) throw new Error('Unknown path');
    const body = await readFile(join(site, file));
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'text/plain' }).end(body);
  } catch {
    missingAssets.push(path);
    response.writeHead(404).end();
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/TensorForge/`;
let browser, socket, session;
let stderr = '';
let startupError;
let nextId = 0;
const pending = new Map();

async function poll(callback, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await callback()) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${description}`);
}

function call(method, params = {}, sessionId = session) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}; requests=${JSON.stringify(requests.slice(-10))}; ${stderr.slice(-500)}`));
    }, method === 'Page.navigate' ? 45_000 : 15_000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function visit(page, ready) {
  console.log(`Checking ${page}`);
  await call('Page.navigate', { url: base + page });
  await poll(() => evaluate(`location.pathname.endsWith(${JSON.stringify(page)}) && (${ready})`), page);
  assert.equal(await evaluate('document.querySelectorAll(".top-nav [aria-current=page]").length'), 1);
}

async function screenshot(name) {
  if (!screenshots) return;
  await mkdir(screenshots, { recursive: true });
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(screenshots, name + '.png'), Buffer.from(data, 'base64'));
}

async function theme(value) {
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
  await poll(() => evaluate(`matchMedia('(prefers-color-scheme: dark)').matches === ${value === 'dark'}`), value + ' theme');
  await delay(50);
}

async function checkChartText(selector) {
  assert.ok(await evaluate(`(() => {
    const svg = document.querySelector(${JSON.stringify(selector)});
    const frame = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('text')].every(text => {
      const matrix = text.getScreenCTM();
      const fontSize = parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b);
      const bounds = text.getBoundingClientRect();
      return fontSize >= 11.5 && bounds.left >= frame.left - 1 && bounds.right <= frame.right + 1;
    });
  })()`), `Unreadable or clipped chart text: ${selector}`);
}

async function checkLabelSpacing(selector) {
  assert.ok(await evaluate(`(() => {
    const labels = [...document.querySelectorAll(${JSON.stringify(selector)} + ' text')].map(text => text.getBoundingClientRect());
    return labels.every((a, index) => labels.slice(index + 1).every(b =>
      a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
    ));
  })()`), `Overlapping chart labels: ${selector}`);
}

async function tap(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  const point = await evaluate(`(() => {
    const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return {x:rect.x + rect.width/2, y:rect.y + rect.height/2};
  })()`);
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

try {
  browser = spawn(process.env.CHROME_BIN || 'google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.on('error', (error) => { startupError = error; });
  browser.stderr.on('data', (data) => { stderr = (stderr + data).slice(-8000); });
  let endpoint;
  await poll(async () => {
    if (startupError) throw startupError;
    if (browser.exitCode !== null) throw new Error('Chrome exited: ' + stderr);
    try {
      const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
      endpoint = `ws://127.0.0.1:${port}${path}`;
      return true;
    } catch { return false; }
  }, 'Chrome startup', 30_000);
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      clearTimeout(task.timeout);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(JSON.stringify(message.error)));
      else task.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' }, null);
  session = (await call('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId;
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await theme('light');
  await visit('index.html', 'document.querySelector("#result-cards")?.dataset.resultType === "measured_array"');
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  const lightBackground = await evaluate('getComputedStyle(document.body).backgroundColor');
  assert.ok(await evaluate('document.getElementById("norm-kind").querySelector("option[value=\\"4\\"]") !== null'));
  await screenshot('query-en-light');

  const initialConfig = await evaluate('JSON.stringify(Object.fromEntries([...document.getElementById("query-form").elements].filter(e => e.name).map(e => [e.name,e.value])))');
  await evaluate('document.getElementById("language-toggle").click()');
  assert.equal(await evaluate('document.documentElement.lang'), 'zh-CN');
  assert.ok(await evaluate('document.getElementById("result-cards").textContent.includes("综合阵列数据")'));
  assert.equal(await evaluate('JSON.stringify(Object.fromEntries([...document.getElementById("query-form").elements].filter(e => e.name).map(e => [e.name,e.value])))'), initialConfig);
  await evaluate('document.querySelector(".help-button").focus()');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".tooltip")).visibility'), 'visible');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".tooltip")).visibility'), 'hidden');

  await evaluate(`for (const [name,value] of Object.entries({precision_name:'INT4',norm_kind:'4',acc_kind:'INT32',out_kind:'INT32',midmat:'0'})) document.querySelector('[name='+name+']').value=value; document.getElementById('query-form').requestSubmit()`);
  await poll(() => evaluate('document.querySelector("#result-cards").dataset.resultType === "derived_measured_unit"'), 'INT4 query');
  await theme('dark');
  assert.notEqual(await evaluate('getComputedStyle(document.body).backgroundColor'), lightBackground);
  await screenshot('query-zh-dark');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow');
  await evaluate('document.querySelector("[aria-describedby=tip-index-midmat]").focus()');
  assert.ok(await evaluate('(() => { const r=document.getElementById("tip-index-midmat").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()'), 'Tooltip outside mobile viewport');
  await evaluate('document.activeElement.blur(); scrollTo(0,0)');
  await screenshot('query-zh-dark-mobile');
  console.log('PASS: query, integer options, translation, keyboard tooltip, mobile layout, automatic dark mode');

  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await visit('ppa.html', 'document.querySelectorAll("#ppa-unit-chart circle").length === 3620');
  assert.equal(await evaluate('document.documentElement.lang'), 'zh-CN');
  assert.equal(await evaluate('document.querySelectorAll("#ppa-array-chart circle").length'), 700);
  const darkChartText = await evaluate('getComputedStyle(document.querySelector("#ppa-unit-chart text")).fill');
  await evaluate('document.getElementById("ppa-unit-clk").value="1410"; document.getElementById("ppa-unit-clk").dispatchEvent(new Event("change")); document.getElementById("language-toggle").click()');
  assert.equal(await evaluate('document.getElementById("ppa-unit-clk").value'), '1410');
  assert.ok(await evaluate('document.querySelector("#ppa-unit-chart").textContent.includes("Power")'));
  await screenshot('ppa-en-dark');
  await theme('light');
  assert.notEqual(await evaluate('getComputedStyle(document.querySelector("#ppa-unit-chart text")).fill'), darkChartText);
  console.log('PASS: PPA filters, persisted language, translated axes, SVG colors follow system theme');

  await visit('baseline.html', 'document.querySelectorAll("#baseline-chart rect").length === 14');
  await evaluate('document.querySelector("#baseline-chart rect").dispatchEvent(new Event("mouseenter")); document.getElementById("language-toggle").click()');
  assert.equal(await evaluate('document.documentElement.lang'), 'zh-CN');
  await evaluate('document.querySelector("#baseline-chart rect").dispatchEvent(new Event("mouseenter"))');
  assert.ok(await evaluate('document.getElementById("baseline-detail").textContent.includes("基线")'));
  await screenshot('baseline-zh-light');
  await visit('breakdown.html', 'document.querySelectorAll("#breakdown-chart path").length === 18');
  assert.ok(await evaluate('document.getElementById("breakdown-series").selectedOptions[0].textContent.includes("SM 顶层")'));
  await evaluate('document.getElementById("breakdown-series").value="1"; document.getElementById("breakdown-series").dispatchEvent(new Event("change"))');
  assert.equal(await evaluate('document.querySelectorAll("#breakdown-chart path").length'), 8);
  await theme('dark');
  await screenshot('breakdown-zh-dark');
  console.log('PASS: baseline and breakdown translations, hover details, dataset switching');

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await visit('ppa.html', 'document.querySelectorAll("#ppa-unit-chart circle").length === 3620');
  await poll(() => evaluate('document.getElementById("ppa-unit-chart").viewBox.baseVal.width < 600'), 'PPA mobile layout');
  await checkChartText('#ppa-unit-chart');
  await checkChartText('#ppa-array-chart');
  await tap('#ppa-unit-chart circle:last-child');
  assert.ok(await evaluate('document.getElementById("ppa-unit-detail").textContent.includes("µm²")'));
  await evaluate('scrollTo(0,0)');
  await screenshot('ppa-zh-dark-mobile');
  await visit('baseline.html', 'document.querySelectorAll("#baseline-chart rect").length === 14');
  await checkChartText('#baseline-chart');
  await tap('#baseline-chart rect:last-of-type');
  assert.ok(await evaluate('document.getElementById("baseline-detail").textContent.includes("TensorForge")'));
  await evaluate('scrollTo(0,0)');
  await screenshot('baseline-zh-dark-mobile');
  await visit('breakdown.html', 'document.querySelectorAll("#breakdown-chart path").length === 18');
  await checkChartText('#breakdown-chart');
  await tap('#breakdown-chart text');
  assert.ok(await evaluate('document.getElementById("breakdown-detail").textContent.includes("µm²")'));
  await evaluate('scrollTo(0,0)');
  await screenshot('breakdown-zh-dark-mobile');
  for (const width of [320, 768, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await poll(() => evaluate(`Math.abs(document.getElementById('breakdown-chart').viewBox.baseVal.width - document.getElementById('breakdown-chart').clientWidth) < 1`), 'chart resize');
    await checkChartText('#breakdown-chart');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Chart page horizontal overflow');
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
  await visit('baseline.html', 'document.querySelectorAll("#baseline-chart rect").length === 14');
  await checkChartText('#baseline-chart');
  await checkLabelSpacing('#baseline-chart');
  assert.ok(await evaluate('document.getElementById("baseline-chart").textContent.includes("点积长度")'));
  await evaluate('document.getElementById("language-toggle").click()');
  await checkChartText('#baseline-chart');
  await checkLabelSpacing('#baseline-chart');
  assert.ok(await evaluate('document.getElementById("baseline-chart").textContent.includes("Dot-product length")'));
  await screenshot('baseline-en-dark-small');
  console.log('PASS: readable responsive charts, touch details, and viewport resizing');
  assert.deepEqual(exceptions, [], 'Browser JavaScript errors');
  assert.deepEqual(missingAssets, [], 'Missing static assets');
  assert.ok(!requests.some(path => path.includes('/api/') || path.endsWith('.json')), 'Unexpected API/data requests');
  console.log('PASS: GitHub Pages subdirectory URLs; no API or separate data requests');
} finally {
  for (const task of pending.values()) clearTimeout(task.timeout);
  socket?.close();
  const browserIsRunning = () => browser?.pid && browser.exitCode === null && browser.signalCode === null;
  if (browserIsRunning()) {
    const exited = once(browser, 'exit');
    browser.kill('SIGTERM');
    await Promise.race([exited, delay(2000)]);
    if (browserIsRunning()) {
      browser.kill('SIGKILL');
      await exited;
    }
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Chrome's child processes can finish writing after its main process exits.
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
