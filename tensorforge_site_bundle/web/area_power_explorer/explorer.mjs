// Browser query engine. The exported data keeps the SQLite row order so that
// duplicate configurations select the same first result as the Python engine.
// BEGIN GENERATED DATA
const SITE_DATA = null;
// END GENERATED DATA
const NOT_FOUND_MESSAGE = '该组合不存在，且没有可用估计值 / No exact or estimated data found';

function unpack(table) {
  return table.rows.map((values, order) => ({
    ...Object.fromEntries(table.columns.map((field, index) => [field, values[index]])),
    order,
  }));
}

function precisionCandidates(name, mx, nv) {
  const raw = String(name || '').trim();
  const base = raw.replace(/^(MXNV|MX|NV)/, '');
  const prefix = mx && nv ? 'MXNV' : mx ? 'MX' : nv ? 'NV' : '';
  return [...new Set([raw, prefix + base, base].filter(Boolean))];
}

function rowKey(row, isArray) {
  const values = [row.precision_name, row.dim_k, row.mx_flag, row.nv_flag,
    row.norm_kind, row.acc_kind, row.out_kind, row.midmat];
  if (isArray) values.push(row.dim_m, row.dim_n);
  return JSON.stringify(values);
}

function indexRows(rows, isArray = false) {
  const index = new Map();
  for (const row of rows) {
    const key = rowKey(row, isArray);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function findRow(index, request, isArray = false) {
  let first = null;
  for (const precision of precisionCandidates(request.precision_name, request.mx, request.nv)) {
    const key = rowKey({
      precision_name: precision, dim_k: request.k,
      mx_flag: Number(request.mx), nv_flag: Number(request.nv),
      norm_kind: request.norm_kind, acc_kind: request.acc_kind,
      out_kind: request.out_kind, midmat: request.midmat,
      dim_m: request.m, dim_n: request.n,
    }, isArray);
    const row = (index.get(key) || []).find((candidate) => (
      candidate.clk_mhz !== null && Math.abs(candidate.clk_mhz - request.clk_mhz) < 1e-6
    ));
    if (row && (!first || row.order < first.order)) first = row;
  }
  return first;
}

function enabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'True';
}

function normalizeRequest(request) {
  return {
    m: Number(request.m), n: Number(request.n), k: Number(request.k),
    clk_mhz: Number(request.clk_mhz), precision_name: request.precision_name,
    mx: enabled(request.mx), nv: enabled(request.nv),
    norm_kind: request.norm_kind, acc_kind: request.acc_kind, out_kind: request.out_kind,
    midmat: Number(request.midmat),
    allow_predicted: request.allow_predicted === undefined || enabled(request.allow_predicted),
  };
}

export class ExplorerQueryEngine {
  constructor(data, predictions = null) {
    if (data.schema_version !== 1) throw new Error('Unsupported measurement data version');
    this.options = data.options;
    this.units = unpack(data.units);
    this.arrays = unpack(data.arrays);
    this.unitIndex = indexRows(this.units);
    this.arrayIndex = indexRows(this.arrays, true);
    this.predictionIndex = new Map();
    if (predictions) this.setPredictions(predictions);
  }

  setPredictions(data) {
    if (data.schema_version !== 1) throw new Error('Unsupported prediction data version');
    this.predictionIndex = indexRows(unpack(data));
  }

  queryArray(input) {
    const request = normalizeRequest(input);
    const { m, n, k, clk_mhz, allow_predicted, ...configuration } = request;
    const requested = { m, n, k, clk_mhz, ...configuration };
    const tileCount = m * n;
    const array = findRow(this.arrayIndex, request, true);
    let unitArea, unitPower, arrayArea, arrayPower, resultType;
    if (array) {
      arrayArea = array.area_um2 || 0;
      arrayPower = array.power_total_mw || 0;
      unitArea = tileCount ? arrayArea / tileCount : 0;
      unitPower = tileCount ? arrayPower / tileCount : 0;
      resultType = 'measured_array';
    } else {
      const measuredUnit = findRow(this.unitIndex, request);
      const predictedUnit = !measuredUnit && allow_predicted
        ? findRow(this.predictionIndex, request) : null;
      const unit = measuredUnit || predictedUnit;
      if (!unit) {
        return {
          status: 'not_found', result_type: 'not_found', exact_match_found: false,
          estimate_available: false, message: NOT_FOUND_MESSAGE,
          tile_count: tileCount, actual_k: k, requested, allow_predicted,
        };
      }
      unitArea = unit.area_um2 || 0;
      unitPower = unit.power_total_mw || 0;
      arrayArea = tileCount * unitArea;
      arrayPower = tileCount * unitPower;
      resultType = measuredUnit ? 'derived_measured_unit' : 'predicted_unit';
    }
    const formula = (label, unitValue, totalValue, unit) => (
      `(${label} = ${m} × ${n} × ${unitValue.toFixed(6)} ${unit} = ${totalValue.toFixed(6)} ${unit})`
    );
    return {
      status: array ? 'exact' : 'estimated_only', result_type: resultType,
      exact_match_found: Boolean(array), estimate_available: true,
      message: array ? '精确结果存在 / Exact measured result found'
        : '精确组合不存在，以下为估计值 / Exact match not found; showing estimate',
      tile_count: tileCount, actual_k: k,
      unit_area_um2: unitArea, unit_power_total_mw: unitPower,
      array_area_um2: arrayArea, array_power_total_mw: arrayPower,
      macs_per_cycle: m * n * k, ops_per_cycle: 2 * m * n * k,
      throughput_ops_per_sec: 2 * m * n * k * clk_mhz * 1_000_000,
      formula_area: formula('Array Area', unitArea, arrayArea, 'um²'),
      formula_power: formula('Array Power', unitPower, arrayPower, 'mW'),
      requested, allow_predicted,
    };
  }
}

// All datasets are compiled into this module; only the indexes are built at runtime.
let explorer;

export async function loadData(name) {
  if (!SITE_DATA) throw new Error('Website data is not built. Run export-static and open the generated site directory.');
  if (!Object.hasOwn(SITE_DATA, name)) throw new Error(`Unknown dataset: ${name}`);
  return SITE_DATA[name];
}

export async function loadExplorer() {
  if (!SITE_DATA) throw new Error('Website data is not built. Run export-static and open the generated site directory.');
  if (!explorer) {
    explorer = new ExplorerQueryEngine(SITE_DATA.measurements, SITE_DATA.predictions);
  }
  return explorer;
}

export async function queryArray(request) {
  const explorer = await loadExplorer();
  return explorer.queryArray(request);
}
