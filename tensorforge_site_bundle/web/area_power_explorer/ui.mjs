export const MESSAGES = {
  en: {
    'nav.reuse': 'Precision Reuse Lab', 'nav.query': 'Query', 'nav.ppa': 'PPA Explorer', 'nav.baseline': 'Baseline Compare', 'nav.breakdown': 'Area Breakdown',
    'language.switch': '简体中文', 'language.label': 'Switch to Simplified Chinese',
    'page.index.title': 'TensorForge: Multi-Precision Tensor Core Design Space Explorer',
    'page.ppa.title': 'TensorForge PPA Explorer', 'page.baseline.title': 'TensorForge Baseline Comparison', 'page.breakdown.title': 'TensorForge Area Breakdown',
    'hero.index': 'Explore tensor-core configurations using synthesized area and power data, with traceable estimates when available.',
    'hero.ppa': 'Compare synthesized dot-product units and arrays. Filter by precision and target clock to explore area–power trade-offs.',
    'hero.baseline': 'Compare baseline dot-product implementations and TensorForge designs at the same precision and dot-product length.',
    'hero.breakdown': 'Inspect the module area shares in the released Ventus synthesis reports.',
    'synthesis': 'Synthesis conditions: ', 'query.controls': 'Configuration', 'query.run': 'Run query', 'query.results': 'Results',
    'field.m': 'Array rows (M)', 'field.n': 'Array columns (N)', 'field.k': 'Dot-product length (K)',
    'field.clock': 'Target clock (MHz)', 'field.precision': 'Supported precision', 'field.mx': 'MX scaling', 'field.nv': 'NV variant',
    'field.norm': 'Normalization (Norm)', 'field.acc': 'Accumulator (Acc)', 'field.out': 'Output format (Out)',
    'field.midmat': 'Intermediate accumulation width (bits)', 'field.prediction': 'Prediction fallback',
    'help.more': 'Explanation: {label}',
    'help.m': 'Number of output rows. Array estimates use M × N identical dot-product units.',
    'help.n': 'Number of output columns. Together with M, this determines the unit count used in array estimates.',
    'help.k': 'Number of terms in each dot product. The theoretical operation count is 2 × M × N × K per cycle, counting multiplication and addition separately.',
    'help.clock': 'The target clock used during hardware synthesis, in MHz. Only released clock configurations are available.',
    'help.precision': 'A combined name selects a unit supporting the listed formats, not just one workload mode. FP4LUT denotes the lookup-table FP4 implementation. Raw configuration identifiers are preserved.',
    'help.mx': 'Match the MX microscaling flag in the released configuration (withMX / noMX). MX and NV are separate flags; not all combinations have data.',
    'help.nv': 'Match the separate NV format/scale variant flag in the released configuration (withNV / noNV). Available results depend on the other selected settings.',
    'help.norm': 'Normalization/alignment format in the floating-point path. Codes 4 and 8 in the reports identify integer INT4 and INT8 paths; they are displayed as integer-path options.',
    'help.acc': 'Format of the accumulator used to sum products, such as FP32 or INT32. It can differ from the input precision.',
    'help.out': 'Output-format configuration from the synthesis reports. Combined format names preserve the original configuration, independently of the input and accumulator formats.',
    'help.midmat': 'midMat is the signed significand width after product alignment, before the adder tree. It controls truncation and intermediate accumulation precision. The tree adds sum-growth bits; Acc specifies the final accumulator format. Values 0 and -1 are dataset markers, not bit widths.',
    'help.prediction': 'Try the released offline prediction table only after both array and unit synthesis lookups fail. This does not run a model for arbitrary new configurations.',
    'help.source': 'Synthesized array: use the full array report; unit values are averages (array totals divided by M × N). Derived unit: multiply measured unit costs by M × N. Predicted unit: scale an offline model estimate. The latter two are array estimates.',
    'help.ppa': 'PPA means power, performance, and area. This page plots synthesized area versus total power; clock and precision are filters.',
    'help.breakdown': 'Each slice is a module’s share of the total area in the selected report. These reports describe Ventus modules, rather than a new tensor-core query.',
    'option.enabled': 'Enabled', 'option.disabled': 'Disabled', 'option.predicted': 'Allow offline predictions', 'option.measured': 'Use synthesis data only',
    'option.norm4': 'INT4 path (code 4)', 'option.norm8': 'INT8 path (code 8)', 'option.midmatMarker': '{value} (configuration marker)', 'option.all': 'All',
    'result.status': 'Query status', 'result.source': 'Result source', 'result.tiles': 'Unit count',
    'result.unitArea': 'Unit area', 'result.unitPower': 'Unit power', 'result.arrayArea': 'Array area', 'result.arrayPower': 'Array power',
    'status.exact': 'Matching synthesized array found', 'status.estimated': 'Array estimate available',
    'status.notFound': 'No matching synthesis data or offline prediction. Try another configuration.',
    'source.measured_array': 'Synthesized array', 'source.derived_measured_unit': 'Derived from synthesized unit', 'source.predicted_unit': 'Offline model prediction',
    'formula.area': 'Array area', 'formula.power': 'Array power', 'formula.none': 'No result available for this configuration.',
    'error.query': 'Could not display the result', 'error.ppa': 'Could not display PPA data', 'error.baseline': 'Could not display baseline data', 'error.breakdown': 'Could not display area breakdown',
    'ppa.units': 'Dot-product units', 'ppa.arrays': 'Synthesized arrays',
    'chart.hoverUnit': 'Hover or tap a point to inspect its unit configuration, area, and power.',
    'chart.hoverArray': 'Hover or tap a point to inspect its array configuration, area, and power.',
    'chart.noPoints': 'No {kind} points match these filters.',
    'chart.point': '{kind} · Precision: {precision} · Clock: {clock} MHz · K: {k} · Area: {area} µm² · Power: {power} mW',
    'metric.area': 'Area (µm²)', 'metric.power': 'Power (mW)', 'baseline.metric': 'Metric', 'baseline.filters': 'Comparison filters', 'baseline.chart': 'Baseline vs TensorForge',
    'baseline.name': 'Baseline', 'baseline.hint': 'Select a precision and metric. Hover or tap a bar to compare designs at the same K.', 'baseline.empty': 'No baseline data for this precision.',
    'baseline.detail': '{precision} · K: {k} · {design} · {metric}: {value}',
    'breakdown.view': 'Report', 'breakdown.dataset': 'Dataset', 'breakdown.chart': 'Area share',
    'breakdown.sm': 'SM top-level modules', 'breakdown.rolled': 'Aggregated components', 'breakdown.total': 'Total area',
    'breakdown.hint': 'Hover or tap a slice or legend to inspect the module area and percentage.',
    'breakdown.detail': '{series} · {label}: {area} µm² ({share}%)', 'footer.repo': 'Source repository',
  },
  zh: {
    'nav.reuse': '精度复用实验室', 'nav.query': '配置查询', 'nav.ppa': '面积与功耗', 'nav.baseline': '基准对比', 'nav.breakdown': '模块面积',
    'language.switch': 'English', 'language.label': '切换为英文',
    'page.index.title': 'TensorForge：多精度张量核心设计探索',
    'page.ppa.title': 'TensorForge 面积与功耗', 'page.baseline.title': 'TensorForge 基准对比', 'page.breakdown.title': 'TensorForge 模块面积占比',
    'hero.index': '选择数据格式和硬件参数，查看面积、功耗及数据来源。',
    'hero.ppa': '按数据格式和目标频率筛选，比较点积单元与阵列的面积、功耗。',
    'hero.baseline': '在相同数据格式和点积长度下，对比基准设计与 TensorForge。',
    'hero.breakdown': '查看 Ventus 综合报告中，各模块的面积占比。',
    'synthesis': '综合条件：', 'query.controls': '查询条件', 'query.run': '查询', 'query.results': '查询结果',
    'field.m': '阵列行数（M）', 'field.n': '阵列列数（N）', 'field.k': '点积长度（K）',
    'field.clock': '目标频率（MHz）', 'field.precision': '支持的数据格式', 'field.mx': 'MX 微缩放', 'field.nv': 'NV 格式支持',
    'field.norm': '规格化格式（Norm）', 'field.acc': '累加器格式（Acc）', 'field.out': '输出格式（Out）',
    'field.midmat': '中间累加位宽（bit）', 'field.prediction': '模型预测',
    'help.more': '说明：{label}',
    'help.m': '输出矩阵的行数。按单元推算阵列时，使用 M × N 个相同点积单元。',
    'help.n': '输出矩阵的列数。M × N 是阵列中的点积单元数量。',
    'help.k': '每个点积的乘积项数。乘法、加法各计一次操作，理论每周期操作数为 2 × M × N × K。',
    'help.clock': '硬件综合时设定的目标频率。仅列出已有数据，目标频率不代表已通过时序检查。',
    'help.precision': '选择单元需要支持的数据格式。组合名称表示同一个单元支持多种格式；FP4LUT 表示用查找表实现 FP4。',
    'help.mx': '选择是否支持 MX 微缩放。与 NV 分开设置，部分组合可能没有综合数据。',
    'help.nv': '选择是否支持 NV 格式。与 MX 分开设置，匹配原数据中的 NV 标记。',
    'help.norm': '点积求和后，规格化结果采用的格式。浮点路径使用 FP16 或 FP32；整数报告中的 4、8 分别标记 INT4、INT8 路径。',
    'help.acc': '将点积结果与累加值相加时使用的格式，如 FP32 或 INT32，可与输入格式不同。',
    'help.out': '结果输出时的数据格式。组合名称表示支持的多种输出格式。',
    'help.midmat': 'midMat 是乘积对齐后、送入加法树的有效数位宽（含符号位），影响截断和中间累加精度。加法树另有求和扩展位；最终累加器格式由 Acc 指定。0、-1 是数据中的配置标记，不按位数解读。',
    'help.prediction': '开启后，仅在阵列和单元都没有综合数据时，查找已有模型预测值。网页不会现场运行模型。',
    'help.source': '阵列综合结果：直接使用整个阵列的报告，单元值为总量除以 M × N。按综合单元推算：单元面积、功耗乘以 M × N。模型预测也按单元换算，后两者均为估算。',
    'help.ppa': 'PPA 指功耗、性能和面积。本页用散点图比较面积与功耗，按数据格式和目标频率筛选。',
    'help.breakdown': '扇区大小表示模块在所选报告中的面积占比，数据来自 Ventus 模块综合报告。',
    'option.enabled': '启用', 'option.disabled': '关闭', 'option.predicted': '允许使用预测值', 'option.measured': '仅用综合数据',
    'option.norm4': 'INT4 路径（代码 4）', 'option.norm8': 'INT8 路径（代码 8）', 'option.midmatMarker': '{value}（配置标记）', 'option.all': '全部',
    'result.status': '查询状态', 'result.source': '数据来源', 'result.tiles': '点积单元数',
    'result.unitArea': '单元面积', 'result.unitPower': '单元功耗', 'result.arrayArea': '阵列面积', 'result.arrayPower': '阵列功耗',
    'status.exact': '找到匹配的阵列综合结果', 'status.estimated': '找到可用于估算的数据',
    'status.notFound': '没有匹配的综合数据或预测值，请调整查询条件。',
    'source.measured_array': '阵列综合结果', 'source.derived_measured_unit': '按综合单元推算', 'source.predicted_unit': '模型预测',
    'formula.area': '阵列面积', 'formula.power': '阵列功耗', 'formula.none': '当前配置暂无数据。',
    'error.query': '无法显示查询结果', 'error.ppa': '无法显示面积与功耗', 'error.baseline': '无法显示基准对比', 'error.breakdown': '无法显示模块面积',
    'ppa.units': '点积单元', 'ppa.arrays': '点积阵列',
    'chart.hoverUnit': '指向或点击数据点，查看配置、面积与功耗。',
    'chart.hoverArray': '指向或点击数据点，查看配置、面积与功耗。',
    'chart.noPoints': '当前条件下没有{kind}数据。',
    'chart.point': '{kind} · 格式：{precision} · 频率：{clock} MHz · K：{k} · 面积：{area} µm² · 功耗：{power} mW',
    'metric.area': '面积（µm²）', 'metric.power': '功耗（mW）', 'baseline.metric': '对比指标', 'baseline.filters': '对比条件', 'baseline.chart': '基准设计与 TensorForge',
    'baseline.name': '基准', 'baseline.hint': '选择数据格式与指标，指向或点击柱形，比较相同 K 下的设计。', 'baseline.empty': '该数据格式暂无基准设计。',
    'baseline.detail': '{precision} · K：{k} · {design} · {metric}：{value}',
    'breakdown.view': '综合报告', 'breakdown.dataset': '数据集', 'breakdown.chart': '模块面积占比',
    'breakdown.sm': 'SM 顶层模块', 'breakdown.rolled': '按部件汇总', 'breakdown.total': '总面积',
    'breakdown.hint': '指向或点击扇区、图例，查看模块面积与占比。',
    'breakdown.detail': '{series} · {label}：{area} µm²（{share}%）', 'footer.repo': '源码仓库',
  },
};

