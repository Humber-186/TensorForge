"""Normalization helpers for area/power explorer inputs."""

from __future__ import annotations

import re
from typing import Any

_DIMK_RE = re.compile(r"dimK(\d+)")
_MIDMAT_RE = re.compile(r"midMat(-?\d+)")
_MN_RE = re.compile(r"_m(\d+)_n(\d+)")
_NORM_RE = re.compile(r"_norm([^_]+)")
_ACC_RE = re.compile(r"_acc([^_]+)")
_OUT_RE = re.compile(r"_out([^_]+)")
_PRECISION_RE = re.compile(r"(?:^|/)(?:DC_log_)?([^/_]+?)(?:_dimK\d+|$)")

_DP_NAMES = {
    "DotProductWrapper",
    "DotProductFP4Wrapper",
    "DotProductINT8INT4Wrapper",
    "DotProductINT8INT4ReuseWrapper",
    "DotProductWrapperFP16INT",
    "DotProductBinary",
}
_ARRAY_NAMES = {"InnerProductArray", "OuterProductArray"}


def _coalesce_text(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _parse_int(text: str) -> int | None:
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _parse_float(text: str) -> float | None:
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _extract(pattern: re.Pattern[str], *sources: str) -> str | None:
    for source in sources:
        if not source:
            continue
        match = pattern.search(source)
        if match:
            return match.group(1)
    return None


def _parse_mx_nv(raw: str, variant: str) -> tuple[bool, bool, str]:
    token = _coalesce_text(raw)
    if not token:
        if "withMXwithNV" in variant:
            token = "withMXwithNV"
        elif "withMXnoNV" in variant:
            token = "withMXnoNV"
        elif "noMXwithNV" in variant:
            token = "noMXwithNV"
        elif "noMXnoNV" in variant:
            token = "noMXnoNV"
        elif "withMX" in variant:
            token = "withMX"
        elif "noMX" in variant:
            token = "noMX"

    mx_flag = token.startswith("withMX")
    nv_flag = token.endswith("withNV")
    return mx_flag, nv_flag, token


def _classify_entity(design_name: str) -> str:
    if design_name in _DP_NAMES:
        return "dp_unit"
    if design_name in _ARRAY_NAMES:
        return "array"
    return "other"


def normalize_record(row: dict[str, Any], source_file: str) -> dict[str, Any]:
    variant = _coalesce_text(row.get("variant"))
    report_dir = _coalesce_text(row.get("report_dir"))
    dim_k = _parse_int(_coalesce_text(row.get("dimK")))
    if dim_k is None:
        dim_k = _parse_int(_extract(_DIMK_RE, variant, report_dir) or "")

    midmat = _parse_int(_coalesce_text(row.get("midMat")))
    if midmat is None:
        midmat = _parse_int(_extract(_MIDMAT_RE, variant, report_dir) or "")

    mn_match = None
    for source in (variant, report_dir):
        mn_match = _MN_RE.search(source)
        if mn_match:
            break
    dim_m = int(mn_match.group(1)) if mn_match else None
    dim_n = int(mn_match.group(2)) if mn_match else None

    norm_kind = _coalesce_text(row.get("norm_kind")) or (_extract(_NORM_RE, variant, report_dir) or "unknown")
    acc_kind = _coalesce_text(row.get("acc_kind")) or (_extract(_ACC_RE, variant, report_dir) or "unknown")
    out_kind = _coalesce_text(row.get("out_kind")) or (_extract(_OUT_RE, variant, report_dir) or "unknown")

    precision_name = _coalesce_text(row.get("precision_name"), row.get("prec"))
    if not precision_name:
        precision_name = _extract(
            _PRECISION_RE,
            _coalesce_text(row.get("precision_set")),
            variant,
            report_dir,
        ) or "unknown"

    mx_flag, nv_flag, mx_raw = _parse_mx_nv(_coalesce_text(row.get("mx")), variant)
    design_name = _coalesce_text(row.get("design_name"))

    return {
        "design_name": design_name,
        "variant": variant,
        "report_dir": report_dir,
        "source_file": source_file,
        "entity_type": _classify_entity(design_name),
        "precision_name": precision_name,
        "clk_mhz": _parse_float(_coalesce_text(row.get("clk_mhz"))),
        "dim_k": dim_k,
        "dim_m": dim_m,
        "dim_n": dim_n,
        "mx_flag": mx_flag,
        "nv_flag": nv_flag,
        "mx_raw": mx_raw,
        "norm_kind": norm_kind,
        "acc_kind": acc_kind,
        "out_kind": out_kind,
        "midmat": midmat,
        "area_um2": _parse_float(_coalesce_text(row.get("area_value"))),
        "power_total_mw": _parse_float(_coalesce_text(row.get("total_value"))),
        "power_dynamic_mw": _parse_float(_coalesce_text(row.get("dynamic_value"))),
        "power_leakage": _parse_float(_coalesce_text(row.get("leakage_value"))),
    }
