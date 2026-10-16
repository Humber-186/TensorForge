const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const number = (value, digits = 0) => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: digits});
const label = (format) => ['FP8', 'FP6', 'FP4'].includes(format) ? `MX${format}` : format;
const familyLabel = (value) => ({unified: '统一复用', hybrid: '混合复用', dedicated: '独立通路'}[value]);
const strategyDescriptions = {
  s01: '全精度统一复用',
  s02: '高精度与整数共享，低精度浮点单独复用',
  s03: '浮点与整数分别复用',
  s04: '浮点统一复用，整数分别独立',
  s05: 'FP16 独立，其余按族复用',
  s06: 'BF16 独立，其余按族复用',
  s07: 'BF16 独立，高精度与整数共享',
  s08: '高精度浮点独立，低精度与整数按族复用',
  s09: 'FP16 与整数独立，其余浮点复用',
  s10: '仅低精度浮点复用',
  s11: '仅高精度浮点与整数复用',
  s12: 'BF16 独立，仅高精度与整数复用',
  s13: '仅整数复用',
  s14: '各精度独立实现，FP4 使用算术电路',
  s15: '高精度与整数复用，FP4 使用查找表',
  s16: 'BF16 独立，高精度与整数复用，FP4 使用查找表',
  s17: '整数复用，FP4 使用查找表',
  s18: '各精度独立实现，FP4 使用查找表',
};
const strategyLabel = (strategy) => strategyDescriptions[strategy.id];
const groupLabel = (group) => group.formats.map(label).join(' / ') + (group.implementation === 'lookup_table' ? '（查找表）' : '');
const colors = ['#4079c7', '#32a391', '#9b7bbb', '#dfa16c', '#6e9fbd', '#b98c9e', '#7c9a74'];
let data;
let state;
let points;
let feedbackTimer;

function initialState() {
  return {k: data.meta.default_k, clock: data.meta.default_clk_mhz, formats: [...data.formats], strategy: 's01', budget: 100, family: 'all', trace: 'FP16'};
}

function readState() {
  const value = initialState();
  const params = new URLSearchParams(location.hash.slice(1));
  if (data.ks.includes(Number(params.get('k')))) value.k = Number(params.get('k'));
  if (data.clocks_mhz.includes(Number(params.get('clock')))) value.clock = Number(params.get('clock'));
  if (params.has('formats')) {
    const formats = data.formats.filter((f) => params.get('formats').split(',').includes(f));
    if (formats.length) value.formats = formats;
  }
  if (data.strategies.some((s) => s.id === params.get('strategy'))) value.strategy = params.get('strategy');
  const budget = Number(params.get('budget'));
  if (params.has('budget') && Number.isFinite(budget) && budget >= 20 && budget <= 120) value.budget = Math.round(budget);
  if (['all', 'unified', 'hybrid', 'dedicated'].includes(params.get('family'))) value.family = params.get('family');
  if (value.formats.includes(params.get('trace'))) value.trace = params.get('trace');
  else value.trace = value.formats[0];
  return value;
}

function saveState() {
  const params = new URLSearchParams({k: state.k, clock: state.clock, formats: state.formats.join(','), strategy: state.strategy, budget: state.budget, family: state.family, trace: state.trace});
  history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
}

function feedback(message) {
  clearTimeout(feedbackTimer);
  const status = $('load-status');
  status.textContent = message;
  status.className = 'lab-status transient';
  status.hidden = false;
  feedbackTimer = setTimeout(() => { status.hidden = true; }, 4500);
}

// Keep complete measured datapaths; never proportionally discount a shared unit.
function evaluate(strategy) {
  const point = points.get(`${strategy.id}:${state.k}:${state.clock}`);
  const groups = (point?.groups || []).map((group) => ({...group, retained: group.formats.some((format) => state.formats.includes(format))}));
  const active = groups.filter((group) => group.retained);
  const covered = new Set(active.flatMap((group) => group.formats));
  const available = active.length > 0 && active.every((group) => group.available && Number.isFinite(group.area_um2)) && state.formats.every((format) => covered.has(format));
  return {...strategy, point, groups, active, available, area: available ? active.reduce((sum, group) => sum + group.area_um2, 0) : null};
}

