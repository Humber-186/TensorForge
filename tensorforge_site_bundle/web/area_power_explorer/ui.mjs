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
    'field.midmat': 'Intermediate configuration (midMat)', 'field.prediction': 'Prediction fallback',
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
    'help.midmat': 'The original midMat parameter distinguishes intermediate arithmetic/datapath configurations. Its available values come from the released designs; it is separate from M, N, and K.',
    'help.prediction': 'Try the released offline prediction table only after both array and unit synthesis lookups fail. This does not run a model for arbitrary new configurations.',
    'help.source': 'Synthesized array: use the full array report; unit values are averages (array totals divided by M × N). Derived unit: multiply measured unit costs by M × N. Predicted unit: scale an offline model estimate. The latter two are array estimates.',
    'help.ppa': 'PPA means power, performance, and area. This page plots synthesized area versus total power; clock and precision are filters.',
    'help.breakdown': 'Each slice is a module’s share of the total area in the selected report. These reports describe Ventus modules, rather than a new tensor-core query.',
    'option.enabled': 'Enabled', 'option.disabled': 'Disabled', 'option.predicted': 'Allow offline predictions', 'option.measured': 'Use synthesis data only',
    'option.norm4': 'INT4 path (code 4)', 'option.norm8': 'INT8 path (code 8)', 'option.all': 'All',
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
    'nav.reuse': '精度复用实验室', 'nav.query': '配置查询', 'nav.ppa': 'PPA 探索', 'nav.baseline': '基线对比', 'nav.breakdown': '面积分解',
    'language.switch': 'English', 'language.label': '切换为英文',
    'page.index.title': 'TensorForge：多精度张量核心设计空间探索',
    'page.ppa.title': 'TensorForge PPA 探索', 'page.baseline.title': 'TensorForge 基线对比', 'page.breakdown.title': 'TensorForge 面积分解',
    'hero.index': '查询不同张量核心配置的综合面积与功耗，并在有数据时查看来源明确的估算结果。',
    'hero.ppa': '比较综合得到的点积单元和阵列，按精度与目标时钟筛选，观察面积和功耗的取舍。',
    'hero.baseline': '在相同精度与点积长度下，比较基线点积实现和 TensorForge 设计。',
    'hero.breakdown': '查看已发布的 Ventus 综合报告中，各模块的面积占比。',
    'synthesis': '综合条件：', 'query.controls': '配置选项', 'query.run': '查询配置', 'query.results': '查询结果',
    'field.m': '阵列行数（M）', 'field.n': '阵列列数（N）', 'field.k': '点积长度（K）',
    'field.clock': '目标时钟（MHz）', 'field.precision': '支持的精度', 'field.mx': 'MX 缩放', 'field.nv': 'NV 变体',
    'field.norm': '归一化（Norm）', 'field.acc': '累加器（Acc）', 'field.out': '输出格式（Out）',
    'field.midmat': '中间计算配置（midMat）', 'field.prediction': '预测回退',
    'help.more': '说明：{label}',
    'help.m': '输出矩阵的行数。阵列估算采用 M × N 个相同点积单元的面积与功耗。',
    'help.n': '输出矩阵的列数。与 M 一起决定阵列估算所用的单元数量。',
    'help.k': '每个点积参与运算的项数。乘法与加法各计一次操作，理论每周期操作数为 2 × M × N × K。',
    'help.clock': '硬件综合时设定的目标时钟，单位为 MHz。这里只提供已发布数据中的频率配置。',
    'help.precision': '组合名称表示该计算单元支持所列出的多种格式，并非只选择一个工作负载的精度。FP4LUT 表示查找表实现的 FP4 路径；查询保留原始配置标识。',
    'help.mx': '匹配数据中的 MX 微缩放标记（withMX / noMX）。MX 与 NV 分开控制，并非所有组合都有综合数据。',
    'help.nv': '匹配数据中独立的 NV 格式/缩放变体标记（withNV / noNV）。能否查到结果还取决于其他配置项。',
    'help.norm': '浮点路径的归一化或对齐格式。报告中的代码 4 和 8 分别标记 INT4、INT8 整数路径，选项中会注明其含义。',
    'help.acc': '用于累加乘积的累加器格式，例如 FP32 或 INT32；可以与输入精度不同。',
    'help.out': '综合报告中的输出格式配置。组合格式保留源数据标识，与输入精度和累加器格式分别选择。',
    'help.midmat': '沿用设计中的 midMat 参数，用于区分中间运算和数据路径配置。可选值来自已发布的设计，与阵列规模 M、N、K 分开匹配。',
    'help.prediction': '只有阵列和单元综合数据都没有匹配记录时，才尝试已发布的离线预测表。不会为任意新配置现场运行模型。',
    'help.source': '综合阵列：使用整个阵列的报告，单元数值是总量除以 M × N 的平均值。综合单元推导：单元面积和功耗乘以 M × N。模型预测：对离线单元预测值作相同换算。后两种属于阵列估算。',
    'help.ppa': 'PPA 指功耗（Power）、性能（Performance）和面积（Area）。本页展示综合面积与总功耗的关系，时钟和精度用于筛选。',
    'help.breakdown': '每个扇区表示模块在所选报告总面积中的占比。这里使用 Ventus 模块报告，并非重新查询一个张量核心配置。',
    'option.enabled': '启用', 'option.disabled': '关闭', 'option.predicted': '允许离线预测', 'option.measured': '仅用综合数据',
    'option.norm4': 'INT4 路径（代码 4）', 'option.norm8': 'INT8 路径（代码 8）', 'option.all': '全部',
    'result.status': '查询状态', 'result.source': '结果来源', 'result.tiles': '单元数量',
    'result.unitArea': '单元面积', 'result.unitPower': '单元功耗', 'result.arrayArea': '阵列面积', 'result.arrayPower': '阵列功耗',
    'status.exact': '找到匹配的综合阵列', 'status.estimated': '可提供阵列估算结果',
    'status.notFound': '当前组合没有匹配的综合数据或离线预测值，请尝试其他配置。',
    'source.measured_array': '综合阵列数据', 'source.derived_measured_unit': '由综合单元推导', 'source.predicted_unit': '离线模型预测',
    'formula.area': '阵列面积', 'formula.power': '阵列功耗', 'formula.none': '此配置暂无可用结果。',
    'error.query': '无法显示查询结果', 'error.ppa': '无法显示 PPA 数据', 'error.baseline': '无法显示基线数据', 'error.breakdown': '无法显示面积分解',
    'ppa.units': '点积单元', 'ppa.arrays': '综合阵列',
    'chart.hoverUnit': '悬停或轻触数据点，查看单元配置、面积和功耗。',
    'chart.hoverArray': '悬停或轻触数据点，查看阵列配置、面积和功耗。',
    'chart.noPoints': '没有符合当前筛选条件的{kind}数据点。',
    'chart.point': '{kind} · 精度：{precision} · 时钟：{clock} MHz · K：{k} · 面积：{area} µm² · 功耗：{power} mW',
    'metric.area': '面积（µm²）', 'metric.power': '功耗（mW）', 'baseline.metric': '对比指标', 'baseline.filters': '对比选项', 'baseline.chart': '基线与 TensorForge',
    'baseline.name': '基线', 'baseline.hint': '选择精度与指标，悬停或轻触柱状图，对比相同 K 下的设计。', 'baseline.empty': '该精度暂无基线数据。',
    'baseline.detail': '{precision} · K：{k} · {design} · {metric}：{value}',
    'breakdown.view': '报告选项', 'breakdown.dataset': '数据集', 'breakdown.chart': '面积占比',
    'breakdown.sm': 'SM 顶层模块', 'breakdown.rolled': '汇总组件', 'breakdown.total': '总面积',
    'breakdown.hint': '悬停或轻触扇区、图例，查看模块面积与占比。',
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
