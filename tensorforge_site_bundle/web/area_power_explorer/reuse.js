const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const number = (value, digits = 0) => Number(value).toLocaleString('en-US', {maximumFractionDigits: digits});
const label = (format) => ['FP8', 'FP6', 'FP4'].includes(format) ? `MX${format}` : format;
const title = (value) => value.charAt(0).toUpperCase() + value.slice(1);
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
  if (!group.available) return '<p class="micro-copy">No exact measurement released for this datapath.</p>';
  const source = group.source;
  return `<details class="source-details"><summary>Measured unit · CSV line ${esc(group.source_row)}</summary><dl>
    <dt>Source</dt><dd>${esc(source.file)}:${esc(group.source_row)}</dd>
    <dt>Variant</dt><dd>${esc(group.variant)}</dd>
    <dt>Normalization / accumulator / output</dt><dd>${esc(source.norm_kind)} / ${esc(source.acc_kind)} / ${esc(source.out_kind)}</dd>
    <dt>Intermediate width / scaling</dt><dd>midMat ${esc(source.midMat)} · ${esc(source.mx)}</dd>
    <dt>Exact constituent area</dt><dd>${esc(number(group.unit_area_um2, 5))} μm² × ${esc(group.instances)} unit(s)</dd>
    <dt>Report</dt><dd>${esc(source.report_dir)}</dd>
  </dl></details>`;
}

function renderMap(selected, budget) {
  $('selection-badge').textContent = `${selected.id.toUpperCase()} · ${title(selected.family)}`;
  $('strategy-description').textContent = `${selected.description}. Each card is one physical datapath; formats inside a card share that hardware.`;
  $('mode-tabs').innerHTML = state.formats.map((format) => `<button type="button" data-trace="${esc(format)}" class="${state.trace === format ? 'active' : ''}" aria-pressed="${state.trace === format}">${esc(label(format))}</button>`).join('');
  $('datapath-map').innerHTML = selected.groups.map((group, index) => {
    const traced = group.retained && group.formats.includes(state.trace);
    const kind = group.implementation === 'lookup_table' ? 'FP4 LOOKUP TABLE' : group.formats.length > 1 ? 'SHARED DATAPATH' : 'DEDICATED DATAPATH';
    return `<article class="datapath-card ${traced ? 'traced' : ''} ${group.retained ? '' : 'removed'}" style="--group-color:${colors[index % colors.length]}" data-group="${esc(group.id)}" data-retained="${group.retained}">
      <div class="datapath-heading"><b>DP ${String(index + 1).padStart(2, '0')}</b><span>${group.retained ? kind : 'REMOVED'}</span></div>
      <div class="hardware-icon"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><span>K = ${esc(group.dim_k)}${group.k_multiplier > 1 ? ` (${esc(group.k_multiplier)}× base)` : ''}</span></div>
      <div class="datapath-formats">${group.formats.map((format) => `<span class="${state.formats.includes(format) ? '' : 'unrequired'} ${traced && state.trace === format ? 'trace-format' : ''}" title="${state.formats.includes(format) ? 'Required format' : 'Extra support remains inside this shared datapath'}">${esc(label(format))}</span>`).join('')}</div>
      <div class="datapath-area">${group.available ? number(group.area_um2) : '—'} <small>μm²${group.retained ? '' : ' excluded'}</small></div>
      ${sourceMarkup(group)}
    </article>`;
  }).join('');
  $('area-stack').innerHTML = selected.available ? selected.groups.map((group, index) => group.retained ? `<span style="width:${group.area_um2 / selected.area * 100}%;--group-color:${colors[index % colors.length]}" title="${esc(group.label)}: ${esc(number(group.area_um2, 2))} μm²"></span>` : '').join('') : '';
  const removed = selected.groups.length - selected.active.length;
  $('pruning-note').textContent = state.formats.length === data.formats.length ? 'Full paper template · all original datapaths retained' : `What-if · ${removed} unused datapath${removed === 1 ? '' : 's'} removed · retained units keep full measured area`;
  $('selected-budget').textContent = !selected.available ? 'Measurement unavailable' : budget === null ? 'Budget reference unavailable' : selected.area <= budget ? '✓ Within area budget' : `${number(selected.area - budget)} μm² over budget`;
  $('selected-budget').classList.toggle('over-budget', !selected.available || (budget !== null && selected.area > budget));
  $('strategy-note').hidden = !selected.notes.length;
  $('strategy-note').textContent = selected.notes.join(' ');
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
    const groups = item.active.map((group) => group.formats.map(label).join('+') + (group.implementation === 'lookup_table' ? ' LUT' : '')).join(' / ');
    return `<button type="button" class="strategy-row ${isSelected ? 'selected' : ''}" data-strategy="${esc(item.id)}" aria-pressed="${isSelected}" ${item.available ? '' : 'disabled'} aria-label="${esc(item.id.toUpperCase())} ${esc(item.description)}, ${item.available ? `${number(item.area)} square micrometers, ${budget === null ? 'budget reference unavailable' : within ? 'within budget' : 'over budget'}` : 'measurement unavailable'}">
      <span class="rank">${String(sorted.indexOf(item) + 1).padStart(2, '0')}</span>
      <span><span class="strategy-name">${esc(item.id.toUpperCase())} · ${esc(item.description)}${item.id === best?.id ? '<span class="row-tags">min area</span>' : ''}${item.id === baseline.id ? '<span class="row-tags">ref</span>' : ''}</span><span class="strategy-groups">${esc(groups || 'No retained units')}</span></span>
      <span class="area-track" aria-hidden="true"><span class="area-bar ${esc(item.family)}" style="width:${item.available ? item.area / maximum * 100 : 0}%"></span>${budget === null ? '' : `<span class="budget-line" style="left:${budget / maximum * 100}%"></span>`}</span>
      <span class="row-area">${item.available ? number(item.area) : '—'}<small class="${within ? '' : 'over'}">${item.available ? `${item.active.length} DP · ${shared ? `${shared} shared` : 'separate'}` : 'unavailable'}</small></span>
    </button>`;
  }).join('');
  if (best && baseline.available) {
    const saving = (1 - best.area / baseline.area) * 100;
    $('ranking-insight').textContent = `${best.id.toUpperCase()} uses the least area for this experiment: ${number(best.area)} μm² (${number(saving, 1)}% below S14). ${state.formats.length === data.formats.length ? 'Try removing a format, then watch which whole datapaths disappear.' : 'Several templates can converge to the same retained hardware; equal areas are expected.'}`;
  } else $('ranking-insight').textContent = best ? 'The S14 reference is unavailable. Measured strategy areas remain visible; budget and savings cannot be evaluated.' : 'Exact constituent measurements are unavailable at this operating point.';
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
  $('blocks-caption').textContent = state.formats.length === data.formats.length ? 'All original units retained' : 'Whole units retained / original';
  $('metric-feasible').textContent = budget === null ? '—' : `${results.filter((item) => item.available && item.area <= budget).length} / 18`;
  $('budget-caption').textContent = budget === null ? 'Reference unavailable' : `${number(budget)} μm² area budget`;
  $('budget-value').textContent = budget === null ? 'S14 reference measurement unavailable' : `${number(budget)} μm² · S14 reference: ${number(baseline.area)} μm²`;
  renderMap(selected, budget);
  renderRanking(results, baseline, budget);
  saveState();
}

