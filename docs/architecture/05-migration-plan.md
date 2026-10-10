# 05 · 迁移计划：分批可执行路线与验收标准

> **文档定位**：把 `02-target-architecture.md`（目标架构）与 `03-engineering.md`（工程化分册）落成**可独立提交、可独立回滚、始终可构建可访问**的分批迁移路线。
> **上游基线（冻结，本文件不改动其任何一行）**：[`01-current-state.md`](./01-current-state.md)（486 行）、[`02-target-architecture.md`](./02-target-architecture.md)（1326 行）、[`03-engineering.md`](./03-engineering.md)（1406 行）、[`04-review.md`](./04-review.md)（853 行）。
> **基线提交**：`95c0260`。
> **状态**：迁移计划（本阶段只产出文档，不改产品代码）。
> **作者**：migrator（t5）。
> **目标排序**（继承 `02`）：**可维护性 > 可扩展性 > 先进性 > 性能**。

### 行数口径（统一表述，与 `01`/`02`/`03` 一致，本文件实测复现）

| 口径 | 命令（**必须用 `find` 遍历，不得用 shell glob**） | 实测 |
|---|---|---|
| **源码（手写）** | `find src -type f ! -name 'lenses-inline.ts' \| xargs wc -l` | **3377 行 / 24 文件** |
| src 目录总计（含生成物） | `find src -type f \| xargs wc -l` | 3380 行 / 25 文件 |
| 含 e2e + scripts | `find src scripts e2e -type f \| xargs wc -l` | 3955 行 / 29 文件 |

> **口径必须卡死的原因**：本团队此前用 shell glob 统计行数，glob **无匹配时不报错**，静默漏掉了 `src/shared/lib/chart.ts`、`src/shared/lib/lens.ts`、`src/styles.css` 共 598 行（`01-current-state.md` §9.1 已记录该失误），得出错误的 2782。**这与本项目"入口漏登记导致构建成功但产物残缺"属同类静默失败。本文件涉及的任何计数一律用 `find` 遍历并核对文件数。**
> 本文件起草时已用上表命令逐条复现，数字与 `02`/`03` 的抬头声明**完全一致**；断言数 `grep -c 'r\.ok(' e2e/verify.cjs` = **49**。

### 本文件与 `03-engineering.md` §9 的关系（重要）

`03-engineering.md` §9 已给出**第一批的实施规格草案**。本文件**以它为基础展开，而非另起炉灶**：

| 处理 | 内容 |
|---|---|
| **沿用** | 第一批 = 修回归网（恢复 E2E 可运行 + 进 CI）；四项任务 1.1 / 1.1b / 1.1c / 1.2 / 1.3 的划分与处置；HF-2 双路径；HF-5 零依赖 `wait-port.mjs`；`dist/*/` 永久废弃；体积不作锚点 |
| **细化** | 第一批补到"可直接开工"粒度：逐文件改动点、精确命令、逐条通过标准、回滚方式、失败诊断表（§2） |
| **补全** | §9 只覆盖第一批，**缺第 2–5 批的分批划分**（§3）、**回归网的最小复跑集**（§4）、**每批风险与回滚**（§5）、**迁移完成的量化验收与新增工具演练**（§6）、**取舍建议**（§7） |
| **修正** | 本文件实测发现 4 处需要修正/补充的地方，逐条列在 §1.4，其中 2 处会改变实施动作、1 处下调了原设计的优先级（M-3）、1 处为行号口径统一 |

**本文件与 `03` §9.4 的唯一表述差异在 §1.4 M-1**（`npm run data` 为必需前置的因果说明），已在 §2.4 标注为对 `03` 的修正，并说明为何不改 `03`（冻结基线）。

---

## 0. 一页结论

**结论：分批 5 批，逐批可发布、可回滚。第一批必须且只能是"修回归网"，零产品代码改动。**

| 批次 | 名称 | 产品代码改动 | 前置依赖 | 可并行 | 回滚 | 预计成本 |
|---|---|---|---|---|---|---|
| **第 1 批** | **修回归网**（E2E 可运行 + 进 CI + 断言改数据源推导） | **零** | 无 | — | `git revert` 1 个提交 | 0.5–1 天 |
| 第 2 批 | 建新网：Vitest + ESLint 基础 + 纯函数行为快照 | 零（只加测试） | 第 1 批 | **建议串行**（见 §3.3；理论上可与第 3 批并行） | 1 个提交 | 1–1.5 天 |
| 第 3 批 | 目录分层 + 领域归位（`shared/` 拆 `platform/` + `tools/lens/domain/`） | 中（纯搬迁，行为不变） | 第 2 批（单测是安全网） | **建议串行**（理由见 §3.3） | 1 个提交 | 1.5–2 天 |
| **第 4 批** | **注册表核心**（契约 + 扫描 + 虚拟模块 + input 派生）+ HF-4/HF-3 | **高（本路线风险峰值）** | 第 3 批 | 串行，不可并行 | 1 个提交（建议先打 tag） | 2.5–4 天 |
| 第 5 批 | 测试分层补齐（L2/L3/E2E 瘦身）+ 可删除性门禁 | 低（测试为主） | 第 4 批 | — | 1 个提交 | 1.5–2 天 |

**用户已拍板的两条硬约束，落在第 1 批**：E2E 进 CI 当真正的合并门禁（第 1 批任务 1.2）、E2E 硬编码期望值改为从数据源推导（第 1 批任务 1.1b）。两者都**不需要注册表存在**，因此都能在第 1 批完成。

**路线总成本**：约 7–11 个工作日（§7.1 拆解），新增依赖 4 个（playwright / vitest / eslint / typescript-eslint），自研约 500 行 + 测试约 750 行（沿用 `03` §7.1 的估算）。

---

## 1. 第一批选中理由与范围界定

### 1.1 为什么是"修回归网"先行（选定理由，与 captain/tooling 一致）

| 理由 | 证据 |
|---|---|
| **它是本仓库唯一的行为契约，当前不可运行** | `grep -c 'r\.ok(' e2e/verify.cjs` = **49**，但 playwright 在 `package.json` / `package-lock.json` / `node_modules` **三处均不存在**（本文件实测：`grep -c playwright package.json` = 0、`grep -c '"node_modules/playwright' package-lock.json` = 0、`ls -d node_modules/playwright` → absent）→ 必然走 `e2e/harness.cjs:26-32` 的 `exit(3)` |
| **没有它，后续所有重构都是盲改** | 第 3–5 批要动 `shared/lib/lens.ts`（206 行）、`src/lens/filter.ts`（130 行）、`src/lens/App.tsx`（283 行）。这些是风险最高、最需要回归保护的部分，而保护网跑不起来 |
| **本批零产品代码改动，风险最低** | 允许改动清单仅 `package.json`、`package-lock.json`、`e2e/`、新增 `.github/workflows/ci.yml` 与 `scripts/wait-port.mjs`；**不碰** `src/**`、`vite.config.ts`、`tsconfig.json` |
| **它修复一处"文档承诺 vs 事实"** | `HANDOFF.md:23` 宣称「`npm run e2e` → 49/49 通过」是**可复现基准线**，干净 clone 下不成立。基准线必须先真实存在 |
| **它解锁后续所有批次** | 第 2 批要写纯函数行为快照——没有可跑的测试运行器，连"试运行"都做不到 |
| **它把用户的第 2 条决策变成事实** | 用户明确要求「E2E 硬编码期望值改为从数据源推导，断言语义是页面展示 == 数据源」。这条**不依赖注册表**（`public/data/lenses.json` 由 `npm run data` 生成，第 1 批即存在），所以能在第 1 批闭环 |

### 1.2 我是否建议换一个批次先行？（评估与否定）

按任务要求，我评估了两个替代方案，**均不成立**：

| 替代方案 | 表面理由 | 否决理由 |
|---|---|---|
| **先拆 `shared/` 目录**（第 3 批提前） | 它是架构瓶颈的根因（P4），"看起来更接近目标" | **风险最高、收益最晚**。拆 206 行的 `shared/lib/lens.ts` 涉及 **11 个消费文件**（`01-current-state.md` §5.3 实测），全部改动无法自动验证——E2E 跑不起来（exit 3）、单测不存在。这正是 `04-review.md` HF-1 强调的"没有回归网的重构是盲改" |
| **先引入注册表**（第 4 批提前） | 它是"新增工具不改共享文件"的直接实现，价值最大 | **前置条件不满足且风险峰值前置**。注册表要求 `tsconfig.json` 的 include 扩展（HF-4）与 `tool.config.ts` 的 TS 直读约束（HF-3）在**同一提交**内完成；而 R2（singlefile × 虚拟模块交互）**至今未被实测**（`04-review.md` §6.2 明确：评审的探针**没装** `vite-plugin-singlefile`，R2 仍未验证）。把最不确定、最危险的一批放在没有任何回归网的位置，是路线设计上的错误 |

**结论：顺序无争议。第 1 批 = 恢复可运行 + 进 CI。** 这与 `03-engineering.md` §9.1 的结论一致，我独立复核后认同，未作调整。

### 1.3 第一批的范围（精确边界）

**允许改动**（白名单）：

| 文件 | 性质 | 类别（见 §1.3b） |
|---|---|---|
| `package.json` | 加 devDependency `playwright` + script `typecheck` | 依赖与 CI 配置 |
| `package-lock.json` | `npm i` 自动更新 | 依赖与 CI 配置 |
| `e2e/verify.cjs` | 数据类快照断言改数据源推导（任务 1.1b）+ 前置断言（M-2） | 测试基础设施 |
| `e2e/harness.cjs` | **允许但预期不改**（见 §2.3） | 测试基础设施 |
| `.github/workflows/ci.yml` | **新建** | 依赖与 CI 配置 |
| `scripts/wait-port.mjs` | **新建**（零依赖端口等待，**不进入构建图**） | 测试基础设施 |
| `scripts/check-e2e-mapping.sh` | *可选* **新建**（断言数/分布机检，只读 `e2e/` 与 `docs/`） | 测试基础设施 |

**禁止改动**（红线，必须用 `git diff` 证明）：

```
src/**            ← 含全部工具实现
vite.config.ts
tsconfig.json
scripts/prepare-data.mjs
docs/architecture/01-current-state.md    ← 冻结基线
docs/architecture/02-target-architecture.md
docs/architecture/03-engineering.md
docs/architecture/04-review.md
```

### 1.3b "零产品代码改动"的精确含义（边界声明，防止误判）

第一批会**新增**脚本文件，因此"零产品代码改动"这个说法必须精确定义，否则后续审阅者会误判边界：

| 类别 | 本批是否触碰 | 说明 |
|---|---|---|
| **产品代码** | ❌ **零改动** | `src/**`、`vite.config.ts`、两个 `index.html`、`scripts/prepare-data.mjs` —— 即**任何影响站点构建产物与运行时行为**的文件，一行不改 |
| **测试基础设施** | ✅ **新增/修改** | `e2e/verify.cjs`（改期望值来源）、**新增** `scripts/wait-port.mjs`、*可选* 新增 `scripts/check-e2e-mapping.sh` |
| **依赖与 CI 配置** | ✅ **修改/新增** | `package.json`、`package-lock.json`、**新增** `.github/workflows/ci.yml` |

**为什么新增 `scripts/` 下的脚本不违反"零产品代码改动"的定位**：

- `scripts/wait-port.mjs` **只在 CI 中运行**（`ci.yml` 的一个 step），**不参与站点构建**——它既不被 `vite build` 引用，也不进任何 bundle，更不影响 `dist/` 的任何一个字节；
- 它的等价物是 `03` §9.2 任务 1.2 里被否决的 `npx wait-on`（一个**外部 CLI 工具**）。用仓库内自有的 12 行零依赖脚本替代一个外部命令，**降低**而非增加了产品面的耦合；
- *可选的* `scripts/check-e2e-mapping.sh` 同理：它是**文档与断言数的机检工具**（`03` §4.6.4），只读 `e2e/verify.cjs` 与 `docs/`，不参与构建。

**判定标准（可机检）**：本批结束时

```bash
git diff --stat HEAD -- src vite.config.ts tsconfig.json scripts/prepare-data.mjs index.html lens/
# → 必须为空
git status --short
# → 允许出现：M package.json、M package-lock.json、M e2e/verify.cjs
#              ?? .github/workflows/ci.yml、?? scripts/wait-port.mjs、?? docs/、?? .agent-teams/
```

**即：`scripts/` 下只有"纯测试基础设施"新增，且新增文件不进入构建图。** 凡进入构建图的改动一律属产品代码，**本批禁止**。

### 1.4 本文件对 `03` §9 的修正（实测发现，逐条）

> 以下 4 条是起草本文件时**实测**发现的。凡涉及实施动作的，均已写进 §2 的对应任务。

**M-1｜`npm run data` 是 E2E 的**必需**前置步骤，不是可选步骤——且漏跑会以"崩溃"而非"断言失败"呈现（会改变实施动作）**

> **本条已被 captain 裁定采纳：只在 `05` 写清，不改 `03`。** 理由：`01`–`04` 是**已通过评审的冻结基线**，改动需重新走评审流程。因此**本文件与 `03` §9.4 存在一处表述强度上的差异**（`03` 的验收序列里 `npm run data` 已在，但**未说明为什么必需**），后续若有人读 `03` 遇到不一致，以本节为准。

