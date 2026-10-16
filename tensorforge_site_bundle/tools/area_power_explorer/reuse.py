"""Measured constituent compositions for the 18 paper reuse templates.

This deliberately does not use the explorer's surrogate model. Each composed
area is a sum of exact dot-product unit measurements, not a measurement of an
integrated design. Canonical row selectors and the template order follow the
paper's ``upstream_plot_clock_gating.py``; the released ``dp_training.csv`` is
the data source here and is distinct from that later clock-gating dataset.
"""

from __future__ import annotations

import csv
import math
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CSV = ROOT / "data" / "dp_training.csv"
FORMATS = ("FP16", "BF16", "FP8", "FP6", "FP4", "INT8", "INT4")
KS = (2, 4, 8, 16, 32)
CLOCKS_MHZ = (1250, 1300, 1350, 1400, 1410, 1450, 1500)

# precision_name: (covered formats, target-K multiplier, display label)
COMPONENTS = {
    "FP16": (("FP16",), 1, "FP16"),
    "BF16": (("BF16",), 1, "BF16"),
    "FP16BF16INT8INT4": (("FP16", "BF16", "INT8", "INT4"), 1, "FP16 / BF16 / INT8 / INT4"),
    "INT8": (("INT8",), 2, "INT8"),
    "INT4": (("INT4",), 4, "INT4"),
    "INT8INT4": (("INT8", "INT4"), 2, "INT8 / INT4"),
    "MXBF16FP8FP6FP4": (("BF16", "FP8", "FP6", "FP4"), 1, "BF16 / MXFP8 / MXFP6 / MXFP4"),
    "MXFP16BF16FP8FP6FP4": (("FP16", "BF16", "FP8", "FP6", "FP4"), 1, "FP16 / BF16 / MXFP8 / MXFP6 / MXFP4"),
    "MXFP16BF16FP8FP6FP4INT8INT4": (FORMATS, 1, "All seven formats"),
    "MXFP16FP8FP6FP4": (("FP16", "FP8", "FP6", "FP4"), 1, "FP16 / MXFP8 / MXFP6 / MXFP4"),
    "MXFP8FP62FP4": (("FP8", "FP6", "FP4"), 2, "MXFP8 / MXFP6 / MXFP4"),
    "MXFP8": (("FP8",), 2, "MXFP8"),
    "MXFP6": (("FP6",), 2, "MXFP6"),
    "MXFP4": (("FP4",), 4, "MXFP4 arithmetic"),
    "MXFP4LUT": (("FP4",), 4, "MXFP4 lookup table"),
}

# Keep the original constituent list, including redundant BF16 in 07/12/16.
# Those templates' original labels omitted BF16 inside the shared H/B/I unit.
TEMPLATES = (
    ("Unified reuse", ("MXFP16BF16FP8FP6FP4INT8INT4",)),
    ("Integer + low float", ("FP16BF16INT8INT4", "MXFP8FP62FP4")),
    ("Float + integer", ("MXFP16BF16FP8FP6FP4", "INT8INT4")),
    ("Float + split integer", ("MXFP16BF16FP8FP6FP4", "INT8", "INT4")),
    ("Separate FP16", ("FP16", "MXBF16FP8FP6FP4", "INT8INT4")),
    ("Separate BF16", ("BF16", "MXFP16FP8FP6FP4", "INT8INT4")),
    ("BF16 + shared integer/float", ("BF16", "FP16BF16INT8INT4", "MXFP8FP62FP4")),
    ("Split high float", ("FP16", "BF16", "MXFP8FP62FP4", "INT8INT4")),
    ("Separate FP16 + split integer", ("FP16", "MXBF16FP8FP6FP4", "INT8", "INT4")),
    ("Only low float reused", ("FP16", "BF16", "MXFP8FP62FP4", "INT8", "INT4")),
    ("Only high float/integer reused", ("FP16BF16INT8INT4", "MXFP8", "MXFP6", "MXFP4")),
    ("BF16 + shared high float/integer", ("BF16", "FP16BF16INT8INT4", "MXFP8", "MXFP6", "MXFP4")),
    ("Only integer reused", ("FP16", "BF16", "INT8INT4", "MXFP8", "MXFP6", "MXFP4")),
    ("Dedicated arithmetic", ("FP16", "BF16", "MXFP8", "MXFP6", "MXFP4", "INT8", "INT4")),
    ("High float/integer + FP4 LUT", ("FP16BF16INT8INT4", "MXFP8", "MXFP6", "MXFP4LUT")),
    ("BF16 + high float/integer + LUT", ("BF16", "FP16BF16INT8INT4", "MXFP8", "MXFP6", "MXFP4LUT")),
    ("Integer reuse + FP4 LUT", ("FP16", "BF16", "INT8INT4", "MXFP8", "MXFP6", "MXFP4LUT")),
    ("Dedicated + FP4 LUT", ("FP16", "BF16", "MXFP8", "MXFP6", "MXFP4LUT", "INT8", "INT4")),
)