function scenarioFormats(scenario) {
  return scenario === 'float' ? ['FP16', 'BF16', 'FP8', 'FP6', 'FP4'] : scenario === 'low' ? ['FP8', 'FP4', 'INT8', 'INT4'] : [...data.formats];
}

function syncControls() {
  $('k-range').value = data.ks.indexOf(state.k);
  $('k-range').setAttribute('aria-valuetext', `K = ${state.k}`);
  $('k-value').value = state.k;
  $('clock-select').value = state.clock;
  $('budget-range').value = state.budget;
  $('budget-percent').value = `${state.budget}%`;
  document.querySelectorAll('.format-chip input').forEach((input) => { input.checked = state.formats.includes(input.value); });
  document.querySelectorAll('[data-scenario]').forEach((button) => {
    const formats = scenarioFormats(button.dataset.scenario);
    const active = formats.length === state.formats.length && formats.every((format) => state.formats.includes(format));
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-family]').forEach((button) => {
    const active = state.family === button.dataset.family;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-preset]').forEach((button) => {
    const active = state.strategy === button.dataset.preset;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
}

function sourceMarkup(group) {
  if (!group.available) return '<p class="micro-copy">此数据通路没有已发布的精确测量值。</p>';
  const source = group.source;
  return `<details class="source-details"><summary>已综合单元 · CSV 第 ${esc(group.source_row)} 行</summary><dl>
    <dt>数据来源</dt><dd>${esc(source.file)}:${esc(group.source_row)}</dd>
    <dt>配置标识</dt><dd>${esc(group.variant)}</dd>
    <dt>归一化 / 累加器 / 输出</dt><dd>${esc(source.norm_kind)} / ${esc(source.acc_kind)} / ${esc(source.out_kind)}</dd>
    <dt>中间位宽 / 缩放配置</dt><dd>midMat ${esc(source.midMat)} · ${esc(source.mx)}</dd>
    <dt>组成单元的精确面积</dt><dd>${esc(number(group.unit_area_um2, 5))} μm² × ${esc(group.instances)} 个单元</dd>
    <dt>综合报告</dt><dd>${esc(source.report_dir)}</dd>
  </dl></details>`;
}

