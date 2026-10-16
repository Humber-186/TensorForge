# TensorForge Site Bundle

This folder contains the TensorForge website and the minimal runtime data needed to run it as a self-contained package later.

## Contents

- `tools/area_power_explorer/`: backend server and build/query tooling
- `web/area_power_explorer/`: frontend pages and interactive charts
- `artifacts/area_power_explorer/`: built SQLite database and prediction artifacts
- `data/`: required source CSV/script subset

## Usage

From this bundle root:

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

The bundle is meant to be easy to extract into a dedicated repo later.

## Precision Reuse Lab

Open `http://127.0.0.1:8000/reuse.html` after starting the server. The other pages also link to **Precision Reuse Lab**.

- Start with a general-purpose, floating-point, or low-bit inference scenario, then choose required formats individually.
- Adjust base K (`2, 4, 8, 16, 32`), synthesis clock target (`1250–1500 MHz`, seven recorded points), and area budget relative to dedicated strategy S14.
- Compare all 18 paper sharing templates, or filter unified/hybrid/dedicated families. Click a strategy to inspect its constituent datapaths; click a precision to trace which units support it.
- Expand a datapath to inspect its exact CSV source row, variant, and synthesis configuration.
- Copy the experiment URL to restore controls and strategy selection. Export CSV includes all 18 results, constituent rows, and the exact area formula.

`/api/reuse-data` returns templates and 630 derived operating points. It uses exact canonical measurements from `data/dp_training.csv`, independently of the query database or surrogate model. Partial-format experiments prune whole unused datapaths; retained shared units are never proportionally discounted. Strategies S07/S12/S16 preserve their source composition’s overlapping BF16 support. FP4 lookup-table strategies use the same numeric format as arithmetic FP4.

Areas are constituent sums, not measurements of separately synthesized integrated wrappers. The bundled data differs from later clock-gated paper datasets; its CSV does not record gating settings or timing slack. The lab reports area and makes no integrated-power or equal per-format throughput claim.

## Validation

From the repository root, run the dependency-free backend checks:

```bash
python3 -m unittest discover -s tests/area_power_explorer -v
```

For browser integration checks, start the explorer on port 8018 (or set `EXPLORER_URL`), install Playwright in your test environment, and run:

```bash
node tests/area_power_explorer/reuse_browser.mjs
```

Optional environment variables: `PLAYWRIGHT_MODULE` for an existing Playwright module path, `CHROME_BIN` for an existing Chromium executable, and `SCREENSHOT_DIR` for desktop/mobile captures. The checks cover all 18 strategies and 35 operating points, whole-unit pruning, LUT-FP4, overlapping BF16, budget controls, keyboard interaction, URL restoration, CSV export, responsive layouts, and missing-measurement/error states.
