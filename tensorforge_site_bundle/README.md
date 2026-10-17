# TensorForge Site Bundle

This folder contains the TensorForge website and the minimal runtime data needed to run it as a self-contained package.

## Contents

- `data/clock_gated_area_power_measurements.csv`: full 4,445-point clock-gated synthesis dataset in the same schema as `data/area_power_measurements.csv`; DAC array names are normalized to the existing array labels, dynamic power is reported in mW, and `report_dir` values are portable relative paths.
- `tools/area_power_explorer/`: offline export/model tooling and the optional legacy Python API
- `web/area_power_explorer/`: readable page/chart/query source and the English/Chinese interface dictionary
- `artifacts/area_power_explorer/site/`: generated static website; website data is embedded in the output `explorer.mjs` and `reuse-data.mjs` (ignored by Git)
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

## Precision Reuse Lab

Open `http://127.0.0.1:8000/reuse.html` after starting the server. The other pages also link to **Precision Reuse Lab**.

- Start with a general-purpose, floating-point, or low-bit inference scenario, then choose required formats individually.
- Adjust base K (`2, 4, 8, 16, 32`), synthesis clock target (`1250–1500 MHz`, seven recorded points), and area budget relative to dedicated strategy S14.
- Compare all 18 paper sharing templates, or filter unified/hybrid/dedicated families. Click a strategy to inspect its constituent datapaths; click a precision to trace which units support it.
- Expand a datapath to inspect its exact CSV source row, variant, and synthesis configuration.
- Copy the experiment URL to restore controls and strategy selection. Export CSV includes all 18 results, constituent rows, and the exact area formula.

The static exporter embeds 525 canonical unit measurements and the 18 templates in `reuse-data.mjs`. The browser computes all 630 operating points, format pruning, area budgets, and rankings using `reuse-model.mjs`; it requests no API or separate JSON data. Source HTML/JS use relative URLs and work under `/TensorForge/` or another static-host subdirectory.

Measurements come directly from `data/clock_gated_area_power_measurements.csv`, matching the current query explorer. Its released DC schema leaves `area_unit` blank for square micrometres; total power is explicitly in mW. The loader validates both fields against this schema. Export does not train models. Partial-format experiments prune whole unused datapaths; retained shared units keep their full measured area. Strategies S07/S12/S16 preserve overlapping BF16 support. FP4 lookup-table strategies use the same numeric format as arithmetic FP4.

Areas are constituent sums, not separately synthesized integrated wrappers. The lab reports area and makes no integrated-power, equal per-format throughput, or timing-closure claim. With all formats, K=32 and 1410 MHz, S01 is 50095.248221 μm² and S14 is 116005.344502 μm² (56.8% savings).

## Validation

From the repository root, run the dependency-free backend checks:

```bash
python3 -m unittest discover -s tests/area_power_explorer -v
```

For browser integration checks, serve the exported directory on port 8018 under `/TensorForge/` (or set `EXPLORER_URL` to its base URL), install Playwright in your test environment, and run:

```bash
node tests/area_power_explorer/reuse_browser.mjs
```

Optional environment variables: `PLAYWRIGHT_MODULE` for an existing Playwright module path, `CHROME_BIN` for an existing Chromium executable, and `SCREENSHOT_DIR` for desktop/mobile captures. The checks cover all 18 strategies and 35 operating points, whole-unit pruning, LUT-FP4, overlapping BF16, budget controls, keyboard interaction, URL restoration, CSV export, responsive layouts, and missing-measurement/static-module error states. This optional extended suite uses Playwright; the standard CI browser suite uses only Node and Chrome.
