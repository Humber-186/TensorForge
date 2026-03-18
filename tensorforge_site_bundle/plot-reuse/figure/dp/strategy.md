“二阶段 surrogate + 复用策略投影”的公式与伪代码（含训练与推理）。我按你现有 CSV 字段来定义符号，并把“dedicated=求和，reuse=投影/修正”写成统一表达。

---

## 1) 记号与输入输出

* 单模式（单精度）点积单元配置：(m)
  例如 `precision=INT4, dimK=64, mx=noMX, norm_kind=4, acc_kind=INT32, out_kind=INT32, midMat=0, clk=1250`.

* 多精度集合：(M={m_1,\dots,m_n})
  例如 (M={\text{INT8},\text{INT4}}) 且共享同一组其它 knobs（或允许各自不同）。

* 复用策略：(s)
  包含：分组方式（unified/hybrid/dedicated）+ 共享哪些子模块（share_mul/share_norm/…）+ mux 复杂度等。

* 标签（从综合/报告读出）：面积 (A)，功耗 (P)（可拆 (P^{dyn},P^{leak})），可选时序 (T) 或 (F_{max})。

---

## 2) 特征向量定义

### 2.1 单模式特征（来自你 CSV 的列）

把每个单模式配置 (m) 编成向量：
[
\mathbf{x}(m)=\text{Encode}(\text{clk},\text{precision},\text{dimK},\text{mx},\text{norm},\text{acc},\text{out},\text{midMat})
]
（precision/mx/norm/acc/out 用 one-hot；dimK/clk 数值归一化）

### 2.2 策略特征

[
\mathbf{e}(s)=\text{Encode}(\text{grouping},\text{share_mul},\text{share_shifter},\text{share_adder},\text{share_norm},\text{share_acc},\text{mux_inputs},\ldots)
]

### 2.3 集合层聚合特征（可选但强烈推荐）

为了让“同一策略对不同规模/不同 bitwidth 组合”可泛化，做一个集合摘要：
[
\mathbf{h}(M)=\text{Agg}\big({\mathbf{x}(m)}_{m\in M}\big)
]
常用 Agg：sum / mean / max / [sum, max, mean] 拼接。

---

## 3) 两阶段模型的核心公式

### Stage-A：单模式 PPA surrogate（base model）

[
\hat{A}(m)=f_A(\mathbf{x}(m)),\qquad
\hat{P}(m)=f_P(\mathbf{x}(m))
]
（也可同时预测 (\hat{P}^{dyn},\hat{P}^{leak})）

### Dedicated 组合（不复用 = 求和）

[
\hat{A}*{ded}(M)=\sum*{m\in M}\hat{A}(m),\qquad
\hat{P}*{ded}(M)=\sum*{m\in M}\hat{P}(m)
]

### Stage-B：复用策略修正（reuse = 投影/压缩 + mux 开销）

推荐用“比值修正”（跨 dimK 更稳）：

[
\rho_A(M,s)=\frac{A_{reuse}(M,s)}{A_{ded}(M)},\qquad
\rho_P(M,s)=\frac{P_{reuse}(M,s)}{P_{ded}(M)}
]

训练一个小模型：
[
(\hat{\rho}_A,\hat{\rho}_P)=g\big(\mathbf{h}(M),\mathbf{e}(s)\big)
]

推理时输出：
[
\boxed{
\hat{A}*{reuse}(M,s)=\hat{\rho}*A(M,s)\cdot \hat{A}*{ded}(M)
}
]
[
\boxed{
\hat{P}*{reuse}(M,s)=\hat{\rho}*P(M,s)\cdot \hat{P}*{ded}(M)
}
]

> 这组式子就是你想要的“一个公式建模多种复用/不复用”：dedicated 就等价于 (\rho=1) 且 (g) 不启用；reuse 则通过 (g) 预测“投影后的压缩系数”。

### （可选）更像“投影”的写法

你也可以把 Stage-B 写成显式投影算子：
[
\mathbf{z}(M,s)=\mathbf{P}*s\Big(\sum*{m\in M}\mathbf{x}(m)\Big)
]
[
(\hat{A}*{reuse},\hat{P}*{reuse})=F(\mathbf{z})
]
但工程上两阶段（先 (\hat A(m)) 再学 (\rho)）更省数据、更好解释。

### 3.1) 乘法器“复用/不复用”的可解释性公式（可写进 DSE 论文）