`03` §9.4 的验收序列里 `npm run data` 已在，但**未说明为什么必需**。任务 1.1b 要求在 `verify.cjs` 顶部 `require('../public/data/lenses.json')`，而该文件：

- 由 `scripts/prepare-data.mjs:23` 生成；
- 被 `.gitignore:28` 排除，**干净 clone 下不存在**。

**陷阱的成因（captain 补充的实测依据）**：`prepare-data.mjs` 的输出是 `public/data/lenses.json` 与 `src/data/lenses-inline.ts` **两份生成物**，**两者都被 `.gitignore`（`:28-29`）排除**，所以干净 clone 下**两者皆不存在**。而 `npm run build`（`package.json:10`）与 `npm run dev`（`:8`）**内部都会先跑 `data`**，`npm run e2e`（`:14`）**不会**——这正是陷阱的成因：其他两条路径都替你跑好了，唯独 E2E 没有。

因此干净 clone 若跳过 `npm run data` 直接跑 E2E，失败形态是 **`MODULE_NOT_FOUND` 崩溃、退出码 2**（`verify.cjs:279-282` 的 catch 分支），**而不是**断言语义失败。**失败本身是响亮的，但失败原因误导人**——实施者会去查断言逻辑，而不是查前置步骤。**处置：在 §2.2 加显式前置断言（M-2）、在 §2.4 与 §4.1 把命令顺序写成硬约束。**

**M-2｜必须给 E2E 加一条"数据源已就绪"的前置自检（会改变实施动作）**

承接 M-1：与其依赖人记得跑 `npm run data`，不如让脚本**响亮失败**（原则七）。建议在 `verify.cjs` 顶部加：

```js
let DATA;
try {
  DATA = require('../public/data/lenses.json');
} catch {
  console.error('\n找不到 public/data/lenses.json —— 请先跑 `npm run data` 再跑 E2E。\n');
  process.exit(3);   // 与 harness.cjs 的"依赖缺失"退出码一致，便于 CI 判别
}
// 前置断言：文件存在但内容为空/结构不对，同样必须响亮失败
if (!Array.isArray(DATA) || DATA.length === 0) {
  console.error(`\npublic/data/lenses.json 内容异常（长度 ${Array.isArray(DATA) ? DATA.length : 'n/a'}）` +
                '—— 请重跑 `npm run data`；若仍失败，检查源数据 scripts/lenses-source.json。\n');
  process.exit(3);
}
```

**这条属于任务 1.1b 的一部分**（同一个改动批次内完成，不额外扩张范围）。**两道检查都要有**：`require` 的 try/catch 抓"文件不存在"，`length === 0` 抓"文件存在但数据为空"——后者是更隐蔽的一种静默失败（`TOTAL = 0` 会让多条断言以难以归因的方式失败）。

**M-3｜P11（"每个入口重复打包 Tailwind 产物"）在**实测中不成立**（**已由 t10 回写 `02`**；不影响第 1 批，影响第 3 批的优先级）**

> **同步状态（t10）**：本条的修正**已落到 `02`**——§0.6 标题与断言已按实测改写、P11 在问题清单表中的定性已下调为「低（原判中）」并注明体积主张证伪、§2.2b 的收益表已改为「收敛入口样板 + 上移 `IS_SINGLE`」、§0.9 结论行已补充「无实质冲突 ≠ 推论正确」的限定。本文件与 `02` 现已一致。

`02` §0.6 断言"每个工具入口都会重复打包一整份 Tailwind 产物"。**实测结果相反**：

```bash
# 判据一：两个入口是否引用【同一个】CSS 文件名？
$ grep -o 'assets/[^"]*\.css' dist/index.html dist/lens/index.html | sed 's/^[^:]*://' | sort -u
assets/useTheme-<hash>.css        # 只输出 1 行 ⇒ 两个入口引用同一个文件

# 判据二：dist/assets 下的 CSS 是不是只有 1 份？
$ ls dist/assets/*.css | wc -l
1
```

**两个入口 HTML 引用的是同一个 CSS 文件，且整站只有 1 份 CSS。** Vite/Rolldown 的**共享 CSS chunk 提取**已经在做去重，第 2 个入口并没有产生第 2 份 Tailwind 产物。

> **⚠️ 判据必须是结构不变量，不写具体文件名或字节数。** 上面的输出刻意写作 `assets/useTheme-<hash>.css`——**`<hash>` 是不可复现的量**：同一份源码在**同一环境**下连续构建 hash 稳定，但**跨环境**（Rolldown/Vite/依赖树差异）会变，本团队已实测到 `19Xi-rf9` 与 `S2PxtYyc` 两个不同的值。
> 字节数同理（曾测得 29,191 与 29,660，随依赖与压缩输出浮动）。**因此可靠的判据只有两条：「两入口引用同一文件名」与「CSS 只有 1 份」**——前者与 hash 无关，后者与体积无关，可长期复现。与 `02` §0.6 的措辞一致。

**这意味着什么**：

- `platform/runtime/mount.tsx` 统一 `import './styles.css'`（`02` §2.1）**仍然值得做**——但它的理由应改为"**收敛入口样板 + 让 `IS_SINGLE` 分支上移**（修复 P10/B5）"，**而不是**"避免重复打包"。按 `02` 自己的原则（"每条高级特性都必须能回答它降低了什么维护成本"），这是**优先级下调**。
- **本条的教训与前几轮同源**：涉及"全量/计数/打包事实"的判断**必须实测**。`02` §0.6 是从 `src/main.tsx:3` 与 `src/lens.tsx:3` 两行 `import './styles.css'` **推理**出"重复打包"的，纸面上很像对的。**这正是 `dist/*/` 方案翻车的同一类错误。**

> **根因补充：这是一次"交叉印证的假象"（不只是单点失误）**。P11 之所以看起来可信，是因为**两个独立来源共享了同一个未验证前提**：
> | 来源 | 它实际观察到的 | 它**未**验证的 |
> |---|---|---|
> | `02` §0.6（本文档作者） | `main.tsx:3` 与 `lens.tsx:3` 各有一行 `import './styles.css'` | 构建产物是否真的产生了两份 CSS |
> | `01-current-state.md` D7（t1 审计） | 同样只是"两处 `import`"这个源码事实 | 同上 |
>
> 两个来源**都只观察到源码形态、都没看构建产物**，于是"两条证据"互相印证了一个错误结论。**这比单点错误更危险**：交叉印证会显著抬高结论的可信度，掩盖掉"证据链其实只有一个"的事实。
> **可操作的防范**：当两个来源"互相独立地"支持同一结论时，先检查它们**是否共享同一个上游事实**。若共享，则它们合计仍只是**一次**观察的权重。


**M-4｜行号引用 LF-1 的修正已由 `04` round 2 接受，本文件统一采用区间写法**

`04-review.md` LF-1 指出返回链接的 `<a>` 实际位于 `src/lens/App.tsx:217-220`（`:216` 是分支行）。`04` round 2 已判定 `02` 用的区间 `212-221` **正确、可接受**。本文件一律用 `:212-221`，不再引用单点 `:216`。

---

## 2. 第一批实施规格（可直接开工）

> **目标**：`npm run e2e` 在干净 clone 下可复现地跑出 **49/49 通过、退出码 0**，且**在 CI 中作为合并门禁真实生效**（故意破坏一条断言 → CI 变红）。
> **零产品代码改动**。

### 2.1 任务 1.1：恢复 E2E 可运行（依赖入库）

| 项 | 内容 |
|---|---|
| **涉及文件** | `package.json`（加 devDependency + 2 个 script）、`package-lock.json`（`npm i` 自动更新） |
| **改动点** | ① devDependencies 加 `playwright`；② **不要**引入 `@playwright/test`（本批不换运行器）；③ 加 `"typecheck": "tsc --noEmit"`（任务 1.3） |
| **回滚** | `git checkout package.json package-lock.json && npm ci`。浏览器缓存（`ms-playwright/`）与仓库无关，无需处理 |

#### ⚠️ HF-2：本机与 CI 是**两条不同的安装路径**，不可混用（本批最易踩的坑）

| 环境 | 命令 | 说明 |
|---|---|---|
| **本机** | `npm i -D playwright --ignore-scripts` | 复用已有 `chromium-1223`；实测 3 秒、**零联网、零下载** |
| **CI** | `npm i -D playwright` **+** `npx playwright install --with-deps chromium` | runner 无缓存，**必须**下载（1–2 分钟，配缓存） |

**本机为什么必须带 `--ignore-scripts`**：playwright 的 postinstall 才会下载浏览器，跳过它即复用现有二进制。`e2e/harness.cjs:41-63` 的 `findChrome()` **一行都不用改**——它扫描 `ms-playwright/chromium-*/chrome-win64/chrome.exe`，本就匹配现有布局。

**⚠️ 本机不要跑 `npx playwright install chromium`。** 后果不是"多下一点东西"：

1. 会新增一份 build 号**可能更高**的浏览器到 `ms-playwright/`；
2. `findChrome()` 的选取逻辑是 `.filter(startsWith('chromium-')).sort().reverse()[0]` ——**取最新**。新目录若排序在后会**顶掉**正在用的 1223；
3. 于是出现「**装完反而行为变了**」：本机原本能跑的 E2E，装完之后跑去启动另一个版本。这类"操作副作用导致行为漂移"极难排查。

**反过来，CI 上不能用 `--ignore-scripts`**：runner 没有那份 chromium，`findChrome()` 返回 `undefined`，playwright 退到默认路径查找并报 `Executable doesn't exist`。**CI 必须显式 install。**

**本机环境实测基线（供实施者核对）**：Node `v24.21.0`、npm `12.0.2`、`ms-playwright` 目录数 **5**（`chromium-1223` / `chromium_headless_shell-1223` / `daemon` / `ffmpeg-1011` / `winldd-1007`）。装完后**目录数必须仍是 5**。

**通过标准（4 条，全部可机检）**：

```bash
grep -c '"node_modules/playwright' package-lock.json     # ≥ 1（当前为 0）
node -e "require('playwright')" ; echo "exit=$?"          # exit=0
ls -d "$LOCALAPPDATA"/ms-playwright/chromium-* | wc -l    # 目录数与装前一致（证明零下载）
```

第 4 条（端到端跑通）在 §2.4 统一验收。

---

### 2.2 任务 1.1b：数据类快照断言改读数据源（HF-1a，**并入本批**）

> **本任务是用户第 2 条决策的落地**。语义从"数据恰好是 1617"变为「**页面展示 == 数据源**」，数据源更新后断言自动跟随。

**改法（自包含、零新依赖）**：

```js
// e2e/verify.cjs 顶部（'use strict' 之后，require harness 之前）
let DATA;
try {
  DATA = require('../public/data/lenses.json');   // 由 npm run data 生成，见 M-1/M-2
} catch {
  console.error('\n找不到 public/data/lenses.json —— 请先跑 `npm run data` 再跑 E2E。\n');
  process.exit(3);
}
const TOTAL = DATA.length;
const BEST = Math.max(...DATA.map((d) => (d.overall ?? -Infinity)));   // 实测 = 9.5
```

**逐条改写清单（8 处，行号按基线 `95c0260`）**：

| # | 行 | 原断言 | 改为 |
|---:|---|---|---|
| 15 | `:86` | `countOf() === 1617` | `=== TOTAL` |
| 24 | `:106` | `/共\s*1,617\s*支/` | 由 `TOTAL.toLocaleString('en-US')` 拼装期望串 |
| 28 | `:141` | `cViltrox > 0 && cViltrox < 1617` | `< TOTAL`（实测 Viltrox 命中 95） |
| 29 | `:144` | `=== 1617` | `=== TOTAL` |
| 31 | `:152` | `=== 1617` | `=== TOTAL` |
| 32 | `:157` | `cMount > 0 && cMount < 1617` | `< TOTAL` |
| 33 | `:164` | `cAp > 0 && cAp < 1617` | `< TOTAL` |
| 18 | `:91` | `statText.includes('9.5')` | `statText.includes(BEST.toFixed(1))` |

**另需同步的 2 处（`03` §4.6.2 未单列，但同属"数据快照"，不改会残留硬编码）**：

| 行 | 原断言 | 处理 |
|---|---|---|
| `:149` | `cFlare > 0 && cFlare < 1617`（抗眩光筛选） | 改 `< TOTAL`。**注意**：`03` §4.6.2 把 #30 归为 L1（下沉单测），但**下沉发生在第 5 批**——第 1 批该行仍在 `verify.cjs` 里执行，`1617` 必须一并消除，否则"字面量已全部消除"的验收不成立 |
| `:86` 与 `:106` 的**格式耦合** | `TOTAL.toLocaleString('en-US')` 才能得到 `1,617` | 必须与 `HeaderSection.tsx:41,62` 和 `TableSection.tsx:205` 的 `.toLocaleString('en-US')` 口径一致，**不要**用 `toLocaleString()`（依赖运行时 locale，CI 上可能不同） |

**⚠️ `:141` 的语义陷阱（必须保留"减少"这个断言强度）**：改写成 `< TOTAL` 后，断言从"命中数在 0 与 1617 之间"变为"命中数在 0 与 TOTAL 之间"。**两者等价**，但**不要**顺手改成 `=== 95` 或 `=== DATA.filter(...)` ——那会把"UI 筛选结果"与"纯函数筛选结果"焊死，而第 5 批要把筛选下沉到 L1 单测，届时这条断言应退化为"命中数 < TOTAL 且 > 0"。**保持现状的最弱形式即可。**

