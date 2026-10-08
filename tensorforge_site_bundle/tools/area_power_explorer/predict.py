"""Prediction artifact generation for the area/power explorer."""

from __future__ import annotations

import json
import subprocess
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DP_DIR = ROOT / "data"
DP_VENV_PY = DP_DIR / ".venv" / "bin" / "python3"
DP_CSV = DP_DIR / "dp_training.csv"
CLOCK_GATED_CSV = DP_DIR / "clock_gated_area_power_measurements.csv"
DP_UNIT_DESIGN_NAMES = {
    "DotProductWrapper",
    "DotProductFP4Wrapper",
    "DotProductINT8INT4Wrapper",
    "DotProductINT8INT4ReuseWrapper",
}
TRAINING_KEY_FIELDS = ("variant", "design_name", "clk_mhz")


def _run(cmd: list[str], cwd: Path) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _training_key(row: dict[str, str]) -> tuple[str, ...]:
    return tuple((row.get(field) or "").strip() for field in TRAINING_KEY_FIELDS)


def _validate_training_data(training_path: Path, measurement_path: Path) -> None:
    training_rows = _read_csv_rows(training_path)
    measurement_rows = _read_csv_rows(measurement_path)
    measurements_by_key = {_training_key(row): row for row in measurement_rows}
    if len(measurements_by_key) != len(measurement_rows):
        raise ValueError(f"Measurement CSV contains duplicate model keys: {measurement_path}")

    seen_training_keys: set[tuple[str, ...]] = set()
    for training_row in training_rows:
        key = _training_key(training_row)
        if key in seen_training_keys:
            raise ValueError(f"Training CSV contains duplicate model key: {key}")
        seen_training_keys.add(key)

        measurement_row = measurements_by_key.get(key)
        if measurement_row is None:
            raise ValueError(f"Training row is missing from clock-gated measurements: {key}")
        mismatched_fields = [
            field
            for field, value in training_row.items()
            if value != measurement_row.get(field)
        ]
        if mismatched_fields:
            raise ValueError(
                f"Training row does not match clock-gated measurements for {key}: "
                f"{', '.join(mismatched_fields)}"
            )


def _manifest_path(path: Path) -> str:
    absolute = path if path.is_absolute() else ROOT / path
    try:
        return absolute.relative_to(ROOT).as_posix()
    except ValueError:
        return absolute.as_posix()


def _manifest_command(cmd: list[str]) -> list[str]:
    return [
        _manifest_path(Path(arg)) if Path(arg).is_absolute() else arg
        for arg in cmd
    ]


def _summarize_training_csv(path: Path) -> dict[str, object]:
    design_counts: dict[str, int] = {}
    rows = _read_csv_rows(path)
    for row in rows:
        design_name = (row.get("design_name") or "").strip()
        design_counts[design_name] = design_counts.get(design_name, 0) + 1

    unexpected = sorted(name for name in design_counts if name and name not in DP_UNIT_DESIGN_NAMES)
    return {
        "source_csv": _manifest_path(path),
        "total_rows": len(rows),
        "design_counts": design_counts,
        "unexpected_design_names": unexpected,
    }


def build_prediction_artifacts(out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not DP_VENV_PY.exists():
        raise FileNotFoundError(f"Missing model python interpreter: {DP_VENV_PY}")
    if not DP_CSV.exists():
        raise FileNotFoundError(f"Missing model CSV: {DP_CSV}")
    if not CLOCK_GATED_CSV.exists():
        raise FileNotFoundError(f"Missing clock-gated measurement CSV: {CLOCK_GATED_CSV}")
    _validate_training_data(DP_CSV, CLOCK_GATED_CSV)
    training_summary = _summarize_training_csv(DP_CSV)
    if training_summary["unexpected_design_names"]:
        raise ValueError(
            f"Prediction training CSV contains non-dot-product rows: {training_summary['unexpected_design_names']}"
        )

    commands = [
        {
            "model_name": "dp_model_by_clk",
            "script": DP_DIR / "dp_model.py",
            "cmd": [
                str(DP_VENV_PY),
                str(DP_DIR / "dp_model.py"),
                "--csv",
                str(DP_CSV),
                "--group",
                "clk_mhz",
                "--out-json",
                str(out_dir / "dp_model_metrics_by_clk.json"),
                "--out-formula",
                str(out_dir / "dp_model_formula_by_clk.txt"),
                "--out-features",
                str(out_dir / "dp_features.csv"),
                "--out-pred",
                str(out_dir / "dp_predictions_by_clk.csv"),
            ],
        },
        {
            "model_name": "dp_two_stage_reuse_by_clk",
            "script": DP_DIR / "dp_two_stage_model.py",
            "cmd": [
                str(DP_VENV_PY),
                str(DP_DIR / "dp_two_stage_model.py"),
                "--csv",
                str(DP_CSV),
                "--group",
                "clk_mhz",
                "--cv-scope",
                "reuse",
                "--out-metrics",
                str(out_dir / "dp_two_stage_metrics_reuse_by_clk.json"),
                "--out-formula",
                str(out_dir / "dp_two_stage_formula_reuse_by_clk.txt"),
                "--out-pred",
                str(out_dir / "dp_two_stage_predictions_reuse_by_clk.csv"),
            ],
        },
    ]

    for item in commands:
        _run(item["cmd"], cwd=ROOT)

    manifest = {
        "source_csv": _manifest_path(DP_CSV),
        "measurement_source_csv": _manifest_path(CLOCK_GATED_CSV),
        "python": _manifest_path(DP_VENV_PY),
        "training_summary": training_summary,
        "runs": [
            {
                "model_name": item["model_name"],
                "script": _manifest_path(item["script"]),
                "cmd": _manifest_command(item["cmd"]),
                "outputs": [
                    _manifest_path(Path(arg))
                    for arg in item["cmd"]
                    if str(out_dir) in arg
                ],
            }
            for item in commands
        ],
    }
    (out_dir / "prediction_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    return out_dir