你现在的 `dp_two_stage_model.py` 里，其实已经隐含了一条很清晰的“乘法器是否可复用”的数学规律：**看多精度集合里 FP 路径需要多少种 mantissa 位宽**（`fp_mantissa_groups`），如果只有 1 种，则 `share_mul=1`，否则 `share_mul=0`。

下面把它抽象成论文可用的定义与公式（兼容你当前的 feature 设计：`fp_mantissa_groups / fp_exponent_groups / mux_inputs`）。

**定义 1（精度集合与子集）**：给定多精度集合 \(M\)，令
\[
M_{\mathrm{FP}}=\{m\in M\mid m\ \text{为 FP 格式}\},\quad
M_{\mathrm{INT}}=\{m\in M\mid m\ \text{为 INT 格式}\}.
\]

**定义 2（位宽映射与“组数”）**：对每个 FP 模式 \(m\in M_{\mathrm{FP}}\)，记其 mantissa 位宽为 \(b_m\)；对每个 FP 模式记 exponent 位宽为 \(e_m\)。定义
\[
G_{\mathrm{mul}}(M)=\left|\{b_m\mid m\in M_{\mathrm{FP}}\}\right|,\qquad
G_{\exp}(M)=\left|\{e_m\mid m\in M_{\mathrm{FP}}\}\right|.
\]
以及 mux 输入数（与你代码里的 `mux_inputs` 一致）：
\[
N_{\mathrm{mux}}(M)=|M|.
\]

**定义 3（复用可行性指示变量）**：把“是否能用一套 FP 乘法器覆盖所有 FP 模式”写成指示函数
\[
r_{\mathrm{mul}}(M)=\mathbb{I}\!\left[G_{\mathrm{mul}}(M)=1\ \wedge\ |M_{\mathrm{FP}}|>0\right],
\]
同理 exponent 路径：
\[
r_{\exp}(M)=\mathbb{I}\!\left[G_{\exp}(M)=1\ \wedge\ |M_{\mathrm{FP}}|>0\right].
\]
> 这就是你现在的 `share_mul/share_exp` 规则的数学写法：**“组数=1 ⇒ 可复用；组数>1 ⇒ 不能完全复用（至少要分组/多实例）”。**

**定义 4（乘法器面积的 dedicated vs. reuse）**：令 \(a_{\mathrm{mul}}(b)\) 表示“支持 mantissa 位宽为 \(b\) 的 FP 乘法器”面积（或等价面积度量）。则：

- Dedicated（不复用，直接相加）：
  \[
  A^{\mathrm{ded}}_{\mathrm{mul}}(M)=\sum_{m\in M_{\mathrm{FP}}} a_{\mathrm{mul}}(b_m).
  \]
- Full reuse（完全复用，用一套覆盖所有 FP 模式；当且仅当 \(r_{\mathrm{mul}}(M)=1\)）：
  \[
  A^{\mathrm{reuse}}_{\mathrm{mul}}(M)=a_{\mathrm{mul}}\!\left(\max_{m\in M_{\mathrm{FP}}} b_m\right)\ +\ A_{\mathrm{mux,mul}}\!\big(N_{\mathrm{mux}}(M)\big).
  \]

其中 \(A_{\mathrm{mux,mul}}(\cdot)\) 是为多模式选择/路由引入的 mux/control 开销（可用线性/对数模型近似，也可直接交给 Stage-B 学习）。

**一个最“可解释”的闭式近似**：若采用常见的“乘法器复杂度近似随位宽平方增长”的模型
\[
a_{\mathrm{mul}}(b)\approx \kappa_{\mathrm{mul}}\cdot b^2,
\]
则当 \(r_{\mathrm{mul}}(M)=1\) 且忽略 mux 开销时，有
\[
\rho_{\mathrm{mul}}(M)\triangleq \frac{A^{\mathrm{reuse}}_{\mathrm{mul}}(M)}{A^{\mathrm{ded}}_{\mathrm{mul}}(M)}
\approx
\frac{\big(\max_{m\in M_{\mathrm{FP}}} b_m\big)^2}{\sum_{m\in M_{\mathrm{FP}}} b_m^2}.
\]
它直接揭示了“复用收益”的结构性规律：**模式数越多、位宽差异越小（更容易同组），\(\rho_{\mathrm{mul}}\) 越小 ⇒ 面积越省；反之（位宽分组多）复用受限。**

> 实际工程里，你可以把 \(\rho_{\mathrm{mul}}\)、\(G_{\mathrm{mul}}(M)\)、\(N_{\mathrm{mux}}(M)\) 作为可解释特征；再由 Stage-B 学习剩余误差（布局布线、时序约束、额外逻辑等带来的偏差）。

