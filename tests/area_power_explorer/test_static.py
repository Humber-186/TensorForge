import copy
import csv
import json
import shutil
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import Mock, patch

from tensorforge_site_bundle.tools.area_power_explorer.build_db import build_database
from tensorforge_site_bundle.tools.area_power_explorer.export_static import (
    MODELS_DIR,
    DEFAULT_SITE_DIR,
    export_static_site,
)
from tensorforge_site_bundle.tools.area_power_explorer.query import ExplorerQueryEngine
from tensorforge_site_bundle.tools.area_power_explorer.server import (
    _api_baseline_data,
    _api_breakdown_data,
    _api_ppa_data,
    _db_options,
    WEB_ROOT,
)
from tensorforge_site_bundle.tools.area_power_explorer.main import main


DB_PATH = Path('tensorforge_site_bundle/artifacts/area_power_explorer/area_power.db')


def read_site_data(path):
    source = (path / 'explorer.mjs').read_text(encoding='utf-8')
    data = source.split('// BEGIN GENERATED DATA\nconst SITE_DATA = ', 1)[1]
    return json.loads(data.split(';\n// END GENERATED DATA', 1)[0])


def unpack(table):
    return [dict(zip(table['columns'], row)) for row in table['rows']]


def request_for(row, m=3, n=5):
    return dict(
        m=row.get('dim_m', m), n=row.get('dim_n', n), k=row['dim_k'],
        clk_mhz=row['clk_mhz'], precision_name=row['precision_name'],
        mx=bool(row['mx_flag']), nv=bool(row['nv_flag']),
        norm_kind=row['norm_kind'], acc_kind=row['acc_kind'],
        out_kind=row['out_kind'], midmat=row['midmat'], allow_predicted=True,
    )


