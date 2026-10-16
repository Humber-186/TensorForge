"""Evidence and coverage checks for the measured precision-reuse API."""

import csv
import json
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from tensorforge_site_bundle.tools.area_power_explorer.reuse import DEFAULT_CSV, load_reuse_data


class ReuseDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_reuse_data()
        with DEFAULT_CSV.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            cls.fieldnames = reader.fieldnames
            cls.rows = list(reader)

    @contextmanager
    def fixture_csv(self, rows, fieldnames=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "measurements.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames or self.fieldnames)
                writer.writeheader()
                writer.writerows(rows)
            yield path

    def point(self, strategy_id, k=32, clk_mhz=1410, data=None):
        return next(point for point in (data or self.data)["points"]
                    if (point["strategy_id"], point["k"], point["clk_mhz"]) == (strategy_id, k, clk_mhz))

    def test_all_18_templates_cover_the_same_seven_formats(self):
        strategies = self.data["strategies"]
        self.assertEqual([strategy["id"] for strategy in strategies], [f"s{i:02}" for i in range(1, 19)])
        formats = {"FP16", "BF16", "FP8", "FP6", "FP4", "INT8", "INT4"}
        for strategy in strategies:
            self.assertEqual(set(strategy["supported_formats"]), formats)
            self.assertEqual({fmt for group in strategy["groups"] for fmt in group["formats"]}, formats)
        self.assertEqual(strategies[0]["family"], "unified")
        self.assertEqual(len(strategies[0]["groups"]), 1)
        self.assertEqual(len(strategies[13]["groups"]), 7)
        self.assertEqual(len(strategies[17]["groups"]), 7)

    def test_every_operating_point_has_exact_constituent_measurements(self):
        expected = {(f"s{i:02}", k, clk) for i in range(1, 19)
                    for k in (2, 4, 8, 16, 32)
                    for clk in (1250, 1300, 1350, 1400, 1410, 1450, 1500)}
        actual = {(point["strategy_id"], point["k"], point["clk_mhz"]) for point in self.data["points"]}
        self.assertEqual(len(self.data["points"]), 630)
        self.assertEqual(actual, expected)
        source_keys = set()
        for point in self.data["points"]:
            self.assertTrue(point["available"])
            self.assertEqual(point["result_type"], "derived_measured_components")
            for group in point["groups"]:
                self.assertTrue(group["available"])
                self.assertEqual(group["dim_k"], point["k"] * group["k_multiplier"])
                source_keys.add((group["precision_name"], group["dim_k"], point["clk_mhz"]))
        self.assertEqual(len(source_keys), 525)

    def test_area_and_power_come_from_exact_provenance_rows(self):
        for point in self.data["points"]:
            source_areas = []
            source_powers = []
            for group in point["groups"]:
                row = self.rows[group["source_row"] - 2]
                self.assertEqual(row["variant"], group["variant"])
                self.assertEqual(row["precision_set"], group["precision_name"])
                self.assertEqual(int(row["dimK"]), group["dim_k"])
                self.assertEqual(int(row["clk_mhz"]), point["clk_mhz"])
                for knob in ("design_name", "mx", "norm_kind", "acc_kind", "out_kind", "midMat"):
                    self.assertEqual(row[knob], group["source"][knob])
                source_areas.append(float(row["area_value"]) * group["instances"])
                source_powers.append(float(row["total_value"]) * group["instances"])
            self.assertAlmostEqual(point["area_um2"], sum(source_areas))
            self.assertAlmostEqual(point["power_sum_mw"], sum(source_powers))
            self.assertAlmostEqual(point["paper_mean_unit_power_mw"], sum(source_powers) / point["unit_count"])

    def test_released_dataset_default_reference_areas(self):
        expected = {"s01": 53006.82818, "s03": 62612.78822, "s14": 134935.31830, "s18": 127414.89627}
        for strategy_id, area in expected.items():
            self.assertAlmostEqual(self.point(strategy_id)["area_um2"], area, places=5)
        saving = 1 - self.point("s01")["area_um2"] / self.point("s14")["area_um2"]
        self.assertAlmostEqual(saving, 1 - 53006.82818 / 134935.31830, places=12)

    def test_lut_implements_fp4_without_adding_a_format(self):
        arithmetic = self.data["strategies"][13]["groups"]
        lut = self.data["strategies"][17]["groups"]
        self.assertEqual([group["formats"] for group in arithmetic], [group["formats"] for group in lut])
        lut_group = next(group for group in lut if group["precision_name"] == "MXFP4LUT")
        self.assertEqual(lut_group["formats"], ["FP4"])
        self.assertEqual(lut_group["implementation"], "lookup_table")

    def test_original_templates_preserve_redundant_bf16_units(self):
        for index in (7, 12, 16):
            strategy = self.data["strategies"][index - 1]
            self.assertEqual(sum("BF16" in group["formats"] for group in strategy["groups"]), 2)
            self.assertIn("BF16+FP16BF16INT8INT4", strategy["name"])
            self.assertIn("BF16+FP16INT8INT4", strategy["original_paper_name"])
            self.assertTrue(strategy["notes"])

    def test_original_legend_order_is_preserved_separately_from_groups(self):
        for index, fp4_name in ((13, "MXFP4"), (17, "MXFP4LUT")):
            strategy = self.data["strategies"][index - 1]
            self.assertEqual(strategy["original_paper_name"],
                             f"FP16+BF16+MXFP8+MXFP6+{fp4_name}+INT8INT4")
            self.assertEqual(strategy["groups"][2]["precision_name"], "INT8INT4")

    def test_missing_measurement_has_null_totals_and_no_prediction(self):
        point = self.point("s01")
        removed_row = point["groups"][0]["source_row"] - 2
        with self.fixture_csv(self.rows[:removed_row] + self.rows[removed_row + 1:]) as path:
            data = load_reuse_data(path)
        missing = self.point("s01", data=data)
        self.assertFalse(missing["available"])
        self.assertEqual(missing["result_type"], "missing_measurement")
        for field in ("area_um2", "power_sum_mw", "paper_mean_unit_power_mw"):
            self.assertIsNone(missing[field])
        self.assertIsNone(missing["groups"][0]["area_um2"])
        self.assertTrue(self.point("s01", k=16, data=data)["available"])
        self.assertEqual(len(data["points"]), 630)

    def test_alternative_knobs_do_not_substitute_for_a_missing_exact_row(self):
        row_index = self.point("s01")["groups"][0]["source_row"] - 2
        rows = [dict(row) for row in self.rows]
        rows[row_index]["midMat"] = "99"
        with self.fixture_csv(rows) as path:
            self.assertFalse(self.point("s01", data=load_reuse_data(path))["available"])

    def test_duplicate_exact_measurement_fails_loudly(self):
        row_index = self.point("s01")["groups"][0]["source_row"] - 2
        with self.fixture_csv(self.rows + [self.rows[row_index]]) as path:
            with self.assertRaisesRegex(ValueError, "Duplicate canonical measurement"):
                load_reuse_data(path)

    def test_invalid_measurements_and_units_fail_loudly(self):
        row_index = self.point("s01")["groups"][0]["source_row"] - 2
        for field, value in (("area_value", "NaN"), ("area_value", "-1"), ("total_value", ""),
                             ("total_value", "inf"), ("dimK", "32.5"), ("total_unit", "W"), ("area_unit", "mm2")):
            with self.subTest(field=field, value=value):
                rows = [dict(row) for row in self.rows]
                rows[row_index][field] = value
                with self.fixture_csv(rows) as path:
                    with self.assertRaises(ValueError):
                        load_reuse_data(path)

    def test_missing_required_column_fails_loudly(self):
        with self.fixture_csv([], [field for field in self.fieldnames if field != "area_value"]) as path:
            with self.assertRaisesRegex(ValueError, "Missing CSV columns: area_value"):
                load_reuse_data(path)

    def test_payload_is_standard_json_without_nan(self):
        encoded = json.dumps(self.data, allow_nan=False)
        decoded = json.loads(encoded)
        self.assertEqual(decoded["meta"]["baseline_strategy_id"], "s14")
        self.assertIn("timing closure", " ".join(decoded["meta"]["caveats"]))


if __name__ == "__main__":
    unittest.main()