### 3.2) 点积单元“全组件”复用：可行性指示函数 + 成本模型（论文可用模板）

你现在 `dp_two_stage_model.py` 的 Stage-B 特征里，已经把“组件是否可复用”抽象成一组二值量：
`share_mul, share_exp, share_norm_align, share_fp_acc, share_int_acc, share_adder_tree, mux_inputs`。
这可以写成一个统一的、可解释的组件级模型（并且能直接映射回你现有特征）。

**定义 5（组件集合）**：把点积单元拆成组件集合
\[
\mathcal{C}=\{\text{mul},\ \text{exp},\ \text{norm/align},\ \text{acc}_{fp},\ \text{acc}_{int},\ \text{adder-tree},\ \text{mux/ctrl}\}.
\]

**定义 6（组件参数与“组数”）**：对每个模式 \(m\in M\) 与组件 \(c\in\mathcal{C}\)，定义一个能决定该组件硬件“形态/规模”的离散参数 \(w_c(m)\)（例如：FP mul 的 mantissa 位宽、exp 单元的 exponent 位宽、norm_kind/out_kind、acc 位宽类型等）。令
\[
G_c(M)=\left|\{w_c(m)\mid m\in M,\ c\ \text{在}\ m\ \text{中启用}\}\right|.
\]

**定义 7（复用可行性指示变量）**：组件 \(c\) “可用一套硬件覆盖所有相关模式”的条件是组数为 1：
\[
r_c(M)=\mathbb{I}\!\left[G_c(M)=1\right].
\]
它对应你代码里的 `share_*`（例如 `share_mul` 就是 \(r_{\mathrm{mul}}(M)\)，`share_exp` 就是 \(r_{\exp}(M)\)；而 `share_norm_align/share_fp_acc/share_int_acc` 在你当前数据里相当于更强的先验：只要存在 FP/INT 子集就默认可共享）。

**定义 8（Dedicated 成本：不复用 = 按模式相加）**：对面积/功耗任意一个成本指标 \(J\in\{A,P\}\)，定义
\[
J^{\mathrm{ded}}(M)=\sum_{m\in M} J(m)
  \approx \sum_{m\in M}\sum_{c\in\mathcal{C}} j_c\!\big(w_c(m)\big),
\]
其中 \(j_c(\cdot)\) 是组件 \(c\) 的成本函数（可用解析近似，也可用 Stage-A 的单模式 surrogate 隐式给出）。

**定义 9（Reuse 成本：复用 = 组级投影 + mux/ctrl 开销）**：复用后，组件 \(c\) 的 dedicated 求和被“投影”为按组求和（每组取 worst-case 形态），并叠加 mux/ctrl：
\[
J^{\mathrm{reuse}}(M,s)\approx
\sum_{c\in\mathcal{C}\setminus\{\mathrm{mux/ctrl}\}}
\sum_{g\in \{w_c(m)\}}\ j_c(g)
\;+\; j_{\mathrm{mux/ctrl}}\!\big(|M|,s\big).
\]
当 \(G_c(M)=1\) 时，上式就退化为“只需要一套组件（worst-case）+ mux 开销”；当 \(G_c(M)>1\) 时，至少需要多套（每个组一套），这正是“复用/不复用规律”的结构来源。

**把组件写实一点（对应你当前的 `share_*`）**：

- 乘法器：\(w_{\mathrm{mul}}(m)=b_m\)（FP mantissa 位宽）；组数 \(G_{\mathrm{mul}}(M)=|\{b_m\}|\)；对应 `fp_mantissa_groups/share_mul`。
- 指数/exp 路径：\(w_{\exp}(m)=e_m\)（FP exponent 位宽）；组数 \(G_{\exp}(M)=|\{e_m\}|\)；对应 `fp_exponent_groups/share_exp`。
- norm/align：\(w_{\mathrm{norm}}(m)\) 可取 `norm_kind`（或与 `out_kind` 组成 tuple）；组数为 1 则可共享；对应 `share_norm_align`（你当前数据里把它简化为 “只要有 FP 就共享”）。
- 累加器：\(w_{\mathrm{acc}}(m)\) 可取 `acc_kind`（FP/INT 分开更清晰）；对应 `share_fp_acc/share_int_acc`。
- adder-tree：若对所有模式结构一致，可直接 \(r_{\mathrm{adder}}(M)=1\)；对应 `share_adder_tree=1`。

