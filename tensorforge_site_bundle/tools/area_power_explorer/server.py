"""Local HTTP server for the area/power explorer."""

from __future__ import annotations

import json
import mimetypes
import re
import sqlite3
import csv
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .query import ExplorerQueryEngine

WEB_ROOT = Path(__file__).resolve().parents[2] / "web" / "area_power_explorer"
ROOT = Path(__file__).resolve().parents[2]


def _ui_precision_name(name: str) -> str:
    return re.sub(r"^(MXNV|MX|NV)", "", str(name or "").strip())


def _db_counts(db_path: Path) -> dict[str, int]:
    con = sqlite3.connect(db_path)
    try:
        counts = {}
        for table in ("source_rows", "dp_units", "array_measurements", "model_runs"):
            counts[table] = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        return counts
    finally:
        con.close()


def _db_options(db_path: Path) -> dict[str, list]:
    con = sqlite3.connect(db_path)
    try:
        con.row_factory = sqlite3.Row
        precision_values = [
            _ui_precision_name(r[0])
            for r in con.execute("SELECT DISTINCT precision_name FROM dp_units WHERE precision_name != 'unknown' ORDER BY precision_name")
            if any(ch.isalpha() for ch in str(r[0]))
        ]
        precisions = sorted(dict.fromkeys(precision_values))
        ks = [r[0] for r in con.execute("SELECT DISTINCT dim_k FROM dp_units WHERE dim_k IS NOT NULL ORDER BY dim_k")]
        clks = [r[0] for r in con.execute("SELECT DISTINCT clk_mhz FROM dp_units WHERE clk_mhz IS NOT NULL ORDER BY clk_mhz")]
        ms = [r[0] for r in con.execute("SELECT DISTINCT dim_m FROM array_measurements WHERE dim_m IS NOT NULL ORDER BY dim_m")]
        ns = [r[0] for r in con.execute("SELECT DISTINCT dim_n FROM array_measurements WHERE dim_n IS NOT NULL ORDER BY dim_n")]
        norms = [
            r[0]
            for r in con.execute("SELECT DISTINCT norm_kind FROM dp_units WHERE norm_kind IS NOT NULL AND norm_kind != 'unknown' ORDER BY norm_kind")
        ]
        accs = [r[0] for r in con.execute("SELECT DISTINCT acc_kind FROM dp_units WHERE acc_kind IS NOT NULL AND acc_kind != 'unknown' ORDER BY acc_kind")]
        outs = [r[0] for r in con.execute("SELECT DISTINCT out_kind FROM dp_units WHERE out_kind IS NOT NULL AND out_kind != 'unknown' ORDER BY out_kind")]
        midmats = [r[0] for r in con.execute("SELECT DISTINCT midmat FROM dp_units WHERE midmat IS NOT NULL ORDER BY midmat")]
        return {
            "precision_name": precisions,
            "dim_m": ms,
            "dim_n": ns,
            "dim_k": ks,
            "clk_mhz": clks,
            "norm_kind": norms,
            "acc_kind": accs,
            "out_kind": outs,
            "midmat": midmats,
            "mx": [0, 1],
            "nv": [0, 1],
            "allow_predicted": [1, 0],
        }
    finally:
        con.close()


def _load_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _api_ppa_data(db_path: Path) -> dict[str, list]:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        dp_points = [
            {
                "entity": "dp_unit",
                "precision_name": row["precision_name"],
                "clk_mhz": row["clk_mhz"],
                "dim_k": row["dim_k"],
                "mx_flag": row["mx_flag"],
                "nv_flag": row["nv_flag"],
                "norm_kind": row["norm_kind"],
                "acc_kind": row["acc_kind"],
                "out_kind": row["out_kind"],
                "midmat": row["midmat"],
                "area_um2": row["area_um2"],
                "power_total_mw": row["power_total_mw"],
            }
            for row in con.execute(
                """
                SELECT precision_name, clk_mhz, dim_k, mx_flag, nv_flag, norm_kind, acc_kind, out_kind, midmat, area_um2, power_total_mw
                FROM dp_units
                WHERE area_um2 IS NOT NULL AND power_total_mw IS NOT NULL
                """
            )
        ]
        array_points = [
            {
                "entity": "array",
                "precision_name": row["precision_name"],
                "clk_mhz": row["clk_mhz"],
                "dim_m": row["dim_m"],
                "dim_n": row["dim_n"],
                "dim_k": row["dim_k"],
                "mx_flag": row["mx_flag"],
                "nv_flag": row["nv_flag"],
                "area_um2": row["area_um2"],
                "power_total_mw": row["power_total_mw"],
            }
            for row in con.execute(
                """
                SELECT precision_name, clk_mhz, dim_m, dim_n, dim_k, mx_flag, nv_flag, area_um2, power_total_mw
                FROM array_measurements
                WHERE area_um2 IS NOT NULL AND power_total_mw IS NOT NULL AND dim_m IS NOT NULL AND dim_n IS NOT NULL
                """
            )
        ]
    finally:
        con.close()
    return {
        "series": [
            {"name": "Dot Product Units", "points": dp_points},
            {"name": "Measured Arrays", "points": array_points},
        ]
    }


