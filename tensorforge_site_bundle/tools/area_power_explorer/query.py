"""Query helpers for the area/power explorer."""

from __future__ import annotations

import csv
import sqlite3
import re
from pathlib import Path
from typing import Any


class ExplorerQueryEngine:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self._prediction_rows: list[dict[str, str]] | None = None

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        return con

    @staticmethod
    def _format_formula(label: str, m: int, n: int, unit_value: float, total_value: float, unit: str) -> str:
        return f"({label} = {m} × {n} × {unit_value:.6f} {unit} = {total_value:.6f} {unit})"

    @staticmethod
    def _mx_nv_from_token(token: str) -> tuple[bool, bool]:
        token = str(token or "").strip()
        mx_flag = token.startswith("withMX")
        nv_flag = token.endswith("withNV")
        return mx_flag, nv_flag

    @staticmethod
    def _base_precision_name(name: str) -> str:
        return re.sub(r"^(MXNV|MX|NV)", "", str(name or "").strip())

    def _candidate_precision_names(self, precision_name: str, mx: bool, nv: bool) -> list[str]:
        raw = str(precision_name or "").strip()
        base = self._base_precision_name(raw)
        prefix = "MXNV" if mx and nv else "MX" if mx else "NV" if nv else ""
        candidates: list[str] = []
        for value in (raw, f"{prefix}{base}" if prefix else base, base):
            if value and value not in candidates:
                candidates.append(value)
        return candidates

    def _prediction_csv_path(self) -> Path:
        return self.db_path.parent / "models" / "dp_two_stage_predictions_reuse_by_clk.csv"

    def _load_prediction_rows(self) -> list[dict[str, str]]:
        if self._prediction_rows is not None:
            return self._prediction_rows

        csv_path = self._prediction_csv_path()
        if not csv_path.exists():
            self._prediction_rows = []
            return self._prediction_rows

        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            self._prediction_rows = list(csv.DictReader(handle))
        return self._prediction_rows

    def _find_predicted_unit(self, *, k: int, clk_mhz: float, precision_name: str, mx: bool, nv: bool,
                             norm_kind: str, acc_kind: str, out_kind: str, midmat: int) -> dict[str, float] | None:
        candidates = set(self._candidate_precision_names(precision_name, mx, nv))
        for row in self._load_prediction_rows():
            row_precision = str(row.get("ps_name") or "").strip()
            row_k = int(float(row.get("dimK") or 0))
            row_clk = float(row.get("clk_mhz") or 0.0)
            row_mx, row_nv = self._mx_nv_from_token(str(row.get("mx") or ""))
            row_norm = str(row.get("norm_kind") or "").strip()
            row_acc = str(row.get("acc_kind") or "").strip()
            row_out = str(row.get("out_kind") or "").strip()
            row_midmat = int(float(row.get("midMat") or 0))

            if (
                row_precision in candidates
                and row_k == k
                and abs(row_clk - clk_mhz) < 1e-6
                and row_mx == mx
                and row_nv == nv
                and row_norm == norm_kind
                and row_acc == acc_kind
                and row_out == out_kind
                and row_midmat == midmat
            ):
                return {
                    "unit_area_um2": float(row["area_pred"]),
                    "unit_power_total_mw": float(row["power_pred"]),
                }
        return None

    def _find_measured_array(self, con: sqlite3.Connection, *, m: int, n: int, k: int, clk_mhz: float,
                             precision_name: str, mx: bool, nv: bool, norm_kind: str,
                             acc_kind: str, out_kind: str, midmat: int) -> sqlite3.Row | None:
        candidates = self._candidate_precision_names(precision_name, mx, nv)
        placeholders = ", ".join("?" for _ in candidates)
        return con.execute(
            """
            SELECT *
            FROM array_measurements
            WHERE precision_name IN (""" + placeholders + """)
              AND dim_m = ?
              AND dim_n = ?
              AND dim_k = ?
              AND ABS(clk_mhz - ?) < 1e-6
              AND mx_flag = ?
              AND nv_flag = ?
              AND norm_kind = ?
              AND acc_kind = ?
              AND out_kind = ?
              AND midmat = ?
            ORDER BY id
            LIMIT 1
            """,
            tuple(candidates) + (m, n, k, clk_mhz, int(mx), int(nv), norm_kind, acc_kind, out_kind, midmat),
        ).fetchone()

    def _find_measured_unit(self, con: sqlite3.Connection, *, k: int, clk_mhz: float,
                            precision_name: str, mx: bool, nv: bool, norm_kind: str,
                            acc_kind: str, out_kind: str, midmat: int) -> sqlite3.Row | None:
        candidates = self._candidate_precision_names(precision_name, mx, nv)
        placeholders = ", ".join("?" for _ in candidates)
        return con.execute(
            """
            SELECT *
            FROM dp_units
            WHERE precision_name IN (""" + placeholders + """)
              AND dim_k = ?
              AND ABS(clk_mhz - ?) < 1e-6
              AND mx_flag = ?
              AND nv_flag = ?
              AND norm_kind = ?
              AND acc_kind = ?
              AND out_kind = ?
              AND midmat = ?
            ORDER BY id
            LIMIT 1
            """,
            tuple(candidates) + (k, clk_mhz, int(mx), int(nv), norm_kind, acc_kind, out_kind, midmat),
        ).fetchone()

    def query_array(self, *, m: int, n: int, k: int, clk_mhz: float, precision_name: str,
                    mx: bool, nv: bool, norm_kind: str, acc_kind: str, out_kind: str,
                    midmat: int, allow_predicted: bool = True) -> dict[str, Any]:
        tile_count = m * n
        with self._connect() as con:
            row = self._find_measured_array(
                con,
                m=m,
                n=n,
                k=k,
                clk_mhz=clk_mhz,
                precision_name=precision_name,
                mx=mx,
                nv=nv,
                norm_kind=norm_kind,
                acc_kind=acc_kind,
                out_kind=out_kind,
                midmat=midmat,
            )
            if row is not None:
                array_area = float(row["area_um2"] or 0.0)
                array_power = float(row["power_total_mw"] or 0.0)
                unit_area = array_area / tile_count if tile_count else 0.0
                unit_power = array_power / tile_count if tile_count else 0.0
                result_type = "measured_array"
            else:
                unit = self._find_measured_unit(
                    con,
                    k=k,
                    clk_mhz=clk_mhz,
                    precision_name=precision_name,
                    mx=mx,
                    nv=nv,
                    norm_kind=norm_kind,
                    acc_kind=acc_kind,
                    out_kind=out_kind,
                    midmat=midmat,
                )
                if unit is None:
                    if allow_predicted:
                        predicted = self._find_predicted_unit(
                            k=k,
                            clk_mhz=clk_mhz,
                            precision_name=precision_name,
                            mx=mx,
                            nv=nv,
                            norm_kind=norm_kind,
                            acc_kind=acc_kind,
                            out_kind=out_kind,
                            midmat=midmat,
                        )
                        if predicted is None:
                            raise LookupError("No predicted data found")
                        unit_area = float(predicted["unit_area_um2"])
                        unit_power = float(predicted["unit_power_total_mw"])
                        array_area = tile_count * unit_area
                        array_power = tile_count * unit_power
                        result_type = "predicted_unit"
                    else:
                        raise LookupError("No measured data found")
                else:
                    unit_area = float(unit["area_um2"] or 0.0)
                    unit_power = float(unit["power_total_mw"] or 0.0)
                    array_area = tile_count * unit_area
                    array_power = tile_count * unit_power
                    result_type = "derived_measured_unit"

        ops_per_cycle = 2 * m * n * k
        throughput_ops_per_sec = ops_per_cycle * clk_mhz * 1_000_000.0
        return {
            "result_type": result_type,
            "tile_count": tile_count,
            "actual_k": k,
            "unit_area_um2": unit_area,
            "unit_power_total_mw": unit_power,
            "array_area_um2": array_area,
            "array_power_total_mw": array_power,
            "macs_per_cycle": m * n * k,
            "ops_per_cycle": ops_per_cycle,
            "throughput_ops_per_sec": throughput_ops_per_sec,
            "formula_area": self._format_formula("Array Area", m, n, unit_area, array_area, "um²"),
            "formula_power": self._format_formula("Array Power", m, n, unit_power, array_power, "mW"),
        }