> 实践上：你可以把 \(\{G_c(M)\}\)、\(|M|\)、以及显式策略向量 \(s\)（共享哪些模块、mux 规模等）作为可解释输入；再用你现有的 Stage-B（学习 \(\rho\) 或残差）拟合真实综合结果。

---

## 4) 伪代码（论文风格）

### Algorithm 1：训练两阶段 PPA 代理模型（Train）

```text
Algorithm 1: Two-Stage Surrogate Training for Dot-Product Unit Reuse DSE

Input:
  D_base  : dataset of single-precision designs
            each record r contains (m_r, A_r, P_r) from synthesis
  D_reuse : dataset of multi-precision reused designs
            each record q contains (M_q, s_q, A_reuse_q, P_reuse_q)
  Encode(.) : feature encoder for x(m), e(s)
  Agg(.)    : set aggregator to build h(M)
Output:
  f_A, f_P : base predictors for single-mode area/power
  g_A, g_P : reuse ratio predictors for area/power

1:  // ----- Stage-A: train base models for single mode -----
2:  for each record r in D_base do
3:      x_r ← Encode(m_r)                 // x(m)
4:      yA_r ← A_r ;  yP_r ← P_r
5:  end for
6:  Train f_A to fit yA from x;  Train f_P to fit yP from x

7:  // ----- Stage-B: build reuse ratio labels and train ratio models -----
8:  for each record q in D_reuse do
9:      // predict dedicated baseline via Stage-A
10:     A_ded_hat ← 0 ;  P_ded_hat ← 0
11:     for each mode m in M_q do
12:         A_ded_hat ← A_ded_hat + f_A(Encode(m))
13:         P_ded_hat ← P_ded_hat + f_P(Encode(m))
14:     end for

15:     // ratio labels (projection / compression factors)
16:     rhoA_q ← A_reuse_q / A_ded_hat
17:     rhoP_q ← P_reuse_q / P_ded_hat

18:     h_q ← Agg({Encode(m) | m ∈ M_q})
19:     e_q ← Encode(s_q)
20:     u_q ← Concat(h_q, e_q)
21:  end for

22: Train g_A to fit rhoA from u;  Train g_P to fit rhoP from u
23: return (f_A, f_P, g_A, g_P)
```

### Algorithm 2：给定复用策略，预测 reused 设计的 PPA（Infer）

```text
Algorithm 2: PPA Inference for a Given Reuse Strategy

Input:
  M : set of modes (precisions/configs)
  s : reuse strategy descriptor
  f_A, f_P : base single-mode predictors
  g_A, g_P : ratio predictors
Output:
  A_reuse_hat, P_reuse_hat : predicted area/power of reused multi-precision design

1:  A_ded_hat ← 0 ;  P_ded_hat ← 0
2:  for each mode m in M do
3:      A_ded_hat ← A_ded_hat + f_A(Encode(m))
4:      P_ded_hat ← P_ded_hat + f_P(Encode(m))
5:  end for

6:  h ← Agg({Encode(m) | m ∈ M})
7:  e ← Encode(s)
8:  u ← Concat(h, e)

9:  rhoA_hat ← g_A(u)
10: rhoP_hat ← g_P(u)

11: A_reuse_hat ← rhoA_hat * A_ded_hat
12: P_reuse_hat ← rhoP_hat * P_ded_hat
13: return (A_reuse_hat, P_reuse_hat)
```

### Algorithm 3（可选）：在策略空间上做 DSE（Pareto 搜索）

```text
Algorithm 3: Multi-Objective DSE over Reuse Strategies

Input:
  S : candidate strategy set
  M : target mode set
  Predict(.) : Algorithm 2
Output:
  Pareto set P*

1:  Initialize empty set R
2:  for each s in S do
3:      (A_hat, P_hat) ← Predict(M, s)
4:      R ← R ∪ {(s, A_hat, P_hat)}
5:  end for
6:  P* ← NonDominatedSort(R)     // Pareto frontier (min area, min power)
7:  return P*
```

---

## 5) 你这份 CSV 如何对应到上述符号

* (m) 的字段：`clk_mhz, precision_set(单精度时就是 INT4/INT8...), dimK, mx, norm_kind, acc_kind, out_kind, midMat`
* (A, P)：`area_value` 对应 (A)；`total_value/dynamic_value/leakage_value` 对应 (P) 的不同拆分
* (s)：如果你现在只有 “ReuseWrapper vs Wrapper”，可以先用：

  * `variant` 或 `design_name` 映射到一个简单策略编码（比如 `is_reuse=1`）
  * 后续再扩展成 `share_mul/share_norm/...` 这种显式策略向量