**通过标准**：

```bash
grep -n '1617' e2e/verify.cjs        # 期望：无输出
grep -n "includes('9.5')" e2e/verify.cjs   # 期望：无输出
grep -c 'r\.ok(' e2e/verify.cjs      # 必须仍是 49（断言总数不变，只换期望值来源）
```

> **最后一条是关键**：`03` §4.6.4 的机检不变量以 49 为权威基数。本任务**只允许改变期望值的来源，不允许增删断言**。若实施中顺手合并/拆分了断言，`scripts/check-e2e-mapping.sh`（若已落地）会报红——**这正是它存在的意义**。

---

### 2.3 任务 1.1c：`:40` 卡片数断言——**维持第二批**，`dist/*/` 永久废弃

**本批不动 `:40`**（`r.ok('工具卡片数量', (await cards.count()) === 1, ...)`）。

**理由（复核 `03` §9.2 任务 1.1c 与 `04-review.md` HF-1b，我实测确认两者成立）**：

```
$ ls -d dist/*/
dist/assets/  dist/data/  dist/lens/      → 计数 3
$ 门户实际渲染卡片数 = 1（TOOLS 仅 lens 一项）
```

`dist/*/` 会数出 **3**，断言**立刻失败**。改进形式 `dist/*/index.html` 虽然这次得 1，但**不可采用**（三条理由与 `03` §4.6.3 同）：

1. **它的"正确"是被 P2 缺陷掩盖的巧合**——单文件模式当前只构建 `lens`（`vite.config.ts:22`）正是 P2 的 bug，修好后语义即变。**把断言焊死在缺陷上。**
2. **`live: false` 会静默错配**——产物含所有构建出的工具，门户只渲染 `live: true` 的（`portal/App.tsx:30`）。
3. **它测的不是"卡片数"**——`:40` 的本体是 `page.locator('main a[href]').count()`，即用户实际看到的卡片；用产物目录对照是拿构建事实比对渲染结果，中间隔着门户的 live/tag/搜索过滤，**恰好丢失了"页面展示 == 数据源"的本意**。

**正确推导源 = 注册表的 `LIVE_TOOLS.length`**（`02` §4.1 的虚拟模块已导出），**处置 ⇒ 第 4 批**（注册表存在的同一批，见 §3.5 任务 4.7）。

> **`harness.cjs` 本批不需要改动。** 其 `BASE`（`:17`）与 `SHOT_DIR`（`:20`）已是零业务耦合：`BASE` 按「命令行参数 > `BASE_URL` > 默认 4173」解析，`SHOT_DIR` 走 `process.env.SHOT_DIR`。**验证方式**：本批结束时 `git diff e2e/harness.cjs` 应为空。若实施者因其他原因改了它，须在提交说明里逐行解释——它是 `02` §9 列明的"必须原样带走"资产。

---

### 2.4 任务 1.2：E2E 进 CI（新增质量门禁）

| 项 | 内容 |
|---|---|
| **涉及文件** | **新建** `.github/workflows/ci.yml`（独立文件，与 `deploy.yml` 解耦） |
| **回滚** | 删除该文件（独立文件，零耦合） |

> **⚠️ 本节是对 `03-engineering.md` §9.4 的一处修正（M-1）。** `03` 的验收序列里 `npm run data` 已列出，但**未说明它为什么必需**；本节把它写成**显式顺序硬约束 + 前置断言**。**为何不改 `03`**：`01`–`04` 是已通过独立评审的**冻结基线**，任何改动都需重新走评审流程；而这是一处"表述补强"而非"事实纠正"（`03` 的命令序列本身没有错，只是缺少因果说明）。**因此 `05` 与 `03` 在此处存在表述强度差异，以 `05` 为准**——详见 §1.4 M-1。

#### 步骤序列（含 M-1 的顺序硬约束）

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24          # 见 §1.4 说明：与本批无关，但统一到 24 避免日后漂移
          cache: npm
      - run: npm ci

      # ★ HF-2：CI 必须显式下载浏览器
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx playwright install --with-deps chromium

      # ★ M-1：npm run data 是 E2E 的必需前置，不可省略
      - name: 生成数据产物
        run: npm run data

      - name: 类型检查
        run: npm run typecheck

      - name: 构建
        run: npx vite build

      - name: 启动预览服务
        run: npx vite preview --port 4173 &
      - name: 等待端口就绪
        run: node scripts/wait-port.mjs http://127.0.0.1:4173   # HF-5：零依赖，非 wait-on
      - name: E2E
        run: npm run e2e

      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: e2e-shots, path: _shots/ }
```

**⚠️ HF-5：等待端口就绪**不能**用 `npx wait-on`**

`wait-on` **不是本仓库的依赖**（本文件实测：`grep -c "wait-on" package.json` = **0**、`package-lock.json` = **0**）。`npx wait-on` 会触发**联网即时下载**，后果：① 引入未锁定版本的第三方包；② registry 受限时直接失败；③ **破坏"干净 clone 可复现"的验收标准**。

**采用零依赖替代**（`scripts/wait-port.mjs`，约 12 行，Node 18+ 自带 `fetch`）：

```js
// scripts/wait-port.mjs —— 零依赖端口等待
const url = process.argv[2] ?? 'http://127.0.0.1:4173';
const deadline = Date.now() + 60_000;

for (;;) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok || res.status < 500) { console.log(`✅ ${url} 就绪`); process.exit(0); }
  } catch { /* 端口未开，继续重试 */ }
  if (Date.now() > deadline) { console.error(`❌ 等待 ${url} 超时`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 300));
}
```

> `status < 500` 允许 4xx 视作"服务已起来"，语义正确——**它等的是服务器在监听，不是特定路径可访问**。

**通过标准（3 条）**：

1. PR 上 CI 变绿，且 E2E 步骤**真的执行**（日志里有 `===== 汇总：49/49 通过 =====`，不是被 skip）。
2. **故意破坏一条断言（临时改 `verify.cjs` 期望值），CI 必须变红** —— 这是"门禁真的生效"的**唯一证明**。验证完必须还原。
3. CI 总时长记录基线（用于第 4/5 批判断是否引入更多闸）。

> **第 2 条是 `04-review.md` §6.7 点名"优秀"的验收设计，建议对后续所有新增闸门沿用同一模式。**

---

### 2.5 任务 1.3：`npm run typecheck` 独立脚本

| 项 | 内容 |
|---|---|
| **涉及文件** | `package.json`（加 1 个 script） |
| **改动** | `"typecheck": "tsc --noEmit"` |
| **理由** | 当前类型检查**只能**通过 `npm run build`（含 `data` + 完整构建）触发，反馈慢 |
| **通过标准** | `npm run typecheck` 退出码 0 |

> **注意**：`typecheck` 在本批**不覆盖** `platform/`、`tools/`、`scripts/`、`e2e/`（`tsconfig.json:25` 的 include 仅 `["src", "vite.config.ts"]`）。这是 HF-4，**必须在第 4 批与 `platform/` 同一提交内解决**（§3.5 任务 4.1）。**本批不要提前改 `tsconfig.json`**——改了会让 `scripts/`（`.mjs`）与 `e2e/`（`.cjs`）进入检查范围，而它们不在本批的允许改动清单内，一旦报错本批就无法收口。

---

### 2.6 第一批验收清单（可逐条勾选）

```bash
# ---------- 环境与依赖 ----------
npm ci
npm i -D playwright --ignore-scripts        # 本机（CI 见 workflow）
node -e "require('playwright')" ; echo "exit=$?"        # → exit=0
ls -d "$LOCALAPPDATA"/ms-playwright/chromium-* | wc -l  # → 与装前一致

# ---------- 数据与类型 ----------
npm run data
npm run typecheck                            # 任务 1.3 → exit 0

# ---------- 构建与起站 ----------
npx vite build
npx vite preview --port 4173 &
node scripts/wait-port.mjs http://127.0.0.1:4173

# ---------- E2E ----------
npm run e2e                                  # → 49/49 通过，exit 0
```

**判定标准（8 条）**：

| # | 判定 | 验证方式 |
|---:|---|---|
| 1 | 干净 clone → 上述命令序列全部通过，**无任何未声明依赖** | 在临时目录 `git clone` 后重跑 |
| 2 | `npm run e2e` 输出 **49/49 通过**、退出码 **0** | 输出末尾汇总行 |
| 3 | CI 上 E2E 步骤真实执行且有断言计数输出 | Actions 日志 |
| 4 | **故意破坏一条断言 → CI 变红** | 临时改期望值推送，确认红，还原 |
| 5 | `git diff` 不含 `src/`、`vite.config.ts`、`tsconfig.json`、`scripts/prepare-data.mjs`（见 §1.3b） | `git diff --stat HEAD -- src vite.config.ts tsconfig.json scripts/prepare-data.mjs index.html lens/` → 空 |
| 6 | `verify.cjs` 中 `1617` 与 `9.5` 字面量已**全部**消除 | `grep -n '1617\|9\.5' e2e/verify.cjs` → 无输出 |
| 7 | 断言总数仍为 **49**（只换期望值来源，未增删断言） | `grep -c 'r\.ok(' e2e/verify.cjs` → 49 |
| 8 | `e2e/harness.cjs` 无改动 | `git diff --stat HEAD -- e2e/harness.cjs` → 空 |

**另需人工确认 2 条（不可机检，但必须做）**：

| # | 判定 | 方式 |
|---:|---|---|
| 9 | **漏跑 `npm run data` 时的失败形态可识别**（M-1/M-2 的验证） | 删掉 `public/data/lenses.json` 后跑 E2E，输出必须是"请先跑 `npm run data`"且 exit 3，**不是** `MODULE_NOT_FOUND` 堆栈 |
| 10 | 新增脚本确实不进入构建图（§1.3b 的边界验证） | `grep -rn "wait-port\|check-e2e-mapping" dist/ dist-single/ vite.config.ts` → 无输出 |

### 2.7 回滚方式

| 场景 | 操作 |
|---|---|
| 任一通过标准失败 | `git revert <本批提交>`（单提交，无跨文件依赖） |
| 只回滚 CI | 删除 `.github/workflows/ci.yml`（独立文件，`deploy.yml` 不受影响） |
| 只回滚依赖 | `git checkout package.json package-lock.json && npm ci` |
| 浏览器缓存 | **无需处理**——`ms-playwright/` 在仓库外，与任何提交无关 |

**回滚后应回到的状态**：`npm run e2e` 重新变成 `exit 3`（与基线一致），站点构建与访问**不受任何影响**（本批未碰任何产品代码）。

### 2.8 失败诊断表（第一批）

| 现象 | 根因 | 处置 |
|---|---|---|
| `exit 3` + "找不到 playwright" | 依赖没装 / 装到了别的目录 | 核对 `node_modules/playwright` 存在 |
| `Executable doesn't exist`（CI） | 用了 `--ignore-scripts` 且没 install | CI 必须 `npx playwright install --with-deps chromium` |
| 本机 E2E 行为突然变了 | 本机跑过 `playwright install`，顶掉了 1223 | 删掉新下载的目录，或 `PLAYWRIGHT_CHROMIUM` 显式指定 |
| `MODULE_NOT_FOUND: ../public/data/lenses.json` | 漏跑 `npm run data`（**M-1**） | 先 `npm run data`；本批已加显式自检（**M-2**） |
| `exit 2` + "脚本异常" | 页面没起来 / 端口不对 | 先跑 `wait-port.mjs` 确认；`BASE_URL` 可覆盖 |
| 断言 `49/49` 里个别失败 | **不要**改产品代码修 | 先确认是"数据源改了"还是"真回归"；前者改断言推导口径，后者停下来报告 |
| CI 里 `1617` 断言失败但本机通过 | 数据源在 CI 上更新了 → **这正是本批要消灭的假失败** | 确认 `TOTAL` 推导是否生效（任务 1.1b 漏改某行） |

---

## 3. 批次划分（第 2–5 批）

### 3.1 批次划分原则

每一批必须同时满足：

1. **可独立提交**——一个提交（或一个可 squash 的提交序列）；
2. **可独立回滚**——`git revert` 该提交即可回到上一批的绿色状态，不需要回滚别的批次；
3. **始终保持站点可构建、可访问**——任一批次结束时 `npm run build` 成功、门户与镜头页可用；
4. **是"最小步"**——批内不混入下一批的前置改动。

### 3.2 依赖图

```
第1批  修回归网（E2E 可运行 + 进 CI）
  │
  ├──────────────┐
  ▼              ▼
第2批 Vitest   第3批 目录分层 + 领域归位
  │  + ESLint      （靠第1批的 E2E 作唯一安全网）
  │  + 纯函数快照
  └──────┬───────┘
         ▼
第4批 注册表核心（契约+扫描+虚拟模块+input 派生）+ HF-4 + HF-3
         │   ← 路线风险峰值，必须在第2、3批都绿之后
         ▼
第5批 测试分层补齐（L2/L3/E2E 瘦身）+ 可删除性门禁
```

**串行（必须按序）**：1 → 3 → 4 → 5；1 → 2 → 4。
**可并行**：第 2 批与第 3 批——**但有边界，见 §3.3**。