function renderMap(selected, budget) {
  $('selection-badge').textContent = `${selected.id.toUpperCase()} · ${familyLabel(selected.family)}`;
  $('strategy-description').textContent = `${strategyLabel(selected)}。每张卡片对应一条物理数据通路，卡片内的精度共享这套硬件。`;
  $('mode-tabs').innerHTML = state.formats.map((format) => `<button type="button" data-trace="${esc(format)}" class="${state.trace === format ? 'active' : ''}" aria-pressed="${state.trace === format}">${esc(label(format))}</button>`).join('');
  $('datapath-map').innerHTML = selected.groups.map((group, index) => {
    const traced = group.retained && group.formats.includes(state.trace);
    const kind = group.implementation === 'lookup_table' ? 'FP4 查找表' : group.formats.length > 1 ? '共享数据通路' : '独立数据通路';
    return `<article class="datapath-card ${traced ? 'traced' : ''} ${group.retained ? '' : 'removed'}" style="--group-color:${colors[index % colors.length]}" data-group="${esc(group.id)}" data-retained="${group.retained}">
      <div class="datapath-heading"><b>通路 ${String(index + 1).padStart(2, '0')}</b><span>${group.retained ? kind : '已移除'}</span></div>
      <div class="hardware-icon"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><span>K = ${esc(group.dim_k)}${group.k_multiplier > 1 ? `（基础 K 的 ${esc(group.k_multiplier)} 倍）` : ''}</span></div>
      <div class="datapath-formats">${group.formats.map((format) => `<span class="${state.formats.includes(format) ? '' : 'unrequired'} ${traced && state.trace === format ? 'trace-format' : ''}" title="${state.formats.includes(format) ? '所需精度' : '共享通路仍保留对此精度的支持'}">${esc(label(format))}</span>`).join('')}</div>
      <div class="datapath-area">${group.available ? number(group.area_um2) : '—'} <small>μm²${group.retained ? '' : '（不计入）'}</small></div>
      ${sourceMarkup(group)}
    </article>`;
  }).join('');
  $('area-stack').innerHTML = selected.available ? selected.groups.map((group, index) => group.retained ? `<span style="width:${group.area_um2 / selected.area * 100}%;--group-color:${colors[index % colors.length]}" title="${esc(groupLabel(group))}：${esc(number(group.area_um2, 2))} μm²"></span>` : '').join('') : '';
  const removed = selected.groups.length - selected.active.length;
  $('pruning-note').textContent = state.formats.length === data.formats.length ? '论文完整配置 · 保留全部原始数据通路' : `需求裁剪 · 移除 ${removed} 条闲置通路 · 保留单元按完整测量面积计入`;
  $('selected-budget').textContent = !selected.available ? '测量数据不可用' : budget === null ? '预算参考不可用' : selected.area <= budget ? '✓ 满足面积预算' : `超出预算 ${number(selected.area - budget)} μm²`;
  $('selected-budget').classList.toggle('over-budget', !selected.available || (budget !== null && selected.area > budget));
  $('strategy-note').hidden = !selected.notes.length;
  $('strategy-note').textContent = selected.notes.length ? '原始配置包含一条独立 BF16 通路，以及一条共享 FP16 / BF16 / INT8 / INT4 的通路。两个物理单元均保留；旧版图例省略了共享通路中的 BF16。' : '';
}

function renderRanking(results, baseline, budget) {
  const sorted = [...results].sort((a, b) => (a.area ?? Infinity) - (b.area ?? Infinity) || a.paper_index - b.paper_index);
  const maximum = Math.max(...results.filter((item) => item.available).map((item) => item.area), budget) * 1.04 || 1;
  const best = sorted.find((item) => item.available);
  const filtered = sorted.filter((item) => state.family === 'all' || item.family === state.family);
  $('strategy-ranking').innerHTML = filtered.map((item) => {
    const isSelected = item.id === state.strategy;
    const within = item.available && budget !== null && item.area <= budget;
    const shared = item.active.filter((group) => group.formats.length > 1).length;
    const groups = item.active.map((group) => group.formats.map(label).join('+') + (group.implementation === 'lookup_table' ? '（查找表）' : '')).join(' / ');
    return `<button type="button" class="strategy-row ${isSelected ? 'selected' : ''}" data-strategy="${esc(item.id)}" aria-pressed="${isSelected}" ${item.available ? '' : 'disabled'} aria-label="${esc(item.id.toUpperCase())} ${esc(strategyLabel(item))}，${item.available ? `${number(item.area)} 平方微米，${budget === null ? '预算参考不可用' : within ? '满足预算' : '超出预算'}` : '测量数据不可用'}">
      <span class="rank">${String(sorted.indexOf(item) + 1).padStart(2, '0')}</span>
      <span><span class="strategy-name">${esc(item.id.toUpperCase())} · ${esc(strategyLabel(item))}${item.id === best?.id ? '<span class="row-tags">最小面积</span>' : ''}${item.id === baseline.id ? '<span class="row-tags">参考</span>' : ''}</span><span class="strategy-groups">${esc(groups || '无保留单元')}</span></span>
      <span class="area-track" aria-hidden="true"><span class="area-bar ${esc(item.family)}" style="width:${item.available ? item.area / maximum * 100 : 0}%"></span>${budget === null ? '' : `<span class="budget-line" style="left:${budget / maximum * 100}%"></span>`}</span>
      <span class="row-area">${item.available ? number(item.area) : '—'}<small class="${within ? '' : 'over'}">${item.available ? `${item.active.length} 条 · ${shared ? `${shared} 条共享` : '独立'}` : '不可用'}</small></span>
    </button>`;
  }).join('');
  if (best && baseline.available) {
    const saving = (1 - best.area / baseline.area) * 100;
    $('ranking-insight').textContent = `当前实验中，${best.id.toUpperCase()} 的面积最小：${number(best.area)} μm²，比 S14 节省 ${number(saving, 1)}%。${state.formats.length === data.formats.length ? '试着取消一种精度，观察哪些完整通路会被移除。' : '不同配置裁剪后可能保留相同硬件，因此出现相同面积是正常的。'}`;
  } else $('ranking-insight').textContent = best ? 'S14 参考数据不可用。仍可查看各策略的已测面积，但无法判断预算与节省比例。' : '当前操作点缺少组成单元的精确测量数据。';
}

