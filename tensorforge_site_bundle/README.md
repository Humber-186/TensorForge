# TensorForge Site Bundle

This folder contains the TensorForge website and the minimal runtime data needed to run it as a self-contained package.

## Contents

- `data/clock_gated_area_power_measurements.csv`: full 4,445-point clock-gated synthesis dataset in the same schema as `data/area_power_measurements.csv`; DAC array names are normalized to the existing array labels, dynamic power is reported in mW, and `report_dir` values are portable relative paths.
- `tools/area_power_explorer/`: offline export/model tooling and the optional legacy Python API
- `web/area_power_explorer/`: readable page/chart/query source and the English/Chinese interface dictionary
- `artifacts/area_power_explorer/site/`: generated static website; all website data is embedded in the output `explorer.mjs` (ignored by Git)
- `artifacts/area_power_explorer/`: built SQLite database and prediction artifacts
- `data/`: required source CSV/script subset, including `clock_gated_updates_2026/` for public update summaries

## Usage

From this bundle root:

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

Publish the generated contents of `artifacts/area_power_explorer/site/` to a static host. No backend
API or model runtime is required; matching and calculations run in the browser.
The site works at the host root or under a subdirectory.

After changing CSV data or offline predictions, rebuild the program with its embedded data:

```bash
python3 -m tools.area_power_explorer.main export-static
```

Use `export-static --out-dir /tmp/tensorforge-site` to produce a standalone site
directory. Export uses the source measurements and existing prediction artifacts
without requiring the model virtual environment or retraining the models.
All measurements, predictions, baseline data, and breakdown data are included in
the browser program; the website does not download individual data files.

The repository's `.github/workflows/pages.yml` builds, checks, and deploys this
website to GitHub Pages. A maintainer must select GitHub Actions as the Pages
publishing source. English/Chinese selection persists between pages, and the
interface and charts follow the system color scheme.

The default `serve` command builds and previews the static website without model
dependencies. Use `serve-api` only for the optional legacy Python query API.
