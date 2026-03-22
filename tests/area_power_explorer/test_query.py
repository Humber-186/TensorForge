import unittest
from pathlib import Path

from tensorforge_site_bundle.tools.area_power_explorer.query import ExplorerQueryEngine


DB_PATH = Path('tensorforge_site_bundle/artifacts/area_power_explorer/area_power.db')


class QueryEngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = ExplorerQueryEngine(DB_PATH)

    def test_missing_exact_match_returns_estimate_when_available(self):
        result = self.engine.query_array(
            m=3,
            n=5,
            k=16,
            clk_mhz=1410.0,
            precision_name='BF16',
            mx=False,
            nv=False,
            norm_kind='FP32',
            acc_kind='FP32',
            out_kind='FP32',
            midmat=26,
            allow_predicted=True,
        )

        self.assertFalse(result['exact_match_found'])
        self.assertTrue(result['estimate_available'])
        self.assertEqual(result['status'], 'estimated_only')
        self.assertIn(result['result_type'], {'derived_measured_unit', 'predicted_unit'})

    def test_missing_exact_and_missing_estimate_returns_structured_not_found(self):
        result = self.engine.query_array(
            m=8,
            n=4,
            k=16,
            clk_mhz=1410.0,
            precision_name='BF16',
            mx=True,
            nv=False,
            norm_kind='FP16',
            acc_kind='INT32',
            out_kind='INT32',
            midmat=0,
            allow_predicted=True,
        )

        self.assertFalse(result['exact_match_found'])
        self.assertFalse(result['estimate_available'])
        self.assertEqual(result['status'], 'not_found')
        self.assertEqual(result['result_type'], 'not_found')