### 3.3 第 2 批与第 3 批能否真并行？——**理论可以，实践建议串行**

| | 论证 |
|---|---|
| **理论可行** | 第 2 批只**新增**测试文件（`*.test.ts`、`vitest.config.ts`）与 lint 配置，不改产品代码；第 3 批只做**搬迁**（文件移动 + import 路径改写）。两者的改动文件集不重叠（除了 `package.json`）。 |
| **实践风险** | 第 3 批把 `src/lens/filter.ts` 搬到 `tools/lens/domain/filter.ts`，而第 2 批正在给 `src/lens/filter.ts` 写行为快照——**两边同时改同一批文件的路径**，`vitest.config.ts` 的 `include`（`03` §4.2 写的是 `tools/*/domain/**/*.test.ts`）会指向一个正在移动的目标。 |
| **建议** | **串行**：先第 2 批（在旧路径写快照测试，锁定行为）→ 再第 3 批（搬迁时测试跟着走，`git mv` + 改 import，测试保持绿色即证明"搬迁无行为变化"）。**这恰好让第 2 批的价值在第 3 批兑现**——测试是搬迁的证明。 |
| **若确要并行** | 第 2 批的 `vitest.config.ts` 必须同时 include 新旧两套路径（`src/lens/**/*.test.ts` 与 `tools/*/domain/**/*.test.ts`），并在第 3 批结束时删掉旧路径条目。**这是一个额外的、必须记住的收尾动作**——并行省下的时间很可能被它吃掉。 |

**结论：建议串行。第 2 批是第 3 批的安全网，顺序本身有语义价值。**

---

### 3.4 第 2 批：建新网（Vitest + ESLint 基础 + 纯函数行为快照）

> 对应 `02` §5.2 / `03` §4.2–4.3 与 `03` §6 的"阶段 0 后半"。

| 项 | 内容 |
|---|---|
| **目标** | 纯函数的反馈时间从 ~30s（跑 E2E）降到 <1s（跑单测） |
| **涉及文件** | **新建** `vitest.config.ts`、`*.test.ts` 若干；**新建** `eslint.config.js`；`package.json`（devDependencies + scripts）；`tsconfig.json` 的 include **不动**（见下） |
| **产品代码改动** | **零**——测试是对**现状行为**的固化，不是修改 |
| **回滚** | `git revert` 该提交（只删新增文件 + 还原 package.json） |

**具体动作**：

1. 加 `vitest`（与 Vite 同源，复用别名与 TS 配置）。
2. **先给现有纯函数写行为快照**，锁定的对象按 `03` §4.3 的用例清单：
   - `src/lens/filter.ts`（130 行）——`applyFilters` 各维度边界、组合筛选、空结果、排序方向、缺失值排末尾；
   - `src/shared/lib/lens.ts`——`fmt` / `money` / `scoreClass`（**8 与 6.5 的边界是业务决策**）/ `focalText` / `brandColor` / `esc` / `brandLabel` / `hex2rgba`。
3. **`fmt(null) === '—'`、`money(0) === '¥0'`、定焦不带区间**这三条是 `02` §9 列为"必须原样带走"的设计意图，**必须有对应用例**。
4. 加 ESLint **基础规则**，**架构规则暂不开启**（目录还没成形，此时开会刷屏报错，反而促使人加 `eslint-disable`——`03` §6 明确"那比不启用更糟"）。

**⚠️ 本批的一个已知约束**：`tsconfig.json:25` 的 include 不含 `scripts/`、`e2e/`，且此时 `platform/`/`tools/` 也还不存在。**本批不要扩 include**（同 §2.5 的理由：会让 `.mjs`/`.cjs` 进入检查范围，引入与本批无关的失败面）。`vitest.config.ts` 需要自己的 `include` 与 aliases——**这与 tsconfig 的 include 是两件事**，不要混。

**通过标准**：

```bash
npm run test:unit        # 全绿
# 反馈速度必须真的快（否则没人会跑 —— 02 §8.3 的必要条件）
time npm run test:unit   # 目标 < 2s
npm run build            # 仍然 exit 0（测试改动不影响构建）
npm run e2e              # 49/49（第 1 批的网仍然绿 → 证明本批零回归）
```

**第 5 条最重要**：第 2 批**必须证明自己没有改变行为**。证据就是第 1 批的 E2E 从 49/49 依然 49/49。

---

### 3.5 第 3 批：目录分层 + 领域归位

> 对应 `02` §2.1 / §2.3 与 `03` §6 的"阶段 1"。**这是纯搬迁批次，不含任何新机制。**

| 项 | 内容 |
|---|---|
| **目标** | 消除"领域代码伪装成共享资产"（P4/B6）：`src/shared/` 里 **278 行 / 584 行（48%）**是镜头专有 |
| **涉及文件** | **移动**：`src/shared/lib/lens.ts`（206 行）→ `tools/lens/domain/{model,metrics,brands,format}.ts`；`src/lens/filter.ts` → `tools/lens/domain/filter.ts`；`src/lens/sections/*`、`src/lens/components/*` → `tools/lens/sections/*`、`tools/lens/components/*`；`src/shared/{useTheme.ts,components/ui.tsx,components/ThemeToggle.tsx,components/ChartBox.tsx,lib/chart.ts}` → `platform/`；`src/shared/components/LensTip.tsx`（72 行）→ `tools/lens/components/` |
| **产品代码改动** | **中**——但**语义等价**：只移动文件、改写 import 路径。**不改任何逻辑** |
| **搬什么判据** | `02` 原则四：**删除所有工具后仍然需要保留的，才是平台**。据此：`useTheme` / `ui.tsx` / `ThemeToggle` / `ChartBox` / `chart.ts` → `platform/`；`lib/lens.ts` / `LensTip.tsx` → `tools/lens/` |
| **回滚** | `git revert`（搬迁是可见的 diff，回滚干净） |

**具体动作（按顺序，每步后跑最小验证集 §4.2）**：

1. **先动领域层**（收益最大、风险次之）：拆 `shared/lib/lens.ts` 为 4 个 `domain/` 文件。**注意**：`01-current-state.md` §5.3 实测它有 **11 个消费文件**，全部要改 import。
2. **再搬页面结构**：`src/lens/**` → `tools/lens/**`。
3. **最后搬平台层**：`src/shared/**` 剩余的 → `platform/**`。
4. 更新 `vite.config.ts:49` 的 `@` 别名与 `tsconfig.json:23` 的 `paths`，并**确保两者同步**（`01-current-state.md` §7.3 的既有风险："改一处漏一处会出现编辑器不报错但构建失败"）。
5. **入口暂不动**：`src/main.tsx`、`src/lens.tsx` 与两个 `index.html` **本批不改**——统一挂载入口 `platform/runtime/mount.tsx` 属于第 4 批（它依赖 Shell 与 ErrorBoundary，而 Shell 的引入会改动 `lens/App.tsx:212-221` 的返回链接渲染，这不是"纯搬迁"）。

**⚠️ 优先级说明（承接 §1.4 的 M-3）**：`02` §0.6 把"每个入口重复打包 Tailwind"列为 P11，但**实测两个入口引用同一个 CSS 文件名、且 `dist/assets` 下 CSS 只有 1 份**（判据见 §1.4 M-3；**不引用具体 hash，该值跨环境不可复现**），该问题不成立。因此 `platform/runtime/mount.tsx` 的引入理由应记为"**收敛入口样板 + 上移 `IS_SINGLE` 分支**"，**不要**为"省一份 Tailwind 产物"而提前做。

**通过标准**：

```bash
find src -type f ! -name 'lenses-inline.ts' | wc -l    # 记录搬迁后 src 剩余文件数（应大幅减少）
find tools platform -type f | wc -l                    # 新增文件数应与之对应
npx tsc --noEmit                                       # exit 0（注意：此时仍只检查 src/ ，见下）
npm run test:unit                                      # 全绿（第 2 批的快照测试跟着文件走，绿=无行为变化）
npm run build                                          # exit 0
npm run e2e                                            # 49/49
```

**⚠️ 本批 tsc 的盲区（重要）**：`tsconfig.json:25` 仍只 include `["src", "vite.config.ts"]`。第 3 批把文件搬出 `src/` 后，**它们会立刻落在 tsc 盲区**——`npm run typecheck` 仍会通过，但**不再检查这些文件**。

**这是本批最重要的风险，也是"必须与第 4 批紧接"的原因**。处置：

- **方案 A（推荐，本文件建议）**：第 3 批**同一提交内**把 include 扩为 `["src", "platform", "tools", "vite.config.ts"]`（**先不加 `scripts`/`e2e`**，避免 `.mjs`/`.cjs` 引入无关失败面），并用 `02` §7.6.2 的注入探针验证盲区已消除；
- **方案 B**：第 3 批不动 include，但**必须把第 4 批的入口条件写成"typecheck 盲区尚未消除"**，并在第 4 批一次性补齐。

**两方案都不允许"忘了"**。我建议 A——因为第 3 批已经把大量代码搬出 `src/`，盲区窗口期越短越好。

---

### 3.6 第 4 批：注册表核心（本路线的风险峰值）

> 对应 `02` §3 / §4 与 `03` §2 / §3。**这是"新增工具不改共享文件"的真正实现批次。**

| 项 | 内容 |
|---|---|
| **目标** | `vite.config.ts` 不再列举工具；门户从注册表读清单；`build:single` 不再静默丢失工具 |
| **涉及文件** | **新建** `platform/contract/{tool.ts,schema.ts,index.ts}`、`platform/registry/{scan.ts,virtual.ts,inputs.ts}`、`platform/runtime/mount.tsx`、`platform/ui/Shell.tsx`、`tools/lens/tool.config.ts`、`tools/lens/icon.tsx`；**改** `vite.config.ts`（派生 input）、`src/portal/App.tsx`（消费 `virtual:toolbox/registry`）、`src/portal/tools.tsx`（删除 `TOOLS` 数组，保留 `SITE`）、两个入口 `*.tsx`、**`tsconfig.json`（HF-4，同一提交）**、`.github/workflows/deploy.yml`（HF-3 的 node-version） |
| **前置** | 第 2、3 批均绿 |
| **回滚** | `git revert`；**建议开工前 `git tag pre-registry`**，因为本批改动面最大 |

**⚠️ 本批有 3 个必须在开工第一天验证的假设（`02` §8.1 的 R1/R2/R3 + `03` §7.3）：**

| 假设 | 若证伪的后果 | `02`/`03` 的已知状态 |
|---|---|---|
| **R1｜虚拟模块 HMR 在工具目录增删时触发** | 开发体验退化：新增工具后需手动重启 dev server | `02` §4.1 已写 `addDir`/`unlinkDir` 监听，**未实测** |
| **R2｜singlefile × 虚拟模块的交互** | 可能产生多余 chunk 或内联失败 | **明确未验证**——`04-review.md` §6.2 记录：评审的探针**没装** `vite-plugin-singlefile`。**这是本批次最不确定的一项** |
| **R3｜`no-restricted-imports` 能表达"禁止 import 兄弟工具但允许自己"** | 需写 ~30 行自定义 rule | `02` §6.3 已承认标准规则**不支持排除自己**，给了退路 |

**`03` §7.3 的纪律必须照做：先验证最不确定的假设，再写其余部分。** 建议开工第一件事就是用 30 行脚本验 R2（`04-review.md` 已验过 R1 与虚拟模块 + input 派生的核心可行性，**唯独没验 singlefile**）。

**⚠️ HF-4 与 HF-3 必须**在同一个提交**内完成（这是硬约束，不是建议）**：

```jsonc
// tsconfig.json —— HF-4
{
  "compilerOptions": { /* 保持不变，特别是 strict / noUnusedLocals */ },
  "include": ["src", "platform", "scripts", "tools", "e2e", "vite.config.ts"]
}
```

**为什么必须同提交**：否则会有一个"新代码已存在、但类型检查还没覆盖它"的窗口期。更关键的是——`02` §3.2 强调 `satisfies ToolManifest` 是"编译期校验字段拼写"的关键机制，而 **`tools/**/tool.config.ts` 不在 include 内时，这个机制在最需要它的地方（新增工具）根本不生效**。

**HF-4 的验证必须用注入探针，不能用"tsc 退出码 0"**（后者无法区分"没检查"与"检查了没错误"）：

```bash
echo 'export const bad: number = "x";' > platform/__typeprobe.ts
npx tsc --noEmit ; echo "exit=$?  # 期望非 0（证明 platform/ 已被检查）"
rm platform/__typeprobe.ts
```

**HF-3 的三条（不可省）**：① `tool.config.ts` 禁用 `enum` / `namespace` / 构造函数参数属性，**由 L2 契约测试或 lint 强制**；② 类型导入用**相对路径**（Node 不解析 tsconfig 的 `paths`——`import type` 可剥离，但解析器仍要处理该 specifier）；③ `deploy.yml` 的 `node-version` **pin 到 24**（类型剥离 22.6+ 才默认开启）。

> **⚠️ HF-4 的一个副作用必须实测**：扩 include 后 `scripts/*.mjs` 与 `e2e/*.cjs` 是 CommonJS，在 `moduleResolution: "bundler"` 下**可能报错**（`skipLibCheck: true` 有帮助但不够）。**退路**：只加 `"platform", "scripts", "tools"`，暂不加 `"e2e"`。**先实测再决定**。

