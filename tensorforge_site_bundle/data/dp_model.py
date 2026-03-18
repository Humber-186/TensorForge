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


FP_FORMATS = ("FP16", "BF16", "FP8", "FP6", "FP4")
INT_FORMATS = ("INT8", "INT4")

# Best-effort mapping to format complexity for feature generation.
# (mantissa bits, exponent bits)
FP_BITS = {
    "FP16": (10, 5),
    "BF16": (7, 8),
    "FP8": (3, 4),  # assume e4m3
    "FP6": (2, 3),  # assume e3m2
    "FP4": (1, 2),  # assume e2m1
}
INT_BITS = {"INT8": 8, "INT4": 4}


def _safe_log2(x: float) -> float:
    return math.log2(x) if x > 0 else 0.0


def parse_precision_set_name(ps_name: str) -> tuple[dict[str, int], dict[str, int]]:
    """
    Parse `ps_name` (basename of `precision_set`) into format counts.

    Supports patterns like:
      - INT8INT4  -> INT8=1, INT4=1
      - MXFP8FP62FP4 -> FP8=1, FP6=1, FP4=2
      - MXFP16BF16FP8FP6FP4INT8INT4 -> FP16,BF16,FP8,FP6,FP4,INT8,INT4
    """
    fp_counts = {k: 0 for k in FP_FORMATS}
    int_counts = {k: 0 for k in INT_FORMATS}

    s = ps_name

    # Handle the "2FP4" compact notation (e.g. "FP62FP4").
    while "2FP4" in s:
        fp_counts["FP4"] += 2
        s = s.replace("2FP4", "", 1)

    # Count base tokens. This is intentionally simple because the dataset
    # contains a small closed set of `ps_name` values.
    for token in ("FP16", "BF16", "FP8", "FP6", "FP4"):
        if token in s:
            fp_counts[token] += 1

    for token in ("INT8", "INT4"):
        if token in s:
            int_counts[token] += 1

    return fp_counts, int_counts


@dataclass(frozen=True)
class FeatureRow:
    ps_name: str
    dimK: int
    clk_mhz: int
    mx: str
    out_kind: str
    midMat: int
    lut_fp4: int
    fp_format_count: int
    int_format_count: int
    total_format_count: int
    fp_mantissa_bits_total: int
    fp_exponent_groups: int
    fp_mantissa_groups: int
    int_bits_total: int
    has_fp_acc: int
    has_int_acc: int
    has_norm_align: int
    has_adder_tree: int
    has_mx_scale: int
    log2_dimK: float
    fp_mantissa_bits_x_dimK: int
    int_bits_x_dimK: int
    fp_format_count_x_dimK: int
    int_format_count_x_dimK: int


