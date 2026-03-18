#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import warnings
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


BASE_MODES = ("FP16", "BF16", "MXFP8", "MXFP6", "MXFP4", "MXFP4LUT", "INT8", "INT4")

# (mantissa_bits, exponent_bits)
FP_BITS = {
    "FP16": (10, 5),
    "BF16": (7, 8),
    "MXFP8": (3, 4),
    "MXFP6": (2, 3),
    "MXFP4": (1, 2),
    "MXFP4LUT": (1, 2),
}
INT_BITS = {"INT8": 8, "INT4": 4}

BASE_MODE_CANONICAL_CONFIGS = {
    "FP16": {
        "mx": "noMXnoNV",
        "norm_kind": "FP32",
        "acc_kind": "FP32",
        "out_kind": "FP16FP32",
        "midMat": 26,
    },
    "BF16": {
        "mx": "noMXnoNV",
        "norm_kind": "FP32",
        "acc_kind": "FP32",
        "out_kind": "FP32",
        "midMat": 26,
    },
    "MXFP8": {
        "mx": "withMXnoNV",
        "norm_kind": "FP32",
        "acc_kind": "FP32",
        "out_kind": "FP32",
        "midMat": 22,
    },
    "MXFP6": {
        "mx": "withMXnoNV",
        "norm_kind": "FP32",
        "acc_kind": "FP32",
        "out_kind": "FP32",
        "midMat": 17,
    },
    "MXFP4": {
        "mx": "withMXnoNV",
        "norm_kind": "FP32",
        "acc_kind": "FP32",
        "out_kind": "FP32",
        "midMat": 9,
    },
    "MXFP4LUT": {
        "mx": "withMXnoNV",
        "norm_kind": "FP32",
        "acc_kind": "FP32",
        "out_kind": "FP32",
        "midMat": 9,
    },
    "INT8": {
        "mx": "noMX",
        "norm_kind": "8",
        "acc_kind": "INT32",
        "out_kind": "INT32",
        "midMat": 0,
    },
    "INT4": {
        "mx": "noMX",
        "norm_kind": "4",
        "acc_kind": "INT32",
        "out_kind": "INT32",
        "midMat": 0,
    },
}


def _safe_log2(x: float) -> float:
    return math.log2(x) if x > 0 else 0.0


def ps_name_from_path(p: str) -> str:
    return os.path.basename(str(p))


def parse_modes(ps_name: str) -> list[str]:
    s = ps_name
    modes: list[str] = []

    if s == "INT8INT4":
        return ["INT8", "INT4"]

    if s == "MXFP4LUT":
        return ["MXFP4LUT"]

    if "FP16" in s:
        modes.append("FP16")
        s = s.replace("FP16", "")
    if "BF16" in s:
        modes.append("BF16")
        s = s.replace("BF16", "")

    fp4_twice = False
    if "2FP4" in s:
        fp4_twice = True
        s = s.replace("2FP4", "")

    if "FP8" in s:
        modes.append("MXFP8")
        s = s.replace("FP8", "")
    if "FP6" in s:
        modes.append("MXFP6")
        s = s.replace("FP6", "")
    if "FP4" in s:
        modes.append("MXFP4")
        s = s.replace("FP4", "")
    if fp4_twice:
        modes.append("MXFP4")

    if "INT8" in s:
        modes.append("INT8")
        s = s.replace("INT8", "")
    if "INT4" in s:
        modes.append("INT4")
        s = s.replace("INT4", "")

    if not modes:
        raise ValueError(f"Unrecognized ps_name: {ps_name}")
    return modes


@dataclass(frozen=True)
class ModeConfig:
    mode: str
    clk_mhz: int
    dimK: int
    mx: str
    norm_kind: str
    acc_kind: str
    out_kind: str
    midMat: int


def infer_mode_config_from_row(row: pd.Series, mode: str) -> ModeConfig:
    clk_mhz = int(row["clk_mhz"])
    dimK = int(row["dimK"])
    canonical = BASE_MODE_CANONICAL_CONFIGS.get(mode)
    if canonical is None:
        raise ValueError(f"Unsupported base mode for Stage-A decomposition: {mode}")
    return ModeConfig(
        mode=mode,
        clk_mhz=clk_mhz,
        dimK=dimK,
        mx=str(canonical["mx"]),
        norm_kind=str(canonical["norm_kind"]),
        acc_kind=str(canonical["acc_kind"]),
        out_kind=str(canonical["out_kind"]),
        midMat=int(canonical["midMat"]),
    )


