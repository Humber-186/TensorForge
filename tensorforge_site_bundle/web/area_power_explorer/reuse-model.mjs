const STRATEGY_COUNT = 18;

function measuredGroup({group, k, clock, units}) {
  const dimK = k * group.k_multiplier;
  const measurement = units.get(`${group.precision_name}:${dimK}:${clock}`);
  const base = {...group, dim_k: dimK, available: measurement !== undefined};
  if (!measurement) {
    return {...base, area_um2: null, unit_area_um2: null, power_mw: null,
      unit_power_mw: null, variant: null, source_row: null, source: null};
  }
  return {...base, ...measurement,
    area_um2: measurement.unit_area_um2 * group.instances,
    power_mw: measurement.unit_power_mw * group.instances};
}

function composePoint({strategy, k, clock, units}) {
  const groups = strategy.groups.map(group => measuredGroup({group, k, clock, units}));
  const available = groups.every(group => group.available);
  const area = available ? groups.reduce((sum, group) => sum + group.area_um2, 0) : null;
  const power = available ? groups.reduce((sum, group) => sum + group.power_mw, 0) : null;
  const unitCount = groups.reduce((sum, group) => sum + group.instances, 0);
  return {strategy_id: strategy.id, k, clk_mhz: clock, available,
    result_type: available ? 'derived_measured_components' : 'missing_measurement',
    area_um2: area, power_sum_mw: power,
    paper_mean_unit_power_mw: available ? power / unitCount : null, unit_count: unitCount, groups};
}

export function buildReusePoints(catalog) {
  if (catalog?.schema_version !== 1 || catalog.strategies?.length !== STRATEGY_COUNT || !Array.isArray(catalog.units)) {
    throw new Error('复用数据格式错误，请重新构建站点');
  }
  const units = new Map(catalog.units.map(unit => [`${unit.precision_name}:${unit.dim_k}:${unit.clk_mhz}`, unit]));
  return catalog.strategies.flatMap(strategy => catalog.ks.flatMap(k =>
    catalog.clocks_mhz.map(clock => composePoint({strategy, k, clock, units}))));
}

export function evaluateStrategy({strategy, point, formats}) {
  const groups = point.groups.map(group => ({...group,
    retained: group.formats.some(format => formats.includes(format))}));
  const active = groups.filter(group => group.retained);
  const covered = new Set(active.flatMap(group => group.formats));
  const available = active.length > 0 && active.every(group => group.available && Number.isFinite(group.area_um2)) &&
    formats.every(format => covered.has(format));
  return {...strategy, point, groups, active, available,
    area: available ? active.reduce((sum, group) => sum + group.area_um2, 0) : null};
}