def _api_baseline_data() -> dict[str, list]:
    rows = _load_csv_rows(ROOT / "data" / "baseline_comparison.csv")
    points = []
    for row in rows:
        try:
            points.append(
                {
                    "design_name": row["design_name"],
                    "precision_name": row["prec"],
                    "dim_k": int(float(row["dimK"])),
                    "clk_mhz": float(row["clk_mhz"]),
                    "mx": row["mx"],
                    "area_um2": float(row["area_value"]),
                    "power_total_mw": float(row["total_value"]),
                }
            )
        except (TypeError, ValueError):
            continue
    return {"series": [{"name": "Baseline Comparison", "points": points}]}


def _api_breakdown_data() -> dict[str, list]:
    sm_rows = _load_csv_rows(ROOT / "data" / "ventus_sm_top_area.csv")
    rolled_rows = _load_csv_rows(ROOT / "data" / "ventus_top_module_area_sum_rolled.csv")

    def _norm(rows: list[dict[str, str]], label_key: str) -> list[dict[str, float | str]]:
        out = []
        for row in rows:
            try:
                out.append({"label": row[label_key], "value": float(row["area_um2"])})
            except (TypeError, ValueError, KeyError):
                continue
        return out

    return {
        "series": [
            {"name": "SM Top Area Breakdown", "points": _norm(sm_rows, "top_module")},
            {"name": "Rolled Component Breakdown", "points": _norm(rolled_rows, "top_module")},
        ]
    }


class ExplorerHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, db_path: Path, engine: ExplorerQueryEngine | None = None, options: dict | None = None, web_root: Path = WEB_ROOT, **kwargs):
        self._db_path = Path(db_path)
        self._engine = engine
        self._options = options
        self._web_root = Path(web_root)
        super().__init__(*args, **kwargs)

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, file_path: Path) -> None:
        if not file_path.exists() or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content = file_path.read_bytes()
        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", (content_type or "application/octet-stream") + ("; charset=utf-8" if content_type and (content_type.startswith("text/") or content_type == "application/javascript") else ""))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/meta":
            self._send_json({"counts": _db_counts(self._db_path)})
            return
        if parsed.path == "/api/options":
            self._send_json(self._options if self._options is not None else _db_options(self._db_path))
            return
        if parsed.path == "/api/ppa-data":
            self._send_json(_api_ppa_data(self._db_path))
            return
        if parsed.path == "/api/baseline-data":
            self._send_json(_api_baseline_data())
            return
        if parsed.path == "/api/breakdown-data":
            self._send_json(_api_breakdown_data())
            return
        if parsed.path == "/api/query":
            params = parse_qs(parsed.query)
            try:
                engine = self._engine if self._engine is not None else ExplorerQueryEngine(self._db_path)
                result = engine.query_array(
                    m=int(params.get("m", ["1"])[0]),
                    n=int(params.get("n", ["1"])[0]),
                    k=int(params.get("k", ["16"])[0]),
                    clk_mhz=float(params.get("clk_mhz", ["1410"])[0]),
                    precision_name=params.get("precision_name", ["BF16"])[0],
                    mx=params.get("mx", ["0"])[0] in {"1", "true", "True"},
                    nv=params.get("nv", ["0"])[0] in {"1", "true", "True"},
                    norm_kind=params.get("norm_kind", ["FP32"])[0],
                    acc_kind=params.get("acc_kind", ["FP32"])[0],
                    out_kind=params.get("out_kind", ["FP32"])[0],
                    midmat=int(params.get("midmat", ["26"])[0]),
                    allow_predicted=params.get("allow_predicted", ["1"])[0] in {"1", "true", "True"},
                )
            except Exception as exc:  # pragma: no cover - exercised indirectly by manual usage
                self._send_json({"error": str(exc)}, status=400)
                return
            self._send_json(result)
            return

        relative = parsed.path.lstrip("/") or "index.html"
        file_path = self._web_root / relative
        if file_path.is_dir():
            file_path = file_path / "index.html"
        if not file_path.exists() and relative == "index.html":
            file_path = self._web_root / "index.html"
        if not file_path.exists():
            file_path = self._web_root / "index.html"
        self._serve_file(file_path)


def make_server(host: str, port: int, db_path: Path, *, web_root: Path = WEB_ROOT) -> ThreadingHTTPServer:
    engine = ExplorerQueryEngine(db_path)
    options = _db_options(db_path)
    handler = partial(ExplorerHandler, db_path=db_path, engine=engine, options=options, web_root=web_root)
    return ThreadingHTTPServer((host, port), handler)


def make_static_server(host: str, port: int, site_dir: Path) -> ThreadingHTTPServer:
    handler = partial(SimpleHTTPRequestHandler, directory=str(Path(site_dir).resolve()))
    return ThreadingHTTPServer((host, port), handler)
