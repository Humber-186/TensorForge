import { loadExplorer, queryArray } from './explorer.mjs';
import { formatNumber, precisionLabel, t } from './ui.mjs';

let currentResult;
let currentError;
let currentOptions;

function setSelectOptions(select, values, defaultValue, formatter = (value) => ({ value: String(value), label: String(value) })) {
  const normalized = values && values.length ? values : [defaultValue];
  const previous = select.value;
  select.replaceChildren(...normalized.map((value) => {
    const item = formatter(value);
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    return option;
  }));
  const available = normalized.map(String);
  select.value = available.includes(previous) ? previous
    : available.includes(String(defaultValue)) ? String(defaultValue) : available[0];
}

function card(label, value, error = false) {
  const article = document.createElement('article');
  article.className = error ? 'card error-card' : 'card';
  for (const [className, text] of [['label', label], ['value', value]]) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    article.appendChild(element);
  }
  return article;
}

function renderCards(result) {
  const cards = document.getElementById('result-cards');
  cards.dataset.resultType = result.result_type;
  if (result.status === 'not_found') {
    cards.replaceChildren(card(t('result.status'), t('status.notFound'), true));
    document.getElementById('result-formulas').textContent = t('formula.none');
    return;
  }

  const rows = [
    ['result.status', t(result.exact_match_found ? 'status.exact' : 'status.estimated')],
    ['result.source', t(`source.${result.result_type}`)],
    ['result.tiles', formatNumber(result.tile_count)],
    ['result.unitArea', `${formatNumber(result.unit_area_um2, 6)} µm²`],
    ['result.unitPower', `${formatNumber(result.unit_power_total_mw, 6)} mW`],
    ['result.arrayArea', `${formatNumber(result.array_area_um2, 6)} µm²`],
    ['result.arrayPower', `${formatNumber(result.array_power_total_mw, 6)} mW`],
  ];
  cards.replaceChildren(...rows.map(([label, value]) => card(t(label), value)));
  document.getElementById('result-formulas').textContent = [
    result.formula_area.replace('Array Area', t('formula.area')),
    result.formula_power.replace('Array Power', t('formula.power')),
  ].join('\n');
}

function renderError(error) {
  const cards = document.getElementById('result-cards');
  cards.dataset.resultType = 'error';
  cards.replaceChildren(card(t('error.query'), error.message || String(error), true));
  document.getElementById('result-formulas').textContent = t('formula.none');
}

function refreshOptions() {
  const options = currentOptions;
  if (!options) return;
  setSelectOptions(document.getElementById('dim-m'), options.dim_m, 8);
  setSelectOptions(document.getElementById('dim-n'), options.dim_n, 4);
  setSelectOptions(document.getElementById('dim-k'), options.dim_k, 16);
  setSelectOptions(document.getElementById('clk-mhz'), options.clk_mhz, 1410);
  setSelectOptions(document.getElementById('precision-name'), options.precision_name, 'BF16',
    (value) => ({ value, label: precisionLabel(value) }));
  setSelectOptions(document.getElementById('norm-kind'), options.norm_kind, 'FP32',
    (value) => ({ value, label: value === '4' || value === '8' ? t(`option.norm${value}`) : value }));
  setSelectOptions(document.getElementById('acc-kind'), options.acc_kind, 'FP32');
  setSelectOptions(document.getElementById('out-kind'), options.out_kind, 'FP32',
    (value) => ({ value, label: precisionLabel(value) }));
  setSelectOptions(document.getElementById('midmat-select'), options.midmat, 26);
  setSelectOptions(document.getElementById('mx-select'), options.mx, 0, (value) => ({ value: String(value), label: t(value ? 'option.enabled' : 'option.disabled') }));
  setSelectOptions(document.getElementById('nv-select'), options.nv, 0, (value) => ({ value: String(value), label: t(value ? 'option.enabled' : 'option.disabled') }));
  setSelectOptions(document.getElementById('allow-predicted'), options.allow_predicted, 1, (value) => ({ value: String(value), label: t(value ? 'option.predicted' : 'option.measured') }));
}

async function submitQuery(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const request = {};
  for (const element of form.elements) {
    if (!element.name) continue;
    request[element.name] = element.value;
  }
  try {
    const result = await queryArray(request);
    currentResult = result;
    currentError = null;
    renderCards(result);
  } catch (error) {
    currentError = error;
    renderError(error);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('query-form');
  form.addEventListener('submit', submitQuery);
  try {
    currentOptions = (await loadExplorer()).options;
    refreshOptions();
    await submitQuery({
      preventDefault() {},
      currentTarget: form,
    });
  } catch (error) {
    currentError = error;
    renderError(error);
  }
});

document.addEventListener('tensorforge:languagechange', () => {
  refreshOptions();
  if (currentError) renderError(currentError);
  else if (currentResult) renderCards(currentResult);
});
