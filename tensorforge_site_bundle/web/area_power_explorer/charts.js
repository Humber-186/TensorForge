import { loadData, loadExplorer } from './explorer.mjs';
import { formatNumber, precisionLabel, t } from './ui.mjs';

function setOptions(select, values, defaultValue, labeler = (v) => ({ value: String(v), label: v === 'all' ? t('option.all') : precisionLabel(v) })) {
  const normalized = values && values.length ? values : [defaultValue];
  const previous = select.value;
  select.replaceChildren(...normalized.map((value) => {
    const item = labeler(value);
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    return option;
  }));
  const available = normalized.map(String);
  select.value = available.includes(previous) ? previous
    : available.includes(String(defaultValue)) ? String(defaultValue) : available[0];
}

function svgClear(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function colorForIndex(index) {
  const palette = Array.from({ length: 8 }, (_, index) => `var(--chart-color-${index + 1})`);
  return palette[index % palette.length];
}

function chartSize(svg, height) {
  const width = Math.round(svg.clientWidth) || 960;
  const mobile = width < 600;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return { width, height, mobile };
}

function watchChartSize(svg, render) {
  let previousWidth = Math.round(svg.clientWidth);
  new ResizeObserver(() => {
    const width = Math.round(svg.clientWidth);
    if (width === previousWidth) return;
    previousWidth = width;
    render();
  }).observe(svg);
}

function inspectOnInteraction(element, describe) {
  element.addEventListener('mouseenter', describe);
  element.addEventListener('click', describe);
}

function initPPA() {
  const unitSvg = document.getElementById('ppa-unit-chart');
  const arraySvg = document.getElementById('ppa-array-chart');
  if (!unitSvg || !arraySvg) return;
  const unitDetail = document.getElementById('ppa-unit-detail');
  const arrayDetail = document.getElementById('ppa-array-detail');
  const unitClkSelect = document.getElementById('ppa-unit-clk');
  const unitPrecisionSelect = document.getElementById('ppa-unit-precision');
  const arrayClkSelect = document.getElementById('ppa-array-clk');
  const arrayPrecisionSelect = document.getElementById('ppa-array-precision');

  loadExplorer().then((explorer) => {
    const hasPPA = (point) => point.area_um2 !== null && point.power_total_mw !== null;
    const unitPoints = explorer.units.filter(hasPPA);
    const arrayPoints = explorer.arrays.filter((point) => (
      hasPPA(point) && point.dim_m !== null && point.dim_n !== null
    ));

    const renderScatter = ({ svg, detail, points, clkSelect, precisionSelect, kind }) => {
      svgClear(svg);
      const selectedPoints = points.filter((point) => {
        const clkOk = clkSelect.value === 'all' || String(point.clk_mhz) === String(clkSelect.value);
        const precOk = precisionSelect.value === 'all' || point.precision_name === precisionSelect.value;
        return clkOk && precOk;
      });
      if (!selectedPoints.length) {
        detail.textContent = t('chart.noPoints', { kind: t(kind === 'array' ? 'ppa.arrays' : 'ppa.units') });
        return;
      }
      const selectedSet = new Set(selectedPoints);
      const backgroundPoints = points.filter((point) => !selectedSet.has(point));
      const { width, height } = chartSize(svg, svg.clientWidth < 600 ? 360 : 480);
      const margin = { left: 70, right: 30, top: 30, bottom: 50 };
      const maxX = Math.max(...points.map((p) => p.power_total_mw));
      const maxY = Math.max(...points.map((p) => p.area_um2));
      const x = (v) => margin.left + (v / maxX) * (width - margin.left - margin.right);
      const y = (v) => height - margin.bottom - (v / maxY) * (height - margin.top - margin.bottom);
      detail.textContent = t(kind === 'array' ? 'chart.hoverArray' : 'chart.hoverUnit');
      const describe = (point) => t('chart.point', {
        kind: t(kind === 'array' ? 'ppa.arrays' : 'ppa.units'), precision: precisionLabel(point.precision_name),
        clock: formatNumber(point.clk_mhz), k: point.dim_k,
        area: formatNumber(point.area_um2, 2), power: formatNumber(point.power_total_mw, 3),
      });
      svg.appendChild(svgEl('line', { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, stroke: 'var(--axis)' }));
      svg.appendChild(svgEl('line', { x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom, stroke: 'var(--axis)' }));
      const xLabel = svgEl('text', { x: width / 2, y: height - 10, 'text-anchor': 'middle', fill: 'var(--chart-text)', 'font-size': 13 });
      xLabel.textContent = t('metric.power');
      svg.appendChild(xLabel);
      const yLabel = svgEl('text', { x: 18, y: height / 2, transform: `rotate(-90 18 ${height / 2})`, 'text-anchor': 'middle', fill: 'var(--chart-text)', 'font-size': 13 });
      yLabel.textContent = t('metric.area');
      svg.appendChild(yLabel);

      backgroundPoints.forEach((point) => {
        const circle = svgEl('circle', {
          cx: x(point.power_total_mw),
          cy: y(point.area_um2),
          r: kind === 'array' ? 5 : 3.5,
          fill: kind === 'array' ? 'var(--predicted)' : 'var(--measured)',
          opacity: 0.15,
        });
        inspectOnInteraction(circle, () => {
          detail.textContent = describe(point);
        });
        svg.appendChild(circle);
      });

      selectedPoints.forEach((point) => {
        const circle = svgEl('circle', {
          cx: x(point.power_total_mw),
          cy: y(point.area_um2),
          r: kind === 'array' ? 7 : 5,
          fill: kind === 'array' ? 'var(--predicted)' : 'var(--measured)',
          opacity: 0.95,
          stroke: 'var(--point-stroke)',
          'stroke-width': 1.5,
        });
        inspectOnInteraction(circle, () => {
          detail.textContent = describe(point);
        });
        svg.appendChild(circle);
      });
    };

    const unitClocks = ['all', ...Array.from(new Set(unitPoints.map((p) => p.clk_mhz))).sort((a, b) => a - b)];
    const unitPrecisions = ['all', ...Array.from(new Set(unitPoints.map((p) => p.precision_name))).sort()];
    const arrayClocks = ['all', ...Array.from(new Set(arrayPoints.map((p) => p.clk_mhz))).sort((a, b) => a - b)];
    const arrayPrecisions = ['all', ...Array.from(new Set(arrayPoints.map((p) => p.precision_name))).sort()];
    setOptions(unitClkSelect, unitClocks, 'all');
    setOptions(unitPrecisionSelect, unitPrecisions, 'all');
    setOptions(arrayClkSelect, arrayClocks, 'all');
    setOptions(arrayPrecisionSelect, arrayPrecisions, 'all');

    const renderUnit = () => renderScatter({
      svg: unitSvg,
      detail: unitDetail,
      points: unitPoints,
      clkSelect: unitClkSelect,
      precisionSelect: unitPrecisionSelect,
      kind: 'dp_unit',
    });
    const renderArray = () => renderScatter({
      svg: arraySvg,
      detail: arrayDetail,
      points: arrayPoints,
      clkSelect: arrayClkSelect,
      precisionSelect: arrayPrecisionSelect,
      kind: 'array',
    });

    unitClkSelect.addEventListener('change', renderUnit);
    unitPrecisionSelect.addEventListener('change', renderUnit);
    arrayClkSelect.addEventListener('change', renderArray);
    arrayPrecisionSelect.addEventListener('change', renderArray);
    document.addEventListener('tensorforge:languagechange', () => {
      setOptions(unitClkSelect, unitClocks, 'all');
      setOptions(unitPrecisionSelect, unitPrecisions, 'all');
      setOptions(arrayClkSelect, arrayClocks, 'all');
      setOptions(arrayPrecisionSelect, arrayPrecisions, 'all');
      renderUnit();
      renderArray();
    });
    renderUnit();
    renderArray();
    watchChartSize(unitSvg, renderUnit);
    watchChartSize(arraySvg, renderArray);
  }).catch((error) => {
    unitDetail.textContent = `${t('error.ppa')}: ${error.message}`;
    arrayDetail.textContent = `${t('error.ppa')}: ${error.message}`;
  });
}

function initBaseline() {
  const svg = document.getElementById('baseline-chart');
  if (!svg) return;
  const detail = document.getElementById('baseline-detail');
  const precisionSelect = document.getElementById('baseline-precision');
  const metricSelect = document.getElementById('baseline-metric');

  loadData('baseline').then((payload) => {
    const points = payload.series[0].points;
    const precisions = Array.from(new Set(points.map((p) => p.precision_name))).sort();
    setOptions(precisionSelect, precisions, precisions[0], (value) => ({ value: String(value), label: String(value) }));

    const render = () => {
      svgClear(svg);
      const precision = precisionSelect.value;
      const metric = metricSelect.value;
      const filtered = points.filter((p) => p.precision_name === precision);
      if (!filtered.length) {
        detail.textContent = t('baseline.empty');
        return;
      }
      const { width, height, mobile } = chartSize(svg, svg.clientWidth < 600 ? 360 : 480);
      detail.textContent = t('baseline.hint');
      const margin = mobile ? { left: 12, right: 12, top: 24, bottom: 48 }
        : { left: 70, right: 30, top: 30, bottom: 60 };
      const ks = Array.from(new Set(filtered.map((p) => p.dim_k))).sort((a, b) => a - b);
      const grouped = ks.map((k) => ({
        k,
        baseline: filtered.find((p) => p.dim_k === k && p.design_name.includes('baseline')),
        wrapper: filtered.find((p) => p.dim_k === k && p.design_name.includes('Wrapper')),
      }));
      const maxY = Math.max(...grouped.flatMap((g) => [g.baseline?.[metric] || 0, g.wrapper?.[metric] || 0]));
      const band = (width - margin.left - margin.right) / grouped.length;
      const scaleY = (v) => height - margin.bottom - (v / maxY) * (height - margin.top - margin.bottom);
      const gap = mobile ? 4 : 10;
      grouped.forEach((g, index) => {
        const x0 = margin.left + index * band + gap;
        const bars = [
          { label: t('baseline.name'), value: g.baseline?.[metric] || 0, color: 'var(--axis)' },
          { label: 'TensorForge', value: g.wrapper?.[metric] || 0, color: 'var(--measured)' },
        ];
        bars.forEach((bar, barIndex) => {
          const barWidth = (band - 3 * gap) / 2;
          const x = x0 + barIndex * (barWidth + gap);
          const yVal = scaleY(bar.value);
          const rect = svgEl('rect', {
            x,
            y: yVal,
            width: barWidth,
            height: height - margin.bottom - yVal,
            fill: bar.color,
            rx: 4,
          });
          inspectOnInteraction(rect, () => {
            detail.textContent = t('baseline.detail', {
              precision, k: g.k, design: bar.label,
              metric: t(metric === 'area_um2' ? 'metric.area' : 'metric.power'), value: formatNumber(bar.value, 3),
            });
          });
          svg.appendChild(rect);
        });
        const text = svgEl('text', { x: margin.left + (index + 0.5) * band, y: height - (mobile ? 36 : 20), 'text-anchor': 'middle', fill: 'var(--chart-text)', 'font-size': 12 });
        text.textContent = mobile ? String(g.k) : `K=${g.k}`;
        svg.appendChild(text);
      });
      if (mobile) {
        const label = svgEl('text', { x: width / 2, y: height - 10, 'text-anchor': 'middle', fill: 'var(--chart-text)', 'font-size': 13 });
        label.textContent = t('field.k');
        svg.appendChild(label);
      }
    };

    precisionSelect.addEventListener('change', render);
    metricSelect.addEventListener('change', render);
    document.addEventListener('tensorforge:languagechange', render);
    render();
    watchChartSize(svg, render);
  }).catch((error) => {
    detail.textContent = `${t('error.baseline')}: ${error.message}`;
  });
}

function donutPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const sx = cx + rOuter * Math.cos(startAngle);
  const sy = cy + rOuter * Math.sin(startAngle);
  const ex = cx + rOuter * Math.cos(endAngle);
  const ey = cy + rOuter * Math.sin(endAngle);
  const isx = cx + rInner * Math.cos(endAngle);
  const isy = cy + rInner * Math.sin(endAngle);
  const iex = cx + rInner * Math.cos(startAngle);
  const iey = cy + rInner * Math.sin(startAngle);
  return [
    `M ${sx} ${sy}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${ex} ${ey}`,
    `L ${isx} ${isy}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${iex} ${iey}`,
    'Z',
  ].join(' ');
}

