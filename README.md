# TensorForge

TensorForge is a cleaned and publishable snapshot of RTL assets plus the bundled area/power explorer website.

## Repository Layout

- `RTL/`
  - `Array/`: flattened array-level RTL files
  - `ComputeUnit/`: flattened compute-unit RTL files
- `tensorforge_site_bundle/`
  - `tools/area_power_explorer/`: backend/build scripts
  - `web/area_power_explorer/`: bundled frontend
  - `artifacts/area_power_explorer/`: packaged DB/model artifacts
  - `data/`: website-required source datasets
