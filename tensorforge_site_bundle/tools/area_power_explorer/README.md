# Area/Power Explorer

本目录包含 MultiPrecisionTensorCore 本地面积/功耗查询网站的后端、构建脚本与服务入口。

---

## 1. 功能概览

网站当前支持：

- 查询 **（Measured Array）**
- 查询 **（Derived from Measured Unit）**
- 查询 **（Predicted Unit）** 回退结果
- 按公式展示：
  - **（Array Area = m × n × Unit Area = ...）**
  - **（Array Power = m × n × Unit Power = ...）**
  - **（Ops/cycle = 2 × m × n × k = ...）**
- 显示配置维度：
  - `m / n / k`
  - `clk`
  - `precision`
  - `MX / NV`
  - `norm / acc / out / midMat`

---

## 2. 代码位置

### 后端
- `tools/area_power_explorer/`

### 前端
- `web/area_power_explorer/`

### 测试
- `tests/area_power_explorer/`

### 生成产物
- `artifacts/area_power_explorer/`

---

## 3. 数据来源

### 主数据
- `plot-result/dc_area_power.csv`

### 基线/补充数据
- `plot-baseline/DPVSbaseline.csv`

### 预测模型数据
- `plot-reuse/figure/dp/dp.csv`

### 预测模型脚本
- `plot-reuse/figure/dp/dp_model.py`
- `plot-reuse/figure/dp/dp_two_stage_model.py`

---

## 4. 使用方法

### 4.1 先构建

```bash
python3 -m tools.area_power_explorer.main build
```

构建完成后会生成：

- `artifacts/area_power_explorer/area_power.db`
- `artifacts/area_power_explorer/models/...`

### 4.2 启动本地网站

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

浏览器访问：

- `http://127.0.0.1:8000/`

---

## 5. 部署/运行策略

### 默认行为：复用已有构建产物

为了避免每次启动都重新跑数据库构建和预测模型，当前 `build` / `serve` 默认会：

- 如果已有 `area_power.db`，则直接复用
- 如果已有 prediction artifacts，则直接复用

这样可以显著降低：

- 启动时间
- CPU 开销
- 内存峰值

更适合日常本地使用。

### 强制完整重建

如果你确实改了 CSV 或模型代码，希望重新生成全部产物：

```bash
python3 -m tools.area_power_explorer.main build --force-rebuild
```

或者：

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000 --force-rebuild
```

### 跳过预测产物

如果只想构建数据库，不想跑预测模型：

```bash
python3 -m tools.area_power_explorer.main build --skip-predictions
```

---

## 6. 预测模型说明

预测 artifacts 依赖已有 Python 环境：

```bash
plot-reuse/figure/dp/.venv/bin/python3
```

当前优化后的模型生成策略：

- single-stage surrogate：
  - 按 `clk_mhz` 分组评估
- two-stage reuse surrogate：
  - 按 `clk_mhz` 分组
  - 使用 `cv-scope=reuse`
- 训练 CSV 会先校验，确保只包含 dot-product 单元数据

---

## 7. 当前 UI 设计说明

当前页面中的查询项都使用**已有选项**，不再依赖自由文本输入。

### 当前选项来源
- `precision`：从数据库去重后生成用户侧 precision 选项
  - UI 中会去掉前缀冲突，例如：
    - `MXFP4 / NVFP4 / MXNVFP4` 在 UI 中显示为基础精度 `FP4`
    - `MX / NV` 通过单独选项控制
- `norm_kind`：
  - UI 中只暴露真正的浮点归一化选项
  - 不再显示 `4 / 8`
- `acc_kind / out_kind / midMat / clk / m / n / k`
  - 全部来自数据库现有值

---

## 8. 常见命令

### 构建
```bash
python3 -m tools.area_power_explorer.main build
```

### 强制重建
```bash
python3 -m tools.area_power_explorer.main build --force-rebuild
```

### 启动服务
```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

### 启动服务并强制重建
```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000 --force-rebuild
```

### 运行测试
```bash
python3 -m unittest discover -s tests/area_power_explorer -v
```

---

## 9. 当前已知限制

- 当前前端选项已经从自由输入改为 selector，但还没有做更复杂的“多级联动筛选”
- 某些 precision / MX / NV / norm / acc / out 组合在数据中本来就不存在，查询时会返回找不到数据
- 预测结果仍然属于 surrogate 结果，不应与实测结果混淆

---

## 10. 推荐本地使用流程

第一次：

```bash
python3 -m tools.area_power_explorer.main build
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

之后日常使用通常直接：

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000
```

只有在你更新了数据表或预测模型之后，再使用：

```bash
python3 -m tools.area_power_explorer.main serve --host 127.0.0.1 --port 8000 --force-rebuild
```
