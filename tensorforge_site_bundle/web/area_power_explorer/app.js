async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function setSelectOptions(select, values, defaultValue, formatter = (value) => ({ value: String(value), label: String(value) })) {
  const normalized = values && values.length ? values : [defaultValue];
  select.innerHTML = normalized.map((value) => {
    const item = formatter(value);
    return `<option value="${item.value}">${item.label}</option>`;
  }).join('');
  if (normalized.map(String).includes(String(defaultValue))) {
    select.value = String(defaultValue);
  } else {
    select.value = String(normalized[0]);
  }
}

function renderCards(result) {
  const cards = document.getElementById('result-cards');
  if (result.status === 'not_found') {
    cards.innerHTML = `
      <article class="card error-card">
        <div class="label">(Query Status)</div>
        <div class="value">${result.message}</div>
      </article>
    `;
    document.getElementById('result-formulas').textContent = '(No exact or estimated result available)';
    return;
  }

  const rows = [
    ['(Query Status)', result.message],
    ['(Result Type)', result.result_type],
    ['(Tile Count)', String(result.tile_count)],
    ['(Unit Area)', `${result.unit_area_um2.toFixed(6)} um²`],
    ['(Unit Power)', `${result.unit_power_total_mw.toFixed(6)} mW`],
    ['(Array Area)', `${result.array_area_um2.toFixed(6)} um²`],
    ['(Array Power)', `${result.array_power_total_mw.toFixed(6)} mW`],
  ];
  cards.innerHTML = rows.map(([label, value]) => `
    <article class="card">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </article>
  `).join('');
  document.getElementById('result-formulas').textContent = `${result.formula_area}\n${result.formula_power}`;
}

function renderError(error) {
  const cards = document.getElementById('result-cards');
  cards.innerHTML = `
    <article class="card error-card">
      <div class="label">(Failed to load result)</div>
      <div class="value">${error.message || String(error)}</div>
    </article>
  `;
  document.getElementById('result-formulas').textContent = '(Failed to load result)';
}

async function loadOptions() {
  const options = await fetchJson('/api/options');
  setSelectOptions(document.getElementById('dim-m'), options.dim_m, 8);
  setSelectOptions(document.getElementById('dim-n'), options.dim_n, 4);
  setSelectOptions(document.getElementById('dim-k'), options.dim_k, 16);
  setSelectOptions(document.getElementById('clk-mhz'), options.clk_mhz, 1410);
  setSelectOptions(document.getElementById('precision-name'), options.precision_name, 'BF16');
  setSelectOptions(document.getElementById('norm-kind'), options.norm_kind, 'FP32');
  setSelectOptions(document.getElementById('acc-kind'), options.acc_kind, 'FP32');
  setSelectOptions(document.getElementById('out-kind'), options.out_kind, 'FP32');
  setSelectOptions(document.getElementById('midmat-select'), options.midmat, 26);
  setSelectOptions(document.getElementById('mx-select'), options.mx, 0, (value) => ({ value: String(value), label: value ? 'With MX' : 'No MX' }));
  setSelectOptions(document.getElementById('nv-select'), options.nv, 0, (value) => ({ value: String(value), label: value ? 'With NV' : 'No NV' }));
  setSelectOptions(document.getElementById('allow-predicted'), options.allow_predicted, 1, (value) => ({ value: String(value), label: value ? 'Allow Predicted' : 'Measured Only' }));
}

async function submitQuery(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const params = new URLSearchParams();
  for (const element of form.elements) {
    if (!element.name) continue;
    params.set(element.name, element.value);
  }
  try {
    const result = await fetchJson(`/api/query?${params.toString()}`);
    renderCards(result);
  } catch (error) {
    renderError(error);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('query-form');
  form.addEventListener('submit', submitQuery);
  try {
    await loadOptions();
    await submitQuery({
      preventDefault() {},
      currentTarget: form,
    });
  } catch (error) {
    renderError(error);
  }
});