function render() {
  if (!state.formats.includes(state.trace)) state.trace = state.formats[0];
  syncControls();
  const results = data.strategies.map(evaluate);
  const selected = results.find((item) => item.id === state.strategy);
  const baseline = results.find((item) => item.id === data.meta.baseline_strategy_id);
  const budget = baseline.available ? baseline.area * state.budget / 100 : null;
  $('metric-area').textContent = selected.available ? number(selected.area) : '—';
  const saving = selected.available && baseline.available ? (1 - selected.area / baseline.area) * 100 : null;
  $('metric-saving').textContent = saving === null ? '—' : `${number(saving, 1)}%`;
  $('metric-saving').style.color = saving !== null && saving < 0 ? '#ad6839' : '';
  $('metric-blocks').textContent = `${selected.active.length} / ${selected.groups.length}`;
  $('blocks-caption').textContent = state.formats.length === data.formats.length ? '保留全部原始单元' : '保留完整单元 / 原始单元';
  $('metric-feasible').textContent = budget === null ? '—' : `${results.filter((item) => item.available && item.area <= budget).length} / 18`;
  $('budget-caption').textContent = budget === null ? '参考数据不可用' : `面积预算 ${number(budget)} μm²`;
  $('budget-value').textContent = budget === null ? 'S14 参考测量数据不可用' : `${number(budget)} μm² · S14 参考面积：${number(baseline.area)} μm²`;
  renderMap(selected, budget);
  renderRanking(results, baseline, budget);
  saveState();
}