def featurize_row(row: pd.Series) -> FeatureRow:
    ps_name = row["ps_name"]
    dimK = int(row["dimK"])
    clk_mhz = int(row["clk_mhz"])
    mx = str(row["mx"])
    out_kind = str(row["out_kind"])
    midMat = int(row["midMat"])

    fp_counts, int_counts = parse_precision_set_name(ps_name)

    fp_format_count = sum(fp_counts.values())
    int_format_count = sum(int_counts.values())
    total_format_count = fp_format_count + int_format_count

    fp_mantissa_bits_total = sum(fp_counts[f] * FP_BITS[f][0] for f in FP_FORMATS)
    int_bits_total = sum(int_counts[i] * INT_BITS[i] for i in INT_FORMATS)

    fp_exp_bits = {FP_BITS[f][1] for f in FP_FORMATS if fp_counts[f] > 0}
    fp_mant_bits = {FP_BITS[f][0] for f in FP_FORMATS if fp_counts[f] > 0}

    fp_exponent_groups = len(fp_exp_bits)
    fp_mantissa_groups = len(fp_mant_bits)

    has_fp = 1 if fp_format_count > 0 else 0
    has_int = 1 if int_format_count > 0 else 0

    lut_fp4 = 1 if "LUT" in ps_name else 0
    has_mx_scale = 1 if mx.startswith("withMX") else 0

    log2_dimK = _safe_log2(dimK)

    return FeatureRow(
        ps_name=ps_name,
        dimK=dimK,
        clk_mhz=clk_mhz,
        mx=mx,
        out_kind=out_kind,
        midMat=midMat,
        lut_fp4=lut_fp4,
        fp_format_count=fp_format_count,
        int_format_count=int_format_count,
        total_format_count=total_format_count,
        fp_mantissa_bits_total=fp_mantissa_bits_total,
        fp_exponent_groups=fp_exponent_groups,
        fp_mantissa_groups=fp_mantissa_groups,
        int_bits_total=int_bits_total,
        has_fp_acc=has_fp,  # reuse FP32 accumulator if any FP exists
        has_int_acc=has_int,  # reuse INT32 accumulator if any INT exists
        has_norm_align=has_fp,  # reuse normalization+alignment across FP formats
        has_adder_tree=1 if total_format_count > 0 else 0,  # reuse adder tree
        has_mx_scale=has_mx_scale,
        log2_dimK=log2_dimK,
        fp_mantissa_bits_x_dimK=fp_mantissa_bits_total * dimK,
        int_bits_x_dimK=int_bits_total * dimK,
        fp_format_count_x_dimK=fp_format_count * dimK,
        int_format_count_x_dimK=int_format_count * dimK,
    )


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ps_name"] = df["precision_set"].apply(os.path.basename)
    feats = [featurize_row(r) for _, r in df.iterrows()]
    feat_df = pd.DataFrame([f.__dict__ for f in feats])
    # Keep original targets and identifiers for grouping/evaluation.
    out = pd.concat(
        [
            df[["variant", "design_name", "clk_mhz", "precision_set", "dimK", "mx", "out_kind", "midMat", "area_value", "total_value"]],
            feat_df.drop(columns=["clk_mhz", "dimK", "mx", "out_kind", "midMat"]),
        ],
        axis=1,
    )
    return out


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.clip(np.abs(y_true), 1e-9, None)
    return float(np.mean(np.abs(y_true - y_pred) / denom))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def make_pipeline(feature_cols_num: list[str], feature_cols_cat: list[str], alpha: float) -> Pipeline:
    pre = ColumnTransformer(
        transformers=[
            ("num", "passthrough", feature_cols_num),
            (
                "cat",
                OneHotEncoder(drop="first", handle_unknown="ignore", sparse_output=False),
                feature_cols_cat,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    return Pipeline([("pre", pre), ("reg", Ridge(alpha=alpha, random_state=0))])


def get_feature_names(fitted_pipeline: Pipeline) -> list[str]:
    pre = fitted_pipeline.named_steps["pre"]
    return list(pre.get_feature_names_out())


def evaluate_cv(
    df_feat: pd.DataFrame,
    y_col: str,
    group_col: str,
    alpha: float,
    use_log_target: bool,
    n_splits: int,
) -> dict:
    num_cols = [
        "dimK",
        "log2_dimK",
        "clk_mhz",
        "fp_format_count",
        "int_format_count",
        "total_format_count",
        "fp_mantissa_bits_total",
        "fp_exponent_groups",
        "fp_mantissa_groups",
        "int_bits_total",
        "has_fp_acc",
        "has_int_acc",
        "has_norm_align",
        "has_adder_tree",
        "has_mx_scale",
        "fp_mantissa_bits_x_dimK",
        "int_bits_x_dimK",
        "fp_format_count_x_dimK",
        "int_format_count_x_dimK",
        "lut_fp4",
    ]
    cat_cols = ["mx", "out_kind", "midMat"]

    X = df_feat[num_cols + cat_cols]
    y = df_feat[y_col].astype(float).to_numpy()
    groups = df_feat[group_col].astype(str).to_numpy()

    splitter = GroupKFold(n_splits=n_splits)

    fold_metrics = []
    for train_idx, test_idx in splitter.split(X, y, groups=groups):
        pipe = make_pipeline(num_cols, cat_cols, alpha=alpha)

        y_train = y[train_idx]
        y_test = y[test_idx]

        if use_log_target:
            y_train_fit = np.log(y_train)
        else:
            y_train_fit = y_train

        pipe.fit(X.iloc[train_idx], y_train_fit)

        y_pred = pipe.predict(X.iloc[test_idx])
        if use_log_target:
            y_pred = np.exp(y_pred)

        fold_metrics.append(
            {
                "r2": float(r2_score(y_test, y_pred)),
                "mape": float(mape(y_test, y_pred)),
                "rmse": float(rmse(y_test, y_pred)),
            }
        )

    r2s = [m["r2"] for m in fold_metrics]
    mapes = [m["mape"] for m in fold_metrics]
    rmses = [m["rmse"] for m in fold_metrics]
    return {
        "target": y_col,
        "group": group_col,
        "n_splits": n_splits,
        "alpha": alpha,
        "log_target": use_log_target,
        "folds": fold_metrics,
        "mean": {"r2": float(np.mean(r2s)), "mape": float(np.mean(mapes)), "rmse": float(np.mean(rmses))},
        "std": {"r2": float(np.std(r2s)), "mape": float(np.std(mapes)), "rmse": float(np.std(rmses))},
    }


def fit_final_model(df_feat: pd.DataFrame, y_col: str, alpha: float, use_log_target: bool) -> tuple[Pipeline, dict]:
    num_cols = [
        "dimK",
        "log2_dimK",
        "clk_mhz",
        "fp_format_count",
        "int_format_count",
        "total_format_count",
        "fp_mantissa_bits_total",
        "fp_exponent_groups",
        "fp_mantissa_groups",
        "int_bits_total",
        "has_fp_acc",
        "has_int_acc",
        "has_norm_align",
        "has_adder_tree",
        "has_mx_scale",
        "fp_mantissa_bits_x_dimK",
        "int_bits_x_dimK",
        "fp_format_count_x_dimK",
        "int_format_count_x_dimK",
        "lut_fp4",
    ]
    cat_cols = ["mx", "out_kind", "midMat"]

    X = df_feat[num_cols + cat_cols]
    y = df_feat[y_col].astype(float).to_numpy()

    pipe = make_pipeline(num_cols, cat_cols, alpha=alpha)
    y_fit = np.log(y) if use_log_target else y
    pipe.fit(X, y_fit)

    names = get_feature_names(pipe)
    coef = pipe.named_steps["reg"].coef_.reshape(-1)
    intercept = float(pipe.named_steps["reg"].intercept_)

    coef_pairs = sorted(zip(names, coef), key=lambda x: abs(x[1]), reverse=True)
    meta = {
        "target": y_col,
        "alpha": alpha,
        "log_target": use_log_target,
        "intercept": intercept,
        "coefficients": [{"feature": n, "coef": float(c)} for n, c in coef_pairs],
        "categorical_baseline": {
            "mx": sorted(df_feat["mx"].astype(str).unique())[0],
            "out_kind": sorted(df_feat["out_kind"].astype(str).unique())[0],
            "midMat": sorted(df_feat["midMat"].astype(str).unique())[0],
        },
    }
    return pipe, meta


def format_formula(meta: dict, top_k_terms: int | None = None) -> str:
    intercept = meta["intercept"]
    log_target = meta["log_target"]
    target = meta["target"]

    coeffs = meta["coefficients"]
    if top_k_terms is not None:
        coeffs = coeffs[:top_k_terms]

    lines = []
    if log_target:
        lines.append(f"ln({target}) = {intercept:.6g}")
    else:
        lines.append(f"{target} = {intercept:.6g}")

    for item in coeffs:
        feat = item["feature"]
        c = item["coef"]
        sign = "+" if c >= 0 else "-"
        lines.append(f"  {sign} {abs(c):.6g} * {feat}")

    if log_target:
        lines.append(f"=> {target} = exp(ln({target}))")
    return "\n".join(lines)


def main() -> int:
    warnings.filterwarnings(
        "ignore",
        message=r"Found unknown categories in columns.*",
        category=UserWarning,
    )

    ap = argparse.ArgumentParser(description="DP area/power modeling from dp.csv with sharing-strategy features.")
    ap.add_argument("--csv", default="dp.csv")
    ap.add_argument("--alpha", type=float, default=1.0, help="Ridge regularization strength")
    ap.add_argument("--splits", type=int, default=5, help="GroupKFold splits")
    ap.add_argument("--group", default="ps_name", help="Group column for CV (e.g. ps_name or clk_mhz)")
    ap.add_argument("--out-json", default="dp_model_metrics.json")
    ap.add_argument("--out-formula", default="dp_model_formula.txt")
    ap.add_argument("--out-features", default="dp_features.csv")
    ap.add_argument("--out-pred", default="dp_predictions.csv")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    df_feat = build_feature_frame(df)
    df_feat.to_csv(args.out_features, index=False)

    results = {"note": "No strategy.md found in repo; this is best-effort per user-described sharing strategy."}

    for target in ("area_value", "total_value"):
        r_lin = evaluate_cv(
            df_feat=df_feat,
            y_col=target,
            group_col=args.group,
            alpha=args.alpha,
            use_log_target=False,
            n_splits=args.splits,
        )
        r_log = evaluate_cv(
            df_feat=df_feat,
            y_col=target,
            group_col=args.group,
            alpha=args.alpha,
            use_log_target=True,
            n_splits=args.splits,
        )

        # Choose by mean MAPE.
        best = r_log if r_log["mean"]["mape"] < r_lin["mean"]["mape"] else r_lin
        results[target] = {"linear": r_lin, "log": r_log, "best": best}

    # Fit final models (best variant per target).
    formulas = []
    final_models = {}
    fitted_pipes: dict[str, Pipeline] = {}
    for target in ("area_value", "total_value"):
        best = results[target]["best"]
        pipe, meta = fit_final_model(
            df_feat=df_feat,
            y_col=target,
            alpha=args.alpha,
            use_log_target=bool(best["log_target"]),
        )
        fitted_pipes[target] = pipe
        final_models[target] = meta
        formulas.append(f"==== {target} (log_target={meta['log_target']}) ====")
        formulas.append(format_formula(meta, top_k_terms=None))
        formulas.append("")

    results["final_models"] = final_models

    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    with open(args.out_formula, "w", encoding="utf-8") as f:
        f.write("\n".join(formulas))

    # Predictions on the full dataset (useful for error analysis / plotting).
    pred_df = df_feat[["variant", "design_name", "ps_name", "clk_mhz", "dimK", "mx", "out_kind", "midMat", "area_value", "total_value"]].copy()
    # Rebuild the exact feature view used by each pipeline.
    # (ColumnTransformer selects a fixed column list, so we can pass the full feature table.)
    X_full = df_feat.drop(columns=["area_value", "total_value"])
    for target in ("area_value", "total_value"):
        yhat = fitted_pipes[target].predict(X_full)
        if bool(final_models[target]["log_target"]):
            yhat = np.exp(yhat)
        pred_df[f"{target}_pred"] = yhat
        pred_df[f"{target}_ape"] = np.abs(pred_df[target] - pred_df[f"{target}_pred"]) / np.clip(np.abs(pred_df[target]), 1e-9, None)
    pred_df.to_csv(args.out_pred, index=False)

    # Console summary.
    for target in ("area_value", "total_value"):
        best = results[target]["best"]
        mean = best["mean"]
        print(
            f"{target} best: log={best['log_target']} | "
            f"R2={mean['r2']:.4f} | MAPE={mean['mape']*100:.2f}% | RMSE={mean['rmse']:.4g}"
        )
    print(f"Wrote: {args.out_features}, {args.out_json}, {args.out_formula}, {args.out_pred}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
