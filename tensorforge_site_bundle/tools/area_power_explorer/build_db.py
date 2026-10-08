"""SQLite build helpers for the area/power explorer."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .ingest import load_canonical_rows

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = Path(__file__).with_name("schema.sql")
DEFAULT_SOURCES = [
    ROOT / "data" / "clock_gated_area_power_measurements.csv",
    ROOT / "data" / "baseline_comparison.csv",
]

_SOURCE_ROW_FIELDS = [
    "source_file",
    "design_name",
    "variant",
    "report_dir",
    "entity_type",
    "precision_name",
    "clk_mhz",
    "dim_k",
    "dim_m",
    "dim_n",
    "mx_flag",
    "nv_flag",
    "mx_raw",
    "norm_kind",
    "acc_kind",
    "out_kind",
    "midmat",
    "area_um2",
    "power_total_mw",
    "power_dynamic_mw",
    "power_leakage",
]

_DP_FIELDS = [
    "source_row_id",
    "source_file",
    "design_name",
    "precision_name",
    "clk_mhz",
    "dim_k",
    "mx_flag",
    "nv_flag",
    "norm_kind",
    "acc_kind",
    "out_kind",
    "midmat",
    "area_um2",
    "power_total_mw",
    "power_dynamic_mw",
    "power_leakage",
]

_ARRAY_FIELDS = [
    "source_row_id",
    "source_file",
    "design_name",
    "precision_name",
    "clk_mhz",
    "dim_k",
    "dim_m",
    "dim_n",
    "mx_flag",
    "nv_flag",
    "norm_kind",
    "acc_kind",
    "out_kind",
    "midmat",
    "area_um2",
    "power_total_mw",
    "power_dynamic_mw",
    "power_leakage",
]


def _bool_to_int(value):
    return None if value is None else int(bool(value))


def _row_values(row, field_names):
    values = []
    for field in field_names:
        value = row.get(field)
        if field in {"mx_flag", "nv_flag"}:
            value = _bool_to_int(value)
        values.append(value)
    return values


def build_database(
    db_path: Path,
    *,
    source_paths: list[Path] | None = None,
    source_root: Path | None = ROOT,
) -> Path:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    paths = DEFAULT_SOURCES if source_paths is None else source_paths
    rows = load_canonical_rows(paths, source_root=source_root)
    con = sqlite3.connect(db_path)
    try:
        con.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        con.execute("DELETE FROM source_rows")
        con.execute("DELETE FROM dp_units")
        con.execute("DELETE FROM array_measurements")
        con.execute("DELETE FROM model_runs")

        source_sql = (
            "INSERT INTO source_rows (" + ", ".join(_SOURCE_ROW_FIELDS) + ") VALUES (" + ", ".join("?" for _ in _SOURCE_ROW_FIELDS) + ")"
        )
        dp_sql = (
            "INSERT INTO dp_units (" + ", ".join(_DP_FIELDS) + ") VALUES (" + ", ".join("?" for _ in _DP_FIELDS) + ")"
        )
        array_sql = (
            "INSERT INTO array_measurements (" + ", ".join(_ARRAY_FIELDS) + ") VALUES (" + ", ".join("?" for _ in _ARRAY_FIELDS) + ")"
        )

        for row in rows:
            cur = con.execute(source_sql, _row_values(row, _SOURCE_ROW_FIELDS))
            source_row_id = cur.lastrowid
            row_with_id = dict(row)
            row_with_id["source_row_id"] = source_row_id
            if row["entity_type"] == "dp_unit":
                con.execute(dp_sql, _row_values(row_with_id, _DP_FIELDS))
            elif row["entity_type"] == "array":
                con.execute(array_sql, _row_values(row_with_id, _ARRAY_FIELDS))
        con.commit()
    finally:
        con.close()
    return db_path
