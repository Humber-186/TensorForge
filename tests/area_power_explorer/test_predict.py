import csv
import tempfile
import unittest
from pathlib import Path

from tensorforge_site_bundle.tools.area_power_explorer.predict import (
    CLOCK_GATED_CSV,
    DP_CSV,
    _validate_training_data,
)


class PredictionDataTests(unittest.TestCase):
    def test_stale_training_measurement_is_rejected(self):
        fieldnames = ['variant', 'design_name', 'clk_mhz', 'area_value']
        measurement = dict(
            zip(fieldnames, ['variant-a', 'DotProductWrapper', '1410.0', '10.0'])
        )
        stale_training = {**measurement, 'area_value': '11.0'}
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            training_path = root / 'training.csv'
            measurement_path = root / 'measurements.csv'
            for path, row in (
                (training_path, stale_training),
                (measurement_path, measurement),
            ):
                with path.open('w', encoding='utf-8', newline='') as handle:
                    writer = csv.DictWriter(handle, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerow(row)

            with self.assertRaisesRegex(ValueError, 'area_value'):
                _validate_training_data(training_path, measurement_path)

    def test_training_rows_match_clock_gated_measurements(self):
        _validate_training_data(DP_CSV, CLOCK_GATED_CSV)

    def test_prediction_targets_match_training_data(self):
        models_dir = Path(
            'tensorforge_site_bundle/artifacts/area_power_explorer/models'
        )
        prediction_paths = [
            models_dir / 'dp_predictions_by_clk.csv',
            models_dir / 'dp_two_stage_predictions_reuse_by_clk.csv',
        ]
        with DP_CSV.open(encoding='utf-8-sig', newline='') as handle:
            training_targets = {
                (row['variant'], row['design_name'], row['clk_mhz']): (
                    float(row['area_value']),
                    float(row['total_value']),
                )
                for row in csv.DictReader(handle)
            }

        for prediction_path in prediction_paths:
            with self.subTest(prediction_path=prediction_path):
                with prediction_path.open(
                    encoding='utf-8-sig', newline=''
                ) as handle:
                    prediction_targets = {
                        (row['variant'], row['design_name'], row['clk_mhz']): (
                            float(row['area_value']),
                            float(row['total_value']),
                        )
                        for row in csv.DictReader(handle)
                    }
                self.assertEqual(prediction_targets, training_targets)
