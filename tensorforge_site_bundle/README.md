# TensorForge Site Bundle

This folder contains the TensorForge website and the minimal runtime data needed to run it as a self-contained package.

## Contents

- `data/clock_gated_area_power_measurements.csv`: full 4,445-point clock-gated synthesis dataset in the same schema as `data/area_power_measurements.csv`; DAC array names are normalized to the existing array labels, dynamic power is reported in mW, and `report_dir` values are portable relative paths.
- `tools/area_power_explorer/`: backend server and build/query tooling
- `web/area_power_explorer/`: frontend pages and interactive charts
- `artifacts/area_power_explorer/`: built SQLite database and prediction artifacts
- `data/`: required source CSV/script subset, including `clock_gated_updates_2026/` for public update summaries

## Usage

From this bundle root:

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

The bundle can be served directly or extracted into a dedicated deployment repository.
