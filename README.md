# TensorForge: Synthesis-Backed Design Space Exploration of Multi-Precision Tensor Core Microarchitectures


## Abstract

Tensor cores drive most AI compute in GPGPUs, yet supporting multiple precisions under tight bandwidth, power, and area budgets remains a major microarchitecture challenge. We present **TensorForge**, a synthesis-backed framework for exploring multi-precision tensor core microarchitectures. TensorForge exposes compute-unit organization, precision configuration, and resource sharing as architectural knobs, generates synthesizable RTL for systematic comparison, and derives actionable design rules from over 600 configurations. We further demonstrate practical deployability by integrating TensorForge-generated designs into an open-source GPGPU. Compared with prior multi-precision compute-unit designs, a TensorForge-generated design point improves area efficiency by **1.77×** and energy efficiency by **1.49×** for FP8, and by **1.35×** and **3.04×** for FP4, while extending the area-power Pareto frontier.

## Highlights

- **Synthesis-backed exploration.** TensorForge turns architectural choices into synthesizable tensor-core RTL for controlled PPA comparison.
- **Multi-precision design knobs.** The framework exposes compute-unit organization, precision support, and resource-sharing policies as first-class parameters.
- **Large design sweep.** The released results cover **600+** synthesized configurations.
- **System-level deployability.** TensorForge-generated designs are demonstrated inside an open-source GPGPU stack.
- **Open artifact bundle.** The release includes RTL, a local area/power explorer website, synthesis-backed data, an open cost model, and extracted design rules.

## Main Result Snapshot

| Precision | Area Efficiency Gain | Energy Efficiency Gain |
| --- | ---: | ---: |
| FP8 | 1.77× | 1.49× |
| FP4 | 1.35× | 3.04× |

These gains are reported against prior multi-precision compute-unit designs and illustrate that TensorForge extends the area-power Pareto frontier rather than trading one objective for another.

## Released Artifact

This repository is organized as a paper artifact rather than a software-only code drop. It releases the following components:

- **Synthesizable tensor-core RTL** for systematic microarchitectural comparison.
- **A local website** for querying measured and estimate-backed area/power results.
- **Synthesis datasets** used to analyze multi-precision design trade-offs.
- **An open cost model** used by the explorer to render predictions when direct measurements are unavailable.
- **Open design rules** distilled from synthesis-backed exploration across the released design space.

## Quick Start

Launch the local explorer website as follows:

```bash
cd tensorforge_site_bundle
python3 -m tools.area_power_explorer.main build
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

## How to Inspect the Website Results

### 1. Query a design point

Open the **Query** page and choose the architectural fields exposed by the interface:

- `M`, `N`, `K`
- `Clock (MHz)`
- `Precision`
- `MX`, `NV`
- `Norm`, `Acc`, `Out`
- `midMat`
- `Prediction Fallback`

Click **Run Query** to retrieve the matching result.

### 2. Read the returned result type

The website distinguishes among three result sources:

- **Measured Array**: directly synthesized array-level data.
- **Derived from Measured Unit**: array-level results derived from measured dot-product units.
- **Predicted Unit**: estimate-backed results produced by the open cost model.

The result panel also shows the explicit formulas used to compute area, power, and operations per cycle, which makes each returned value auditable rather than opaque.

### 3. Inspect the other data views

Use the navigation bar at the top of the site to open:

- **PPA Explorer** for area-versus-power scatter plots across measured units and measured arrays.
- **Baseline Compare** for side-by-side comparison between prior designs and TensorForge-generated points.
- **Breakdown** for component-level area decomposition views.

Together, these pages provide both query-oriented inspection and global visual analysis of the released synthesis results.

## Open Cost Model

TensorForge releases the cost model used to support estimate-backed exploration on the website.

### Feature generation

The model derives features from the underlying precision-sharing strategy rather than from a flat label alone. The released feature set captures architectural signals such as:

- whether floating-point or integer accumulation resources are present,
- total mantissa capacity and mantissa grouping structure,
- exponent grouping structure,
- normalization/alignment behavior,
- LUT-oriented FP4 handling,
- and interaction terms tied to `dimK`.

This makes the model interpretable at the microarchitecture level: its inputs correspond to concrete resource-sharing decisions rather than purely symbolic configuration names.

### Model form

TensorForge fits **ridge-regression** surrogates with **log-linear** targets for both area and total power:

- `ln(area) = b0 + Σ bi·fi`, with `area = exp(ln(area))`
- `ln(total power) = c0 + Σ ci·fi`, with `total power = exp(ln(total power))`

This formulation provides a compact, transparent approximation layer for rapid exploration while remaining grounded in synthesis data.

### Predictive performance

The released model reports the following evaluation results:

| Validation Scope | Target | R² | MAPE |
| --- | --- | ---: | ---: |
| Leave-one-clock | Area | 0.9543 | 7.88% |
| Leave-one-clock | Total power | 0.9620 | 7.58% |
| Leave-one-configuration | Area | 0.8687 | 18.56% |
| Leave-one-configuration | Total power | 0.7607 | 18.73% |

These results show that the surrogate is strong for interpolation across clocks and still informative under stricter held-out configuration evaluation.

### Role in the website

When a queried design point does not have a directly released measurement, the explorer can use the open cost model to render **estimate-backed results** instead of returning an empty view. This enables fast what-if inspection without hiding which outputs are measured and which are predicted.

## Open Design Rules

Beyond raw RTL and synthesis outputs, TensorForge releases **actionable design rules** extracted from the full synthesis campaign. These rules summarize how compute-unit organization, precision composition, and resource-sharing choices shape area and power efficiency across the explored design space.

In other words, the repository is intended not only to reproduce numbers, but also to help researchers and hardware designers reuse the lessons behind those numbers.


