# TensorForge 网站与构建工具

网站采用纯静态托管。配置匹配、阵列面积/功耗换算和图表计算在浏览器执行，所有网站数据编入发布程序，不单独下载 JSON。

## 日常预览

从 `tensorforge_site_bundle/` 目录运行：

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

访问 `http://127.0.0.1:8000/`。此命令重新导出数据并启动静态 HTTP 服务，不训练模型，也不依赖 `data/.venv`。

界面支持简体中文和英文：首次跟随浏览器语言，之后记住用户选择。系统切换深色/浅色模式时，页面、控件和图表自动同步。
选项旁的圆形 `i` 提示支持悬停、键盘聚焦和点击，按 Esc 可关闭。
图表按容器宽度重新布局，保持文字可读；手机上的面积分解图例移至环图下方。悬停或轻触数据点、柱状图、扇区及模块图例即可查看详细数值。

## 源码与发布目录

| 路径 | 用途 |
| --- | --- |
| `web/area_power_explorer/` | 可维护的 HTML、CSS、JavaScript 源码 |
| `web/area_power_explorer/ui.mjs` | 双语文案、语言偏好、说明提示的交互 |
| `web/area_power_explorer/explorer.mjs` | 浏览器查询逻辑；源码仅保留数据占位符 |
| `artifacts/area_power_explorer/site/` | 默认静态发布目录，已被 Git 忽略 |
| `artifacts/area_power_explorer/area_power.db` | 离线 SQLite 数据产物 |
| `artifacts/area_power_explorer/models/` | 离线模型预测、公式与指标 |
| `tests/area_power_explorer/` | 数据一致性、查询对齐和真实浏览器检查 |

只部署构建生成的静态目录。导出命令会把数据嵌入该目录的 `explorer.mjs`，不会把生成数据写回源码；禁止将源码目录用作导出目标。

## 导出与 GitHub Pages

```bash
python3 -m tools.area_power_explorer.main export-static
# 导出独立目录：
python3 -m tools.area_power_explorer.main export-static --out-dir /tmp/tensorforge-site
```

导出使用主 CSV 重新构建测量数据，复用已有预测产物，生成完整静态页面和 `.nojekyll`。相对资源链接支持 `/TensorForge/` 子目录部署。

仓库中的 `.github/workflows/pages.yml` 会执行数据检查、JavaScript 语法检查和 Chrome 界面检查，然后构建 `_site/`：

- PR 运行检查与构建。
- `main` 的推送与针对 `main` 的手动运行会部署到 GitHub Pages。
- 发布任务只上传 `_site/`，不上传 RTL、CSV、数据库或后端工具。
- 网站构建和检查使用 Python 标准库、Node 24 与 Chrome；不安装或运行模型训练依赖。

首次发布需要仓库维护者在 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 数据来源与查询顺序

主数据为 `data/clock_gated_area_power_measurements.csv` 的 4,445 条时钟门控综合记录。
`data/area_power_measurements.csv` 保留为历史数据，不参与默认数据库构建。
另外使用基线对比 CSV、Ventus 模块面积 CSV 和两阶段模型的离线预测表。

浏览器按下列顺序匹配：

1. **综合阵列数据**：完整匹配 `M/N/K`、频率、精度、MX/NV、Norm/Acc/Out 和 midMat，直接使用阵列报告。
2. **综合单元推导**：匹配单元配置，面积与功耗乘以 `M × N`，属于阵列估算。
3. **离线模型预测**：开启预测回退时，查已有预测表，并作同样的阵列换算。
4. 都没有匹配记录时，返回无数据；不会为任意新配置现场运行模型。

每周期理论操作数为 `2 × M × N × K`，理论吞吐为该操作数乘以目标时钟频率。乘法与加法各计一次操作。

下拉选项来自综合数据。组合精度名称按格式分隔显示，查询值仍保留原始标识。
浮点 Norm 选项为 FP16/FP32；整数报告中的代码 `4/8` 分别显示为 INT4/INT8 路径，便于查询整数配置。
源数据并不覆盖所有选项组合，因此部分组合会返回无数据。

## 离线数据库与模型构建

以下命令供数据和模型维护使用，普通静态展示无需运行：

```bash
python3 -m tools.area_power_explorer.main build
python3 -m tools.area_power_explorer.main build --force-rebuild
python3 -m tools.area_power_explorer.main build --skip-predictions
```

默认 `build` 复用已有数据库和预测产物。修改数据或模型并准备好训练环境后，使用 `--force-rebuild` 完整重建。
`build` 完成后也会更新默认静态发布目录。单独更新综合 CSV 时，`export-static` 始终使用当前 CSV，不复用旧数据库。

模型训练入口依赖 `data/.venv/bin/python3` 及 NumPy、pandas、scikit-learn；该环境不随仓库提交。
训练集 `data/dp_training.csv` 是主数据中的 560 条点积单元记录，构建预测产物前会逐字段验证一致性。
修改综合数据后，应同步训练子集、预测 CSV、公式和验证指标，避免混用不同版本。

- 单阶段模型：`data/dp_model.py`，按 `clk_mhz` 分组验证。
- 两阶段模型：`data/dp_two_stage_model.py`，网页预测表使用 `scope=reuse` 的产物。
- 复用范围的验证指标只评价复用样本，不代表所有配置的预测误差。

兼容的 Python API 可显式运行：

```bash
python3 -m tools.area_power_explorer.main serve-api --host 127.0.0.1 --port 8000
```

## 修改后的检查

从仓库根目录运行：

```bash
python3 -m unittest discover -s tests/area_power_explorer -v
python3 -m tensorforge_site_bundle.tools.area_power_explorer.main export-static
node tests/area_power_explorer/browser_smoke.mjs
```

浏览器检查使用 Node 24 内置的 WebSocket 和本机 Chrome，不需要 npm 包。
可用 `CHROME_BIN` 指定 Chrome 可执行文件，用 `--site-dir` 指定发布目录，用 `--screenshots /tmp/tensorforge-ui` 保存检查截图。

双语文案修改放在 `ui.mjs` 的两个字典中，并保持键完整对应。配置值和源模块名保持原始标识。
直接访问源码目录或以 `file://` 打开不属于支持的预览方式，请使用 `serve` 或构建后运行静态 HTTP 服务。