function initBreakdown() {
  const svg = document.getElementById('breakdown-chart');
  if (!svg) return;
  const detail = document.getElementById('breakdown-detail');
  const seriesSelect = document.getElementById('breakdown-series');

  loadData('breakdown').then((payload) => {
    const seriesLabel = (series) => t(series.name === 'SM Top Area Breakdown' ? 'breakdown.sm' : 'breakdown.rolled');
    const refreshOptions = () => setOptions(seriesSelect, payload.series.map((series, index) => index), 0,
      (value) => ({ value: String(value), label: seriesLabel(payload.series[value]) }));
    refreshOptions();
    const render = () => {
      svgClear(svg);
      const series = payload.series[Number(seriesSelect.value)];
      const points = series.points;
      detail.textContent = t('breakdown.hint');
      const total = points.reduce((sum, point) => sum + point.value, 0);
      let angle = -Math.PI / 2;
      const width = Math.round(svg.clientWidth) || 960;
      const mobile = width < 600;
      const rOuter = Math.min(170, mobile ? (width - 40) / 2 : width * 0.22);
      const rInner = rOuter * 0.53;
      const cx = mobile ? width / 2 : width * 0.3;
      const cy = mobile ? rOuter + 30 : 250;
      const legendX = mobile ? 24 : Math.round(width * 0.58);
      const legendY = mobile ? cy + rOuter + 40 : 30;
      chartSize(svg, mobile ? legendY + points.length * 24 + 20 : 520);
      points.forEach((point, index) => {
        const slice = (point.value / total) * Math.PI * 2;
        const path = svgEl('path', {
          d: donutPath(cx, cy, rOuter, rInner, angle, angle + slice),
          fill: colorForIndex(index),
          stroke: 'var(--panel)',
          'stroke-width': 2,
        });
        const describe = () => {
          const share = (point.value / total) * 100;
          detail.textContent = t('breakdown.detail', { series: seriesLabel(series), label: point.label,
            area: formatNumber(point.value, 2), share: formatNumber(share, 2) });
        };
        inspectOnInteraction(path, describe);
        svg.appendChild(path);
        const swatch = svgEl('rect', { x: legendX, y: legendY + index * 24, width: 10, height: 10, fill: colorForIndex(index), rx: 2 });
        inspectOnInteraction(swatch, describe);
        svg.appendChild(swatch);
        const legend = svgEl('text', { x: legendX + 20, y: legendY + 10 + index * 24, fill: 'var(--chart-text)', 'font-size': 13 });
        inspectOnInteraction(legend, describe);
        legend.textContent = `${point.label} (${((point.value / total) * 100).toFixed(1)}%)`;
        svg.appendChild(legend);
        angle += slice;
      });
      const centerText = svgEl('text', { x: cx, y: cy - 12, 'text-anchor': 'middle', fill: 'var(--chart-text)', 'font-size': 18, 'font-weight': '700' });
      const heading = svgEl('tspan', { x: cx });
      heading.textContent = t('breakdown.total');
      const value = svgEl('tspan', { x: cx, dy: 30 });
      value.textContent = `${formatNumber(total / 1_000_000, 2)} mm²`;
      centerText.append(heading, value);
      svg.appendChild(centerText);
    };
    seriesSelect.addEventListener('change', render);
    document.addEventListener('tensorforge:languagechange', () => { refreshOptions(); render(); });
    render();
    watchChartSize(svg, render);
  }).catch((error) => {
    detail.textContent = `${t('error.breakdown')}: ${error.message}`;
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initPPA();
  initBaseline();
  initBreakdown();
});
