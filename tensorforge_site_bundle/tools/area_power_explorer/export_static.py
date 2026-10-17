"""Export a self-contained static site; Python is only needed at build time."""

from __future__ import annotations

import csv
import json
import shutil
import sqlite3
import tempfile
from pathlib import Path

from .build_db import build_database
from .reuse import load_reuse_catalog
from .server import WEB_ROOT, _api_baseline_data, _api_breakdown_data, _db_counts, _db_options

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "artifacts" / "area_power_explorer" / "models"
DEFAULT_SITE_DIR = ROOT / "artifacts" / "area_power_explorer" / "site"
UNIT_COLUMNS = [
    "precision_name", "clk_mhz", "dim_k", "mx_flag", "nv_flag",
    "norm_kind", "acc_kind", "out_kind", "midmat", "area_um2", "power_total_mw",
]
ARRAY_COLUMNS = UNIT_COLUMNS + ["dim_m", "dim_n"]
SITE_ASSETS = (
    "index.html", "ppa.html", "baseline.html", "breakdown.html",
    "styles.css", "app.js", "charts.js", "ui.mjs",
    "reuse.html", "reuse.css", "reuse.js", "reuse-model.mjs",
    "fonts/noto-sans-sc.woff2", "fonts/OFL.txt",
)
DATA_START = "// BEGIN GENERATED DATA\n"
DATA_END = "// END GENERATED DATA"


def _write_program(path: Path, payload: dict, *, source_name: str, declaration: str) -> None:
    source = (WEB_ROOT / source_name).read_text(encoding="utf-8")
    before, start, remainder = source.partition(DATA_START)
    _, end, after = remainder.partition(DATA_END)
    if not start or not end:
        raise ValueError("Browser program is missing its generated-data markers")
    data = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    path.write_text(before + DATA_START + declaration + " = " + data + ";\n" + DATA_END + after, encoding="utf-8")


def _prediction_data(models_dir: Path) -> dict:
    path = models_dir / "dp_two_stage_predictions_reuse_by_clk.csv"
    rows = []
    if path.exists():
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                mx = str(row.get("mx") or "").strip()
                rows.append([
                    str(row.get("ps_name") or "").strip(),
                    float(row.get("clk_mhz") or 0),
                    int(float(row.get("dimK") or 0)),
                    int(mx.startswith("withMX")), int(mx.endswith("withNV")),
                    str(row.get("norm_kind") or "").strip(),
                    str(row.get("acc_kind") or "").strip(),
                    str(row.get("out_kind") or "").strip(),
                    int(float(row.get("midMat") or 0)),
                    float(row["area_pred"]), float(row["power_pred"]),
                ])
    return {"schema_version": 1, "columns": UNIT_COLUMNS, "rows": rows}


def _export(out_dir: Path, db_path: Path, models_dir: Path) -> Path:
    if out_dir.resolve() == WEB_ROOT.resolve():
        raise ValueError("Export to a separate build directory, not the website source directory")
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in SITE_ASSETS:
        source, target = WEB_ROOT / name, out_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)

    with sqlite3.connect(db_path) as con:
        units = con.execute(
            "SELECT " + ", ".join(UNIT_COLUMNS) + " FROM dp_units ORDER BY id"
        ).fetchall()
        arrays = con.execute(
            "SELECT " + ", ".join(ARRAY_COLUMNS) + " FROM array_measurements ORDER BY id"
        ).fetchall()
        sources = [row[0] for row in con.execute(
            "SELECT DISTINCT source_file FROM source_rows ORDER BY source_file"
        )]
    measurements = {
        "schema_version": 1,
        "sources": sources,
        "counts": _db_counts(db_path),
        "options": _db_options(db_path),
        "units": {"columns": UNIT_COLUMNS, "rows": units},
        "arrays": {"columns": ARRAY_COLUMNS, "rows": arrays},
    }
    _write_program(out_dir / "explorer.mjs", {
        "measurements": measurements,
        "predictions": _prediction_data(models_dir),
        "baseline": _api_baseline_data(),
        "breakdown": _api_breakdown_data(),
    }, source_name="explorer.mjs", declaration="const SITE_DATA")
    _write_program(out_dir / "reuse-data.mjs", load_reuse_catalog(),
                   source_name="reuse-data.mjs", declaration="export const REUSE_DATA")
    (out_dir / ".nojekyll").write_text("", encoding="utf-8")
    # Remove only the JSON files produced by the previous exporter.
    data_dir = out_dir / "data"
    for name in ("measurements", "predictions", "baseline", "breakdown"):
        (data_dir / f"{name}.json").unlink(missing_ok=True)
    if data_dir.exists() and not any(data_dir.iterdir()):
        data_dir.rmdir()
    return out_dir


def export_static_site(
    out_dir: Path = DEFAULT_SITE_DIR,
    *,
    db_path: Path | None = None,
    models_dir: Path = MODELS_DIR,
) -> Path:
    """Rebuild measurements from CSV by default, reusing offline predictions."""
    if db_path is not None:
        return _export(Path(out_dir), Path(db_path), Path(models_dir))
    with tempfile.TemporaryDirectory(prefix="tensorforge-static-") as temp_dir:
        fresh_db = build_database(Path(temp_dir) / "area_power.db")
        return _export(Path(out_dir), fresh_db, Path(models_dir))