def mode_config_to_frame(configs: list[ModeConfig]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "mode": [c.mode for c in configs],
            "clk_mhz": [c.clk_mhz for c in configs],
            "dimK": [c.dimK for c in configs],
            "mx": [c.mx for c in configs],
            "norm_kind": [c.norm_kind for c in configs],
            "acc_kind": [c.acc_kind for c in configs],
            "out_kind": [c.out_kind for c in configs],
            "midMat": [c.midMat for c in configs],
            "log2_dimK": [_safe_log2(c.dimK) for c in configs],
        }
    )


def make_stage_a_pipeline(alpha: float) -> Pipeline:
    num_cols = ["dimK", "log2_dimK", "clk_mhz"]
    cat_cols = ["mode", "mx", "norm_kind", "acc_kind", "out_kind", "midMat"]
    pre = ColumnTransformer(
        [
            ("num", "passthrough", num_cols),
            ("cat", OneHotEncoder(drop="first", handle_unknown="ignore", sparse_output=False), cat_cols),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    return Pipeline([("pre", pre), ("reg", Ridge(alpha=alpha, random_state=0))])


def make_stage_b_pipeline(alpha: float) -> Pipeline:
    num_cols = [
        "n_modes_total",
        "n_modes_unique",
        "has_fp",
        "has_int",
        "fp_mantissa_bits_total",
        "int_bits_total",
        "fp_mantissa_groups",
        "fp_exponent_groups",
        "share_mul",
        "share_norm_align",
        "share_fp_acc",
        "share_int_acc",
        "share_adder_tree",
        "share_exp",
        "mux_inputs",
        "A_ded_hat",
        "P_ded_hat",
        "A_fp_ded_hat",
        "A_int_ded_hat",
        "P_fp_ded_hat",
        "P_int_ded_hat",
        "A_ded_max",
        "A_ded_min",
        "A_ded_std",
        "P_ded_max",
        "P_ded_min",
        "P_ded_std",
        "A_dom_frac",
        "P_dom_frac",
        "dimK",
        "log2_dimK",
        "clk_mhz",
        "count_FP16",
        "count_BF16",
        "count_MXFP8",
        "count_MXFP6",
        "count_MXFP4",
        "count_MXFP4LUT",
        "count_INT8",
        "count_INT4",
    ]
    cat_cols = ["mx", "out_kind", "midMat"]
    pre = ColumnTransformer(
        [
            ("num", "passthrough", num_cols),
            ("cat", OneHotEncoder(drop="first", handle_unknown="ignore", sparse_output=False), cat_cols),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    return Pipeline([("pre", pre), ("reg", Ridge(alpha=alpha, random_state=0))])


def pipeline_feature_names(pipe: Pipeline) -> list[str]:
    return list(pipe.named_steps["pre"].get_feature_names_out())


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.clip(np.abs(y_true), 1e-9, None)
    return float(np.mean(np.abs(y_true - y_pred) / denom))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def build_base_dataset(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ps_name"] = df["precision_set"].apply(ps_name_from_path)
    base_df = df[df["ps_name"].isin(BASE_MODES)].copy()
    if len(base_df) == 0:
        raise RuntimeError("No base-mode rows found for Stage-A.")
    base_df = base_df.rename(columns={"ps_name": "mode"})
    base_df["log2_dimK"] = base_df["dimK"].astype(float).map(_safe_log2)
    return base_df


def build_reuse_dataset(df: pd.DataFrame, stage_a_area: Pipeline, stage_a_power: Pipeline) -> pd.DataFrame:
    df = df.copy()
    df["ps_name"] = df["precision_set"].apply(ps_name_from_path)
    reuse_df = df[~df["ps_name"].isin(BASE_MODES)].copy()
    if len(reuse_df) == 0:
        raise RuntimeError("No multi-mode rows found for Stage-B.")

    rows = []
    for _, r in reuse_df.iterrows():
        ps_name = str(r["ps_name"])
        modes = parse_modes(ps_name)
        mode_cfgs = [infer_mode_config_from_row(r, m) for m in modes]
        X_modes = mode_config_to_frame(mode_cfgs)

        A_parts = np.exp(stage_a_area.predict(X_modes))
        P_parts = np.exp(stage_a_power.predict(X_modes))
        A_ded_hat = float(np.sum(A_parts))
        P_ded_hat = float(np.sum(P_parts))

        A_fp_ded_hat = float(np.sum([v for m, v in zip(modes, A_parts) if m not in ("INT8", "INT4")]))
        A_int_ded_hat = float(np.sum([v for m, v in zip(modes, A_parts) if m in ("INT8", "INT4")]))
        P_fp_ded_hat = float(np.sum([v for m, v in zip(modes, P_parts) if m not in ("INT8", "INT4")]))
        P_int_ded_hat = float(np.sum([v for m, v in zip(modes, P_parts) if m in ("INT8", "INT4")]))

        A_ded_max = float(np.max(A_parts)) if len(A_parts) else 0.0
        A_ded_min = float(np.min(A_parts)) if len(A_parts) else 0.0
        A_ded_std = float(np.std(A_parts)) if len(A_parts) else 0.0
        P_ded_max = float(np.max(P_parts)) if len(P_parts) else 0.0
        P_ded_min = float(np.min(P_parts)) if len(P_parts) else 0.0
        P_ded_std = float(np.std(P_parts)) if len(P_parts) else 0.0
        A_dom_frac = float(A_ded_max / max(A_ded_hat, 1e-9))
        P_dom_frac = float(P_ded_max / max(P_ded_hat, 1e-9))

        A_reuse = float(r["area_value"])
        P_reuse = float(r["total_value"])

        rhoA = A_reuse / max(A_ded_hat, 1e-9)
        rhoP = P_reuse / max(P_ded_hat, 1e-9)

        has_fp = int(any(m not in ("INT8", "INT4") for m in modes))
        has_int = int(any(m in ("INT8", "INT4") for m in modes))

        fp_mant_bits = []
        fp_exp_bits = []
        fp_mantissa_bits_total = 0
        for m in modes:
            if m in ("INT8", "INT4"):
                continue
            mant, exp = FP_BITS[m]
            fp_mant_bits.append(mant)
            fp_exp_bits.append(exp)
            fp_mantissa_bits_total += mant

        fp_mantissa_groups = len(set(fp_mant_bits)) if fp_mant_bits else 0
        fp_exponent_groups = len(set(fp_exp_bits)) if fp_exp_bits else 0

        int_bits_total = sum(INT_BITS[m] for m in modes if m in INT_BITS)

        share_mul = int(fp_mantissa_groups <= 1 and has_fp == 1)
        share_norm_align = int(has_fp == 1)
        share_fp_acc = int(has_fp == 1)
        share_int_acc = int(has_int == 1)
        share_adder_tree = 1
        share_exp = int(fp_exponent_groups <= 1 and has_fp == 1)
        mux_inputs = len(modes)

        counts = {f"count_{m}": 0 for m in BASE_MODES}
        for m in modes:
            counts[f"count_{m}"] += 1

        rows.append(
            {
                "variant": r["variant"],
                "design_name": r["design_name"],
                "ps_name": ps_name,
                "clk_mhz": int(r["clk_mhz"]),
                "dimK": int(r["dimK"]),
                "log2_dimK": _safe_log2(int(r["dimK"])),
                "mx": str(r["mx"]),
                "out_kind": str(r["out_kind"]),
                "midMat": int(r["midMat"]),
                "A_reuse": A_reuse,
                "P_reuse": P_reuse,
                "A_ded_hat": A_ded_hat,
                "P_ded_hat": P_ded_hat,
                "A_fp_ded_hat": A_fp_ded_hat,
                "A_int_ded_hat": A_int_ded_hat,
                "P_fp_ded_hat": P_fp_ded_hat,
                "P_int_ded_hat": P_int_ded_hat,
                "A_ded_max": A_ded_max,
                "A_ded_min": A_ded_min,
                "A_ded_std": A_ded_std,
                "P_ded_max": P_ded_max,
                "P_ded_min": P_ded_min,
                "P_ded_std": P_ded_std,
                "A_dom_frac": A_dom_frac,
                "P_dom_frac": P_dom_frac,
                "rhoA": rhoA,
                "rhoP": rhoP,
                "n_modes_total": len(modes),
                "n_modes_unique": len(set(modes)),
                "has_fp": has_fp,
                "has_int": has_int,
                "fp_mantissa_bits_total": fp_mantissa_bits_total,
                "int_bits_total": int_bits_total,
                "fp_mantissa_groups": fp_mantissa_groups,
                "fp_exponent_groups": fp_exponent_groups,
                "share_mul": share_mul,
                "share_norm_align": share_norm_align,
                "share_fp_acc": share_fp_acc,
                "share_int_acc": share_int_acc,
                "share_adder_tree": share_adder_tree,
                "share_exp": share_exp,
                "mux_inputs": mux_inputs,
                **counts,
            }
        )

    return pd.DataFrame(rows)


def fit_two_stage(df_train: pd.DataFrame, alpha_a: float, alpha_b: float) -> tuple[Pipeline, Pipeline, Pipeline, Pipeline]:
    base_train = build_base_dataset(df_train)
    Xa = base_train[["mode", "clk_mhz", "dimK", "log2_dimK", "mx", "norm_kind", "acc_kind", "out_kind", "midMat"]]

    fa = make_stage_a_pipeline(alpha=alpha_a)
    fp = make_stage_a_pipeline(alpha=alpha_a)
    fa.fit(Xa, np.log(base_train["area_value"].astype(float).to_numpy()))
    fp.fit(Xa, np.log(base_train["total_value"].astype(float).to_numpy()))

    reuse_train = build_reuse_dataset(df_train, stage_a_area=fa, stage_a_power=fp)

    Xb = reuse_train.drop(columns=["variant", "design_name", "ps_name", "A_reuse", "P_reuse", "rhoA", "rhoP"])
    gb_a = make_stage_b_pipeline(alpha=alpha_b)
    gb_p = make_stage_b_pipeline(alpha=alpha_b)
    gb_a.fit(Xb, np.log(np.clip(reuse_train["rhoA"].astype(float).to_numpy(), 1e-9, None)))
    gb_p.fit(Xb, np.log(np.clip(reuse_train["rhoP"].astype(float).to_numpy(), 1e-9, None)))
    return fa, fp, gb_a, gb_p


def predict_two_stage(df: pd.DataFrame, fa: Pipeline, fp: Pipeline, gb_a: Pipeline, gb_p: Pipeline) -> pd.DataFrame:
    df = df.copy()
    df["ps_name"] = df["precision_set"].apply(ps_name_from_path)

    out = df[
        ["variant", "design_name", "ps_name", "clk_mhz", "dimK", "mx", "norm_kind", "acc_kind", "out_kind", "midMat", "area_value", "total_value"]
    ].copy()

    base_mask = out["ps_name"].isin(BASE_MODES)
    base = out[base_mask].copy()
    if len(base) > 0:
        base["log2_dimK"] = base["dimK"].astype(float).map(_safe_log2)
        Xa = base.rename(columns={"ps_name": "mode"})[
            ["mode", "clk_mhz", "dimK", "log2_dimK", "mx", "norm_kind", "acc_kind", "out_kind", "midMat"]
        ]
        out.loc[base_mask, "area_pred"] = np.exp(fa.predict(Xa))
        out.loc[base_mask, "power_pred"] = np.exp(fp.predict(Xa))
        out.loc[base_mask, "rhoA_pred"] = 1.0
        out.loc[base_mask, "rhoP_pred"] = 1.0

    reuse_mask = ~base_mask
    reuse = out[reuse_mask].copy()
    if len(reuse) > 0:
        reuse_feats = build_reuse_dataset(df[reuse_mask], stage_a_area=fa, stage_a_power=fp)
        Xb = reuse_feats.drop(columns=["variant", "design_name", "ps_name", "A_reuse", "P_reuse", "rhoA", "rhoP"])

        rhoA_hat = np.exp(gb_a.predict(Xb))
        rhoP_hat = np.exp(gb_p.predict(Xb))

        out.loc[reuse_mask, "rhoA_pred"] = rhoA_hat
        out.loc[reuse_mask, "rhoP_pred"] = rhoP_hat
        out.loc[reuse_mask, "area_pred"] = rhoA_hat * reuse_feats["A_ded_hat"].to_numpy()
        out.loc[reuse_mask, "power_pred"] = rhoP_hat * reuse_feats["P_ded_hat"].to_numpy()

    out["area_ape"] = np.abs(out["area_value"].astype(float) - out["area_pred"].astype(float)) / np.clip(
        np.abs(out["area_value"].astype(float)), 1e-9, None
    )
    out["power_ape"] = np.abs(out["total_value"].astype(float) - out["power_pred"].astype(float)) / np.clip(
        np.abs(out["total_value"].astype(float)), 1e-9, None
    )
    return out


def cv_evaluate(df: pd.DataFrame, group_col: str, n_splits: int, alpha_a: float, alpha_b: float, scope: str) -> dict:
    df = df.copy()
    df["ps_name"] = df["precision_set"].apply(ps_name_from_path)

    if scope == "all":
        splitter = GroupKFold(n_splits=n_splits)
        groups = df[group_col].astype(str).to_numpy()
        splits = [(train_idx, test_idx, df.iloc[train_idx], df.iloc[test_idx]) for train_idx, test_idx in splitter.split(df, groups=groups)]
    elif scope == "reuse":
        base_df = df[df["ps_name"].isin(BASE_MODES)].copy()
        reuse_df = df[~df["ps_name"].isin(BASE_MODES)].copy()
        splitter = GroupKFold(n_splits=n_splits)
        groups = reuse_df[group_col].astype(str).to_numpy()
        splits = []
        for train_idx, test_idx in splitter.split(reuse_df, groups=groups):
            reuse_train = reuse_df.iloc[train_idx]
            reuse_test = reuse_df.iloc[test_idx]
            train_df = pd.concat([base_df, reuse_train], axis=0, ignore_index=True)
            splits.append((None, None, train_df, reuse_test))
    else:
        raise ValueError(f"Unknown scope: {scope}")

    fold_metrics = []
    for _, __, df_train, df_test in splits:
        fa, fp, gb_a, gb_p = fit_two_stage(df_train, alpha_a=alpha_a, alpha_b=alpha_b)
        pred = predict_two_stage(df_test, fa=fa, fp=fp, gb_a=gb_a, gb_p=gb_p)

        area_true = pred["area_value"].astype(float).to_numpy()
        area_pred = pred["area_pred"].astype(float).to_numpy()
        power_true = pred["total_value"].astype(float).to_numpy()
        power_pred = pred["power_pred"].astype(float).to_numpy()

        fold_metrics.append(
            {
                "area_r2": float(r2_score(area_true, area_pred)),
                "area_mape": float(mape(area_true, area_pred)),
                "area_rmse": float(rmse(area_true, area_pred)),
                "power_r2": float(r2_score(power_true, power_pred)),
                "power_mape": float(mape(power_true, power_pred)),
                "power_rmse": float(rmse(power_true, power_pred)),
            }
        )

    def _mean_std(key: str) -> tuple[float, float]:
        vals = [m[key] for m in fold_metrics]
        return float(np.mean(vals)), float(np.std(vals))

    keys = ["area_r2", "area_mape", "area_rmse", "power_r2", "power_mape", "power_rmse"]
    mean = {k: _mean_std(k)[0] for k in keys}
    std = {k: _mean_std(k)[1] for k in keys}
    return {
        "group": group_col,
        "scope": scope,
        "n_splits": n_splits,
        "alpha_a": alpha_a,
        "alpha_b": alpha_b,
        "folds": fold_metrics,
        "mean": mean,
        "std": std,
    }


def coef_dump(pipe: Pipeline) -> dict:
    names = pipeline_feature_names(pipe)
    coef = pipe.named_steps["reg"].coef_.reshape(-1)
    intercept = float(pipe.named_steps["reg"].intercept_)
    pairs = sorted(zip(names, coef), key=lambda x: abs(x[1]), reverse=True)
    return {
        "intercept": intercept,
        "coefficients": [{"feature": n, "coef": float(c)} for n, c in pairs],
    }


def write_formula(path: str, fa: Pipeline, fp: Pipeline, gb_a: Pipeline, gb_p: Pipeline) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write("Stage-A (single-mode):\n")
        f.write("  ln(area_value)  = b0 + Σ bi * φi(x(m))\n")
        f.write("  ln(total_value) = c0 + Σ ci * φi(x(m))\n\n")
        f.write("Stage-B (reuse ratio):\n")
        f.write("  ln(rhoA) = d0 + Σ di * ψi(u(M,s))\n")
        f.write("  ln(rhoP) = e0 + Σ ei * ψi(u(M,s))\n\n")
        f.write("Final:\n")
        f.write("  A_ded_hat = Σ_m exp(f_A(x(m)))\n")
        f.write("  P_ded_hat = Σ_m exp(f_P(x(m)))\n")
        f.write("  A_reuse_hat = exp(g_A(u)) * A_ded_hat\n")
        f.write("  P_reuse_hat = exp(g_P(u)) * P_ded_hat\n\n")

        f.write("Stage-A area coefficients (sorted by |coef|):\n")
        a = coef_dump(fa)
        f.write(f"  intercept={a['intercept']:.6g}\n")
        for item in a["coefficients"]:
            f.write(f"  {item['coef']:.6g} * {item['feature']}\n")
        f.write("\nStage-A power coefficients (sorted by |coef|):\n")
        p = coef_dump(fp)
        f.write(f"  intercept={p['intercept']:.6g}\n")
        for item in p["coefficients"]:
            f.write(f"  {item['coef']:.6g} * {item['feature']}\n")
        f.write("\nStage-B ln(rhoA) coefficients (sorted by |coef|):\n")
        ra = coef_dump(gb_a)
        f.write(f"  intercept={ra['intercept']:.6g}\n")
        for item in ra["coefficients"]:
            f.write(f"  {item['coef']:.6g} * {item['feature']}\n")
        f.write("\nStage-B ln(rhoP) coefficients (sorted by |coef|):\n")
        rp = coef_dump(gb_p)
        f.write(f"  intercept={rp['intercept']:.6g}\n")
        for item in rp["coefficients"]:
            f.write(f"  {item['coef']:.6g} * {item['feature']}\n")


def main() -> int:
    warnings.filterwarnings("ignore", message=r"Found unknown categories in columns.*", category=UserWarning)

    ap = argparse.ArgumentParser(description="Two-stage surrogate + reuse-ratio model per strategy.md")
    ap.add_argument("--csv", default="dp.csv")
    ap.add_argument("--alpha-a", type=float, default=1.0, help="Ridge alpha for Stage-A")
    ap.add_argument("--alpha-b", type=float, default=1.0, help="Ridge alpha for Stage-B")
    ap.add_argument("--group", default="clk_mhz", help="CV grouping column (clk_mhz or ps_name)")
    ap.add_argument("--splits", type=int, default=7)
    ap.add_argument("--cv-scope", choices=["all", "reuse"], default="all", help="Evaluate on all rows or reuse rows only")
    ap.add_argument("--out-metrics", default="dp_two_stage_metrics.json")
    ap.add_argument("--out-formula", default="dp_two_stage_formula.txt")
    ap.add_argument("--out-pred", default="dp_two_stage_predictions.csv")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    df["ps_name"] = df["precision_set"].apply(ps_name_from_path)

    metrics = cv_evaluate(
        df,
        group_col=args.group,
        n_splits=args.splits,
        alpha_a=args.alpha_a,
        alpha_b=args.alpha_b,
        scope=args.cv_scope,
    )

    fa, fp, gb_a, gb_p = fit_two_stage(df, alpha_a=args.alpha_a, alpha_b=args.alpha_b)
    pred = predict_two_stage(df, fa=fa, fp=fp, gb_a=gb_a, gb_p=gb_p)

    pred.to_csv(args.out_pred, index=False)
    write_formula(args.out_formula, fa=fa, fp=fp, gb_a=gb_a, gb_p=gb_p)
    with open(args.out_metrics, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    mean = metrics["mean"]
    print(
        f"CV scope={args.cv_scope} group={args.group} | "
        f"Area R2={mean['area_r2']:.4f} MAPE={mean['area_mape']*100:.2f}% RMSE={mean['area_rmse']:.4g} | "
        f"Power R2={mean['power_r2']:.4f} MAPE={mean['power_mape']*100:.2f}% RMSE={mean['power_rmse']:.4g}"
    )
    print(f"Wrote: {args.out_metrics}, {args.out_formula}, {args.out_pred}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