**本批要落实的逐条处置（第 1 批遗留的 3 条）**：

| # | 内容 |
|---|---|
| **4.7** | `verify.cjs:40` 卡片数改 `LIVE_TOOLS.length`（任务 1.1c 的兑现） |
| **4.8** | `:94/:213`（8 张画布）、`:103`（100 行）、`:102/:176`（3/4 支对比）解耦——**这些耦合视图结构，本批注册表就位后才有解耦依据** |
| **4.9** | `tools.tsx:32,42` 卡片文案里的数据快照（「1,617 / 46 / 41 / 39」）——按 `02` §0.7 的**第 2 条方案**：**`meta` 不写数字**，数字由工具页面自己渲染（`HeaderSection` 已有动态统计） |

**通过标准**：

```bash
npm run tools:list                                     # 扫到 tools/lens
npm run typecheck                                      # exit 0
npx tsc --noEmit  + 注入探针                            # 探针必须报错（HF-4 生效）
npx vite build                                         # exit 0
npx vite build --mode singlefile                       # exit 0
test -f dist-single/index.html && echo OK              # ★ P2 修复的直接证据
ls dist/*/index.html                                   # 必须与注册表的 live 工具集合一致
npm run e2e                                            # 49/49（含已解耦的 :40）
git status --short                                     # ★ 新增"第三个工具"演练见 §6
```

**★ 单文件产物必须包含门户**：基线实测 `npm run build:single` **exit 0 但无 `dist-single/index.html`**（P2 现场证据）。第 4 批修好后，`test -f dist-single/index.html` 必须成立——**这是本批最有力的一条验收**。

---

### 3.7 第 5 批：测试分层补齐 + 可删除性门禁

> 对应 `02` §5.3 / §5.4 / §6.4 与 `03` §4.4 / §4.5 / §5.3。

| 项 | 内容 |
|---|---|
| **目标** | 把"新工具的质量下限"自动化；把"随删随去"从文档承诺变成 CI 事实 |
| **涉及文件** | **新建** `e2e/specs/{tool-contract,build-artifacts}.spec.cjs`、`e2e/lib/`（原 `harness.cjs` 迁入）、`e2e/run.cjs`、`scripts/test-deletability.mjs`；**改** `e2e/verify.cjs`（瘦身，按 `03` §4.6.2 的 49 条映射） |
| **产品代码改动** | 低——`e2e/` 与 `scripts/` 为主 |
| **回滚** | `git revert` |

**具体动作**：

1. **L2 通用契约 spec**（`03` §4.4）：对注册表里**每个** live 工具跑同一套断言（可访问无 404 / 有非空 `<h1>` / 标题非空 / 移动端无横向滚动 / 主题切换无 `console.error`）。**它同时是"随删随去"的验证**——列表来自注册表，删工具自动少跑一组，不会有悬空引用。
2. **L3 产物契约**（`03` §4.5）：`dist`/`dist-single` 的 HTML 与注册表**双向**比对（"不多不少"）——既抓"新增工具但产物缺失"（P2），也抓"删除了工具但产物还在"（残留检测）。
   > **⚠️ 实施状态（t17 标注）**：其中「与 registry.json 双向比对」这半边**未实施**（`dist/registry.json` 不存在）——它是 `02` §7.3 的可选项，当前单工具阶段收益不足（`generatedAt` 冲突未决、且该断言等价于"恰好 main+lens 两个 index.html"，已由 P2 响亮失败与 urlLayoutPlugin 的拒绝覆盖隐式保证）。**触发条件：第 2 个 live 工具上线，或需要产物级可复现断言时**（与 §10.8 的 singlefile 标记决策点同批评估，见 §10.9）。
3. **E2E 瘦身**：按 `03` §4.6.2 的 49 条归属逐条处置（**6 下沉 L1 / 14 上移 L2 / 29 保留 L4**）。
4. **可删除性门禁**（`03` §5.3）：**注意性能退化模式**——`02` §6.4 给的完整版是"每工具一次完整构建"，工具数 N 时 N 次构建。`03` §5.3 的优化版改为「只验扫描 + input 派生 + `tsc --noEmit`」，理由成立（悬空引用一定表现为扫描失败或 `import` 失败，后者由 resolve 抛出）。**当前只有 1 个工具，先用哪种都行；建议直接用优化版，避免日后忘记优化。**

**⚠️ 保留清单（任何批次都不许动）**——`02` §9 与 `03` §4.6 点名的"踩坑资产"：

| 资产 | 位置 | 为什么 |
|---|---|---|
| `canvasReport` 像素健康度 | `harness.cjs:95-127` | 抓"图表整块变白但控制台不报错"。**与图表数量无关，属不变量断言** |
| `#34` 表格遮挡回归守卫 | `verify.cjs:172-173` + `harness` 的 `prepareRow`/`rowRect`/`hitTest` | 图表曾因 `ChartCard`/`ChartBox` 双层高度错配而盖住数据表 |
| `findChrome()` | `harness.cjs:41-63` | 处理 playwright 与 chromium build 号不一致 |
| `prepareRow` 的手工滚动 + 真实鼠标坐标方法论 | `harness.cjs:129-164` | 绕过 sticky 表头与内部滚动容器的 actionability 误判 |

**这四条要连同注释一起带走**——`02` §9 的原话："这些注释记录了踩过的坑，是本仓库最有价值的资产之一。"

**通过标准**：

```bash
npm run verify          # 全量闸绿（对应 03 §2.1 的 verify 脚本）
# 删除安全性必须真的被证明
npx playwright install --with-deps chromium   # 若用 L4
node scripts/test-deletability.mjs            # exit 0
# 负向验证（★ 必做，与第 1 批"故意破坏断言"同一模式）：
#   在 portal/App.tsx 里硬编码 'lens'，test:deletability 必须变红
```

**最后一条是"门禁真的生效"的唯一证明**，与第 1 批的验收模式一致。

---

## 4. 回归网建立细节

### 4.1 E2E 复现步骤（精确到命令）

**本机（Git Bash / bash）**：

```bash
cd /d/docs/01-my-website

# 1) 依赖（本机零下载路径）
npm ci
npm i -D playwright --ignore-scripts
node -e "require('playwright')" ; echo "exit=$?"        # → 0
ls -d "$LOCALAPPDATA"/ms-playwright/chromium-* | wc -l  # → 5（装前装后一致）

# 2) 数据 + 类型（★ 顺序硬约束，见 M-1）
npm run data
npm run typecheck

# 3) 构建
npx vite build

# 4) 起站（另开一个终端，或用后台任务）
npx vite preview --port 4173 &
node scripts/wait-port.mjs http://127.0.0.1:4173

# 5) 跑 E2E
npm run e2e                                             # → 49/49 通过，exit 0
```

**CI（无浏览器）**：`npm ci` → `npx playwright install --with-deps chromium` → `npm run data` → 构建 → preview → `wait-port` → `npm run e2e`。

> **平台说明（承接 `04` LF-4）**：上述为 **Git Bash / bash** 形式。PowerShell 下 `&` 后台运算符语义不同，`npx vite preview` 需另开窗口或用 `Start-Job`。

**⚠️ 截图目录**：E2E 会写 `_shots/`（`harness.cjs:20`），已被 `.gitignore:32` 排除，不会污染工作树。

### 4.2 每批后需复跑的最小验证集

**"最小"= 能证明"本批没破坏任何东西"的最小命令集**。按批次给：

| 批次 | 最小验证集 | 预计耗时 | 说明 |
|---|---|---|---|
| **第 1 批** | `npm run data` → `npm run typecheck` → `npx vite build` → `npm run e2e` ≤ 49/49 | ~2 min | 本批的唯一产出就是它自己 |
| **第 2 批** | `npm run test:unit`（<2s） + `npm run build` + `npm run e2e` | ~2 min | 单测是新增物；**E2E 必须仍 49/49**（证明零行为改动） |
| **第 3 批** | `npm run test:unit` + `npm run build` + `npm run e2e` | ~2 min | 搬迁批次：**单测绿 = 无行为变化**，这比 E2E 更精确 |
| **第 4 批** | `npm run tools:list` + `npm run typecheck`（+注入探针）+ `build` + `build:single` + `npm run e2e` | ~4 min | 风险峰值：多验一条 `dist-single/index.html` 存在 |
| **第 5 批** | `npm run verify`（全量） | ~5 min | 本批就是测试层，跑全量 |

**日常开发的更小集（不替代批次验收）**：

```bash
npm run test:unit        # <2s，改纯函数时用（第2批之后）
npm run typecheck        # ~5s，改类型时用
```

**"改动类型 → 触发哪层"的对照表**（沿用 `02` §5.6，作为"最小验证集"的选择依据）：

| 改动类型 | 最小验证集 |
|---|---|
| 改 `domain/` 纯函数 | L1 单测（<1s） |
| 改工具元数据 `tool.config.ts` | L1 契约校验（<1s） |
| **新增工具** | 全量 `npm run verify` |
| **删除工具** | `test:deletability` + L2 |
| 改共享 UI 组件 | L2（全工具）+ L4 E2E |
| 改构建配置 | `build` + `build:single` + L3 + L4 |

### 4.3 回归网的三条纪律

1. **每批结束必须留下可复现的绿色基线**——`npm run e2e` 的通过条数与退出码要记录在提交说明里（第 1 批后是固定值 49）。
2. **负向验证每个新增闸门**——"故意破坏 → 必须变红"（第 1 批的 CI、第 4 批的探针、第 5 批的 deletability 都要做）。**只打印通过的门禁等于没有门禁。**
3. **不修改断言来让批次通过**。若某条断言在合法改动后失败，先判断是"断言写死了业务事实"（改断言推导源）还是"真回归"（停手报告）。第 1 批的任务 1.1b 就是第一类的标准处置。

---

## 5. 每批的风险与回滚

### 5.1 风险与回滚总表

| 批次 | 主要风险 | 等级 | 缓解 | 回滚 |
|---|---|---|---|---|
| **第 1 批** | 本机误跑 `playwright install` → 顶掉 chromium-1223 → **行为漂移** | 中 | 只允许 `npm i -D playwright --ignore-scripts`；验收含"目录数不变" | `git revert`；浏览器缓存与仓库无关 |
| | CI 首次引入浏览器下载 → 时间与稳定性 | 低 | `~/.cache/ms-playwright` 缓存，key 用 `hashFiles('package-lock.json')` | 删除 `ci.yml` |
| | 漏跑 `npm run data` → E2E **崩溃（exit 2）而非断言失败** | 中 | **M-1 顺序硬约束 + M-2 前置自检** | — |
| | 顺手增删断言 → 破坏 49 的权威基数 | 中 | 验收第 7 条：`grep -c 'r\.ok('` 必须仍为 49 | — |
| **第 2 批** | Vitest 与 Vite 别名二次漂移（`@` 已在 `vite.config.ts:49` 与 `tsconfig.json:23` 两处） | 低 | `03` §4.2 已给建议：抽 `aliases.ts` 单一来源，或加一条单测断言一致 | `git revert` |
| | 单测写成"测实现"而非"测行为" | 中 | 只对**现状行为**做快照（零产品代码改动）；`fmt(null)==='—'` 这类是设计意图，必须固化 | `git revert` |
| **第 3 批** | **tsc 盲区**：文件搬出 `src/` 后不再被检查（`tsconfig.json:25`） | **高** | §3.5 方案 A：同提交扩 include + 注入探针验证 | `git revert`（搬迁 diff 可见） |
| | import 路径漏改（11 个消费文件引用 `shared/lib/lens.ts`） | 中 | `npx tsc --noEmit` + `vite build` + 单测三层兜住 | `git revert` |
| | 别名 (`@`) 与 tsconfig `paths` 不同步 | 中 | 两处必须同时改（`01` §7.3 的既有坑）；纳入通过标准 | `git revert` |
| **第 4 批** | **R2（singlefile × 虚拟模块）未验证** | **高** | **开工第一件事验 R2**（`04` §6.2 明确它仍未验证）；`03` §7.3 纪律 | `git tag pre-registry` 后 `git revert` |
| | **P2 修复后语义变化**：`build:single` 从"只有 lens"变成"所有 live 工具" | 中 | 这是**目标行为**；验收用 `ls dist/*/index.html` 与注册表比对 | 同上 |
| | HF-4 扩 include 后 `scripts/*.mjs` / `e2e/*.cjs` 报错 | 中 | 退路：只加 `platform`/`scripts`/`tools`，暂不加 `e2e`（**先实测**） | 同上 |
| | HF-3：Node 类型剥离在 CI 版本上不生效 | 中 | `node-version` pin **24**；`tool.config.ts` 用相对路径 + 无 `enum` | 同上 |
| | 门户构建产物体积与工具数原本应解耦，若注册表把实现代码带进门户依赖图 | 中 | 虚拟模块**只序列化纯数据**（`02` §7.1）；图标用 `import iconUrl` 单独引用 | 同上 |
| **第 5 批** | `test:deletability` 随工具数变慢 | 低 | 用 `03` §5.3 的优化版（`tsc` 代替完整打包） | `git revert` |
| | E2E 瘦身时**静默丢失断言** | **高** | `03` §4.6.4 的 `check-e2e-mapping.sh` 机检（映射条目数 == 49、三层分布 == 6+14+29） | `git revert` |

### 5.2 贯穿全路线的三条红线

