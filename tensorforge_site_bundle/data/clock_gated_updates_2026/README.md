# TensorForge 2026 Clock-Gated Update Data

This directory contains public update data for the TensorForge 2026 clock-gated synthesis release.

- `clock_gated_area_power_measurements.csv`: full 4,445-point clock-gated synthesis dataset converted to the same 24-column schema as `data/area_power_measurements.csv`; DAC array names are normalized to the existing `InnerProductArray`/`OuterProductArray` labels, dynamic power is reported in mW for schema consistency, and `report_dir` values are portable relative paths.

- `fp4_lutfp4_clock_gated_1410.csv`: 1.41 GHz clock-gated FP4 arithmetic vs. LUT-FP4 comparison.
- `clock_gated_pareto_1410_points.csv`: clock-gated 1.41 GHz Pareto candidate points.
- `clock_gated_pareto_1410_front.csv`: clock-gated 1.41 GHz Pareto-front points.
- `dp_two_stage_metrics_retrained_2026-06-21.json`: retrained surrogate metrics; 560 synthesized dot-product samples, 7-fold CV, area/power MAPE 8.08% / 7.34%, R² 0.9859 / 0.9726.
- `dp_two_stage_formula_retrained_2026-06-21.txt`: corresponding retrained surrogate formula dump.

The surrogate model is for trend explanation and future candidate pruning only. Reported PPA points and Pareto fronts remain based on synthesized RTL.