def _canonical_spec(precision: str, dim_k: int) -> dict[str, str]:
    """Exact synthesis knobs: alternatives must never silently substitute."""
    spec = {
        "design_name": "DotProductWrapper", "mx": "withMXnoNV",
        "norm_kind": "FP32", "acc_kind": "FP32", "out_kind": "FP32", "midMat": "26",
    }
    if precision in ("FP16", "BF16", "FP16BF16INT8INT4"):
        spec["mx"] = "noMX" if precision == "FP16BF16INT8INT4" and dim_k == 16 else "noMXnoNV"
        if precision == "FP16":
            spec["out_kind"] = "FP16FP32"
    elif precision in ("INT4", "INT8", "INT8INT4"):
        spec.update({"design_name": "DotProductINT8INT4ReuseWrapper" if precision == "INT8INT4" else "DotProductINT8INT4Wrapper",
                     "mx": "noMX", "norm_kind": "4" if precision == "INT4" else "8",
                     "acc_kind": "INT32", "out_kind": "INT32", "midMat": "0"})
    elif precision in ("MXFP8", "MXFP6", "MXFP4", "MXFP4LUT"):
        spec["midMat"] = {"MXFP8": "22", "MXFP6": "17", "MXFP4": "9", "MXFP4LUT": "9"}[precision]
        if precision == "MXFP4LUT":
            spec["design_name"] = "DotProductFP4Wrapper"
    elif dim_k == (32 if precision == "MXFP8FP62FP4" else 16):
        spec["mx"] = "withMX"
    return spec


def _number(value: Any, *, field: str, row: int) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {field} at CSV row {row}: {value!r}") from exc
    if not math.isfinite(result) or result < 0:
        raise ValueError(f"Invalid {field} at CSV row {row}: {value!r}")
    return result


def _integer(value: Any, *, field: str, row: int) -> int:
    result = _number(value, field=field, row=row)
    if not result.is_integer():
        raise ValueError(f"Invalid integer {field} at CSV row {row}: {value!r}")
    return int(result)


def _load_units(csv_path: Path) -> dict[tuple[str, int, int], dict[str, Any]]:
    units = {}
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"precision_set", "dimK", "clk_mhz", "area_value", "total_value", "variant", "report_dir",
                    "design_name", "mx", "norm_kind", "acc_kind", "out_kind", "midMat"}
        missing = required.difference(reader.fieldnames or ())
        if missing:
            raise ValueError(f"Missing CSV columns: {', '.join(sorted(missing))}")
        for row_number, row in enumerate(reader, start=2):
            precision = row["precision_set"].strip()
            if precision not in COMPONENTS:
                continue
            dim_k = _integer(row["dimK"], field="dimK", row=row_number)
            clk = _integer(row["clk_mhz"], field="clk_mhz", row=row_number)
            if clk not in CLOCKS_MHZ or dim_k not in {k * COMPONENTS[precision][1] for k in KS}:
                continue
            spec = _canonical_spec(precision, dim_k)
            if any(str(row[field]).strip() != expected for field, expected in spec.items()):
                continue
            key = (precision, dim_k, clk)
            if key in units:
                raise ValueError(f"Duplicate canonical measurement for {precision}, dimK={dim_k}, clock={clk}")
            power_unit = str(row.get("total_unit") or "mW").strip()
            if power_unit != "mW":
                raise ValueError(f"Unexpected total power unit {power_unit!r} at CSV row {row_number}")
            area_unit = str(row.get("area_unit") or "um2").strip()
            if area_unit not in ("um2", "µm²", "μm²"):
                raise ValueError(f"Unexpected area unit {area_unit!r} at CSV row {row_number}")
            units[key] = {
                "unit_area_um2": _number(row["area_value"], field="area_value", row=row_number),
                "unit_power_mw": _number(row["total_value"], field="total_value", row=row_number),
                "variant": row["variant"], "source_row": row_number,
                "source": {"file": "data/dp_training.csv" if csv_path.resolve() == DEFAULT_CSV.resolve() else str(csv_path),
                           "row": row_number, "report_dir": row["report_dir"], **spec},
            }
    return units