1. **HANDOFF §9 的六条硬约束不可破坏**（`04-review.md` §6.4 逐条实测确认，第 4 批最易碰）：
   - Chart.js **唯一收口**在 `shared/lib/chart.ts:9`（全仓只此 1 处 import，且是 `import type`）；
   - `ChartCard`/`ChartBox` 的高度契约；
   - 主题 class **渲染期同步写入** `useHTML`（`useTheme.ts:27-31`）；
   - **大 JSON 保持 string 常量**（`prepare-data.mjs:81-83`——这是 1617 条数据能被 `tsc` 快速处理的前提，**最易在"顺手改成数组导出"时被破坏**）；
   - `public/.nojekyll` 存在；
   - base 路径的 shell 判断（`deploy.yml:46-55` 含 `tr 'A-Z' 'a-z'`）。
2. **产物体积不作验收锚点**（`04` MF-5）：`dist-single/lens/index.html` 曾测得 **1,476,952** 字节（基线重建），而 `HANDOFF.md:343` 记 1,475,600——差 +0.09%，随依赖版本漂移。**只作参考量级（≈1.47 MB）**。同理 `public/data/lenses.json` 的 0.92 MB。**若需门禁单文件产物，断言结构（存在性、无外链 `assets/*.js`）而非字节数。**
3. **涉及"全量/计数/推导源"的判断必须实测，不能推理**。这是本团队用两次实际翻车（`dist/*/` 方案、行数 glob）换来的教训，本文件 §1.4 的 M-3 是第三次同源发现。

### 5.3 团队级纪律：审计与验收文档不写 content hash、不用产物体积作锚点

> **纪律（本节确立，适用于本仓库全部审计/设计/验收文档）**：
> **凡"事实证据 / 通过标准 / 验收锚点"，一律使用可长期复现的【结构不变量】；不写 content hash，不写产物体积字节数。**

**为什么必须固化为纪律（两次同源教训）：**

| # | 事件 | 被误用的量 | 漂移表现 | 后果 |
|---|---|---|---|---|
| 1 | `04` MF-5 / `01` D13 | `dist-single/lens/index.html` 体积 | 1,475,600 → **1,476,952** | 文档称"精确一致"，复核者会误判为"构建坏了" |
| 2 | `05` M-3 / `02` §0.6（本文件 t12 修正） | CSS chunk content hash | `useTheme-19Xi-rf9.css` → **`useTheme-S2PxtYyc.css`** | 把它当作"P11 不成立"的证据，而该值跨环境不可复现 |

两次都是**同一个根因**：**把"随环境/依赖漂移的测量值"当成了"可复现的事实"**。这类值有三个特征，恰好都致命：

1. **在同环境内稳定** —— 所以本地复核"能通过"，看不出问题；
2. **跨环境会变**（Rolldown/Vite 版本、依赖树、压缩输出、内联顺序） —— 所以 CI 或他人复核会失败；
3. **失败信息看起来像"构建坏了"** —— 于是制造**无关的红色**，浪费排查时间，甚至诱使人们去"修"一个没坏的东西。

**正确的替代（本团队一律采用）：**

| 不要写 | 改写成 |
|---|---|
| `assets/useTheme-19Xi-rf9.css` 被两个 HTML 引用 | **两个入口引用的是否为同一个 CSS 文件名**（`grep -o 'assets/[^"]*\.css' ... \| sort -u` 只输出 1 行） |
| `dist-single/lens/index.html` = 1,476,952 字节 | **该文件存在** + **单文件内无外部 `assets/*.js` 引用** |
| `public/data/lenses.json` = 0.92 MB | **该文件存在且能被 `JSON.parse`** + **记录条数 == 数据源条数** |

**允许的例外（留痕，但必须标注）**：历史审计中已记录的实测值**可以保留**（它们是当时的真实观察），但**必须显式标注"不可复现、不可作判据"**，并紧邻给出结构判据。例如 `01-current-state.md` D13 的处理方式（原文保留 + 追加处置说明指向 `03-engineering.md` §5.2）就是合规范例。

> **一句话**：**证据必须是"结构"，不是"测量值"。** 凡是需要跑一次构建才能得到的数字，都不适合作为跨时间、跨环境的判据。


### 5.4 已完成的卫生项：`src/styles.css` 显式限定 Tailwind 扫描范围（t13）

> **状态：已实施**（本阶段唯一的产品代码改动，见 §5.4.1 的影响面声明）。记录在此，供实施者了解基线与验证方式。

**问题**：Tailwind 4 默认从 CSS 文件所在目录向上找到项目根，扫描**根下全部文件**。本项目根下有 `docs/`（大量 Markdown）与 `.agent-teams/`（团队信箱 `*.jsonl`），这些**协作文件里出现的类名字符串**会被当成候选类，生成无人使用的野生规则。

**实测证据（`03`/`04` 之外的独立测量）**：产物 CSS 中曾有 5 条野生规则——`.p-[12.34px]` / `.p-[13.37px]` / `.p-[66.44px]` / `.p-[77.55px]` / `.p-[99.11px]`，而 **`src/` 中完全不存在这 5 个值**；它们来自 `04-review.md`（把 CSS 片段当例子写进文档）与团队收件箱。

**危害不是体积**（几 KB），而是**让「产物变化 ⇒ 源码变化」这条诊断链断掉**：改一份 Markdown 也能改变生产构建，排查构建差异时会被误导——这与本项目已记录的静默失败家族同源。

**修法**：
```css
@source not "../docs";
@source not "../.agent-teams";
```
**为什么用 `@source not` 而不是把 `@source` 指向 `src/`**：后者会让根级 `index.html` / `lens/index.html` 里的类名漏扫（那些也是真实样式来源）。`not` 是"排除法"，保留了默认扫描的全部真实来源。

#### 5.4.1 影响面声明（本阶段唯一的产品代码改动）

| 项 | 内容 |
|---|---|
| **改动文件** | `src/styles.css`（唯一）——**仅新增 17 行注释 + 2 行 `@source not`**，未修改任何既有规则 |
| **为什么在本轮做而不是推迟** | ① 改动是**声明式**的、不触碰任何样式语义；② 它有**可机检的通过/失败判据**（见下），符合本阶段"证据必须可验证"的标准；③ 若推迟，后续任何审计者继续在 `docs/` 里写 CSS 示例（如 `04` 已做过的），野生规则会持续累积且**无人察觉**。 |
| **为什么不作为常规实施批次** | 它与迁移路线的任何一批都无依赖关系，属于**独立的构建卫生修复**；放进实施批次反而会被误认为"架构改造的一部分"。 |
| **风险** | 低。最坏情况是"某个真实来源被误排除"→ 表现为样式丢失。已用 5/5 源码类抽检 + 全量类对比确认无遗漏。 |
| **回滚** | 删除 `src/styles.css` 的两行 `@source not` 即恢复原状（注释可留）。 |

#### 5.4.2 验证方式（判据为结构不变量，**不写 hash、不用字节数作锚点**）

```bash
npm run build                        # 期望 exit 0

# 判据一：两个入口仍引用【同一个】CSS 文件名
grep -o 'assets/[^"]*\.css' dist/index.html dist/lens/index.html | sed 's/^[^:]*://' | sort -u
#   期望：只输出 1 行

# 判据二：dist/assets 下 CSS 仍只有 1 份
ls dist/assets/*.css | wc -l
#   期望：1

# 判据三：野生规则消失（这是本次改动的目的）
grep -c '13\.37px' dist/assets/*.css
#   期望：0（无匹配，grep 退出码 1）
```

**参考量级（仅参考，非判据）**：产物 CSS 由约 29.8 KB 降至约 28.0 KB。**不作为验收锚点**——见 §5.3 纪律。

## 6. 迁移完成后的验收清单

### 6.1 三项架构达成标准（来自 `02` §10）

| # | 标准 | 可执行验证 |
|---:|---|---|
| 1 | **新增工具不修改任何共享文件** | 演练见 §6.2，`git status` 只显示 `tools/<new>/` 下的新文件 |
| 2 | **删除任一工具后构建仍通过、产物无残留** | `node scripts/test-deletability.mjs` → exit 0；负向：`portal/` 硬编码工具名 → 变红 |
| 3 | **改动纯函数的反馈时间从 ~30s 降到 <1s** | `time npm run test:unit` < 2s；对比 `time npm run e2e` ~30s |

### 6.2 ★ 真实新增工具演练（量化验收的核心）

> **这是"架构确实变简单了"的唯一可信证明**。不要用文档描述代替它，要**真的做一遍**。

**演练对象**：新增一个「对比工具」`tools/compare/`，**使用与 lens 不同的数据源**（例如从 `public/data/compare.json` 读），以覆盖数据流水线路径（`04-review.md` §6.1 指出这是设计里**唯一"半自动"**的环节）。

**演练步骤**：

```bash
npm run new -- compare        # 脚手架：复制 tools/_template 并替换 __ID__
# 编辑 tools/compare/tool.config.ts（live 保持 false 直到完工）
# 编辑 tools/compare/App.tsx
# 编辑 tools/compare/icon.tsx
npm run dev                   # ★ 门户必须自动出现卡片，无需改任何共享文件
# 完工后把 live 改为 true
npm run verify                # 全量闸绿
```

**量化验收标准（改动文件数与行数上限）**：

| 指标 | **上限** | 说明与我们期望值的来源 |
|---|---|---|
| **修改的共享文件数** | **0** | 硬指标。`git status --short` 中除 `tools/compare/**` 外**不得出现任何已修改的受跟踪文件** |
| 新建文件数 | **≤ 6** | `tool.config.ts` / `App.tsx` / `icon.tsx` / `index.html` / `domain/index.ts` / `data/pipeline.mjs`（无数据管道时 ≤ 5） |
| 手写新增行数 | **≤ 300 行** | 脚手架自带的样板（约 80–120 行）不计入手写量。**对照基线：当前新增一个工具至少 6 个位置、跨 4–6 个文件**（`01-current-state.md` §1.3） |
| 脚手架命令数 | 1（`npm run new -- <id>`） | 对应基线的人工复制 `lens/index.html` 24 行模板 |
| 首次出现在门户的耗时 | 无需重启 dev server | 验 R1（HMR）；若需重启，记为本项**未达标**并记录 |
| 新增工具后的产物完整性 | `dist/compare/index.html` 存在，且 `build:single` 也包含它 | 验 P2 已根除 |

**"0 个共享文件"是硬门槛**：只要需要改 `vite.config.ts`、`portal/`、`platform/` 中任何一处，**标准 1 即未达成**，架构目标未实现——此时应记录具体的耦合位置并回到第 4 批修正，**不允许"这次先手工改一下"**。

**演练的负向部分（必须做）**：

```bash
rm -rf tools/compare          # 删除即"随删随去"
npm run typecheck && npx vite build && npx vite build --mode singlefile
npm run e2e                   # 全绿
git status --short            # ★ 不得残留任何对 compare 的引用
```

### 6.3 迁移完成的整体验收清单

```bash
# ---------- 一、站点始终可构建可访问 ----------
npm run build                                  # exit 0
npx vite build --mode singlefile               # exit 0
test -f dist-single/index.html && echo OK      # ★ P2 已修复
test -f dist/lens/index.html && echo OK

# ---------- 二、单一事实来源 ----------
grep -n "resolve(root, 'lens/index.html')" vite.config.ts   # → 无输出（不再手写入口）
grep -n "TOOLS" src/portal/tools.tsx 2>/dev/null            # → 无输出（或文件已删）
npm run tools:list                             # 清单可见

# ---------- 三、类型保护无盲区（HF-4） ----------
npm run typecheck                              # exit 0
echo 'export const bad: number = "x";' > tools/lens/__probe.ts
npx tsc --noEmit ; echo "exit=$?  # 必须非 0"
rm tools/lens/__probe.ts

# ---------- 四、四层测试都在 CI ----------
npm run test:unit                              # L1
npm run test:contract                          # L2
npm run test:artifacts                         # L3
npm run e2e                                    # L4
node scripts/test-deletability.mjs             # 删除安全性

# ---------- 五、红线未破 ----------
grep -rn "chart.js" src/ tools/ platform/      # 仍只有 1 处收口
ls -a public/.nojekyll                         # 存在
grep -n "tr 'A-Z' 'a-z'" .github/workflows/deploy.yml   # 仍在
grep -n 'node-version' .github/workflows/*.yml # → 24

# ---------- 六、文档与事实一致 ----------
# HANDOFF.md:23 的「49/49 通过」现在由 CI 可复现地证明
```

### 6.4 验收的判定原则

- **"清单全勾"不等于"迁移完成"**——必须有 §6.2 的**真实演练**作为证据。
- **每一项量化上限都要留记录**（演练时的实际文件数、行数、耗时），**不要只写"通过"**。
- **若某项未达标**：记录具体差距 + 根因 + 是否值得修。**不为了让清单变绿而修改验收标准**——那正是 `04-review.md` BF-1 的教训（"改数字不是修根因"）。

---

## 7. 取舍建议：哪些批次有价值、哪些属可选优化

> **用户的第一约束是"可维护性"。不要为不存在的规模付出复杂度**（`02` §8.3 自己承认："若永远只有 1 个工具，本设计的全部基础设施收益为零，只有成本"）。

### 7.1 成本收益排序（我的判断）