function exportCSV() {
  const results = data.strategies.map(evaluate);
  const baseline = results.find((item) => item.id === data.meta.baseline_strategy_id);
  const budget = baseline.available ? baseline.area * state.budget / 100 : null;
  const rows = [['策略编号', '策略说明', '策略类别', '所需精度', '基础K', '综合目标频率_MHz', '面积_μm²', '相对S14节省_%', '面积预算_μm²', '满足预算', '保留通路数', '移除通路数', '数据类型', '来源CSV', '来源行号', '来源配置', '面积公式', '比较范围']];
  results.forEach((item) => rows.push([
    item.id.toUpperCase(), strategyLabel(item), familyLabel(item.family), state.formats.map(label).join('+'), state.k, state.clock,
    item.area ?? '', item.available && baseline.available ? (1 - item.area / baseline.area) * 100 : '', budget ?? '',
    item.available && budget !== null ? item.area <= budget ? '是' : '否' : '', item.active.length, item.groups.length - item.active.length,
    item.available ? '由已综合单元推导' : '缺少测量数据', data.meta.source_file,
    item.active.map((group) => group.source_row ?? '缺失').join(';'), item.active.map((group) => group.variant ?? '缺失').join(';'),
    item.active.map((group) => `${group.unit_area_um2 ?? '?'} * ${group.instances}`).join(' + '),
    '整条通路裁剪；共享单元保留完整面积；使用已发布数据；不含集成开销；目标频率不代表已通过时序收敛',
  ]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], {type: 'text/csv;charset=utf-8;'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tensorforge-reuse-K${state.k}-${state.clock}MHz.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback('已导出全部 18 种策略及其组成单元的精确数据来源。');
}

function bindControls() {
  $('format-toggles').innerHTML = data.formats.map((format) => `<label class="format-chip ${format.startsWith('INT') ? 'int-chip' : ''}"><input type="checkbox" value="${esc(format)}" aria-label="需要支持 ${esc(label(format))}"><span>${esc(label(format))}</span></label>`).join('');
  $('format-toggles').addEventListener('change', (event) => {
    const formats = [...document.querySelectorAll('.format-chip input:checked')].map((input) => input.value);
    if (!formats.length) { event.target.checked = true; feedback('请至少保留一种需要支持的精度。'); return; }
    state.formats = formats;
    render();
  });
  $('k-range').max = data.ks.length - 1;
  $('k-ticks').innerHTML = data.ks.map((k) => `<span>${esc(k)}</span>`).join('');
  $('k-range').addEventListener('input', () => { state.k = data.ks[Number($('k-range').value)]; render(); });
  $('clock-select').innerHTML = data.clocks_mhz.map((clock) => `<option value="${esc(clock)}">${number(clock)} MHz</option>`).join('');
  $('clock-select').addEventListener('change', () => { state.clock = Number($('clock-select').value); render(); });
  $('budget-range').addEventListener('input', () => { state.budget = Number($('budget-range').value); render(); });
  document.querySelectorAll('[data-scenario]').forEach((button) => button.addEventListener('click', () => {
    state.formats = scenarioFormats(button.dataset.scenario);
    state.strategy = button.dataset.scenario === 'float' ? 's03' : button.dataset.scenario === 'low' ? 's17' : 's01';
    state.trace = state.formats[0];
    state.family = 'all';
    render();
  }));
  document.querySelectorAll('[data-family]').forEach((button) => button.addEventListener('click', () => { state.family = button.dataset.family; render(); }));
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => { state.strategy = button.dataset.preset; render(); }));
  $('mode-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-trace]');
    if (!button) return;
    state.trace = button.dataset.trace;
    render();
    $('mode-tabs').querySelector(`[data-trace="${state.trace}"]`).focus({preventScroll: true});
  });
  $('strategy-ranking').addEventListener('click', (event) => {
    const button = event.target.closest('[data-strategy]');
    if (!button || button.disabled) return;
    state.strategy = button.dataset.strategy;
    render();
    $('strategy-ranking').querySelector(`[data-strategy="${state.strategy}"]`)?.focus({preventScroll: true});
  });
  $('reset-lab').addEventListener('click', () => { state = initialState(); render(); feedback('已重置：全部精度，K = 32，1,410 MHz。'); });
  $('export-csv').addEventListener('click', exportCSV);
  $('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); feedback('已复制实验链接。打开后可恢复所有设置和所选策略。'); }
    catch { feedback('复制浏览器地址即可分享实验，链接中已保存全部设置。'); }
  });
  window.addEventListener('hashchange', () => { state = readState(); render(); });
}

async function start() {
  try {
    const response = await fetch('/api/reuse-data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    if (data.schema_version !== 1 || data.strategies?.length !== 18 || !Array.isArray(data.points)) throw new Error('数据格式不符合预期');
    points = new Map(data.points.map((point) => [`${point.strategy_id}:${point.k}:${point.clk_mhz}`, point]));
    state = readState();
    bindControls();
    render();
    $('operating-count').textContent = data.ks.length * data.clocks_mhz.length;
    $('load-status').hidden = true;
    $('lab').hidden = false;
  } catch (error) {
    $('load-status').className = 'lab-status error';
    const reason = error instanceof SyntaxError ? '响应数据无法解析' : error instanceof TypeError ? '网络连接失败' : error.message;
    $('load-status').textContent = `综合数据加载失败（${reason}）。请启动 TensorForge 探索服务，然后`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary-button';
    retry.textContent = '重试';
    retry.addEventListener('click', () => location.reload());
    $('load-status').append(retry);
  }
}

start();
