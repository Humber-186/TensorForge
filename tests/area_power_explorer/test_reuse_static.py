"""Static browser calculations agree with exact CSV constituent measurements."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from tensorforge_site_bundle.tools.area_power_explorer.export_static import export_static_site
from tensorforge_site_bundle.tools.area_power_explorer.reuse import load_reuse_data


class ReuseStaticTests(unittest.TestCase):
    def test_browser_compositions_and_format_pruning_match_csv_without_api(self):
        reference = load_reuse_data()
        with tempfile.TemporaryDirectory() as directory:
            site = export_static_site(Path(directory))
            source = (site / 'reuse-data.mjs').read_text()
            self.assertNotIn('"points":', source)
            self.assertIn('clock_gated_area_power_measurements.csv', source)
            for name in ('reuse.html', 'reuse.js', 'reuse.css', 'reuse-model.mjs'):
                self.assertTrue((site / name).is_file())
            html = (site / 'reuse.html').read_text()
            self.assertNotIn('href="/', html)
            self.assertNotIn('src="/', html)
            script = """
                globalThis.fetch = () => { throw new Error('Unexpected API/data download'); };
                const {REUSE_DATA} = await import(process.argv[1]);
                const {buildReusePoints, evaluateStrategy} = await import(process.argv[2]);
                const points = buildReusePoints(REUSE_DATA);
                const subsetAreas = REUSE_DATA.strategies.flatMap(strategy => {
                    const point = points.find(p => p.strategy_id === strategy.id && p.k === 32 && p.clk_mhz === 1410);
                    return Array.from({length: 127}, (_, index) => {
                        const mask = index + 1;
                        const formats = REUSE_DATA.formats.filter((_, bit) => mask & (1 << bit));
                        const result = evaluateStrategy({strategy, point, formats});
                        return {strategy: strategy.id, mask, area: result.area};
                    });
                });
                const incomplete = {...REUSE_DATA, units: REUSE_DATA.units.filter(unit =>
                    !(unit.precision_name === 'FP16' && unit.dim_k === 32 && unit.clk_mhz === 1410))};
                const missing = buildReusePoints(incomplete).find(p => p.strategy_id === 's14' && p.k === 32 && p.clk_mhz === 1410);
                console.log(JSON.stringify({
                    areas: points.map(p => p.area_um2), powers: points.map(p => p.power_sum_mw),
                    rows: points.map(p => p.groups.map(g => g.source_row)), subsetAreas,
                    missing: {available: missing.available, area: missing.area_um2},
                }));
            """
            result = subprocess.run(
                ['node', '--input-type=module', '-e', script,
                 (site / 'reuse-data.mjs').as_uri(), (site / 'reuse-model.mjs').as_uri()],
                capture_output=True, text=True, check=True, timeout=30,
            )
        browser = json.loads(result.stdout)
        for index, point in enumerate(reference['points']):
            self.assertAlmostEqual(browser['areas'][index], point['area_um2'], places=7)
            self.assertAlmostEqual(browser['powers'][index], point['power_sum_mw'], places=7)
        self.assertEqual(browser['rows'], [[group['source_row'] for group in point['groups']]
                                         for point in reference['points']])
        defaults = {point['strategy_id']: point for point in reference['points']
                    if point['k'] == 32 and point['clk_mhz'] == 1410}
        for result in browser['subsetAreas']:
            formats = {fmt for bit, fmt in enumerate(reference['formats']) if result['mask'] & (1 << bit)}
            expected = sum(group['area_um2'] for group in defaults[result['strategy']]['groups']
                           if formats.intersection(group['formats']))
            self.assertAlmostEqual(result['area'], expected)
        self.assertEqual(browser['missing'], {'available': False, 'area': None})