class StaticExportTests(unittest.TestCase):
    def test_exports_leave_source_unchanged_and_reject_source_as_destination(self):
        source = (WEB_ROOT / 'explorer.mjs').read_bytes()
        self.assertIn(b'const SITE_DATA = null;', source)
        self.assertNotEqual(DEFAULT_SITE_DIR.resolve(), WEB_ROOT.resolve())
        with tempfile.TemporaryDirectory() as temp:
            out = export_static_site(Path(temp) / 'site')
            self.assertEqual((WEB_ROOT / 'explorer.mjs').read_bytes(), source)
            self.assertTrue((out / '.nojekyll').exists())
        with self.assertRaisesRegex(ValueError, 'source directory'):
            export_static_site(WEB_ROOT, db_path=DB_PATH)

    def test_preview_is_static_and_does_not_build_models(self):
        server = Mock()
        server.serve_forever.side_effect = KeyboardInterrupt
        with tempfile.TemporaryDirectory() as temp:
            with patch('tensorforge_site_bundle.tools.area_power_explorer.main.make_static_server', return_value=server) as factory:
                with patch('tensorforge_site_bundle.tools.area_power_explorer.main.run_build_only') as model_build:
                    self.assertEqual(main(['serve', '--out-dir', temp]), 0)
                    model_build.assert_not_called()
            self.assertTrue((Path(temp) / 'index.html').exists())
            factory.assert_called_once_with('127.0.0.1', 8000, Path(temp))
            server.server_close.assert_called_once()

    def test_integer_normalization_codes_are_available_for_integer_queries(self):
        options = _db_options(DB_PATH)
        self.assertIn('4', options['norm_kind'])
        self.assertIn('8', options['norm_kind'])
        self.assertIn('INT4', options['precision_name'])
        result = ExplorerQueryEngine(DB_PATH).query_array(
            m=8, n=4, k=16, clk_mhz=1410, precision_name='INT4', mx=False, nv=False,
            norm_kind='4', acc_kind='INT32', out_kind='INT32', midmat=0,
        )
        self.assertNotEqual(result['status'], 'not_found')

    @unittest.skipUnless(shutil.which('node'), 'Node.js is required for translation checks')
    def test_both_languages_cover_all_interface_and_tooltip_keys(self):
        script = """
            const { MESSAGES, setLanguage, t, precisionLabel } = await import(process.argv[1]);
            setLanguage('zh');
            console.log(JSON.stringify({
                en: Object.keys(MESSAGES.en).sort(), zh: Object.keys(MESSAGES.zh).sort(),
                norm4: t('option.norm4'), source: t('source.measured_array'),
                precision: precisionLabel('FP16BF16FP8FP6FP4'),
                scaled: precisionLabel('MXFP16BF16FP8FP6FP4'),
                original: precisionLabel('FP8FP62FP4'),
            }));
        """
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script, (WEB_ROOT / 'ui.mjs').resolve().as_uri()],
            text=True, capture_output=True, check=True, timeout=30,
        )
        messages = json.loads(result.stdout)
        self.assertEqual(messages['en'], messages['zh'])
        self.assertIn('INT4', messages['norm4'])
        self.assertEqual(messages['source'], '综合阵列数据')
        self.assertEqual(messages['precision'], 'FP16 / BF16 / FP8 / FP6 / FP4')
        self.assertEqual(messages['scaled'], 'MX · FP16 / BF16 / FP8 / FP6 / FP4')
        self.assertEqual(messages['original'], 'FP8FP62FP4')
        keys = set(messages['en'])

        class InterfaceParser(HTMLParser):
            def handle_starttag(self, tag, attributes):
                for name, value in attributes:
                    if name in ('data-i18n', 'data-help-label'):
                        self_outer.assertIn(value, keys)

        self_outer = self
        for path in WEB_ROOT.glob('*.html'):
            with self.subTest(page=path.name):
                InterfaceParser().feed(path.read_text())

    def test_export_is_self_contained_and_preserves_chart_data(self):
        with tempfile.TemporaryDirectory() as temp:
            out = export_static_site(Path(temp) / 'site')
            bundle = read_site_data(out)
            data = bundle['measurements']
            self.assertEqual(data['options'], _db_options(DB_PATH))
            chart_series = _api_ppa_data(DB_PATH)['series']
            for table, series in zip(('units', 'arrays'), chart_series):
                rows = unpack(data[table])
                self.assertEqual(len(rows), len(series['points']))
                for row, point in zip(rows, series['points']):
                    for field, value in point.items():
                        if field != 'entity':
                            self.assertEqual(row[field], value)
            self.assertEqual(bundle['baseline'], _api_baseline_data())
            self.assertEqual(bundle['breakdown'], _api_breakdown_data())
            self.assertEqual(len(bundle['predictions']['rows']), 560)
            self.assertFalse((out / 'data').exists())
            for page in out.glob('*.html'):
                html = page.read_text()
                self.assertNotIn('href="/', html)
                self.assertNotIn('src="/', html)
                self.assertIn('type="module"', html)
            for script in ('app.js', 'charts.js', 'explorer.mjs'):
                self.assertNotIn('/api/', (out / script).read_text())
                self.assertNotIn('fetch(', (out / script).read_text())

    def test_export_without_predictions_keeps_measurements_available(self):
        with tempfile.TemporaryDirectory() as temp:
            out = export_static_site(
                Path(temp) / 'site', db_path=DB_PATH, models_dir=Path(temp) / 'no-models',
            )
            bundle = read_site_data(out)
            self.assertEqual(bundle['predictions']['rows'], [])
            self.assertTrue(bundle['measurements']['units']['rows'])

    @unittest.skipUnless(shutil.which('node'), 'Node.js is required to verify embedded runtime data')
    def test_embedded_program_needs_no_data_downloads_and_can_be_rebuilt(self):
        with tempfile.TemporaryDirectory() as temp:
            out = export_static_site(Path(temp) / 'site', db_path=DB_PATH)
            first_build = (out / 'explorer.mjs').read_bytes()
            export_static_site(out, db_path=DB_PATH)
            self.assertEqual((out / 'explorer.mjs').read_bytes(), first_build)
            script = """
                globalThis.fetch = () => { throw new Error('Unexpected data download'); };
                const { loadExplorer, loadData, queryArray } = await import(process.argv[1]);
                const explorer = await loadExplorer();
                const sameExplorer = explorer === await loadExplorer();
                const result = await queryArray({
                    m:8, n:4, k:16, clk_mhz:1410, precision_name:'BF16',
                    mx:false, nv:false, norm_kind:'FP32', acc_kind:'FP32',
                    out_kind:'FP32', midmat:26, allow_predicted:true,
                });
                console.log(JSON.stringify({
                    units: explorer.units.length, arrays: explorer.arrays.length,
                    predictions: (await loadData('predictions')).rows.length,
                    baselines: (await loadData('baseline')).series[0].points.length,
                    breakdowns: (await loadData('breakdown')).series.length,
                    sameExplorer, resultType: result.result_type,
                }));
            """
            result = subprocess.run(
                ['node', '--input-type=module', '-e', script, (out / 'explorer.mjs').as_uri()],
                text=True, capture_output=True, check=True, timeout=30,
            )
            self.assertEqual(json.loads(result.stdout), dict(
                units=3620, arrays=700, predictions=560, baselines=43,
                breakdowns=2, sameExplorer=True, resultType='measured_array',
            ))

    @unittest.skipUnless(shutil.which('node'), 'Node.js is required for browser/Python parity checks')
    def test_browser_results_match_python_for_all_released_records_and_fallbacks(self):
        with tempfile.TemporaryDirectory() as temp:
            out = export_static_site(Path(temp) / 'site', db_path=DB_PATH)
            bundle = read_site_data(out)
            data = bundle['measurements']
            predictions = bundle['predictions']
            requests = [request_for(row) for row in unpack(data['units']) + unpack(data['arrays'])]
            # Frequency matching retains the Python engine's tolerance.
            nearby = {**requests[0], 'clk_mhz': requests[0]['clk_mhz'] + 0.0000005}
            missing = {**requests[0], 'precision_name': 'not-a-precision'}
            requests.extend([nearby, missing, {**missing, 'allow_predicted': False}])
            engine = ExplorerQueryEngine(DB_PATH)
            expected = [engine.query_array(**request) for request in requests]

            # Remove measurements to exercise prediction fallback, including MX
            # aliases, frequency tolerance, and explicitly disabling predictions.
            empty_data = copy.deepcopy(data)
            empty_data['units']['rows'] = []
            empty_data['arrays']['rows'] = []
            empty_db = build_database(Path(temp) / 'empty.db', source_paths=[])
            prediction_engine = ExplorerQueryEngine(empty_db)
            with (MODELS_DIR / 'dp_two_stage_predictions_reuse_by_clk.csv').open(
                encoding='utf-8-sig', newline='',
            ) as handle:
                prediction_engine._prediction_rows = list(csv.DictReader(handle))
            prediction_requests = [request_for(row) for row in unpack(predictions)]
            mx_request = next(request for request in prediction_requests if request['mx'])
            alias = {**mx_request, 'precision_name': mx_request['precision_name'].removeprefix('MX')}
            nearby_prediction = {**alias, 'clk_mhz': alias['clk_mhz'] + 0.0000005}
            prediction_requests.extend([alias, nearby_prediction, {**alias, 'allow_predicted': False}, missing])
            expected.extend(prediction_engine.query_array(**request) for request in prediction_requests)

            script = """
                const { ExplorerQueryEngine } = await import(process.argv[1]);
                let input = '';
                for await (const chunk of process.stdin) input += chunk;
                const { data, predictions, requests, emptyData, predictionRequests } = JSON.parse(input);
                const engine = new ExplorerQueryEngine(data, predictions);
                const fallback = new ExplorerQueryEngine(emptyData, predictions);
                const results = [
                    ...requests.map((request) => engine.queryArray(request)),
                    ...predictionRequests.map((request) => fallback.queryArray(request)),
                ];
                process.stdout.write(JSON.stringify(results));
            """
            result = subprocess.run(
                ['node', '--input-type=module', '-e', script, (out / 'explorer.mjs').as_uri()],
                input=json.dumps(dict(
                    data=data, predictions=predictions, requests=requests,
                    emptyData=empty_data, predictionRequests=prediction_requests,
                )), text=True, capture_output=True, check=True, timeout=30,
            )
            actual = json.loads(result.stdout)
            self.assertEqual(len(actual), len(expected))
            for browser, python in zip(actual, expected):
                for field in python:
                    if field in ('formula_area', 'formula_power'):
                        # JS and Python differ only at decimal rounding ties.
                        self.assertIn('×', browser[field])
                    elif isinstance(python[field], float):
                        self.assertAlmostEqual(browser[field], python[field], places=6)
                    else:
                        self.assertEqual(browser[field], python[field], (python['requested'], field))
            self.assertIn('measured_array', {row['result_type'] for row in actual})
            self.assertIn('derived_measured_unit', {row['result_type'] for row in actual})
            self.assertIn('predicted_unit', {row['result_type'] for row in actual})
            self.assertIn('not_found', {row['result_type'] for row in actual})


if __name__ == '__main__':
    unittest.main()
