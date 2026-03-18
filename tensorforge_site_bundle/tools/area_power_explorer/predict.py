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
DP_UNIT_DESIGN_NAMES = {
    "DotProductWrapper",
    "DotProductFP4Wrapper",
    "DotProductINT8INT4Wrapper",
    "DotProductINT8INT4ReuseWrapper",
}


def _run(cmd: list[str], cwd: Path) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def _summarize_training_csv(path: Path) -> dict[str, object]:
    design_counts: dict[str, int] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        total_rows = 0
        for row in reader:
            total_rows += 1
            design_name = (row.get("design_name") or "").strip()
            design_counts[design_name] = design_counts.get(design_name, 0) + 1

    unexpected = sorted(name for name in design_counts if name and name not in DP_UNIT_DESIGN_NAMES)
    return {
        "source_csv": str(path),
        "total_rows": total_rows,
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
        "source_csv": str(DP_CSV),
        "python": str(DP_VENV_PY),
        "training_summary": training_summary,
        "runs": [
            {
                "model_name": item["model_name"],
                "script": str(item["script"]),
                "cmd": item["cmd"],
                "outputs": [arg for arg in item["cmd"] if str(out_dir) in arg],
            }
            for item in commands
        ],
    }
    (out_dir / "prediction_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return out_dir