| 批次 | 价值 | 判定 | 理由 |
|---|---|---|---|
| **第 1 批** | ★★★★★ | **必做** | 零产品代码改动、修复唯一行为契约的不可运行状态、解锁全部后续。**性价比最高的一批，无争议** |
| **第 2 批** | ★★★★☆ | **必做（建议）** | 纯函数反馈时间从 ~30s 降到 <1s，是"可维护性"的**量化改善**；且它是第 3 批的安全网。**成本 1–1.5 天，收益立即兑现** |
| **第 4 批** | ★★★★☆ | **必做** | 它是用户目标（"新增工具不改共享文件"）的**唯一实现路径**。但对当前 1 个工具是**纯投入**，收益要等第 2 个工具出现 |
| **第 3 批** | ★★★☆☆ | **建议做，可延后** | 价值真实（消除"假共享"误导），但**对"新增第 2 个工具"不是必需**——第 4 批的注册表不依赖 `platform/` 的存在（`platform/` 可以在第 4 批与 registry 一起建）。若时间紧，**第 3 批可与第 4 批合并**，代价是第 4 批改动面更大、回滚更难 |
| **第 5 批** | ★★★☆☆ | **建议做** | L2 通用契约（新工具质量下限自动化）+ 可删除性门禁（原则八的证明）价值高；E2E 瘦身价值中等（当前 282 行尚可维护）。**可拆：先做 L2 + deletability，瘦身延后** |

### 7.2 明确不建议做的事（附理由）

| 不做 | 理由 |
|---|---|
| **Monorepo / workspaces / Turbo / Nx / Moon** | 单包、5 个 npm script、构建以秒计。**编排器收益为负**（`02` §6.5、`03` §7.2） |
| **状态管理库（Redux/Zustand）** | `lens/App.tsx:32-42` 的 9 个 `useState` 是合理的；引入库增加概念而不减代码 |
| **组件库（shadcn/Radix）** | `shared/components/ui.tsx` 187 行已够用，且已适配本项目的 CSS 变量色板 |
| **Storybook** | 1 个工具、约 15 个组件，成本高于收益。**组件数 > 30 再评估** |
| **SSR / SSG / 微前端** | 纯静态站 + GitHub Pages，无服务端、无独立部署需求 |
| **`json-schema-to-ts`** | `04` §6.5 判定为过度设计，已砍。手写类型 + 手写校验器 + 字段集一致单测，**保护强度相同**（`04` §R2-5 独立验证了该机制的逻辑成立） |
| **`wait-on`** | 未声明依赖，`npx` 会联网下载，破坏"干净 clone 可复现" |
| **截图 diff 的可视化回归** | 现有 `canvasReport` 的像素健康度检查已覆盖最有价值的场景，且**比截图 diff 稳定** |
| **产物体积门禁** | 随依赖版本漂移（曾测得 1,475,600 → 1,476,952，**不可复现**），会造成无关的红色。**改为断言结构**（存在性、无外链 `assets/*.js`）——见 §5.3 纪律 |
| **Lighthouse / 依赖漏洞扫描** | 纯前端小页面、8 个直接依赖，人工可控（`03` §5.4） |

### 7.3 本路线中我下调优先级的项（与 `02` 的差异，附实测依据）

| 项 | `02` 的原表述 | 我的调整 | 依据 |
|---|---|---|---|
| **`platform/runtime/mount.tsx` 统一 `import './styles.css'`** | P11："每个入口重复打包一整份 Tailwind 产物"，据此作为引入 mount.tsx 的主要理由之一 | **优先级下调**（`02` 已按此回写）：仍做，但理由改为"收敛入口样板 + 上移 `IS_SINGLE` 分支"。**不作为独立收益项主张** | **实测两者引用同一个 CSS 文件名，且 `dist/assets` 下 CSS 仅 1 份**——**P11 不成立**，见 §1.4 M-3。（**判据为结构不变量**：不引用具体 hash——跨环境会变；不引用字节数——随依赖漂移。详见 §5.3 团队级纪律） |
| **`dist/registry.json` + hash 的确定性契约** | `02` §7.3 列为高级特性 | **标为可选且未实施**（t17 标注，见 §10.9）；不阻塞任何批次 | `04` §6.6 已提示收益偏低、成本也低。当前 1 个工具，`generatedAt` 与可复现构建的冲突（`03` §4.5 自己也标注了）反而是净成本。触发条件与 §10.8 的 singlefile 决策点同批评估 |
| **第 3 批与第 4 批的分离** | `03` §6 的阶段 1 与阶段 2 分开 | **保留分离（推荐）**，但明确：**若时间紧可合并**，代价是第 4 批回滚粒度变粗 | 权衡透明化，让决策者自己选 |

### 7.4 一句话总结这份路线的取舍

**必做的是第 1 批与第 4 批**——前者让"改代码"这件事重新变得可验证，后者才是用户要的"工具即插件"。

**第 2、3、5 批是让第 4 批安全的脚手架与让收益可测的仪表**，它们让第 4 批从"一次高风险重构"变成"一次有网的重构"。**若预算只够做两批，做第 1 批和第 4 批，并在第 4 批额外小心 R2（singlefile × 虚拟模块）**。

**不要做的事**：不要为"看起来先进"引入编排器、状态库、schema 推导、体积门禁。**这份设计最有价值的部分不是它引入了什么，而是它明确拒绝引入什么。**

---

## 8. 第一批实施记录（t14，已完成）

> 本节是 §2 第一批规格的**执行结果存档**。逐项对应 §2.6 的验收清单，全部实测。

### 8.1 交付清单

| 项 | 内容 | 验证证据 |
|---|---|---|
| **playwright 入库** | devDependencies 加 `playwright ^1.64.0`；lock 2 处匹配 | `npm i -D playwright --ignore-scripts` 3 秒装完、**零浏览器下载**（`ms-playwright` 目录数保持 5 不变，复用 chromium-1223） |
| **E2E 基线恢复** | `npm run e2e` → **49/49 通过，退出码 0**（此前必然 exit 3） | 两次实跑存档：t14 工作中 1 次 + captain 独立复跑 1 次（`node e2e/verify.cjs http://localhost:4199`）；另做断言破坏→恢复循环证明门禁有效（见 8.3） |
| **数据前置断言** | 新增 `e2e/prereq.cjs`：① 文件缺失 → 「请先跑 npm run data」+ exit 2；② 空数组/损坏 → 同样 exit 2 | 两条负向实测：移走 lenses.json → 明确指引 + exit 2；写入 `[]` → 「length === 0」+ exit 2。verify.cjs 顶部接线，取 `lensCount` 作 TOTAL |
| **lint 选型：oxlint** | 新增 `scripts/oxlint.main.json`（1200=error）与 `scripts/oxlint.guard.json`（800=warn） | 选型理由见 8.2 |
| **行数护栏** | 1200 行 = ERROR（阻塞）、800 行 = WARNING（不阻塞） | 正向：当前 23 文件全绿（最大 434 行）；负向见 8.4 |
| **npm scripts** | `lint` / `lint:guard` / `typecheck` | 三条各实测 exit 0 |
| **端口等待** | `scripts/wait-port.mjs`（零依赖，Node 内置 fetch 轮询） | 正向 82ms 就绪 exit 0；负向坏端口 3s 超时 exit 1 |
| **CI workflow** | 新增 `.github/workflows/ci.yml`：data → typecheck → lint → lint:guard → build → preview → wait-port → e2e，失败上传 `_shots/` | 结构自检 11 项全过；node pin 24；CI 用 `install --with-deps chromium`（与本机 `--ignore-scripts` 显式区分，写进文件头注释）；`--host 127.0.0.1` 规避 ubuntu 与本机监听差异；deploy.yml 未动 |

### 8.2 lint 选型理由（oxlint，而非 eslint/typescript-eslint）

**typescript-eslint 被否决的实测原因**：本仓 TypeScript 是 `^7.0.2`（Go 原生 tsc），而 typescript-eslint 的 peer 范围是 `typescript >=4.8.4 <6.1.0` —— `npm i -D eslint @eslint/js typescript-eslint` 直接 **ERESOLVE**（实测，见 npm 日志）。`--force` 会得到未经测试的组合，不值得。

**oxlint 够用的实测原因**：本批只需两条规则——`max-lines`（护栏）与 `no-restricted-imports`（t15 的三条依赖铁律）。`npx oxlint --rules` 实测两条均支持（1.87.0），且不依赖 TS 类型 API，不受 TS 7 影响；23 文件 13ms。迁移到 `platform/`/`tools/` 后同一份配置直接生效。

**给 t15 的预留**：三条依赖铁律在迁移批次追加到 `scripts/oxlint.main.json` 的 `rules`（配置已留注释占位）。若届时发现 oxlint 的 `no-restricted-imports` 表达力不足（如无法表达「禁止 import 兄弟工具但允许自己」），退路是写自定义规则或补装 eslint——该决策推迟到有真实配置需求时再做。

### 8.3 门禁有效性证明（负向测试）

**只跑通不算数，必须证明它能失败**：

```
① 破坏：sed 把 verify.cjs 的「工具卡片数量 === 1」改为 === 99
② 实跑：FAIL 工具卡片数量 — count=1
        ===== 汇总：48/49 通过 =====   exit=1
③ 恢复：git checkout e2e/verify.cjs（仅保留本批的 prereq 接线 7 行）
④ 复跑：===== 汇总：49/49 通过 =====   exit=0
```

**结论**：E2E 的失败会以**非零退出码**呈现 → CI 的 step 会红 → PR 无法合并。门禁真实生效。

### 8.4 行数护栏的负向证据

```
造文件 src/__linetest__/over1200.ts（1300 行）：
  x eslint(max-lines): File has too many lines (1300).
  Found 2 warnings and 1 error.      exit=1   ← 触发即构建失败 ✅

造文件 src/__linetest__/over800.ts（900 行）：
  ! eslint(max-lines): File has too many lines (900).
  Found 4 warnings and 0 errors.     exit=0   ← 只警告、不阻塞 ✅

验证后两个临时文件已删除。
```

（900 行的文件在 1200-error 配置下显示为 warning，属预期——它只超警戒线、未超硬上限。）

### 8.5 一条环境发现（影响所有本地 E2E 操作）

**本机 `vite preview` 只监听 IPv6 `[::1]`，不监听 `127.0.0.1`**：
- `curl http://127.0.0.1:4173/` → 连接拒绝；`curl "http://[::1]:4173/"` → 200
- Chromium 里 `127.0.0.1` 走 IPv4 → `net::ERR_CONNECTION_REFUSED`
- **本地跑 E2E 必须用 `http://localhost:4173`**（localhost 会解析到 ::1）

这解释了 HANDOFF「另开终端跑 preview」的隐含前提。CI 里则相反——用 `--host 127.0.0.1` 显式指定（ubuntu 的默认监听不同），并把 URL 传给 e2e。两个环境都已写进 ci.yml 注释。

### 8.6 回滚方式

| 改动 | 回滚 |
|---|---|
| playwright / lint 依赖（package.json、package-lock.json） | `git checkout package.json package-lock.json` |
| 新增配置与脚本 | 删除 `scripts/oxlint.main.json`、`scripts/oxlint.guard.json`、`e2e/prereq.cjs`、`scripts/wait-port.mjs`、`.github/workflows/ci.yml` |
| verify.cjs 的 prereq 接线（7 行） | `git checkout e2e/verify.cjs` |

## 9. 交给实施者的问题（开放项，已定位但未决）

1. **R2 未验证**（第 4 批的入口阻塞项）：`vite-plugin-singlefile` × 虚拟模块 × 派生 input 的真实交互。`04-review.md` §6.2 明确"评审的探针没装 singlefile"。**必须先跑冒烟测试。**
2. **`vitest.config.ts` 的 `include` 与 `tsconfig.json` 的 `include` 是两套**（第 2 批）：前者管测试文件发现，后者管 `tsc` 覆盖面。**不要混为一谈。**
3. **别名三处同步**（第 3 批）：`vite.config.ts:49`、`tsconfig.json:23`，加上 `vitest.config.ts`（第 2 批引入）会是第三处。`03` §4.2 建议抽 `aliases.ts` 单一来源——**实现时决定**，但必须有一处防漂移的机制（共享常量或一条一致性单测）。
4. **`e2e/*.cjs` 在 `moduleResolution: "bundler"` 下是否报错**（第 4 批 HF-4 的副作用）：**必须实测**，退路是只加 `platform`/`scripts`/`tools`。
5. **`registry.json` 的 `generatedAt` 与可复现构建冲突**（第 5 批可选；**t17 标注：未实施**，处置见 §10.9）：`03` §4.5 已标注，实现时决定（排除在 hash 外 / `SOURCE_DATE_EPOCH` / 直接去掉）。触发条件与 §10.8 的 singlefile 决策点同批评估。
6. **`icon.tsx` vs `icon.svg` 的取舍**（第 4 批 R8）：`<img>` 路径会丢失 `currentColor` 跟随主题的能力；`02` §4.3 推荐 `icon.tsx`。**实现时先验证 `currentColor` 是否仍生效。**

---

---

| npm scripts 三条 | 含在 package.json 的 checkout 里 |

---

## 10. 第二批实施记录（t15，已完成）

> 目录迁移的执行结果存档。对应 §3 批次划分中的第 2 批。