function exportCSV() {
  const results = data.strategies.map(evaluate);
  const baseline = results.find((item) => item.id === data.meta.baseline_strategy_id);
  const budget = baseline.available ? baseline.area * state.budget / 100 : null;
  const rows = [['strategy', 'description', 'family', 'required_formats', 'base_K', 'clock_target_MHz', 'area_um2', 'savings_vs_S14_pct', 'budget_um2', 'within_budget', 'retained_datapaths', 'removed_datapaths', 'source_type', 'source_csv', 'source_rows', 'source_variants', 'area_formula', 'scope']];
  results.forEach((item) => rows.push([
    item.id.toUpperCase(), item.description, item.family, state.formats.map(label).join('+'), state.k, state.clock,
    item.area ?? '', item.available && baseline.available ? (1 - item.area / baseline.area) * 100 : '', budget ?? '',
    item.available && budget !== null ? item.area <= budget : '', item.active.length, item.groups.length - item.active.length,
    item.available ? 'derived_measured_components' : 'missing_measurement', data.meta.source_file,
    item.active.map((group) => group.source_row ?? 'missing').join(';'), item.active.map((group) => group.variant ?? 'missing').join(';'),
    item.active.map((group) => `${group.unit_area_um2 ?? '?'} * ${group.instances}`).join(' + '),
    'Whole-datapath pruning; shared units keep full area; released bundled dataset; integration overhead excluded; clock target does not certify timing closure',
  ]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], {type: 'text/csv;charset=utf-8;'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tensorforge-reuse-K${state.k}-${state.clock}MHz.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback('Exported all 18 strategies with exact constituent sources.');
}

function bindControls() {
  $('format-toggles').innerHTML = data.formats.map((format) => `<label class="format-chip ${format.startsWith('INT') ? 'int-chip' : ''}"><input type="checkbox" value="${esc(format)}" aria-label="Require ${esc(label(format))}"><span>${esc(label(format))}</span></label>`).join('');
  $('format-toggles').addEventListener('change', (event) => {
    const formats = [...document.querySelectorAll('.format-chip input:checked')].map((input) => input.value);
    if (!formats.length) { event.target.checked = true; feedback('Keep at least one required precision selected.'); return; }
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
  $('reset-lab').addEventListener('click', () => { state = initialState(); render(); feedback('Experiment reset to all formats, K = 32, 1,410 MHz.'); });
  $('export-csv').addEventListener('click', exportCSV);
  $('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); feedback('Experiment link copied. It restores every control and your selected strategy.'); }
    catch { feedback('Copy the address in your browser to share this experiment; all settings are saved in the link.'); }
  });
  window.addEventListener('hashchange', () => { state = readState(); render(); });
}

async function start() {
  try {
    const response = await fetch('/api/reuse-data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    if (data.schema_version !== 1 || data.strategies?.length !== 18 || !Array.isArray(data.points)) throw new Error('Unexpected reuse dataset');
    points = new Map(data.points.map((point) => [`${point.strategy_id}:${point.k}:${point.clk_mhz}`, point]));
    state = readState();
    bindControls();
    render();
    $('operating-count').textContent = data.ks.length * data.clocks_mhz.length;
    $('load-status').hidden = true;
    $('lab').hidden = false;
  } catch (error) {
    $('load-status').className = 'lab-status error';
    $('load-status').textContent = `The synthesis dataset could not be loaded (${error.message}). Start the TensorForge explorer server, then `;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary-button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => location.reload());
    $('load-status').append(retry);
  }
}

start();