const STORAGE_KEY = 'tensorforge.language';
let language = globalThis.navigator?.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
try {
  const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') language = saved;
} catch { /* Browser storage can be unavailable; retain the default language. */ }

export function getLanguage() { return language; }

export function t(key, values = {}) {
  const message = MESSAGES[language][key] ?? MESSAGES.en[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value);
}

export function precisionLabel(value) {
  const raw = String(value);
  const prefix = raw.match(/^(MXNV|MX|NV)/)?.[0] || '';
  const base = raw.slice(prefix.length);
  const modes = base.match(/TF32|BF16|FP16|FP8|FP6|FP4LUT|FP4|INT8|INT4/g);
  return modes && modes.join('') === base ? (prefix ? `${prefix} · ` : '') + modes.join(' / ') : value;
}

function applyTranslations() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = t(`page.${document.body.dataset.page}.title`);
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('.help-button').forEach((button) => {
    button.setAttribute('aria-label', t('help.more', { label: t(button.dataset.helpLabel) }));
  });
  document.getElementById('language-toggle')?.setAttribute('aria-label', t('language.label'));
}

export function setLanguage(next) {
  if (next !== 'en' && next !== 'zh') throw new Error(`Unsupported language: ${next}`);
  language = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, next); } catch { /* Preference is optional. */ }
  applyTranslations();
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('tensorforge:languagechange'));
}