### 10.1 结构迁移清单（git mv，历史保留）

| 原 | 新 | 行数 | 说明 |
|---|---|---|---|
| `src/lens/**`（11 文件） | `tools/lens/**` | 1317 | 工具本体（App / filter / data / 7 个 section / Drawer） |
| `src/shared/lib/lens.ts` | `tools/lens/domain/lens.ts` | 206 | 假共享下沉（审计确认仅 lens 引用） |
| `src/shared/components/LensTip.tsx` | `tools/lens/components/LensTip.tsx` | 72 | 假共享下沉 |
| `src/shared/lib/chart.ts` | `platform/chart/chart.ts` | 286 | 真基础设施 |
| `src/shared/components/ChartBox.tsx` | `platform/chart/ChartBox.tsx` | 30 | 真基础设施 |
| `src/shared/components/ui.tsx` | `platform/ui/ui.tsx` | 187 | 真基础设施 |
| `src/shared/components/ThemeToggle.tsx` | `platform/ui/ThemeToggle.tsx` | 33 | 真基础设施 |
| `src/shared/useTheme.ts` | `platform/theme/useTheme.ts` | 56 | 真基础设施 |
| `lens/index.html` | `tools/lens/index.html` | 24 | 物理入口随工具走 |
| `src/lens.tsx` | `tools/lens/main.tsx` | 10 | 入口改名并迁移 |
| （新增） | `tools/lens/tool.config.ts` | 12 | 契约实现：`satisfies ToolManifest` |
| （新增） | `tools/lens/icon.svg` | 5 | 从 `src/portal/tools.tsx` 内联 SVG 抽离（P3 修复） |
| （新增） | `platform/contract/tool.ts` | 33 | ToolManifest 类型（契约单一来源） |
| （新增） | `platform/registry/plugin.ts` | ~200 | 扫描器 + 虚拟模块 + input 派生 + URL 布局重排 |
| （新增） | `platform/registry/virtual.d.ts` | 13 | 虚拟模块类型声明 |
| （删除） | `src/shared/**`（整目录） | — | 已全部按归属迁移，src/ 只剩 portal + styles + data 生成物 |

### 10.2 单一真源收敛（验收项 3）

- **扫描器** `scanTools()`：扫 `tools/*/tool.config.ts`，校验 id 与目录名一致、live 工具备齐 App.tsx + index.html、无重复 id。约定即过滤（无 tool.config.ts 的目录不是工具）。
- **虚拟模块** `virtual:toolbox/registry`：导出 `TOOLS` / `LIVE_TOOLS` / `ALL_TAGS`，门户 `App.tsx` 只 import 它，不再 import 任何工具目录。`src/portal/tools.tsx` 只剩 `SITE` 常量，工具数组已删除（P12 的数字快照一并移除）。
- **input 派生** `deriveInputs({singlefile})`：多文件 = main + 每个 live page 工具；单文件 = 恰好一个 live 工具（多于一个响亮报错——Rolldown codeSplitting=false 不支持多入口，实测 [INVALID_OPTION]）。

### 10.3 P2 根除证据（验收项 4）

```
$ mv tools/lens/index.html /tmp/
$ npm run build
error during build:
Error: [toolbox] 工具 lens：live=true 但缺少 index.html     ← 响亮失败，点名工具
exit=1
$ mv /tmp/ /恢复后 npm run build → ✓ built in 296ms
```

### 10.4 三条依赖铁律（验收项 5）

**实现方式的偏离说明（含实测原因）**：原设计用 oxlint overrides 按 files 分层配规则；实测 **oxlint 1.87 的 overrides 块整体不生效**——用 `no-restricted-imports` 探针验证：把该规则放进 overrides 的 `files: ["platform/**"]` 后，对已知违例文件（platform 下 import tools）扫描仍为 0 error，同一规则写在顶层 rules 则命中（auditor 用独立探针复证，结论一致）。即 overrides 里的规则被静默忽略。改为：

- **铁律①③**：oxlint 顶层规则 + 指定目录跑（`oxlint platform --config scripts/oxlint.iron-platform.json`；portal 同理）——实测可靠。
- **铁律②**（工具间零横向依赖）：oxlint 的 `no-restricted-imports` 在目录扫描模式下对相对 specifier 的 glob 匹配不可靠（单文件能命中、目录扫描漏，base 推断不同）——**不能建立在"有时能命中"上**，改用确定性文本扫描 `scripts/check-iron-laws.mjs`（解析 import specifier，解析绝对路径后判断是否落进兄弟工具目录）。

**负向证据（三条都有，验证后探针已删除）**：

| 铁律 | 违例探针 | 结果 |
|---|---|---|
| ① platform import tools | `platform/__iron__/bad.ts` import `'../../tools/lens/filter'` | `help: 依赖铁律①…` + **1 error, exit 1** ✅ |
| ② tools/a import tools/b | `tools/__probe2__/bad.ts` import `'../lens/filter'` | `✗ 铁律②违例：…→ 工具 lens` + **exit 1** ✅ |
| ③ portal import 工具内部 | `src/portal/__probe__/bad.ts` import `'../../../tools/lens/filter'` | `help: 依赖铁律③…` + **1 error, exit 1** ✅ |

正向：三条配置全绿（`npm run lint` exit 0，含 4 段检查）。

### 10.5 产物与行为等价（验收项 6–8）

| 项 | 迁移前 | 迁移后 |
|---|---|---|
| `npm run build` | exit 0 | **exit 0** |
| dist 产物 | index.html + lens/index.html | **相同**（URL 契约 /lens/ 保持） |
| 两入口引用同一 CSS | ✅（`useTheme--sjHHf-b.css`） | ✅（同一文件名） |
| `dist/assets/*.css` 数量 | 1 | **1** |
| `npm run build:single` | exit 0（但缺门户，P2） | **exit 0**（dist-single/lens/index.html，单工具自包含） |
| E2E | 49/49 | **49/49、exit 0**（harness.cjs 零改动、断言数 49 不变；verify.cjs +7 行为 t14 的数据前置断言接线，非本批产物；数据产物路径未变、URL 契约未变） |
| 行数护栏 | 0 触发（最大 434） | **0 触发**（最大 434，`tools/lens/sections/OverviewSection.tsx`） |
| lint | — | 4 段检查全绿 |

### 10.6 实测发现的技术事实（记录，防后人重蹈）

1. **Vite 8 (Rolldown) 的 input 合并**：`rolldownOptions` 与 `rollupOptions` 同时存在时前者胜出（debug 输出「rollupOptions specified by that plugin will be ignored」）；但**默认 main input 挂在 rollupOptions 上**——只写 rolldownOptions 时 resolved input 仍是 `{main, lens}` 两个入口。**必须两处都显式写**。
2. **Rolldown 的 HTML 产物路径**由文件相对 root 的目录结构决定，`input key` 与 `entryFileNames` 都改变不了 HTML 落点（均实测）。URL 契约 `/<id>/` 用 `closeBundle` 文件系统重排实现（`urlLayoutPlugin`，拒绝覆盖已存在目录——响亮失败）。
3. **Node 24 类型剥离的上下文限制**：CJS `require` 能剥 `.ts`；但从 ESM 上下文 `createRequire` 加载 `.ts` 会 MODULE_NOT_FOUND（剥离器只挂在 CJS require 上）。构建期直读 tool.config.ts 必须用 **ESM 动态 `import()`**。
4. **Go 原生 tsc（TS 7）的注释解析缺陷**：块注释里出现 `tools/*/` 字面量会使解析器错乱（`*/` + `/` 序列被误认为注释结束+正则开始），报 TS1127 Invalid character。注释里写 `tools/<id>/` 规避。本团队注释规范新增一条。
5. **oxlint 1.87 的 overrides 块不生效**（用 `no-restricted-imports` 真实违例探针实测：规则置于 overrides 后对违例文件 0 error、置于顶层 rules 则命中）——分层规则要用独立配置文件+指定目录跑。

### 10.7 回滚方式

本次迁移**不动 package.json 依赖**，回滚即回退目录结构：
```
git checkout HEAD -- src/ vite.config.ts tsconfig.json index.html
git clean -fd tools/ platform/
git checkout HEAD -- lens/ 2>/dev/null  # 恢复被 mv 走的 lens/index.html（如 HEAD 有）
```
（实际上 HEAD 里没有 tools//platform/，`git clean` 即可全删；`src/lens.tsx` 与 `src/shared/**` 由 checkout 恢复。）
E2E / lint / CI 配置均未因迁移改动语义，无需单独回滚。

### 10.8 遗留决策点与实现适配声明（t16 追加）

**① 单文件多工具的取舍（开放，待用户决策）**

现状：`deriveInputs({singlefile:true})` 在 live 工具 >1 时**响亮报错**（Rolldown `codeSplitting=false` 不支持多入口，实测 [INVALID_OPTION]），当前单工具下不受影响。

候选方案（出现第 2 个工具时再定，**现在不过度设计**）：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A. 契约加标记**（captain 初步倾向） | `ToolManifest.singlefile?: boolean`，与 live/external 同级；deriveInputs 读取它决定打包谁 | 契约加一个字段 + 文档说明；语义清晰（每个工具自带"要不要离线单文件版"） |
| B. 按 id 显式选择 | 构建参数 `--singlefile-tool=lens` | 每次手动指定，易漏 |
| C. 全部打包 | 每工具一个独立 HTML 循环构建 | CI 时间 ×N；且与"单文件=分享一个文件"的语义不符 |

触发条件：第二个 live 工具上线、且其作者想要离线单文件版时。

**② urlLayoutPlugin 是 Rolldown 特定适配（非通用机制）**

`urlLayoutPlugin`（closeBundle rename）是**对 Vite 8/Rolldown 特定行为的适配**：Rolldown 以 HTML 文件相对 root 的目录结构决定产物落点（input key 与 entryFileNames 实测都无法改变 HTML 位置）。**若未来更换打包器（回到 Rollup / 换 esbuild / Vite 改版），该插件必须重新验证**——Rollup 的 input key 语义与 Rolldown 不同（key 通常直接决定输出路径），届时可能根本不需要这个插件。不得把它当成跨构建器的通用机制复用。

#### 10.9 评审遗留处置（t17 追加）

**① `dist/registry.json` 契约缺口 —— 处置：标注「未实施 / 后续批次」（选②）**

`02` §7.3 设计了「清单哈希写入 `dist/registry.json` 供 CI 断言可复现」，本批（t15）**未实现**——实测 `ls dist/registry.json` 不存在。**理由（当前阶段不值得实现）**：

- `02` §7.3 自己标注了 `generatedAt` 与可复现构建的冲突（排除在 hash 外 / `SOURCE_DATE_EPOCH` / 直接去掉，三选一未决）；
- `05` §7 取舍表已把它标为「可选，不阻塞任何批次」，`04` §6.6 评审判定「收益偏低、成本也低」；
- 当前 **1 个工具**：registry.json 的消费方（L3 产物断言「HTML 集合与 registry.json 双向一致」）在单工具下等价于「dist 里恰好 main + lens 两个 index.html」——这个断言已由构建响亮失败机制（P2）与 URL 布局插件的「拒绝覆盖」隐式保证；
- 为 1 个工具引入 emit 逻辑，是**先付清全部成本、收益要等第 N 个工具才出现**——违反本文档自己的「护栏是症状不是病」原则。

**触发实施的时机**：第 2 个 live 工具上线时（与 §10.8 的 singlefile 标记决策点**同批评估**——两者都是"第 2 个工具出现时再定"）。届时实现 emit（构建期写 registry.json，含每个 live 工具的 id/route/哈希，`generatedAt` 排除在 hash 外）+ L3 产物断言。**标注位置**：§2.4 的 L3 验收描述（:715 附近）、§7 取舍表（:1061）、第 5 批条目（:1152）三处均已加同一标注，读者不会再把验收描述误读为已实现。

**在实施之前**，本文档中的相关表述按「设计意图」理解，不代表已实现——下游不得引用 `dist/registry.json` 作为已存在的验收物。

**② 「E2E 零改动」表述更正**

§10.5 原写「verify.cjs 零改动」，与 git 事实不符（verify.cjs 实有 +7 行，系 t14 的 `assertDataReady` 前置接线，属 Batch 1 范畴）。已更正为「harness 零改动、断言数 49 不变、verify.cjs +7 行为 t14 前置断言接线」。**改动本身正当（t14 交付物），仅更正归属表述。**

**③ no-var 探针证据更正**

§10.4 / §10.6 原以「no-var 探针」作为 overrides 失效的证据——auditor 指出该探针无效：`oxlint.main.json` 顶层 rules 从未配置过 no-var，探针两边都不会命中。已更正为真实的 `no-restricted-imports` 探针表述（规则置于 overrides 后对已知违例 0 error、置于顶层 rules 则命中）。**overrides 失效的结论本身成立**——auditor 已用真实探针独立复证。

> **上游文档**：[`02-target-architecture.md`](./02-target-architecture.md)（目标形态与判定标准）、[`03-engineering.md`](./03-engineering.md)（工程化细节与 §9 第一批规格）、[`01-current-state.md`](./01-current-state.md)（现状事实）、[`04-review.md`](./04-review.md)（评审结论与已否决方案）。
> **纪律**：每一批结束时都必须是**可发布状态**，且**回滚只需 `git revert` 一个提交**。不攒大改动。