def load_reuse_data(csv_path: Path | str | None = None) -> dict[str, Any]:
    """Return JSON-safe templates and all 630 requested operating points.

    Missing exact measurements yield ``available=False`` and null totals; no
    prediction or neighboring row is substituted. Malformed or duplicate exact
    measurements raise ``ValueError`` so invalid evidence cannot look measured.
    ``csv_path`` is optional for local validation and independent use.
    """
    csv_path = Path(csv_path) if csv_path is not None else DEFAULT_CSV
    units = _load_units(csv_path)
    strategies = []
    points = []
    for index, (description, precisions) in enumerate(TEMPLATES, start=1):
        strategy_id = f"s{index:02}"
        groups = []
        for group_index, precision in enumerate(precisions, start=1):
            formats, multiplier, label = COMPONENTS[precision]
            groups.append({
                "id": f"g{group_index}", "label": label, "precision_name": precision,
                "formats": list(formats), "k_multiplier": multiplier, "instances": 1,
                "implementation": "lookup_table" if precision == "MXFP4LUT" else "shared" if len(formats) > 1 else "dedicated_arithmetic",
            })
        name = "+".join(precisions).replace("MXFP8FP62FP4", "MXFP8FP6FP4")
        original_name = name.replace("BF16+FP16BF16INT8INT4", "BF16+FP16INT8INT4") if index in (7, 12, 16) else name
        if index in (13, 17):
            # The original legend lists the integer block last, whereas its
            # constituent specification (and our groups) lists it third.
            original_name = name.replace("+INT8INT4", "") + "+INT8INT4"
        notes = []
        if index in (7, 12, 16):
            notes.append("The source template includes a separate BF16 unit and a shared FP16/BF16/INT8/INT4 unit. Both physical units are preserved; the original label omitted BF16 in the shared unit.")
        strategies.append({
            "id": strategy_id, "paper_index": index, "name": name, "original_paper_name": original_name,
            "family": "unified" if index == 1 else "dedicated" if index in (14, 18) else "hybrid",
            "description": description, "notes": notes, "supported_formats": list(FORMATS), "groups": groups,
        })
        for k in KS:
            for clk in CLOCKS_MHZ:
                measured_groups = []
                for group in groups:
                    dim_k = k * group["k_multiplier"]
                    measurement = units.get((group["precision_name"], dim_k, clk))
                    measured = {**group, "dim_k": dim_k, "available": measurement is not None,
                                "area_um2": None, "unit_area_um2": None, "power_mw": None,
                                "variant": None, "source_row": None, "source": None}
                    if measurement is not None:
                        measured.update(measurement)
                        measured["area_um2"] = measurement["unit_area_um2"] * group["instances"]
                        measured["power_mw"] = measurement["unit_power_mw"] * group["instances"]
                    measured_groups.append(measured)
                available = all(group["available"] for group in measured_groups)
                area = sum(group["area_um2"] for group in measured_groups) if available else None
                power = sum(group["power_mw"] for group in measured_groups) if available else None
                unit_count = sum(group["instances"] for group in measured_groups)
                points.append({
                    "strategy_id": strategy_id, "k": k, "clk_mhz": clk, "available": available,
                    "result_type": "derived_measured_components" if available else "missing_measurement",
                    "area_um2": area, "power_sum_mw": power,
                    "paper_mean_unit_power_mw": power / unit_count if power is not None else None,
                    "unit_count": unit_count, "groups": measured_groups,
                })
    return {
        "schema_version": 1, "formats": list(FORMATS), "ks": list(KS), "clocks_mhz": list(CLOCKS_MHZ),
        "meta": {
            "default_k": 32, "default_clk_mhz": 1410,
            "source_file": "data/dp_training.csv" if csv_path.resolve() == DEFAULT_CSV.resolve() else str(csv_path),
            "technology": "TSMC 22 nm", "synthesis_tool": "Synopsys Design Compiler X-2025.06",
            "process_corner": "TT, 25 °C", "data_variant": "released bundled synthesis dataset",
            "baseline_strategy_id": "s14", "area_unit": "μm²",
            "caveats": [
                "Area is the sum of exact synthesized dot-product units from dp_training.csv: derived composition, not a separately synthesized integrated design.",
                "These 18 templates use the released bundled unit dataset, distinct from the later clock-gated paper dataset; their area reductions can differ.",
                "Requirement filtering keeps every whole datapath that intersects the required formats. A retained shared unit keeps its complete measured area; redundant BF16 groups in templates 07/12/16 remain when BF16 is required.",
                "FP8, FP6 and FP4 denote the measured MX formats. FP4 LUT is another implementation of FP4, not an additional numeric format.",
                "Component dimK equals target K times k_multiplier (1, 2 or 4). This preserves the paper's composition convention and does not establish equal per-format throughput.",
                "Clock is the requested synthesis target. The CSV has no slack data and does not certify timing closure.",
                "Power sum is a sum of constituent DC reports, not workload or integrated-design power. The paper plotting convention uses mean constituent-unit power; neither establishes simultaneous active power.",
                "No shared-block internals, interconnect, selection logic, routing overhead or surrogate estimates are added to the measured constituent areas.",
            ],
        },
        "strategies": strategies, "points": points,
    }