function initializeUI() {
  applyTranslations();
  document.getElementById('language-toggle')?.addEventListener('click', () => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  });
  const currentPage = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
  document.querySelectorAll('.top-nav a').forEach((link) => {
    if (link.getAttribute('href').replace('./', '').replace(/\.html$/, '') === currentPage) {
      link.setAttribute('aria-current', 'page');
    }
  });
  document.querySelectorAll('.help').forEach((help) => {
    const position = () => {
      const button = help.querySelector('button');
      const tip = help.querySelector('.tooltip');
      const rect = button.getBoundingClientRect();
      const width = Math.min(320, innerWidth - 32);
      tip.style.width = `${width}px`;
      tip.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - width - 16))}px`;
      const height = tip.getBoundingClientRect().height;
      tip.style.top = `${rect.bottom + height + 8 < innerHeight
        ? rect.bottom + 8 : Math.max(16, rect.top - height - 8)}px`;
    };
    help.querySelector('button').addEventListener('click', () => {
      position();
      help.classList.remove('is-dismissed');
      help.classList.toggle('is-open');
    });
    for (const event of ['pointerenter', 'focusin']) {
      help.addEventListener(event, () => { position(); help.classList.remove('is-dismissed'); });
    }
    addEventListener('resize', position);
    addEventListener('scroll', position, { passive: true });
    help.addEventListener('focusout', () => help.classList.remove('is-open'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.help').forEach((help) => {
        help.classList.remove('is-open');
        help.classList.add('is-dismissed');
      });
    }
  });
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.help.is-open').forEach((help) => {
      if (!help.contains(event.target)) help.classList.remove('is-open');
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeUI, { once: true });
  else initializeUI();
}
