import unittest

from tensorforge_site_bundle.tools.area_power_explorer.normalize import normalize_record


class NormalizeRecordTests(unittest.TestCase):
    def test_precision_is_parsed_from_precision_set_without_path_prefix(self):
        row = {
            'precision_set': 'BF16_dimK16_noMX_normFP32_accFP32_outFP32_midMat26_m8_n4',
            'design_name': 'InnerProductArray',
            'report_dir': 'reports/DC_log_BF16_dimK16_noMX_normFP32_accFP32_outFP32_midMat26_m8_n4/report',
            'clk_mhz': '1410',
        }

        result = normalize_record(row, 'area_power_measurements.csv')

        self.assertEqual(result['precision_name'], 'BF16')

    def test_precision_bundle_with_multiple_precisions_is_not_unknown(self):
        row = {
            'precision_set': 'MXFP16BF16FP8FP6FP4INT8INT4_dimK256_withMX_normFP32_accFP32_outFP32_midMat26_m1_n1',
            'design_name': 'InnerProductArray',
            'report_dir': 'reports/DC_log_MXFP16BF16FP8FP6FP4INT8INT4_dimK256_withMX_normFP32_accFP32_outFP32_midMat26_m1_n1/report',
            'clk_mhz': '1410',
        }

        result = normalize_record(row, 'area_power_measurements.csv')

        self.assertEqual(result['precision_name'], 'MXFP16BF16FP8FP6FP4INT8INT4')

    def test_precision_is_parsed_from_variant_segment_not_parent_clock_directory(self):
        row = {
            'variant': '1410MHz/BF16_dimK2_noMX_normFP32_accFP32_outFP32_midMat26',
            'report_dir': '1410MHz/DC_log_BF16_dimK2_noMX_normFP32_accFP32_outFP32_midMat26/report',
            'precision_set': '1410MHz',
            'prec': 'BF16',
            'design_name': 'DotProductWrapper',
            'clk_mhz': '1410',
        }

        result = normalize_record(row, 'baseline_comparison.csv')

        self.assertEqual(result['precision_name'], 'BF16')
