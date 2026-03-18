# TensorForge

TensorForge is a cleaned and publishable snapshot of RTL assets plus the bundled area/power explorer website.

## Repository Layout

- `RTL/`
  - `rtl_test/Array/`: array-level generated SystemVerilog
  - `rtl_test/ComputeUnit/`: compute-unit generated SystemVerilog
  - `rtl/`, `rtl-base-prec/`, `rtl-prec/`, `rtl-sr/`: additional RTL collections preserved from the local workspace
- `tensorforge_site_bundle/`
  - `tools/area_power_explorer/`: backend/build scripts
  - `web/area_power_explorer/`: bundled frontend
  - `artifacts/area_power_explorer/`: packaged DB/model artifacts
  - `plot-result/`, `plot-baseline/`, `plot-Ventus/`, `plot-reuse/`: website-required source datasets

## Publishing Rules

- Local planning notes under `docs/plans/` are intentionally ignored.
- Any Verilog/SystemVerilog file whose filename contains `FP4` is intentionally excluded from GitHub publication.
- Bundle artifacts were sanitized to remove machine-specific absolute paths before publication.
