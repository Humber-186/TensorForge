"""CLI entrypoints for the area/power explorer."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from .build_db import build_database
from .predict import build_prediction_artifacts
from .server import make_server

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = ROOT / "artifacts" / "area_power_explorer"


def _prediction_artifacts_exist(models_dir: Path) -> bool:
    required = [
        models_dir / "prediction_manifest.json",
        models_dir / "dp_model_metrics_by_clk.json",
        models_dir / "dp_two_stage_metrics_reuse_by_clk.json",
        models_dir / "dp_two_stage_predictions_reuse_by_clk.csv",
    ]
    return all(path.exists() for path in required)


def _database_is_usable(db_path: Path) -> bool:
    if not db_path.exists():
        return False
    try:
        con = sqlite3.connect(db_path)
        try:
            tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            con.close()
    except sqlite3.Error:
        return False
    required = {"source_rows", "dp_units", "array_measurements", "model_runs"}
    return required.issubset(tables)


def run_build_only(out_dir: Path, include_predictions: bool = False, reuse_existing: bool = True) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    db_path = out_dir / "area_power.db"
    if not (reuse_existing and _database_is_usable(db_path)):
        build_database(db_path)
    if include_predictions:
        models_dir = out_dir / "models"
        if not (reuse_existing and _prediction_artifacts_exist(models_dir)):
            build_prediction_artifacts(models_dir)
    return db_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Area/power explorer build and serve commands")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build", help="Build SQLite DB and prediction artifacts")
    build_parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    build_parser.add_argument("--skip-predictions", action="store_true")
    build_parser.add_argument("--force-rebuild", action="store_true")

    serve_parser = subparsers.add_parser("serve", help="Serve the local explorer")
    serve_parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8000)
    serve_parser.add_argument("--skip-predictions", action="store_true")
    serve_parser.add_argument("--force-rebuild", action="store_true")

    args = parser.parse_args(argv)
    out_dir = Path(args.out_dir)

    if args.command == "build":
        db_path = run_build_only(
            out_dir,
            include_predictions=not args.skip_predictions,
            reuse_existing=not args.force_rebuild,
        )
        print(f"Built explorer database at {db_path}")
        return 0

    db_path = run_build_only(
        out_dir,
        include_predictions=not args.skip_predictions,
        reuse_existing=not args.force_rebuild,
    )
    httpd = make_server(args.host, args.port, db_path)
    print(f"Serving area/power explorer at http://{args.host}:{args.port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
