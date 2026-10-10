# 04 · 独立评审（红队）：t1 与 t6 设计文档的事实一致性

> **评审人**：auditor（独立评审）
> **评审对象**（磁盘唯一真源）：
> - `01-current-state.md`（t1，architect）
> - `02-target-architecture.md`（t6，tooling，1186 行）
> - `03-engineering.md`（t6，tooling，1132 行）
> **基线**：commit `95c0260`；评审时 `git status --porcelain` 仅 `?? .agent-teams/`、`?? docs/`
> **方法**：所有结论均由本机实测/源码直读得出，不采信任何转述。文末列出复现命令。
> **边界**：只读评审。未修改任何他人产出，未修改产品代码。

---

## 0. 结论摘要

**总体判断：三份文档的事实基础质量高，绝大部分结论经得起复验。** 我实测复现了 t1 §9 中除 D10（已撤回）以外的**全部 12 条**，以及 t6 的静默失败两条与 §0.9 一致性声明。**「t6 与 t1 无实质冲突」这个结论我予以证实**——但那是"无实质冲突"，不是"无缺陷"。

我找到了 **1 个 blocker、5 个 high**。其中最关键的一条是：**t6 自称"无冲突"的两份文档之间，对同一个数字给出了 45 与 49 两种说法**，而这正是本仓库唯一行为契约的规模。另一条是**用户已拍板的决策（E2E 进 CI）与 t6 §9 的计划在同一批内自相矛盾**。

| 级别 | 数量 | 主题 |
|---|---|---|
| **blocker** | 1 | BF-1 断言数 45 与 49 自相矛盾（本仓库唯一行为契约的规模） |
| **high** | 5 | HF-1 `:40` 用 `dist/*/` 推导已实测证伪（另两条快照应并入第一批）；HF-2 本地/CI 的 playwright 安装路径未区分；HF-3 `.ts` 直读依赖 Node 版本且 enum/PARAM 属性会崩；HF-4 `platform/` 不进 tsconfig → 新代码不受类型检查；HF-5 `wait-on` 未纳入依赖清单 |
| **medium** | 5 | MF-1 `deploy.yml` 行号引用漂移；MF-2 一致性表内部措辞自相矛盾；MF-3 §9 清洁度声明需随 HF-1 同步；MF-4 `tsconfig` include 未列为迁移步骤；MF-5 产物体积漂移，不宜作精确锚点 |
| **low** | 4 | LF-1 t1 行号微漂移；LF-2 `SITE.home` 行号；LF-3 §0.9 表头措辞；LF-4 复现命令用的是 GNU/非 Windows 形式 |

**同时，我实测证实了本设计的两处核心机制**（这是本次评审最重要的正面结论）：
1. **虚拟模块 + 派生 input 在真实 Vite 8.3.4 / Rolldown 上可行**（§6.2）——async `config` 钩子 + `enforce:'pre'` 正确派生多入口，且缺 `index.html` 时**响亮失败**而非静默产出残缺包。
2. **P2 静默失败可被根除**（§6.3）——机制已验证。

---

## 1. 我实测复现的事实（作为后续判断的基线）

### 1.1 行数口径：统一口径**完全正确**

| 口径 | 命令 | 实测 | 文档说法 | 判定 |
|---|---|---|---|---|
| 源码（手写） | `find src -type f ! -name 'lenses-inline.ts'` | **3377 行 / 24 文件** | 3377 / 24 | ✅ 精确一致 |
| src 含生成物 | `find src -type f` | **3380 行 / 25 文件** | 3380 / 25 | ✅ |
| 含 e2e + scripts | `find src scripts e2e -type f` | **3955 行 / 29 文件** | 3955 / 29 | ✅ |

`HANDOFF.md:22` 的「源码 24 文件 / 3,377 行」**完全吻合**。**D10 的 2782 与任何一种口径都对不上**，撤回正确，我不再复述。

> 附带核实：`HANDOFF.md:22` 称「E2E 2 文件 / 477 行」——实测 `e2e/harness.cjs` 195 + `e2e/verify.cjs` 282 = **477** ✅。

### 1.2 t1 §9 逐条复验结果：**12/12 复现，无不可复现项**

| # | 论断 | 我的独立实测 | 判定 |
|---|---|---|---|
| D1 | `README.md:75` 漏列 `ThemeToggle.tsx` | `ThemeToggle.tsx` 存在（33 行），消费点 `portal/App.tsx:45`、`lens/App.tsx:222` | ✅ 成立 |
| D2 | `shared/` 被宣称为跨工具复用，但 48% 是镜头专有 | `lib/lens.ts`(206) 引用者=11 个 `src/lens/**` + **LensTip 自身**；`LensTip.tsx`(72) 引用者=5 个 `src/lens/**` + 自身；**门户对 shared 的 import 实测恰好 2 行**（`portal/App.tsx:4,5`） | ✅ 成立 |
| D3 | `BRAND_CN` 46 条 | 与文档一致（非缺陷，列出仅为已核对） | ✅ 一致 |
| D4 | 原始数据 1,269,140 字节 | `ls -l` = **1,269,140** | ✅ 一致 |
| D5 | 产物 ≈0.92 MB | `public/data/lenses.json` = **965,979** 字节 = 0.921 MB | ✅ 一致 |
| D6 | `Tool.id` 无锚点消费点 | 全仓 `Tool.id` 消费点**唯一**是 `portal/App.tsx:98` 的 `key={t.id}`；`锚点` 全仓只命中 `tools.tsx:4` 注释本身；`SITE.home` **零消费点** | ✅ 成立 |
| D7 | 三步法漏 2 处 | 返回链接在 `lens/App.tsx:217-220`（`href={import.meta.env.BASE_URL}`）；`styles.css` 重复导入 `main.tsx:3` + `lens.tsx:3` | ✅ 成立（行号微漂，见 LF-1） |
| D8 | E2E 基准线不可复现 | `npm run e2e` **实测 exit 3**；playwright 在 `package.json`/`package-lock.json`/`node_modules` **三处皆无** | ✅ 成立 |
| D9 | `data-metric` 是产品为测试让路 | 全仓仅 2 处：`FilterPanel.tsx:340`、`verify.cjs:146` | ✅ 成立 |
| D11 | 单文件只构建 lens（有意） | `vite.config.ts:22` 确认；`dist-single/data/lenses.json` 冗余属实 | ✅ 一致 |
| D12 | 硬编码文案与"改源即可"矛盾 | `tools.tsx:32` 含「1,617 支」「46 个品牌」「41 种卡口」；`tools.tsx:42` meta 含「1,617」；`部署指南.md:167` 确实承诺"只要更新源文件" | ✅ 成立 |
| D13 | `dist-single/lens/index.html` = 1,475,600 | ⚠️ **见 MF-5**：该文件当前构建为 **1,476,952 字节** | ⚠️ 与文档一致但已有漂移 |

**结论：t1 §9 在撤回 D10 并自我降级 D3/D4/D5/D11/D13 为"一致项"之后，剩余 12 条全部可复现。t1 的清单是可信的。** 这一点我必须明确说清：captain 此前"整份不能采信"的警示在**流程上**正确（假阳性确实出现过），但在**事实层面**这 12 条经我独立复验全部成立，不应再被笼统质疑。

> **一处需要修正的"一致"结论（D13）**：t1 称 `dist-single/lens/index.html` = 1,475,600 字节且"完全准确"。我在**当前基线**重建后实测为 **1,476,952 字节**（差 +1,352 字节）。差异很可能来自 `vite-plugin-singlefile` / Rolldown 的版本或内联顺序变化，属于**构建产物随依赖版本漂移**，不是文档错误——但它说明"D13 精确一致"只在**当时的构建环境**下成立，**不是可长期复现的不变量**。详见 MF-5。

### 1.3 我实测复现的构建基线（与 t1 记录一致）

```
$ npm run build          → exit 0
镜头总数 1617 / 归一化总分(脏数据) 6 条 / 清洗对焦距离 968 条 / 体积 0.92 MB
→ 与 t1 §8 / memory 记录的数据管道基线完全一致 ✅

$ npm run build:single   → exit 0，但产物【缺门户】：
dist-single/.nojekyll
dist-single/data/lenses.json        ← 冗余（d11 已自认）
dist-single/lens/index.html
（dist-single/index.html 不存在 ⇒ 单文件版【没有门户入口】）
```
**这是 P2 静默失败的现场证据**：`build:single` **成功退出（exit 0）**，但产物缺失整个门户。用户拿到单文件版后无法访问工具箱主页，而 CI 不会报错——因为 CI 根本不跑这个命令。

---

## 2. Blocker

### BF-1 断言数「45」与「49」自相矛盾——且这正是本仓库唯一的行为契约

**问题**：t6 的两份文档对同一事实给出两个不同数字，其中 `03-engineering.md` **自身**在相隔 700 行的两处互相矛盾。

**证据**：
- `03-engineering.md:698`：「现状 `verify.cjs` 的 **45 条**断言，逐条给出归属」
- `03-engineering.md:739`：「瘦身结果：约 **45 条** → L4 保留约 20 条」
- `03-engineering.md:28`：「282 行 / **49 条**断言 | `grep -c 'r.ok(' = 49`」
- `03-engineering.md:1048`：「**49 条** E2E 断言是本仓库**唯一**的行为契约」
- `02-target-architecture.md:81`：「282 行、**49 条**断言（`r.ok(...)` 调用共 49 处）」
- **实测**：`grep -c "r.ok(" e2e/verify.cjs` → **49**

**为什么这是 blocker 而不是 medium**：
1. `:28` 与 `:81` 都明确写了测量命令并给出 49，`tooling` 显然**知道**正确值是 49。`:698`/`:739` 的 45 是他自己曾经自纠过的数字（t6 交付说明称"3 处自纠确认落盘：断言数 49"）——**说明自纠只落盘了一部分，`§4.6` 整节仍是旧数字**。
2. `:698` 是 §4.6 迁移映射表的**入口陈述**。实施者按此表做"45 条 → 20 条保留"的瘦身时，会以为已覆盖全部断言，**实际有 4 条从未被归属**——这 4 条会在迁移中静默丢失。**这与本设计的核心目标（消灭静默失败）直接冲突。**
3. 我核对了该表实际只有 **37 行**映射条目，连 45 都不到。所以 §4.6 的表**既不完整、基数也错**。

**建议修法**：
- 把 `:698`、`:739` 的 45 全部改为 49。
- **更重要**：§4.6 的表必须补齐到 49 条，并加一条自检断言——建议在 `03-engineering.md` 或校验脚本里固定写死：
  `test $(grep -c 'r.ok(' e2e/verify.cjs) -eq $(grep -c '^| .*:[0-9]' <(sed -n '/### 4.6/,/### 4.7/p' 03-engineering.md))`
  即让"映射表条目数 == 实际断言数"成为**可机检**的不变量。否则下次改 `verify.cjs` 仍会漂移。
- 建议同时把"45"这个数字从两份文档中彻底清除，避免再次误导。

---

## 3. High

### HF-1 第一批「不修快照断言」的推迟**不成立**（应并入第一批），且 tooling 的撤回方案有一处**已被我实测证伪**

**背景**：用户明确要求「E2E 硬编码期望值改为从数据源推导」。`03-engineering.md:1099` 原本把「修 `verify.cjs:40` 等快照断言」列为本批**不做**，理由是其解耦"依赖注册表存在（第二批）"。tooling 随后**自行撤回了这个保守判断**，给出新方案：

| 断言 | 原写死值 | tooling 的撤回方案 | 我的判定 |
|---|---|---|---|
| `:86,:106,:141,:144,:152,:157,:164` | `1617` | 读 `public/data/lenses.json` 的 `length` | ✅ **成立** |
| `:91` | `9.5` | 对数据求 `max(overall)` | ✅ **成立** |
| `:40` | 卡片数 `=== 1` | **数 `dist/*/` 产物目录数** | ❌ **实测证伪（见下）** |
| `:94/:213`、`:103`、`:102/:176` | 8 画面/100 行/3-4 支 | 留第二批 | ✅ **合理**（耦合视图结构，非数据源） |
| `harness.cjs:95-127` `canvasReport` | 像素健康度 | 任何批次都保留 | ✅ **正确**（不变量断言） |

**关于 `1617` 与 `9.5`（HF-1a）——撤回成立，我实测支持并入第一批**：
这两条的正确来源是 `public/data/lenses.json`，该文件由 `npm run data` 生成，**在第一批就已存在**，**完全不依赖注册表**。改法是自包含的（顶部 `require('../public/data/lenses.json')`，断言改为 `=== DATA.length`）。
**而且改后断言更强**：它从"数据恰好是 1617"变成"**页面展示 == 数据源**"，正是用户点名要的语义。**建议并入第一批。**

**关于 `:40` 用「数 `dist/*/` 产物目录数」（HF-1b）——我实测证伪，此方案不可用**：

我在本仓库实际跑了 `npm run build`，然后：

```
$ ls -d dist/*/
dist/assets/    dist/data/    dist/lens/
$ ls -d dist/*/ | wc -l
3          ← 而实际卡片数是 1
```

**`dist/` 下的顶层目录有 3 个**：`assets/`（打包产物）、`data/`（数据文件）、`lens/`（唯一工具）。naive 的 `dist/*/` 计数会得到 **3**，与页面上的 **1** 张卡片不符——**这条断言会立刻失败，而且是"看起来像数据问题"的误导性失败**。

**改进形式 `dist/*/index.html` 我实测是对的**：
```
$ ls -d dist/*/index.html
dist/lens/index.html        → count = 1  ✅
```
它天然排除了 `assets/`、`data/`（无 `index.html`），也排除了门户（`dist/index.html` 是根级文件、不是目录）。**但仍有三个未解决的问题，我不建议采用**：

1. **单文件模式下语义不同**。我实测 `npm run build:single` 的产物是：
   ```
   dist-single/.nojekyll
   dist-single/data/lenses.json
   dist-single/lens/index.html      ← 只有 lens，门户 index.html 完全缺失
   ```
   计数仍是 1，**看似可用**——但这是**巧合**：单文件模式当前本来就只构建 lens（即 P2 的 bug）。一旦 P2 被修复（单文件也纳入所有 live 工具），此计数才真正对齐。**用一个"当前被 bug 掩盖"的产物结构做断言基准，是把断言焊死在缺陷上。**
2. **`live: false` 会静默错配**。产物目录包含**所有**构建出来的工具，而门户卡片只渲染 `live: true` 的（`portal/App.tsx:30` 的 `liveCount`、`:100` 的 `SoonCard`）。若引入一个 `live: false` 的工具并让它进了构建，目录数会**大于**卡片数 → 断言误报失败。而"live:false 不纳入构建"正是 `02-*.md:517` 的设计意图，两者会打架。
3. **它测的不是"卡片数"**。`:40` 的断言本体是 `page.locator('main a[href]').count()`，即**用户实际看到的卡片**。用产物目录做对照，是拿**构建事实**去比对**渲染结果**——中间隔了门户的过滤逻辑（tags/search/live/`list.length > 0`）。**这恰恰失去了用户要的"页面展示 == 数据源"语义。**

**建议修法（HF-1b 替代方案）**：
- **第一批**：只把 `:86/:91` 等**数据类**快照改为读 `public/data/lenses.json`（撤回成立，收益确定、零依赖）。
- **`:40` 保持第二批，且不要用 `dist/*/`**。正确来源就是注册表（`LIVE_TOOLS.length`）——它是"门户应该渲染多少张卡片"的唯一权威语义，且 `02-*.md:448` 的虚拟模块已经导出了 `LIVE_TOOLS`。**这恰好印证了 t6 原稿的理由是对的**：这条断言确实依赖注册表。
- **结论：tooling 的撤回是"方向正确、其中一条过火"。** `1617`/`9.5` 该并入第一批；`:40` 应维持第二批（原判断正确），且**必须废弃 `dist/*/` 这个推导源**。

> 附带实测（与 HF-1 相关）：本仓库 `npm run build` 实测 **exit 0**，输出 `镜头总数 1617 / 归一化总分(脏数据) 6 条 / 清洗对焦距离 968 条 / 体积 0.92 MB`，与 t1 记录的数据管道基线**完全一致**。

### HF-2 本地 / CI 的 playwright 安装路径未区分——最容易踩的坑

**问题**：`03-engineering.md` 在 §4.7 已正确选择方案 A（进 devDependencies，`:752`/`:756`），但**第一批的执行步骤**（`:1063`、`:1106`）让实施者无条件跑 `npx playwright install chromium`，**没有区分"本机可复用已有浏览器"与"CI 必须下载"**。

**证据**：
- `03-engineering.md:1063`：「`npm i -D playwright` → `npx playwright install chromium`」（无条件的）
- `03-engineering.md:1106`：§9.4 验收序列里同样是无条件 `npx playwright install chromium`
- `03-engineering.md:1075`：CI 步骤写的是 `npx playwright install --with-deps chromium` ✅（CI 侧正确）
- 对比 `harness.cjs:8-9` 原注释：「playwright（不进 devDependencies，避免 CI 的 `npm ci` 顺带下载浏览器）」

**风险**：实施者照 `:1063` 在本机执行 `npx playwright install chromium`，会**无谓地下载一份新 chromium**（覆盖/并列已有的 1223），耗时且可能与现有 `findChrome()` 取"最新目录"的行为产生**版本漂移**（`findChrome` 取 `.sort().reverse()[0]`，新下载的 build 号若更高就会被优先选中，导致"本机原本能过、装完反而变了行为"）。

**我的实测证据（这是用户决策依据，我重跑并留存）**：

```
[1] npm i -D playwright --ignore-scripts
    → "added 2 packages in 2s"   ELAPSED_MS=2207
    → installed version = 1.64.0
[2] 显式指定已有二进制启动
    → LAUNCH_OK version=148.0.7778.96 text=proof
[3] 是否偷偷下载了浏览器？
    → ms-playwright 目录数 = 5（chromium-1223 / chromium_headless_shell-1223 / daemon / ffmpeg-1011 / winldd-1007）
    → 与安装前完全一致 ⇒ 零下载
```

**结论（纳入正式评审基准）**：
- **本机**：`npm i -D playwright --ignore-scripts` 即可（3 秒、零联网），**不需要** `playwright install`；`harness.cjs:41-63` 的 `findChrome()` 现成匹配 `chromium-1223/chrome-win64/chrome.exe` 布局，**一行不用改**。
- **CI**：**必须** `npx playwright install --with-deps chromium`——CI runner **没有**本机那份 chromium-1223，`--ignore-scripts` 在 CI 上会导致 `findChrome()` 返回 `undefined`，随后 playwright 用默认路径查找并报 `Executable doesn't exist`。`:1075` 已经写对了，问题只在于**没有把两者的差异显式讲清楚**。

#### ⚠️ 环境归属声明（区分「可行性已验证」与「仓库当前状态」）

这两件事必须分开陈述，否则会误导实施者：

| | 结论 | 说明 |
|---|---|---|
| **可行性** | ✅ **已验证** | "playwright 可离线复用已有 chromium" 这一机制成立，证据见上表 |
| **仓库当前状态** | ❌ **仍是干净未装** | 干净 clone 下 `npm run e2e` **依旧必然 exit 3**；第一批要做的事**一件都没少** |

**证据（我在本仓库实测，`/d/docs/01-my-website`）**：
```
$ grep -c "playwright" package.json                    → 0
$ grep -c '"node_modules/playwright' package-lock.json → 0
$ ls -d node_modules/playwright                        → 不存在
$ git status --short                                   → 仅 ?? .agent-teams/ 与 ?? docs/
```
**即：依赖文件与产品代码零改动；playwright 未装入本仓库。**

**环境归属说明**：上述 playwright 预验证（3 秒 / 2 包 / 零下载 / `LAUNCH_OK 148.0.7778.96`）**全部在仓库外的隔离目录 `/tmp` 下进行**（`/tmp/pwproof`），**不是**在 `/d/docs/01-my-website` 内，因此**未写入本仓库的 `package.json` / `package-lock.json` / `node_modules`**。`ms-playwright` 目录数在验证前后均为 **5**，与初始状态一致。所有 `/tmp` 探针目录**已删除**，无残留。

> 之所以要特别声明：验证结论证明的是**可行性**，不是"本仓库已装好"。**实施者不可据此以为 `npm run e2e` 现在就能跑**——它依旧 exit 3。

**建议修法**：在 §9.2 任务 1.1 增加一行显式的双路径说明：

| 环境 | 命令 | 说明 |
|---|---|---|
| 本机（已有 ms-playwright 缓存） | `npm i -D playwright --ignore-scripts` | 复用已有 chromium；实测 3 秒、零下载 |
| CI | `npm i -D playwright` **+** `npx playwright install --with-deps chromium` | runner 无缓存，必须下载（1–2 分钟，配 `~/.cache/ms-playwright` 缓存） |

并**明确警告**：本机不要跑 `playwright install chromium`，否则会新增一份 build 号可能更高的浏览器，改变 `findChrome()` 的选取结果（`.sort().reverse()` 取最新）。

**当前仓库真实状态（防止实施者误判起点）**：`git status --porcelain` = 仅 `?? .agent-teams/`、`?? docs/`；`git diff --stat HEAD` 为空；`package.json` 无 playwright；`package-lock.json` 匹配数 0；`node_modules` 中**无** playwright。**即：仓库当前是干净状态。** 我此前的探测安装全部发生在 `/tmp` 下的隔离目录，**未污染本仓库**，且探测目录已删除。`ms-playwright` 目录数与初始一致（5 个）。

### HF-3 `.ts` 直读依赖 Node 版本，且 `enum`/参数属性会直接崩溃

**问题**：t6 的方案让**构建期 Node 直接 `import()` 工具的 `tool.config.ts`**（`02-target-architecture.md:481`、`03-engineering.md:160` 的 `scripts/validate-tools.mjs`）。这在 Node 22+ 靠"类型剥离"工作，但有**两个实现陷阱没有被文档提及**。

**我的实测证据**：

```
Node v24.21.0
[OK]   export const x: number = 1;              → TS-IMPORT-OK 1 HI
[OK]   export function f(a: string): string     → 可用
[FAIL] export enum E { A, B }                   → ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX
[FAIL] class C { constructor(public a: number) {} } → ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX
```

**风险**：
1. **Node 版本下限未声明**。CI 用的是 `deploy.yml` 里的 `node-version: 22`，本机是 24。类型剥离在 **22.6+ 才默认开启**（22.x 早期需 `--experimental-strip-types`）。若 CI 用 22.0–22.5，`scanTools` 会在 CI 上崩而本机正常——**典型的"本地能跑 CI 不能跑"**，而这正是本设计 §7.3 声称要消灭的失败模式。
2. **`enum` 与构造函数参数属性是硬失败**，不是警告。工具作者若在 `tool.config.ts` 里用了 `enum`（很自然），构建直接崩，且错误信息是 Node 内部的 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`，**不指向具体是哪个工具**。

**建议修法**：
- 在 §3.3/§4.1 显式写明**约束**：`tool.config.ts` 必须只使用可剥离语法（**禁止 `enum`、`namespace`、构造函数参数属性**），且这条要**由 L2 契约测试或 lint 规则强制**，不能只写在文档里。
- CI 的 `node-version` 从 `22` 提升为 `24`（或至少显式写 `22.6+`），并把"构建期 TS 直读"列为该项决策的理由。
- **退路**（建议同时写入文档）：若不想依赖 Node 的类型剥离，让 `tool.config.ts` 只做 `export default { ... } satisfies ToolManifest`（纯字面量，无类型导入）——但注意 `02-target-architecture.md:444` 的示例**恰恰 import 了类型** `import type { ToolManifest } from '@app/contract/tool'`。`import type` 是可剥离的，但仍要求解析 `@app/contract/tool` 这个**别名**——**Node 不认识 tsconfig 的 `paths`**，这一步会失败。**这是一个文档未覆盖的真实缺口。**

> **HF-3 的补充实证说明**：我的探针里 `tool.config.ts` 用的是**纯字面量、无 import**，所以成功了。而 t6 文档给出的示例（`:444`）含 `import type ... from '@app/contract/tool'`。在 Node 直读场景下，"`import type` 被剥离"与"模块解析器仍需处理该 specifier"是两件事——实施时必须实测。我建议把这一条列为**实现阶段第一优先验证项**（与 R3 同级）。

### HF-4 `platform/` 等新增目录不进 `tsconfig.json` → 新代码不受类型检查

**问题**：目标架构把大量新代码放在 `platform/`（`02-target-architecture.md:397` 的 `platform/contract/tool.ts`、`:526` 的 `platform/registry/virtual.ts`、`:633` 的 `platform/registry/inputs.ts`、`:1042` 的 `platform/runtime/mount.tsx`），并在 `03-engineering.md:160` 让 `scripts/validate-tools.mjs` 引用 `../platform/registry/scan.ts`。但：

**证据**：`tsconfig.json:25` → `"include": ["src", "vite.config.ts"]`。**不含 `platform/`、`scripts/`、`e2e/`。**

**后果**：
1. 新增的 `platform/**` 与 `scripts/**` 里**任何类型错误都不会被 `tsc --noEmit` 捕获**——而 CI 的闸门核心就是 `tsc`。**新代码在类型检查的盲区里。**
2. `03-engineering.md` 的 CI 设计（`:764+`）与 `02-target-architecture.md` §6.2 的 9 项闸门**都建立在 `tsc` 有效的前提上**，但没有任何一处提到需要**同步扩 `tsconfig.include`**。
3. 更微妙：`02-target-architecture.md:466` 强调 `satisfies ToolManifest` 是"编译期校验字段拼写"的关键机制——**但 `tools/**/tool.config.ts` 同样不在 include 内**，这个"关键机制"在最需要它的地方（新增工具）**根本不生效**。

**建议修法**：
- 在迁移计划里显式增加一步：`tsconfig.json` 的 `include` 扩为 `["src", "platform", "scripts", "e2e", "vite.config.ts", "tools"]`。
- 注意副作用：扩 include 后 `e2e/*.cjs` 仍是 CommonJS，需确认 `moduleResolution: bundler` 下不报错（当前 `skipLibCheck: true` 有帮助，但要实测）。
- 把这条写进**第二批入口条件**，因为它必须在引入 `platform/` 的**同一个提交**里完成，否则会有一个"新代码无类型保护"的窗口期。

### HF-5 `wait-on` 未纳入依赖清单，第一批验收序列步会直接失败

**问题**：`03-engineering.md:1075` 的 CI 步骤与 `:1111` 的验收序列都使用 `npx wait-on http://127.0.0.1:4173`，但 `wait-on` **不是依赖**。

**证据**：
- `grep -c "wait-on" package.json package-lock.json` → **均为 0**
- `ls node_modules | grep -x wait-on` → **不存在**

**后果**：`npx wait-on` 会触发**联网即时下载**（npx 对未知包的行为）。在 CI 上这会：① 引入未锁定的第三方包（可维护性反面）；② 若 registry 受限则直接失败；③ 使"干净 clone 可复现"这一验收标准（`:1116`）**不成立**——因为多了一个未声明的网络依赖。而 `§9.1` 的第一条理由恰恰是"没有回归网的重构是盲改"，验收标准又写着"干净 clone → 命令序列全部通过"。

**建议修法**（三选一）：
- **推荐**：把 `wait-on` 加进 `devDependencies`（与会 HF-2 的 playwright 同批），版本锁定。
- 或用**零依赖**替代：`npx vite preview` 之后用一个 3 行的 Node 轮询脚本（`fetch` + 重试）等待端口就绪。**考虑到本批的定位是"最小、可复现、零产品代码改动"，零依赖方案更契合。**
- 至少必须在 §9.2 的"涉及文件"里写出 `package.json` 要加 `wait-on` —— 当前 `:1061` 只写了 playwright。

---

## 4. Medium

### MF-1 `deploy.yml` 行号引用漂移（部分正确）

- `03-engineering.md:154`：「**CI 从未跑过 `build:single`**（`deploy.yml:60` 只跑 `npm run build`）」
  → **实测 `deploy.yml:60` 确实是 `run: npm run build`** ✅ 正确。
- 但 `02-target-architecture.md:172` 写的是 `deploy.yml:60`，而 t6 交付说明里写的是 `:41/:60/:64` 与 `:46-55`。**实测**：`:46` = 计算 base 路径、`:49-50` = `tr 'A-Z' 'a-z'`、`:59` = `VITE_BASE`、`:60` = `npm run build`、`:64` = `upload-pages-artifact`。**所以 `:60` 与 `:46-55` 都对，`:41` 实为 `:46`**（漂移 5 行）。
- **影响**：低危但会造成复核困惑。**建议**：统一为 `:60`（构建步骤）与 `:46-55`（base 计算），删掉 `:41`。

### MF-2 §0.9 一致性表内部措辞自相矛盾（P10 归属）

- `02-target-architecture.md:165`：「✅ 一致。**本文档额外补入 t1 的发现**：`index.html` 复制不到返回链接（P10）」
- `02-target-architecture.md:171`：表格另起一行，把 **P10/P11/P12 列为「t1 独有，本文档补入」**
- `02-target-architecture.md:167`：把 **B5** 标为「⚠️ **t1 独有且正确**」

三处对"哪些是 t1 独有、哪些是本文当补入"的说法不统一：`:165` 说 P10 是"t1 的发现"（对），但把它挂在 **B3 那一行**（B3 是"物理平台入口 HTML"，与 P10 不是一回事）。**结论不受影响（无实质冲突成立），但表格归属混乱，会让读者以为 B3 包含 P10。**

**建议修法**：`:165` 删掉关于 P10 的那半句，让 P10 只出现在 `:171` 那一行。

### MF-3 §9 的"零产品代码改动"声明需限定范围

`03-engineering.md:1049`：「它是**零产品代码改动**的一批。只动 `package.json` + `e2e/` + CI 配置，**不碰 `src/`、`vite.config.ts`、`scripts/`**」，`:1119` 的判定标准 4 也据此要求 `git diff` 不含这三处。

**这条声明我核实为真**（当前 `git diff --stat HEAD` 为空，只有未跟踪的 `docs/`、`.agent-teams/`）。但 HF-1 建议把 `verify.cjs:86/:91` 的数据源推导并入第一批后，**`e2e/` 会被修改**——这与 `:1049` 不冲突（`e2e/` 本就在允许清单内），但 `:1099` 的"不修快照断言"必须同步改，否则文件内部自相矛盾。**请与 HF-1 一并处理。**

### MF-4 `tsconfig` 的 include 未在"涉及文件"中列出

与 HF-4 同源。`03-engineering.md:1011+` 的自我约束/成本章节、`02-target-architecture.md` §6.2 的闸门表，均未把 `tsconfig.json` 的 include 扩展列为迁移步骤。**建议**：并入 HF-4 的修法。

### MF-5 `dist-single/lens/index.html` 体积已漂移，不应作为"精确一致"的验收锚点

- t1 D13 与 `HANDOFF.md:343`/`:639` 均记 `dist-single/lens/index.html` = **1,475,600** 字节，并称"完全准确"。
- **我在当前基线重建后实测 = 1,476,952 字节**（`wc -c`，差 **+1,352** 字节，约 +0.09%）。

**判定**：这不是文档造假，而是**构建产物体积随依赖版本漂移**——`vite-plugin-singlefile` 的内联顺序、Rolldown 的压缩输出都会影响最终字节数。问题在于**把它写成"精确一致"会制造一个假的不变量**：下一个人按此校验会失败，且会误以为"构建坏了"。

**建议修法**：
- 把该数字从"精确断言"降级为"**参考量级**（≈1.47 MB）"，或标注"随依赖版本浮动"。
- **不要**把产物体积写进 CI 门禁（体积断言会造成无关的红色）。若要门禁，应断言**结构**（如"`dist-single/lens/index.html` 存在""单文件内无外部 `assets/*.js` 引用"），而不是字节数。
- 同理适用于 D5（产物 0.92 MB）——本次实测 `npm run data` 报告 0.92 MB，仍然吻合，**但同样只是量级参考**。

---

## 5. Low

### LF-1 t1 与文档的返回链接行号微漂移
t1 §9 D7 与 captain 提示均写 `src/lens/App.tsx:216`；**实测 `<a>` 元素位于 `:217-220`**（`:216` 是 `) : (` 的分支行）。**结论不变**（返回链接确实写死、模板复制不到），仅行号需修正为 `:217`。`02-target-architecture.md:165` 的 `212-221` 区间引用是**正确**的。

### LF-2 `SITE.home` 的行号
t1 写 `tools.tsx:52`；**实测 `SITE.home` 定义在 `:48`**（`export const SITE = {` 在 `:48`，`home:` 在 `:52`——按"字段行"计 t1 也对）。**零消费点的结论正确**，无需修改。

### LF-3 §0.9 表头措辞
`:159` 写「本文档的 P 编号与 t1 的 B 编号是**两套独立得出的结论**」——这是**准确且诚实**的表述，值得保留。仅提示：由于 t6 成文晚于 t1 且已回读补齐，说"独立得出"对 B5/P10/P11/P12 已不完全成立（这些是回读引入的）。**不影响任何结论。**

### LF-4 复现命令的平台适配
`01-current-state.md:450-465` 与 `03-engineering.md:1103-1112` 的命令是 GNU/bash 形式（`find`、`&` 后台、`wdiff` 风格）。本机是 **Windows + Git Bash**：`find` 可用，但 `npx vite preview --port 4173 &` 在 pwsh 下不可用。**建议**在文档里标注"命令为 Git Bash 环境"，或补一份 PowerShell 等价形式。低危（captain 与 tooling 都在 Git Bash 下工作）。

---

## 6. 各审查维度的结论

### 6.1 可实施性：「新增第三个工具零共享文件改动」——**成立，但有一个未覆盖的缺口**

我按 captain 要求做了一次思维演练：新增一个 `tools/compare/`（依赖**不同数据源**，比如从 `public/data/prices.json` 读）。

**演练结果**：

| 步骤 | 是否需改共享文件 | 说明 |
|---|---|---|
| 建 `tools/compare/` 目录 | ❌ 不需要 | 扫描器自动发现 ✅ |
| 写 `tool.config.ts` | ❌ 不需要 | `id` 由目录名校验 ✅ |
| 写 `App.tsx` + `index.html` | ❌ 不需要 | input 由注册表派生 ✅ |
| 提供 `icon.tsx`/`icon.svg` | ❌ 不需要 | 图标在工具目录内 ✅ |
| 数据交付 | ⚠️ **半自动** | 若工具自带 pipeline，需有人**运行** `npm run data` 并确保产物路径约定一致——`02-target-architecture.md` §4.4 给了契约，但"工具自带 pipeline 的产物如何进入 `public/`"的约定**在文档里是描述性的，没有可执行示例** |
| 类型检查 | ❌ **受影响** | `tools/` 不在 `tsconfig.include` → `satisfies ToolManifest` 不生效（**HF-4**） |
| `tool.config.ts` 用 `enum` | ❌ **会崩** | Node 类型剥离硬失败（**HF-3**） |

**结论**：对"注册表 + input 派生 + 图标"这三件事，**零共享文件改动的目标确实达成**——而且我用真实 Vite 8.3.4 **实测验证了核心机制可行**（见 §6.2）。缺口集中在**类型检查盲区**（HF-4）与**构建期 TS 直读约束**（HF-3）这两处，它们都不是架构问题，而是"迁移步骤清单漏项"。

### 6.2 核心机制实测：虚拟模块 + 派生 input **确实可行**（本评审最重要的正面结论）

由于整个设计建立在这两个机制上，我在隔离目录用**本仓库真实的 Vite 8.3.4 / Rolldown** 搭了最小复现：

```
[1] 虚拟模块 resolveId/load + async config 钩子派生 input
    → npx vite build 成功
    → [toolbox-inputs] derived input keys = main,alpha,beta
    → 产物正确生成，虚拟模块内容（Alpha/Beta）确认进入 bundle
    → 证明：async config 钩子 + enforce:'pre' 能正确派生多入口

[2] 故意让一个 live 工具缺 index.html
    → 构建【响亮失败】：
      Error: [toolbox-inputs] gamma: live 工具缺少 index.html
    → 证明：P2 的静默失败【确实被根除】，错误信息可定位到具体工具

[3] 两种 mode（多文件 / singlefile）下 input 派生均正常
    → dist/ 与 dist-single/ 均生成 index.html + tools/alpha/index.html
```

**这是对 t6 §4.1/§4.2 设计的有力证实**：`config` 钩子在 input 解析**之前**运行（设计正确），`enforce: 'pre'` 让校验先于 rolldown 的模糊报错（设计正确），且失败是**响亮的、带工具名的**（原则七落地）。

> **R2 仍未验证**：我的探针**没有**装 `vite-plugin-singlefile`，所以 singlefile 与虚拟模块的真实交互（是否产生多余 chunk / 内联是否失败）**没有被验证**。`02-target-architecture.md:1120` 自己也把 R2 标为"实现时先做冒烟测试"——**这个标注是诚实的，我确认它仍需实测**。建议实施第二阶段前先补这个冒烟测试。

### 6.3 静默失败：两条**均属实**，且新方案能根除

| 论断 | 实测 | 判定 |
|---|---|---|
| `vite.config.ts:22` 单文件模式只构建 lens | `const input = single ? { lens: ... } : { main, lens }` ✅ | **属实** |
| `deploy.yml` 的 CI 从未跑过 `build:single` | `deploy.yml:60` 只有 `run: npm run build`；全文 grep 无 `build:single`、无 `singlefile`、无 `e2e` ✅ | **属实** |
| 新方案是否根除 | 实测 [2]：缺 `index.html` 时构建**响亮失败**，而非产出残缺产物 ✅ | **可根除，机制已验证** |

> 补充：`deploy.yml` 全文共 76 行，我通读确认**没有任何测试步骤**（无 e2e、无 lint、无单测）。所以当前 CI 的唯一质量门禁就是 `npm run build`（内含 `tsc --noEmit`）。t1 与 t6 对此的描述准确。

### 6.4 风险与回归：HANDOFF §9 六条硬约束 **全部未受威胁**

| 硬约束 | 实测证据 | 新方案的影响 |
|---|---|---|
| Chart.js 收口 | 全仓 `chart.js` 只有 **1 处** import：`shared/lib/chart.ts:9`（且是 `import type`） | 目标架构未触碰；**建议在迁移中保留这条收口** |
| ChartCard/ChartBox 高度契约 | `ChartBox.tsx` 30 行存在 | 未提及改动；低风险 |
| 主题 class 渲染期同步写入 | `useTheme.ts:27-31`（文档 §9 明确"保留"） | 已在 `02-*.md:1162` 列为"必须原样带走"✅ |
| 大 JSON 保持 string 常量 | `prepare-data.mjs:89` → `export const LENSES_JSON = ${JSON.stringify(json)}`；产物 `lenses-inline.ts` 是**单行字符串** ✅ | `02-*.md:1160` 已列为保留项 ✅ **这条最关键，文档已正确识别** |
| `.nojekyll` | `ls -a public/` → `.nojekyll` **存在** ✅ | 未被触碰 |
| base 路径判断 | `deploy.yml:46-55` 含 `tr 'A-Z' 'a-z'` ✅ | `02-*.md:1166` 已列为保留项 ✅ |

**结论：六条硬约束在 t6 的设计中都被显式保护（§9 的"有意保留"表质量很高），无回归风险。** 特别值得肯定的是 `.nojekyll` 与 `base` 路径这类"无声失效"的细节都被点到了。

### 6.5 过度设计：**总体克制，1 处建议砍**

t6 主动列了"不建议引入"（`02-*.md:1016` Turbo/Moon）与"暂不实现"（`:1097`），并在 `:724` 对每个高级特性都标注了维护收益——这个纪律是好的。

**唯一的过度设计嫌疑**：`02-*.md:1071` §7.4「工具元数据的 schema 单一来源」+ R4（`json-schema-to-ts`）。
- 该节为了"元数据 schema 单一来源"引入运行时 schema + 类型推导（`FromSchema`），风险表 R4 自己承认"可能引入 `json-schema-to-ts`"。
- **判定**：对**当前 1 个工具**的仓库，`satisfies ToolManifest` + 手写 `validateManifest`（`:470`）**已经足够**——它同样能实现编译期字段校验与运行时校验。引入 schema 推导的价值要等到"工具数量多到 schema 需要跨语言消费"时才出现，而那**不在可预见范围内**（用户第一约束是可维护性，不是规模）。
- **建议**：按 R4 的退路（"手写类型 + 手写校验器 + 一条字段集一致单测"）执行，**明确不引入 `json-schema-to-ts`**；把 §7.4 降级为"暂不实现"与 §7.5 并列。这样少一个依赖、少一层推导魔法。

### 6.6 目标对齐：**良好**

- 文档开篇即声明「**可维护性 > 可扩展性 > 先进性 > 性能**」（`02-*.md:11`），并在 §8.3 诚实写出「**若永远只有 1 个工具，本设计收益为零**」——**这种自我限定的诚实值得肯定**，也正因如此，它可以被视为对齐了用户约束。
- §8.2 的三个取舍（虚拟模块 vs 生成脚本、扫描 vs 显式注册、门户不做成工具）都给出了**面向维护成本**的理由，不是技术偏好。
- **一处提醒**：§7.3「注册表确定性契约（写 `dist/registry.json` + hash）」在当前规模下收益偏低，但成本也低（一个排序 + 一次哈希），**不列为缺陷**，仅建议标为可选。

### 6.7 第一批可行性：**可行，但缺 4 项前置说明**

**结论：方向正确，选定"先修回归网"是正确的第一批。** 理由（`:1046-1051`）成立且我认同。四处必须补：

1. **HF-2**：本地与 CI 的安装路径差异要写清（本机跳过 install；CI 必须 install）。**这是最容易让实施者踩坑的一处。**
2. **HF-5**：`wait-on` 未声明依赖，破坏"干净 clone 可复现"。
3. **HF-1a**：`verify.cjs:86/:91` 的数据源推导本批就能做，应并入（用户点名要求）。
4. **HF-1b**：`:40` 的 `dist/*/` 推导方案**已实测证伪**，不要采用；维持第二批 + 用注册表。

另外一条**正面确认**：`:1076` 的"故意让一条断言失败，CI 必须变红"是**优秀**的验收设计——它证明门禁真的生效，而不是只打印通过。这条应当保留，**建议对所有新增 CI 闸门都采用这个模式**。

---

## 7. 对 captain 三个具体问题的直接回答

**Q1：t6 §9 是否把「playwright 进 devDependencies」写成待定或倾向 B？**
**答：没有。** `03-engineering.md:756` 明确「**推荐 A + 缓存**」，理由写得很清楚（"可复现性优先于 CI 时间……B 方案会让'CI 挂了但本地能过'成为常态"）。**与用户决策一致，不构成缺陷。** 真正的缺陷是 HF-2（local/CI 安装路径未区分）与 HF-5（`wait-on` 未声明）。

**Q2：既然要进 CI，本机复用 chromium 与 CI 必须下载是否被清晰区分？**
**答：没有被清晰区分。** `:1075` 的 CI 步骤写对了（`--with-deps chromium`），但 `:1063`/`:1106` 让实施者无条件跑 `playwright install chromium`，**没有说明本机可跳过**。**已标为 HF-2（high）。** 我已附上重跑的可复现证据（3 秒 / 2 包 / 零下载 / LAUNCH_OK 148.0.7778.96）。

**Q3：把「修快照断言」推迟到第二批是否合理？tooling 的撤回是否成立？**
**答：tooling 的撤回方向正确，但其中一条我已实测证伪，应维持原判断。**

- **成立、应并入第一批**：`:86/:106/:141/:144/:152/:157/:164` 的 `1617` → 读 `public/data/lenses.json` 的 `length`；`:91` 的 `9.5` → 数据求 `max(overall)`。这两类**不依赖注册表**，且改后断言更强（"页面展示 == 数据源"，正是用户要的语义）。**已标 HF-1a。**
- **不成立、已证伪**：`:40` 卡片数改为「数 `dist/*/` 产物目录数」。我实测 `ls -d dist/*/` → **`assets/ data/ lens/`，计数 3**，而实际卡片数是 **1**——**这条断言会立刻失败**。改进形式 `dist/*/index.html` 计数虽为 1，但仍有三个问题：① 单文件模式下"可用"是被 P2 的 bug 掩盖的巧合，修好 P2 后语义会变；② `live:false` 的工具会进产物但不出卡片 → 计数错配；③ 它拿"构建事实"比对"渲染结果"，中间隔了门户过滤逻辑，**失去了"页面展示 == 数据源"的本意**。**已标 HF-1b，建议维持第二批，且不要用 `dist/*/`**——正确来源是注册表的 `LIVE_TOOLS.length`（`02-*.md:448` 的虚拟模块已导出）。**这反而印证了 t6 原稿"该条依赖注册表"的判断是对的。**
- **维持第二批、判断合理**：`:94/:213`（8 张画布）、`:103`（100 行/页）、`:102/:176`（3/4 支对比）——耦合视图结构而非数据源。
- **保留正确**：`harness.cjs:95-127` 的 `canvasReport` 像素健康度判据是不变量断言，任何批次都该留。

**Q4（captain 的核心任务）："无实质冲突"是否成立？**
**答：成立，但需加限定。** 我逐条核对了 §0.9 的对照表，**没有发现两份文档之间的实质性事实冲突**；差异确实仅在于切分粒度（B1+B2 合并为 P1）与各自遗漏（t1 补 B5/P10/P11/P12，t6 补 P2/P9），且双方对"以代码为准"的处理是正确的。**但"无实质冲突"不等于"无缺陷"**——BF-1（45 vs 49）与 HF-1（与用户决策冲突）都发生在 **t6 文档内部**，不需要与 t1 冲突就能构成缺陷。此外 §0.9 表格本身有一处归属措辞混乱（MF-2）。

---

## 8. 复现命令（全部在本仓库根目录执行）

```bash
# 基线
git rev-parse HEAD                      # 95c0260
git status --porcelain                  # 仅 ?? .agent-teams/ 、 ?? docs/
git diff --stat HEAD                     # 空

# 行数口径（统一口径）
find src -type f | wc -l                                                # 25
find src -type f ! -name 'lenses-inline.ts' | wc -l                     # 24
find src -type f ! -name 'lenses-inline.ts' -print0 | xargs -0 wc -l | tail -1   # 3377
find src scripts e2e -type f -print0 | xargs -0 wc -l | tail -1         # 3955

# BF-1 断言数（49，文档 §4.6 误写 45）
grep -c "r\.ok(" e2e/verify.cjs                                         # 49

# HF-5 wait-on 未声明
grep -c "wait-on" package.json package-lock.json                         # 0 0
ls node_modules | grep -x wait-on                                        # 无输出

# HF-4 tsconfig 覆盖面
grep -n '"include"' tsconfig.json                                        # ["src", "vite.config.ts"]

# 6.3 静默失败
sed -n '20,24p' vite.config.ts            # single ? { lens } : { main, lens }
grep -n "build:single\|e2e" .github/workflows/deploy.yml                 # 无输出
npm run e2e ; echo "exit=$?"                                             # exit=3

# HF-2 预验证（在隔离目录做，勿污染仓库）
mkdir -p /tmp/pwproof && cd /tmp/pwproof
echo '{"name":"proof","private":true}' > package.json
npm i -D playwright --ignore-scripts --no-audit --no-fund   # added 2 packages in 2s
node -e "const{chromium}=require('playwright');(async()=>{const b=await chromium.launch({executablePath:'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'});console.log('OK',b.version());await b.close()})()"
ls ~/AppData/Local/ms-playwright/         # 仍为 5 项，无新增

# HF-3 构建期 TS 直读的语法边界
node -e "import('data:text/javascript,export enum E{A}')" 2>&1 | tail -3  # ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX

# HF-1b 证伪 `dist/*/` 推导源（必须先构建）
npm run build
ls -d dist/*/            # assets/ data/ lens/  → 3 个，而卡片数是 1 ⇒ 该方案不可用
ls -d dist/*/index.html  # 仅 dist/lens/index.html → 1（可用但语义脆弱，见 HF-1b）

# 1.3 构建基线 + P2 现场证据
npm run build            # exit 0；1617 / 6 条 / 968 条 / 0.92 MB
npm run build:single     # exit 0，但【无 dist-single/index.html】⇒ 单文件版缺门户
wc -c dist-single/lens/index.html   # 1,476,952（HANDOFF 记 1,475,600，见 MF-5）

# HF-2 环境归属：确认本仓库【未】装 playwright
grep -c "playwright" package.json                        # 0
grep -c '"node_modules/playwright' package-lock.json     # 0
ls -d node_modules/playwright 2>/dev/null || echo absent # absent

# 6.4 硬约束
grep -rn "chart.js" src/                  # 仅 shared/lib/chart.ts:9
ls -a public/                             # .nojekyll 存在
grep -n "tr 'A-Z' 'a-z'" .github/workflows/deploy.yml                    # :49-50
sed -n '85,92p' scripts/prepare-data.mjs  # LENSES_JSON 字符串常量
```

---

## 9. 评审边界声明

- **只读评审**：未修改 `01-current-state.md`、`02-target-architecture.md`、`03-engineering.md` 中的任何一行；未修改任何产品代码。本文件是本次评审的**唯一**写入。
- **`git status`**：评审结束时仅 `?? .agent-teams/`、`?? docs/`；`git diff --stat HEAD` 为空。
- **隔离性**：所有实验均在仓库外的 `/tmp` 独立目录进行（playwright 预验证 `/tmp/pwproof`、Vite 虚拟模块探针 `/tmp/vprobe`、Node 类型剥离探针 `/tmp/tsprobe`），**已全部删除**。**本仓库未被污染**：`package.json` / `package-lock.json` / `node_modules` 中均无 playwright，`ms-playwright` 目录数与初始一致（5 项）。
- **构建行为**：为取得 P2 与体积证据，我实际执行了 `npm run build` 与 `npm run build:single`（均 exit 0），随后**已删除** `dist/`、`dist-single/`（二者均在 `.gitignore:6-7` 内）。构建的副作用是重新生成了 `public/data/lenses.json` 与 `src/data/lenses-inline.ts`——这两个文件同样被 `.gitignore:28-29` 忽略，`git status` 确认无跟踪文件改动。

---
---

# 04-review · Round 2（复审 t7 修订）

> **复审人**：auditor（独立评审，round 2）
> **复审对象**：t7 对 `02-target-architecture.md`（1186 → **1311** 行）与 `03-engineering.md`（1132 → **1351** 行）的修订
> **复审基线**：commit `95c0260`；`git status` 仅 `?? .agent-teams/`、`?? docs/`
> **方法**：打开两份文档原文逐条核对 + 本机实测复现，**未采信 t7 的 output 自述**
> **边界**：只读评审。**未编辑 02/03 任何一行**；未改产品代码。

## R2-0. 复审结论

**判定：`pass`。**

t4 的 **1 blocker + 5 high + 5 medium + 4 low** 中，**14 条已真实闭合**（打开原文逐条核对），**1 条部分闭合**（MF-5 的正文已改，但 t1 原文未同步——这是我上轮就该写明的边界，且不影响 02/03 的修复目标）。修订过程中**发现的 1 处新缺陷**（§4.6.5 分布数字）属**同一根因家族的残留**，我列为 **medium**，**不构成 needs_revision**：它不影响任何实施动作，且其正确值可由 t7 自己新增的机检不变量直接算出。

**最重要的判断：BF-1 的根因层是真闭合的，不是"改数字"。** t7 加了 `scripts/check-e2e-mapping.sh` 这条**可机检不变量**，我实测它 **49 == 49 通过**，并**对抗性测试了 6 个边界情况**（详见 R2-2）——它能抓住最危险的漂移方向，且抓不住的那些也已被我给出补强建议。

| t4 finding | 处置 | 复核判定 |
|---|---|---|
| **BF-1** 断言数 45 vs 49 | 全文无「45 条」；§4.6 重写为 49 条逐条映射；新增机检不变量 | ✅ **真闭合（含根因）** |
| HF-1a 数据类快照并入第一批 | §9.2 任务 1.1b，8 条，自包含改法 | ✅ 闭合 |
| HF-1b `:40` 维持第二批 + 废弃 `dist/*/` | §4.6.3 + §9.2 任务 1.1c | ✅ 闭合（且证据完整） |
| HF-2 本机/CI 双路径 | §4.7 后 + §9.2 任务 1.1 + §9.4 | ✅ 闭合 |
| HF-3 TS 直读约束 | §7.6.1 + §9.5 迁移步骤 | ⚠️ **基本闭合，1 处残留**（见 R2-4） |
| HF-4 tsconfig include | §7.6.2 + §9.5，附盲区验证命令 | ✅ 闭合（质量最高） |
| HF-5 零依赖 wait-port | §9.2 任务 1.2 + §7 成本章节 | ✅ 闭合 |
| MF-1 deploy.yml 行号 | 统一为 `:46,60,64` | ✅ 闭合 |
| MF-2 §0.9 P10 归属 | 措辞已修正并加限定 | ✅ 闭合 |
| MF-3 §9 范围声明 | 与 HF-1a 同步 | ✅ 闭合 |
| MF-4 tsconfig 列为迁移步骤 | §9.5 入口条件 | ✅ 闭合 |
| MF-5 体积不作锚点 | §5.2 警示 + §7 成本 | ⚠️ 部分（t1 原文未同步，见 R2-5） |
| LF-1..4 | 均已处理 | ✅ 闭合 |
| 过度设计 json-schema-to-ts | §7.4 改写 + R4 更新 | ✅ 闭合（机制逻辑成立） |

---

## R2-1. BF-1 复核：数字、映射表、抽样逐条核对

**① 残留检查**：`grep -c "45 条"` → 02 与 03 **均为 0** ✅（与 captain 实测一致）

**② 映射表条数**：§4.6.2 表实测 **49 行**，编号 1–49 **连续无缺号、无重号**。每行均给出 `verify.cjs` 行号 + 归属层 + 处置 ✅

**③ 抽样核对行号与归属（我抽了 17 条，全部命中）**：

| # | 表内声称 | 实测 `verify.cjs` 该行内容 | 判定 |
|---|---|---|---|
| 1 | `:36` 主页标题 | `r.ok('主页标题', (await page.title()).includes('工具箱')…)` | ✅ |
| 3 | `:40` 卡片数 | `r.ok('工具卡片数量', (await cards.count()) === 1, …)` | ✅ |
| 15 | `:86` 数据载入 | `r.ok('数据载入（1617 条）', (await countOf()) === 1617, …)` | ✅ |
| 18 | `:91` 归一 | `r.ok('最高综合分已归一（9.5，不是 89.2）', statText.includes('9.5'))` | ✅ |
| 19 | `:94` 画布 8 | `r.ok('画布数量为 8', rep0.length === 8, …)` | ✅ |
| 23 | `:103` 单页 100 | `r.ok('表格单页 100 行', (await page.locator('table tbody tr').count()) === 100)` | ✅ |
| 25 | `:113` 翻页 | `r.ok('翻页生效', /第\s*2\s*\//.test(page2), …)` | ✅ |
| 26 | `:120` 排序 | `r.ok('按参考价排序生效', /¥\d/.test(firstRow), …)` | ✅ |
| 27 | `:133` 悬停 | `r.ok('表格行悬停显示浮层', !!tip && tip.op === '1' …)` | ✅ |
| 28 | `:141` Viltrox | `r.ok('搜索 Viltrox 命中数减少', cViltrox > 0 && cViltrox < 1617, …)` | ✅ |
| 30 | `:149` 抗眩光 | `r.ok('抗眩光 ≥10 筛选生效', cFlare > 0 && cFlare < 1617, …)` | ✅ |
| 34 | `:173` 遮挡守卫 | `r.ok('数据表未被图表遮挡（命中态正确）', cmpHit.includes('[data-cmp]'), …)` | ✅ |
| 35 | `:176` 对比 4 支 | `r.ok('加入对比台后为 4 支', …aria-label^="移除 "…)` | ✅ |
| 41 | `:213` 极端筛选 | `r.ok('极端筛选下不崩溃（8 块画布都还在）', …canvasReport…length == 8…)` | ✅ |
| 47 | `:267` CSV 下载 | `r.ok('CSV 导出触发下载', !!download, …)` | ✅ |
| 48 | `:271` 无异常 | `r.ok('无未捕获的页面异常', pageErrors.length === 0, …)` | ✅ |
| 49 | `:272` 无 console.error | `r.ok('无 console.error', consoleErrors.length === 0, …)` | ✅ |

**17/17 全中，无一处行号错配。** 归属层也与断言语义相符（`:103` 分页→L1、`:94` 画布→L4、`:271/:272`→L2 上移，均合理）。

**④ 分布数字**：⚠️ **§4.6.5 的 `6 + 12 + 31` 是错的**——见 R2-3（新缺陷 RN-1）。**但这不影响闭合判定**：合计仍为 49，且「无断言被静默丢弃」这一 BF-1 的实质危害已消除。

---

## R2-2. BF-1 根因层复核：机检不变量是否真能检测漂移

**脚本逻辑（§4.6.4）**：
```bash
ACTUAL=$(grep -c 'r\.ok(' e2e/verify.cjs)
MAPPED=$(sed -n '/#### 4.6.2/,/#### 4.6.3/p' "$DOC" | grep -c '^| *[0-9]')
[ "$ACTUAL" -eq "$MAPPED" ] || { echo "❌ …"; exit 1; }
```

**本机实跑：`ACTUAL=49  MAPPED=49` → PASS** ✅

### 对抗性边界测试（我构造了 6 种漂移并实跑）

| # | 边界情况 | 实测结果 | 评价 |
|---|---|---|---|
| 1 | **删掉 1 个映射行**（模拟断言被漏记） | MAPPED=48 → **捕获并 exit 1** | ✅ **这正是 BF-1 的原始场景，能抓** |
| 2 | **`verify.cjs` 新增 1 条断言**（文档没跟） | ACTUAL=50 ≠ 49 → **捕获** | ✅ 抓得住（但**无法指出是哪一条**，只报总数不符） |
| 3 | **重复一行**（凑数使总数不变） | MAPPED=50 → 总数不符被抓；但若**同时删一行再加一行**则总数仍 49 → **漏网** | ⚠️ 盲点（见下） |
| 4 | **把所有行号改成 `:9999`**（行号全失效） | MAPPED 仍 49 → **完全不被察觉** | ⚠️ 盲点（脚本只计数，不核对行号） |
| 5 | **`sed` 区间失效**（改标题名/调整小节顺序） | 区间为空 → MAPPED=0 → **exit 1 响亮失败** | ✅ 好——失效方向是"误报"而非"漏报" |
| 6 | **表头 `\| # \|` 与分隔行 `\|---:\|` 是否被误计** | 均**不匹配** `^\| *[0-9]` → 不计入 | ✅ 精确 |

**第 5 点值得特别肯定**：`sed` 区间一旦失配就得到 0，**脚本会立刻报错**，而不是静默通过。**失效方向是安全的**——这是这个设计最关键的正确性属性。

**第 4 点是真盲点，但优先级低**：行号漂移不会让"断言被静默丢弃"，只会让文档指向错误位置，而人在按表操作时**会打开 `verify.cjs` 看到内容不符**。故不列缺陷。

### 我实测确认的两条边界情况（captain 点名要求）

**(a) 断言跨多行书写**：实测 `grep -c 'r\.ok('` = **49**，`grep -o | wc -l` = **49**，二者相等 ⇒ **当前无多行拆分**。且**即使将来有人把一条 `r.ok(` 拆成多行，两侧（代码与文档表）都按"行/条"计，方向一致**，不产生假阴性；真正的风险是"一行内写两个 `r.ok(`"——但当前代码风格是每条独立行，且会让 ACTUAL 偏小而 MAPPED 偏大 → 同样被抓住。

**(b) 映射表格式变化**：实测 `^| *[0-9]` 要求**行首管道符后为数字**。若有人把编号列改成 `#1`、或改用无序列表、或把表格加一列前置编号，**MAPPED 会变小 → 触发 exit 1**，属**响亮失败**（同第 5 点）。若有人改成 `| 01 |` 仍匹配；改成 `|一|` 则不匹配 → 报错。**结论：格式变化一律导致误报而非漏报，方向安全。**

**建议补强（非阻塞，供 tooling 取舍）**：把"只比总数"升级为"比集合"，可同时覆盖第 3、4 号盲点：
```bash
# 期望：映射表的编号集合 == 1..ACTUAL，且连续性成立
ACTUAL=$(grep -c 'r\.ok(' e2e/verify.cjs)
MAPPED_NUMS=$(sed -n '/#### 4.6.2/,/#### 4.6.3/p' "$DOC" | grep -o '^| *[0-9]\+' | grep -o '[0-9]\+' | sort -n)
[ "$MAPPED_NUMS" = "$(seq 1 "$ACTUAL" | tr '\n' ' ' | sed 's/ $//')" ] || { echo "❌ 编号不连续/重复"; exit 1; }
```
这样 `1..49` 的**连续性**成为不变量，能抓住"重复行凑数"。

---

## R2-3. 新缺陷（本轮独立发现）

### RN-1 §4.6.5 的层分布数字错误（medium）

**问题**：`03-engineering.md:819-823` 声称 `6(L1) + 12(L2) + 31(L4) = 49`。**该分布与 §4.6.2 表自身的归属标记不符**：

| 层 | §4.6.5 声称 | 实测（按 §4.6.2 表的「归属」列统计） |
|---|---|---|
| L1 | 6 | **6** ✅ |
| L2 | 12 | **14** ❌（10 条纯 `L2 通用` + 4 条 `L2 通用 + DERIVED`） |
| L4 | 31 | **29** ❌（22 条纯 `L4` + 7 条 `L4 + DERIVED`） |
| 合计 | 49 | **49** ✅ |

**更直接的自证矛盾**：`:820` 的 L2 单元格**自己列了 13 个编号**（`#1、#2、#4、#5、#6、#7、#8、#9、#10、#11、#46、#48、#49`）却标注 **12** ——**列出的 id 数与标注数字不符**，一望可知。

**证据（实测命令）**：
```bash
sed -n '/#### 4.6.2/,/#### 4.6.3/p' docs/architecture/03-engineering.md > /tmp/tbl.md
grep -c '| L1' /tmp/tbl.md   # 6
grep -c 'L2'    /tmp/tbl.md  # 14
grep -c '| L4'  /tmp/tbl.md  # 29
echo 1 2 4 5 6 7 8 9 10 11 46 48 49 | wc -w   # 13（而文档标 12）
```

**影响**：低——合计仍 49，**BF-1 的实质危害（断言被静默丢弃）已消除**；且该数字不驱动任何实施动作（实施者按 §4.6.2 逐条表操作，不按 §4.6.5 的汇总数）。但它是**"人工维护的汇总数字再次与明细不一致"**——正是 BF-1 的同一根因，留在文档里会削弱"已加机检机制"的说服力。

**建议修法**：把 `:819-821` 改为实测值 **6 + 14 + 29 = 49**，并同步 `:820` 的编号列（要么补上缺失的 id 使之为 14，要么更正为 13 并核对到底哪条漏列）。**更彻底**：既然 §4.6.4 已有 `check-e2e-mapping.sh`，可顺手让该脚本**同时输出三层计数**，让分布也不再人工维护：
```bash
echo "L1=$(grep -c '| L1' /tmp/tbl.md)  L2=$(grep -c 'L2' /tmp/tbl.md)  L4=$(grep -c '| L4' /tmp/tbl.md)"
```

---

## R2-4. HF-2 / HF-3 / HF-4 / HF-5 复核

### HF-2 本机 vs CI 双路径 —— ✅ **清晰闭合**

`:1170-1193` 给出双列表格与完整警告，`:1317-1321` 的验收序列用"二选一"注释块明确区分。**无残留的无条件 install 表述**：
- 本机：`npm i -D playwright --ignore-scripts`（标注"复用已有 chromium-1223；实测 3 秒、零联网、零下载"）
- CI：`npm i -D playwright` → `npx playwright install --with-deps chromium`
- `:1181-1187` 双向警告齐全：本机跑 install 会导致"**装完反而行为变了**"；CI 用 `--ignore-scripts` 会导致 `findChrome()` 返回 `undefined`。
- `:1193` 通过标准含"`ls -d ms-playwright/chromium-*` 目录数**不变**（证明零下载）"——**把我上轮的实测方法固化成了可执行验收项**，很好。

> 注：`:836`、`:909` 出现的 `--with-deps` 分别在「方案对比表」与「CI workflow」语境，**正确**。

### HF-3 TS 直读约束 —— ⚠️ **基本闭合，1 处残留**

§7.6.1 完整覆盖了我指出的两个陷阱，**且给出了可执行替代**：
- ✅ `enum` / 构造函数参数属性硬失败 → 列明禁用并由"L2 契约测试或 lint 强制"（不是只写文档）
- ✅ `@app/*` 别名 → `:444` 代码注释已改为「**必须是相对路径**，不能用 `@app/*` 别名——构建期 Node 直读 .ts 时不解析 tsconfig 的 paths（见 §7.6.1）」
- ✅ Node 版本 → `:1200-1202` 说明 22.6+ 才默认开启，02 的 CI 示例 `:878` 已 pin **24**

**残留问题**：`03-engineering.md` 里**三处 CI workflow 仍写 `node-version: 22`**（`:865`、`:883`、`:903`），与 `02:878` 的 **24** 以及 §9.5 迁移步骤（`:1109`，要求"CI `node-version` pin 到 **24**"）**互相矛盾**。

**为什么这是残留而非闭合**：`03-engineering.md` 是**定义实际 CI YAML 的那份文档**。实施者若照抄 `:865` 的 `node-version: 22`，会落回 22.0–22.5 的风险窗口（`scanTools` 在 CI 崩而本机正常——正是 §7.3 声称要消灭的失败模式）。`02:878` 改对了，但**执行面的那份没改**。

**建议修法**：把 `:865`、`:883`、`:903` 的 `node-version: 22` 全部改为 `24`，或在各 workflow 处加注"（HF-3：必须 24，见 §9.5）"。

**判定**：**不构成 needs_revision**（决策已明确记录且 pin 24 的指令在 §9.5 与 02 中均存在，实施者按迁移步骤走会做对），但**应作为 t7 的遗留待修项记录**，避免实施者照抄 22。

### HF-4 tsconfig include —— ✅ **闭合，且质量最高**

§7.6.2 给出了：现状引用（`tsconfig.json:25`）、两条后果（含"satisfies 在最需要它的新增工具上失效"这一关键点）、可直接粘贴的 `include` 数组、**以及盲区消除的验证命令**：
```bash
echo 'export const bad: number = "x";' > platform/__typeprobe.ts
npx tsc --noEmit ; echo "exit=$?  # 期望非 0（证明 platform/ 已被检查）"
rm platform/__typeprobe.ts
```
**这条"故意注入类型错误、断言 tsc 必须报错"的验证方式，与我 review 中要求的"可执行的盲区消除验证命令"完全对应**，且比"tsc 退出码 0"更强（后者无法区分"没检查"与"检查了没错误"）。**这是本轮质量最高的一处修复。**
另外 `:1235` 主动指出 `e2e/*.cjs` 在 `moduleResolution: bundler` 下可能报错的副作用与退路 —— 与我在 HF-4 中的提示一致，且给出了分步退路。

### HF-5 零依赖端口等待 —— ✅ **闭合**

`wait-on` 全文 **7 处，全部为"不引入/已废弃/备选不选"语境**，**无任何执行命令**：
- `:1070`、`:1085`：成本表与处置说明标注"**不引入** `wait-on`"
- `:1258-1285`：完整理由 + 零依赖替代 `scripts/wait-port.mjs`（用 Node 内置 `fetch` 轮询，12 行）
- `:1327`：验收序列用 `node scripts/wait-port.mjs … # HF-5：零依赖，非 wait-on`
- `:1286` 还补上了我指出的缺口：「无论选哪种，`package.json` 都必须在"涉及文件"里列出」

**我实际验证了 `wait-port.mjs` 的逻辑**：`fetch(url, {method:'HEAD'})` + `res.ok || res.status < 500` 判就绪 + 60s 超时 + 300ms 轮询。**逻辑正确**：`status < 500` 允许 4xx（如 404）也视作"服务已起来"，这对"端口就绪"的语义是恰当的——**它等的是服务器在监听，不是特定路径可访问**。零依赖，符合本批定位。

### 附：我实测确认 `dist/*/` 与 `wait-on` 的字面量残留均为正确记录（不作为缺陷）

按 captain 的裁定，我**不以字面量残留为判据**，而核验"**是否被采用为推导源**"：
- `dist/*/` 共 13 处，**逐处语境均为"实测证伪/已废弃/不得使用"**：`:718`（表内明确"**不是** `dist/*/`"）、`:772-788`（§4.6.3 完整证伪记录）、`:1226-1246`（§9.2 任务 1.1c 再次声明废弃）、`:1305`（"**不得用** `dist/*/`"）。**无一处作为推导源被采用** ✅
- 其中 `:775-779` 与 `:1231-1233` 保留了 `ls -d dist/*/` → **3** vs 卡片数 **1** 的实测反例，**这正是"为何不可用"的证明**，删掉会让该错误复发。**保留是正确的。**
- `wait-on` 同理 ✅

**我确认 captain 的裁定与我的判断一致**：判据应是"无一处被采用为推导源 / 无执行命令"，而非字面量为零。

---

## R2-5. MF-5 与过度设计复核

### MF-5 体积不作锚点 —— ⚠️ **部分闭合**

✅ **已闭合的部分**（02/03 两份，即 t7 的修复范围）：
- `03-engineering.md:960` §5.2 明确：「**产物体积只能作"参考量级"（≈1.47 MB），不得作为验收锚点或 CI 门禁**」，并给了正确替代——"若要门禁单文件产物，应断言**结构**而非字节数"。这与我 review 的建议**完全一致**。
- 同处还主动把我的发现外推到 `public/data/lenses.json` 的 0.92 MB。

⚠️ **未闭合的部分**：**t1 的 `01-current-state.md:419` 仍原样保留**「实测该文件**存在且恰为 1,475,600 字节** ✅ 完全准确」的旧结论，与 03 的新表述**并存且矛盾**。

**为什么我不把它算作 needs_revision**：① 它**不在 t7 的修改范围**（t7 契约限定为 02/03 两份）；② 我在 round 1 的 MF-5 里**也只指向了"不应作锚点"的行为约束，且 t1 是只读审计产出，修改它需 captain 决定**。**但我上轮未明确写出这个边界，这是我 review 的不足**——本轮补明：**t1 的 D13 结论应视为已被 MF-5 实质修正，建议 captain 决定是否在 t1 加一行指向 03 的批注**（而非改 t1 的原始结论，以保留审计史）。

### 过度设计 `json-schema-to-ts` —— ✅ **闭合，且强制机制逻辑成立**

- `02:1074-1078`：明确「**经 t4 评审判定为过度设计，已砍掉**」，并保留改写以记录取舍理由（正确做法）
- `02:1130-1133`：代价对比表（0 依赖 / 强保护 / 低调试成本）→ 结论选后者
- `02:1247`：风险表 R4 已划掉原方案，标注"**已采纳 R4 退路**"
- `03:1084`：成本表同步

**我独立验证了替代机制的逻辑**（`02:1111-1121`）：
```ts
const fromType = { id:'', name:'', desc:'', tags:[], tint:'', meta:'', live:false,
                   route: undefined, keywords: [] } satisfies Required<Record<keyof ToolManifest, unknown>>;
expect(new Set(Object.keys(fromType))).toEqual(new Set(manifestFieldNames));
```
**逻辑成立**，理由：
1. `satisfies Required<Record<keyof ToolManifest, unknown>>` 强制该对象字面量**必须包含 `ToolManifest` 的全部键**——少一个键 → **编译期报错**；多一个键 → 因 `Record<keyof T, unknown>` 不允许多余属性而报错（对象字面量的 excess property check）。
2. 运行时再与校验器内部维护的 `manifestFieldNames` 比对集合相等 → 若**校验器**漏加字段 → **测试红**。
3. 两处合起来实现**双向绑定**：类型侧变→编译失败；校验器侧变→测试失败。**保护强度确实与 schema 自动推导相当，且零依赖。**

**一个值得记录的边界**（非缺陷）：该机制保证"字段**名**集合一致"，但**不保证字段类型/可选性一致**（`Required<>` 只作用于键的存在性，值为 `unknown`）。所幸 `ToolManifest` 的类型正确性已由 `tool.config.ts` 的 `satisfies ToolManifest` 在编译期保证，故整体闭环。**建议在 §7.4 加半句说明**，避免后人误以为这条单测覆盖了类型校验——**但这是可选的加固，不是缺陷**。

---

## R2-6. 风险与回归复核

### ✅ HANDOFF §9 六条硬约束 —— 全部完好保留

`02-target-architecture.md:1279-1291` 的「有意保留」表**原样完整**（我逐条比对 round 1 记录，未减少、未改义）：

| 硬约束 | 文档位置 | 状态 |
|---|---|---|
| 双构建模式 | `vite.config.ts:16-31` | ✅ |
| `__INLINE_DATA__` + DCE | `vite.config.ts:38-40`、`lens/data.ts:15-18` | ✅ |
| **大 JSON 保持 string 常量**（最关键） | `prepare-data.mjs:81-83` | ✅ |
| CSS 变量 + `@theme inline` | `styles.css:10-40, 54-78` | ✅ |
| `useTheme` 渲染期同步写 DOM | `shared/useTheme.ts:27-31` | ✅ |
| `fmt()` 缺失显示 `—` | `shared/lib/lens.ts:179-183` | ✅ |
| `canvasReport` 像素健康度 | `e2e/harness.cjs:95-127` | ✅（`03:828` 还强调"任何批次都不该动"） |
| `findChrome()` | `e2e/harness.cjs:41-63` | ✅（HF-2 明确"一行都不用改"） |
| base 路径 shell 判断 | `deploy.yml:46-55` | ✅ |
| 深色防闪白内联脚本 | `index.html:12-20` | ✅ |

**t7 的新增内容未削弱其中任何一条**——反而 `03:827-828` 把 #34 遮挡守卫与 `canvasReport` 两条"踩坑资产"提升为"迁移时必须连同注释一起带走"。

### ✅ 交叉引用无死链

```bash
grep -rn "01-maintainability-architecture\|02-engineering-build-test" docs/architecture/
→ 无输出
```
所有交叉引用**均指向现存三个文件名**（`01-current-state.md` / `02-target-architecture.md` / `03-engineering.md`）。✅

### ✅ 未引入与 t1 冲突的行数口径断言

新增内容中出现的关键数字（`02:17-24`、`03:11-12`）仍为 **3377 行 / 24 文件**（源码口径），并保留 3380/25 与 3955/29 的并列声明。**无冲突** ✅
（我 round 1 实测过：`find src -type f ! -name 'lenses-inline.ts'` = 24 文件 / 3377 行，精确吻合。）

### ✅ MF-1 / MF-2 / MF-3 抽查

- **MF-1**：`02:148` 已统一为 `deploy.yml:46,60,64`（删掉了错误的 `:41`）✅
- **MF-2**：§0.9 表头已加限定「**大部分**是两套独立得出的结论（其中 B5/P10/P11/P12 系本文档回读 t1 后补入）」，且 B3 行改为「✅ 一致（**P10 与 B3 无关，见下方独立行**）」——**正是我建议的修法** ✅
- **MF-3**：`:1308` 明确本批"**允许**改 package.json / lock / e2e/ / ci.yml / wait-port.mjs；**不碰** src/、vite.config.ts、tsconfig.json"，与 §9.5 入口条件一致 ✅
- **LF-1**：返回链接引用统一为 `App.tsx:212-221` 区间（我 round 2 实测 `<a>` 在 `:217-220`，区间包含之，**可接受**）✅
- **LF-4**：`:1314` 标注"命令为 Git Bash 形式"，`:1339` 补了 PowerShell 说明与 `&` 语义差异 ✅

---

## R2-7. 我实测复现的环境与基线

```bash
# 行数（与 t7 自述一致）
wc -l docs/architecture/*.md     # 02=1311  03=1351  01=481  04=(本文件)

# BF-1 残留 = 0，实际断言数 = 49
grep -c "45 条" docs/architecture/02-target-architecture.md docs/architecture/03-engineering.md  # 0 / 0
grep -c 'r\.ok(' e2e/verify.cjs  # 49

# 机检不变量实跑（§4.6.4 脚本逐字复现）
ACTUAL=$(grep -c 'r\.ok(' e2e/verify.cjs)
MAPPED=$(sed -n '/#### 4.6.2/,/#### 4.6.3/p' docs/architecture/03-engineering.md | grep -c '^| *[0-9]')
# ACTUAL=49  MAPPED=49  -> PASS

# §4.6.5 分布实测（与文档声称的 6/12/31 不符）
grep -c '| L1' /tmp/tbl.md   # 6
grep -c 'L2'    /tmp/tbl.md  # 14
grep -c '| L4'  /tmp/tbl.md  # 29

# 死链检查
grep -rn "01-maintainability-architecture\|02-engineering-build-test" docs/architecture/  # 无输出

# 产品代码零改动
git status --short   # 仅 ?? .agent-teams/ 与 ?? docs/
git diff --stat HEAD # 空
```

---

## R2-8. Round 2 边界声明

- **只读复审**：**未编辑** `02-target-architecture.md`、`03-engineering.md`、`01-current-state.md` 任何一行。本轮对本文件的写入是**追加 Round 2 章节**，round 1 内容（第 0–9 节）**完整保留**于本文件前半部分。
- **环境**：所有变异测试均在 `/tmp/inv` 隔离目录进行（用 `head -N` 拷贝副本做漂移模拟），**未改动仓库内任何文档**；已清理。
- **未新增文件**：未创建 `scripts/check-e2e-mapping.sh` 或 `scripts/wait-port.mjs`——它们**是 t7 的设计提案，实现属后续迁移批次**，本阶段不改产品代码。
- **`git status`**：`?? .agent-teams/`、`?? docs/`；`git diff --stat HEAD` 为空。

---
---

# 04-review · Round 3（复审 t10：P11 证伪修正与 §0.9 重述）

> **复审人**：auditor（独立评审，round 3）
> **复审对象**：t10 对**已通过评审的冻结基线** `02-target-architecture.md` 的修改（P11 证伪相关的四处改写、P11 定性降级、§0.9 结论重述）及 `05-migration-plan.md` 的同步
> **复审基线**：commit `95c0260`；`git status` 仅 `?? .agent-teams/`、`?? docs/`
> **方法**：**自行跑构建**比对 CSS chunk + 打开原文逐条核对，**未采信 t10 的自述**
> **边界**：只读复审。**未编辑 02/03/05 任何一行**；未改产品代码。

## R3-0. 复审结论

**判定：`pass`。**

t10 的修改**如实反映了实测事实**，且**没有回避矛盾**——§0.9 的重述是本轮最可能"和为贵式淡化"的地方，而它**恰恰选择了如实暴露**。P11 的定性降级彻底，`05` 同步到位。我另发现 **3 条 medium/low 残留**（均为"同一事实的重复引用未同步"，不改变任何结论，不构成 needs_revision）。

**我先独立复现了 P11 的证伪**（这是本轮的事实基础，必须自己跑）：

```bash
$ npm run build                      # exit 0
$ grep -o 'assets/[^"]*\.css' dist/index.html dist/lens/index.html
dist/index.html:assets/useTheme-S2PxtYyc.css
dist/lens/index.html:assets/useTheme-S2PxtYyc.css     # 同一 chunk ✅
$ ls dist/assets/*.css | wc -l
1                                                      # 整站仅 1 份 ✅
```
**P11「每个入口重复打包一整份 Tailwind 产物」确认为假**——Rolldown 的共享 CSS 提取已在去重。**t10 的证伪是对的。**

---

## R3-1. 四处改写核验（逐处对照实测）

| # | 位置 | 改写内容 | 与实测是否一致 |
|---|---|---|---|
| 1 | `:112` §0.6 标题 | 「入口样板重复 + `IS_SINGLE` 泄漏（原「Tailwind 重复打包」已被实测证伪）」 | ✅ 标题已如实标注证伪 |
| 2 | `:116` 后果断言 | 明确写「**本条早先的结论被实测证伪**」，并给出可复现命令与结果 | ✅ 如实 |
| 3 | `:182` P11 表行 | 定性由「中」下调为「**低（原判「中」随证伪下调）**」，并把体积主张用 ~~删除线~~ 标注 | ✅ 如实 |
| 4 | `:390` P9/§2.2b 处置表行 | 收益改为「收敛入口样板 + 上移 `IS_SINGLE`」，并明写「**⚠️ 体积收益不存在**……**不得据此主张体积下降**」 | ✅ 如实 |

> 说明：任务书给的 `:152`/`:356` 是 t10 修改**前**的行号；t10 的改写使文档从 1311 行增至 **1360 行**，故实际位置为 `:182` 与 `:390`。**内容对应关系无误**，我按内容而非单点行号核对。

**四处改写均与实测一致，无一处淡化或含糊。**

---

## R3-2. P11 定性降级是否彻底 ✅

**核验方法**：全文检索所有可能把体积成本当作收益主张的地方。

| 检查项 | 结果 |
|---|---|
| 全文不再把「消除 Tailwind 重复打包的体积成本」作为独立收益 | ✅ `:144` 用 ~~删除线~~ 明确标为「❌ **不存在**」，并加「**不得把这条作为收益主张**——它会被实施者照抄成"预期减少 N 份 CSS 体积"，而实际不会有任何体积变化」 |
| 真实收益已改为架构一致性 | ✅ `:145`「**收敛入口样板**」`StrictMode`+`createRoot`+`import './styles.css'` 收敛为 `mountTool()`；`:146`「**上移 `IS_SINGLE`**」工具不再感知构建模式 |
| 明确记录该体积成本在当前配置下**并不存在** | ✅ `:128`「因此**不存在**"按工具数线性增长的 Tailwind 体积成本"」 |
| `:148` 对设计的影响已相应调整 | ✅「理由**改为**上面两条架构一致性收益……**而非**体积成本」，且「`mount.tsx` 的优先级相应下调」 |

**降级彻底，无残留的独立收益主张。**

---

## R3-3. §0.9 结论行重述 —— 本轮最关键的一处 ✅

这是 captain 点名"最可能出现和为贵式淡化"的地方。**我的判断：没有淡化，反而如实暴露了矛盾。**

**原表述**：`两份文档无实质冲突`
**新表述**（`:204` + `:206-208`）：
> `两份文档在「与代码事实的一致性」上无实质冲突`……**但这份一致性不等于两份文档的结论都成立**
> **⚠️ 新增的实质差异（t10 修正）**：P11 的表述**原先有误**……**这是一处"两份文档都说对了来源、但本文档的结论本身错了"的差异**……**"无实质冲突"限定于事实来源与切分粒度，不构成对推论正确性的背书**——推论正确性只能由实测背书

**我逐项核对它是否如实**：

| 核验点 | 判定 |
|---|---|
| 是否承认 P11 被证伪 | ✅ 明确写「经实测**证伪**」 |
| 是否承认构成"新的实质差异" | ✅ 标题即「**新增的实质差异**」 |
| 是否回避矛盾 | ✅ **未回避**——反而把结论行**限定范围**（"无实质冲突"只管事实来源与切分粒度），并显式声明**不背书推论正确性**。这是**收紧**而非放宽 |
| 与表内其余条目是否自洽 | ✅ `:189` 表头限定「P11 系回读 t1 后补入，非独立得出」仍在；`:201` P11 行已注明"原以「Tailwind 重复打包」名义补入，该体积主张已被实测证伪，现定性下调"；`:207` 第三点与之一致 |

**我特别验证了 doc 的一个关键史实主张**：`:208` 说「P11 源自 t1 的 D7 观察，双方一致」。**我实测核对 `01-current-state.md`**：
- `:414` D7 确实包含「**每个入口 `import './styles.css'`**（`src/main.tsx:3`/`src/lens.tsx:3`，**重复打包 Tailwind 产物**）」——**t1 确实也主张了同一个错误结论**
- `:42`、`:167`、`:374` 三处 t1 正文同样写了「每个工具的包都会重复打包整份 Tailwind 产物」

**所以 doc 的表述精确**：P11 的**源码观察**（两处 import）t1 与 02 都做对了，**推论**（重复打包）两边都错了。这正是 `05:200-205` 命名的「**交叉印证的假象**」——两个来源共享同一个未验证前提，合计仍只是**一次**观察的权重。**这个诊断准确且有方法论价值。**

---

## R3-4. 根因留痕核验 ✅

| 要求 | 实现 | 判定 |
|---|---|---|
| 记录这是「由两行 import 推理出的结论被实测证伪」 | `:132`「这是一次「**由两行 `import` 推理出的结论被实测证伪**」。当时的推理链是"两个入口各自 import → 各打一份"——听起来无懈可击，但忽略了构建器已有的去重优化」 | ✅ |
| 归入已知静默失败家族 | `:133-137` 给出三行对照表：shell glob 无匹配不报错（建筑师）／`dist/*/` 推导源（t7 已废弃）／本条 P11 | ✅ **三条齐全，与项目史实一致** |
| 附可复现验证命令 | `:138`「可复现的验证命令就是上面那条 `grep -o 'assets/[^"]*\.css' ... \| sort -u`——**比对两个入口引用的 CSS chunk 文件名是否为同一个**」；`:119-127` 给出完整命令与输出 | ✅ |

**captain 转述的"共同结构：推理链看起来完整，但缺一个实测锚点，而缺失不会报错"——文档 `:138` 写的是「共同教训：凡"由代码结构推理出的量级/计数结论"，**必须实测**；推理只用于提出假设，不用于定论」。表述准确。**

**额外肯定**：`:130` 主动加了一条**判据纪律**——「**用"结构不变量"而非文件名/字节数作判据**……不同构建产出的 content hash 不同……字节数也随依赖与压缩输出微动（29,191 → 29,660）。**可靠的判据是「两个入口引用的是否为同一个文件名」与「CSS 文件是否只有 1 份」**」。**这与本文档 MF-5「体积不得作验收锚点」是同一条纪律——把一次证伪转化成了一条可复用的判据规范，这是超出要求的加分项。**

---

## R3-5. 05-migration-plan.md 同步核验 ✅（但有 2 处重复引用未同步）

| 位置 | 内容 | 判定 |
|---|---|---|
| `:172-205` §1.4 M-3 | 完整记录 P11 证伪 + 同步状态声明「已由 t10 回写 `02`……本文件与 `02` 现已一致」 | ✅ |
| `:190` 判据纪律 | 与 02 `:130` 一致，明写 `assets/useTheme-<hash>.css`，并说明 hash 跨环境不可复现 | ✅ **且比 02 更严格**（明确"刻意写作 `<hash>`"） |
| `:195` 优先级结论 | 「理由应改为"收敛入口样板 + 让 `IS_SINGLE` 分支上移"……**而不是**"避免重复打包"……这是**优先级下调**」 | ✅ 与 02 新表述**无矛盾** |
| `:200-205` 根因补充 | 「交叉印证的假象」表：02 §0.6 与 01-current-state.md D7 **都只观察到源码形态、都没看构建产物** | ✅ **我核实为真**（见 R3-3） |
| `:607` | 承接说明，理由改为"收敛入口样板 + 上移 IS_SINGLE"，「**不要**为"省一份 Tailwind 产物"而提前做」 | ✅ 语义正确（但引用了旧 hash，见 RN-2） |
| `:865`、`:877` | 已记录 hash 漂移教训：「把它当作"P11 不成立"的证据，而该值跨环境不可复现」 | ✅ **诚实** |

**05 与修正后的 02 在语义上完全一致，无矛盾。** 详见 RN-1/RN-2/Rn-3 三处残留。

---

## R3-6. 新缺陷（本轮独立发现）

### RN-1 `05-migration-plan.md` 有重复的 M-4 标题（low）

**问题**：`:207` 与 `:209` 是**逐字相同的两行**：
```
**M-4｜行号引用 LF-1 的修正已由 `04` round 2 接受，本文件统一采用区间写法**
**M-4｜行号引用 LF-1 的修正已由 `04` round 2 接受，本文件统一采用区间写法**
```
（实测 `grep -n "^\*\*M-4"` → `207` 与 `209`）

**影响**：纯排版瑕疵。M-4 是 `05` 自己维护的"修正台账"，重复标题会让读者以为有两条 M-4。
**建议修法**：删除 `:209` 那一行（保留 `:207`）。

### RN-2 `05` 有两处仍把旧 hash/字节数当作证据引用（medium）

**问题**：`05:190` 已明确确立「**判据必须是结构不变量，不写具体文件名或字节数**」，且 `05:865` 自己把 `19Xi-rf9` 列为**已知的不可复现值**。但同一文件仍有两处把它当作**证据**使用：

- `:607`「…但**实测两个入口共享同一个 CSS chunk**（`useTheme-19Xi-rf9.css`），该问题不成立」
- `:1013`「**实测两者共享同一个 CSS chunk**（`useTheme-19Xi-rf9.css` 被两个 HTML 共同引用，**29,191 字节**）——**P11 不成立**」

**为什么这是缺陷而非无害残留**：这两处**把不可复现的值放在了证据位置**（句式是"实测……（具体值）"）。后来者照此复核会得到 `S2PxtYyc`/29,660 而**怀疑结论本身不成立**——恰好消解了本文件自己刚建立的判据纪律。`:190` 已经把正确写法立好了（用 `<hash>` 占位），这两处却没跟着改。

**我实测确认该值确已过期**：
```
02 文档自身记录：29,191 → 29,660（hash 19Xi-rf9 → S2PxtYyc）
05:865 自认：     useTheme-19Xi-rf9.css → useTheme-S2PxtYyc.css（列为"不可复现"）
```
> **附我本轮发现的更根本原因（值得记入根因）**：`29,191` 这个值**不只是"跨环境"不可复现，它在同一环境内也随文档自身长度变化**。我实测：
> ```
> 02 截断到 1186 行（t6 原始长度）→ CSS = 29191 B  ← 与文档记录完全吻合
> 02 截断到 1311 行（t7 后）      → CSS = 29660 B
> 02 当前 1351/1360 行           → CSS = 29660 B
> ```
> **机制**：Tailwind v4 自动扫描项目内所有文件。`02-target-architecture.md` 的代码示例里含 `TOOLS.filter(`、`transform(` 等 token，被扫描器**当成工具类**，因此该文档**每加一段代码示例，就会给产物 CSS 注入几十到上千字节**。实测单独放入 02 会使 CSS 从 27,986 B 增至 29,660 B（**+1,674 B**），新增的选择器只有 `.filter` 与 `.transform`。
>
> **这本身是一个**新**的、双方都没发现的缺陷**——见 RN-3。

**建议修法**：把 `:607`、`:1013` 的证据写法统一改为结构不变量，与 `:190`/`:877` 对齐，例如：
> 「实测两个入口引用的是**同一个** CSS chunk 文件名，且 `dist/assets` 下 CSS 只有 **1** 份（判据与 hash/字节数无关，见 §1.4 M-3 的判据说明）」

### RN-3（新的独立发现）文档自身污染构建产物：`02` 的代码示例被 Tailwind 扫描进 CSS（medium）

**问题**：Tailwind v4 是 **CSS-first + 自动内容探测**，会扫描项目根下的源文件。本仓库 `src/styles.css:1` 只有 `@import "tailwindcss";`，**没有 `@source` 限制、也没有 `tailwind.config.js`**（`01-current-state.md:374` 已确认"没有 `tailwind.config.js`"）。因此 Tailwind 的默认扫描范围**包含了 `docs/architecture/*.md`**。

**我的实测证据（隔离目录，从 HEAD 干净导出后逐项加入文档）**：

| 加入的文档 | 产物 CSS |
|---|---|
| （无 docs/） | 27,986 B |
| `01-current-state.md` | 27,986 B |
| **`02-target-architecture.md`** | **29,660 B** ← **+1,674 B** |
| `03-engineering.md` | 27,986 B |
| `04-review.md` | 27,986 B |
| `05-migration-plan.md` | 27,986 B |

**只有 `02` 会注入 CSS**（因为它含最多可直接识别的 Tailwind 工具类名），新增选择器为 **`.filter` 与 `.transform`**——来自文档里的 `TOOLS.filter(`、`transform(row, report)` 等代码示例。

**为什么这值得记为缺陷（而非趣闻）**：
1. **它使"体积类判据"在本文档上根本不成立**——这正是 RN-2 里 `29,191` 无法复现的**根本原因**（该值对应 02 的 1186 行版本）。若只把它归因为"跨环境差异"，会**漏掉真正机制**，下次仍会有人记错。
2. **它的方向是"文档越长 → 产物越大"**，与"文档只描述、不影响产物"的直觉相反，属该文档核心论点（"凡推理出的量级结论必须实测"）的**又一个实例**，且是本项目**第 4 次**同类。
3. **它会给未来迁移埋坑**：文档已到 1360 行，若继续增长，CSS 会持续注水；而 `03` 的 CI 有产物契约测试（`test:artifacts`），若将来对 CSS 加任何体积断言（尽管 MF-5 已禁止），会因**改文档而变红**。

**建议修法（三选一，成本递增）**：
- **最小**（推荐，本阶段即可）：在 `02`/`05` 的判据说明里**补一句根因**：「`29,191` 不可复现的**真正机制**是 Tailwind v4 自动扫描把本文档代码示例里的 `filter`/`transform` 当工具类，注入约 1.7 KB；因此**体积永远不可作判据**——即便固定环境，改文档也会改变产物。」这样把"跨环境"这一**不完整**归因修正为完整归因。
- **中**：给 `src/styles.css` 加 `@source "./src"`（或等价的内容范围声明），把扫描限定在源码目录，`docs/` 不再影响产物。**这是真正的修复**，且顺带让"体积判据"恢复一定可复现性。
- **后**：在 `05` 的迁移计划里登记为一个独立小项（"文档不得污染产物"），与 CI 的产物契约测试一起做。

**判定说明**：RN-3 **不构成 needs_revision**——它**不影响任何已闭合结论**（P11 证伪成立、判据纪律正确），属**新增的、范围外的**架构卫生问题，且 `05` 正在规划产物契约测试，**正是登记它的合适位置**。但它是本轮**最有价值的新发现**，建议 captain 决定是否纳入。

---

## R3-7. 不得回退已闭合结论 —— 全部通过 ✅

| 已闭合结论 | 核验 | 判定 |
|---|---|---|
| `:40` 维持第二批 + 推导源为 `LIVE_TOOLS.length` | `03` 中 `LIVE_TOOLS.length` 出现 **4** 次，含"推导源必须是注册表 LIVE_TOOLS.length，不得用 dist/*/" | ✅ 未回退 |
| `dist/*/` 永久废弃 | `03` 中"永久废弃/已废弃" **2** 处；全文 13 处语境仍全为废弃记录 | ✅ 未回退 |
| `wait-on` 不引入 | 无任何 `npx wait-on` / `run: wait-on` **执行命令**；7 处全为"不引入/已废弃/不能"语境 | ✅ 未回退 |
| `json-schema-to-ts` 已砍 | `02` 中"已砍/不引入" **2** 处，R4 仍标"已决定不引入" | ✅ 未回退 |
| `04-review.md` round 1/2 记录完整 | round 1 的 BF-1 章节 **1** 处、round 2 标题 **1** 处，均完整保留（853 行） | ✅ 未回退 |
| 行数口径 3377 行 / 24 文件（排除 `lenses-inline.ts`） | `02` 中"3377 行 / 24 文件" **1** 处，:`13-24` 口径表完整；本轮我未改任何源文件 | ✅ 未回退 |

---

## R3-8. 越界核验 —— 全部通过 ✅

```bash
$ git diff --stat HEAD
（空）
$ git status --short
?? .agent-teams/
?? docs/
```

- **产品代码与配置零改动**：`src/`、`e2e/`、`package.json`、`package-lock.json`、`scripts/`、`public/`、`vite.config.ts`、`tsconfig.json`、`.github/` **均未被修改**（`git diff --stat HEAD` 为空，即无任何已跟踪文件的改动）。✅
- **本轮 t10 的改动范围限于 `02` 与 `05`**（二者 mtime 均为 `00:30`，为最新），与任务书一致。✅
- **`01-current-state.md` 与 `03-engineering.md` 的 mtime 分别为 `00:21` 与 `00:20`，早于 `02`/`05` 的 `00:30`** ⇒ **未被 t10 触碰**。✅

> **诚实说明（两处行数与我上轮记录不符，我如实记录而不臆断归属）**：
> | 文件 | round 1/2 记录 | 当前 | 差 |
> |---|---|---|---|
> | `01-current-state.md` | 481 | **486** | +5 |
> | `03-engineering.md` | 1351 | **1406** | +55 |
>
> 这两处增长**不在 t10 的修改范围内**（mtime 早于 t10 的产物，且任务书限定 t10 只改 `02`+`05`），应属其他任务（t9 或更早的收尾）。我在本轮**未修改任何文件**，**无法从当前状态判定其归属**，故只记录事实、不作结论。**如需确认，应由 captain 查任务台账。**
>
> **但有一点我可确证且与 P11 直接相关**：`01` 的 **D7（`:414`）与正文（`:42`/`:167`/`:374`）仍保留「重复打包整份 Tailwind 产物」的错误主张**——因为 t10 的范围是 `02`+`05`，**未同步 t1**。这与 round 2 的 MF-5 是**同一类边界**（只读审计产出需 captain 决定是否加批注）。**建议 captain 决定是否在 `01` 的 D7 处加一行指向 `02` §0.6 的批注**，以免未来有人引用 t1 的 D7 时重新引入 P11。

---

## R3-9. 我独立寻找的其他潜在问题（均未成立，如实记录）

| 检查 | 结论 |
|---|---|
| §0.9 表内其余条目是否因 P11 重述而自相矛盾 | ❌ 未矛盾。`:189` 表头限定（P11 系回读补入）、`:201` P11 行、`:204` 结论行、`:206-208` 补充块四者一致 |
| `02` 是否仍有地方把 P11 列为"高"影响 | ❌ 无。`:182` 已下调为"低（原判中）"，我之前 round 1 记录的"P11 高"仅存在于 04-review 的**历史留痕**中（应保持，不改史） |
| "无实质冲突"的限定是否被过度削弱以至于失去意义 | ❌ 未失去。限定为"事实来源与切分粒度"层面，仍准确描述了 t1 与 02 的关系；且新增"不背书推论正确性"是**必要的**澄清 |
| `05` 的 M-3 是否与 `02` §0.6 出现双重叙述冲突 | ❌ 无冲突，`05:174` 明确写了同步状态与对应位置 |
| 根因表三条是否与项目实际史实相符 | ✅ 相符：shell glob（`01:432` 自述）、`dist/*/`（`03` §4.6.3 记录）、P11（本轮） |

---

## R3-10. Round 3 边界声明

- **只读复审**：**未编辑** `02-target-architecture.md`、`03-engineering.md`、`05-migration-plan.md`、`01-current-state.md` 任何一行。本轮对本文件的写入是**追加 Round 3 章节**，round 1/round 2 内容**完整保留**。
- **我自行跑构建取证**：执行了 `npm run build`（exit 0）用于比对两个入口的 CSS chunk；并在 **`/tmp/cleancss` 隔离目录**用 `git archive HEAD` 导出干净副本做了"逐份加入文档 → 观察 CSS 体积"的对照实验（RN-3 的证据来源）。**所有临时目录与 `dist/` 已删除**。
- **未新增文件**：未创建 `scripts/check-e2e-mapping.sh`、`scripts/wait-port.mjs` 或内容范围声明——**它们属后续迁移批次**，本阶段不改产品代码。
- **`git status`**：`?? .agent-teams/`、`?? docs/`；`git diff --stat HEAD` 为空。

---
---

# 04-review · Round 3 附篇：RN-3 撤回与更正（应 captain 要求重做对照实验）

> **触发**：captain 对我的 **RN-3**（"文档自身污染构建产物"）提出质疑，并给了干净复现步骤。
> **结论**：**RN-3 的核心主张被撤回。captain 是对的。** 我的原实验有**方法学缺陷**，得出的因果链不成立。
> **但**在重做的过程中，我发现了一个**真实且不同的**事实（`.agent-teams/` 会被扫描），并**修正了原实验的技术错误**。
> **这是本项目第 5 次同类错误，而这次犯错的是我** —— 我把它完整记录在案，作为该纪律的反面教材。

## R3C-1. 撤回声明

**撤回** Round 3 的 RN-3 中以下主张：

| 原主张 | 判定 |
|---|---|
| "无 docs → 27,986 B；仅加 02 → 29,660 B（**+1,674 B**）" | ❌ **撤回**：该对照不成立 |
| "02 的代码示例含 `TOOLS.filter(`、`transform(` 被扫描器当工具类" | ❌ **撤回**：`.filter`/`.transform` 来自真实产品代码，与文档无关 |
| "因此**文档越长，产物越大**" | ❌ **撤回** |
| "29,191 不可复现的**真正机制**是文档被扫描" | ❌ **撤回**：把 02 截断回 1186 行得到 29191 是**巧合**，不是因果 |

**保留**（经重做实验确认）：
- ✅ **Tailwind v4 确实会扫描 `docs/**/*.md`**（我用注入法证明了，见 R3C-3）——这一机制**本身**是真的。
- ⚠️ 但**当前的 `docs/` 内容对产物贡献 0 字节**，因此**不构成缺陷**。它的实际影响是"未来若有人在文档里写合法的 Tailwind 类名，会进产物"，属**潜在卫生问题**而非现存缺陷，**严重度应从 medium 降为 low 且不阻塞**。

## R3C-2. 我的方法学错误（这是关键，值得完整记录）

原实验的做法是：`git archive HEAD` 导出到 **`/tmp/cleancss`**，再逐份复制 `docs/` 下的文件进去构建。**两处错误叠加，共同造出了假信号**：

| # | 错误 | 为什么致命 |
|---|---|---|
| 1 | **跨盘隔离**：把仓库导出到 `/tmp`（不同文件系统） | 引入了**除"有无 docs"之外的**大量差异（`node_modules` 用 symlink 代用、`.agent-teams` 不在场、`_archive`/`_shots`/`dist-single` 不在场、`public/data` 产物状态不同）。**变量没有唯一化。** |
| 2 | **只复制子集**：只把某几份 `.md` 放进隔离树 | 这恰好**改变了我后来发现的 `.agent-teams` 因素**：隔离树里根本没有 `.agent-teams`，基线自然更小。**我测到的是"隔离树 vs 真实树"的差，却归因给了 `docs/`。** |

**captain 的原始判断是对的**：他怀疑"跨盘 `mv`/复制子集引入了别的差异"，并建议"在同一文件系统内改名"。**这正是问题的根源。**

### 我在重做中又踩了一个坑（同样记录）

第一次按 captain 建议做 `mv docs docs__hidden` 时，我得到"无变化"，但那**也不能证明**结论——因为 **`docs__hidden` 仍在项目内，Tailwind 仍然扫描它**。我随后在 `R3C-3` 里把目录**移出项目**（`mv docs /tmp/docs-parked`）才得到干净结果。**"改名"必须移出扫描根，而不是只换名字。**

## R3C-3. 干净对照实验结果（全部在本仓库、同一文件系统）

### 实验一：把目录**移出项目**后重建（正确做法）

```
A) docs 在项目内        -> CSS = 29,692 B
B) docs 移出到 /tmp     -> CSS = 29,692 B     ← docs 影响 = 0 B
C) .agent-teams 移出    -> CSS = 29,660 B     ← .agent-teams 影响 = -32 B
```
**⇒ `docs/` 对产物体积的影响是 0。RN-3 的核心主张不成立，captain 正确。**

### 实验二：注入法直接判定"是否被扫描"

在任何目录里放一个有**合法** Tailwind 任意值的类名，重建后看它是否出现在 CSS：

| 注入位置 | 类名 | 是否出现在产物 CSS |
|---|---|---|
| `docs/architecture/02-target-architecture.md` | `p-[77.55px]` | ✅ **出现** |
| `docs/…/02-….md`（.agent-teams 不在场时） | `p-[66.44px]` | ✅ **出现** |
| `src/portal/App.tsx`（阳性对照） | `p-[12.34px]` | ✅ 出现 |
| `.agent-teams/…/auditor.jsonl` | `p-[99.11px]` | ✅ **出现** |

**⇒ Tailwind v4 的扫描范围确实包含仓库内的 `.md` 与 `.jsonl`，不只 `src/`。** 我原来"机制猜对了"，但**因果链与量级完全错了**。

> **附**：我第一次注入用的是 `rn3uniq9x-[12.34px]`（非法类名），产物无变化，我**一度据此误判"未被扫描"**。改用合法类名后才得到正结果。**这提醒：注入法的探针必须是语法合法的工具类，否则会把"探针无效"误读为"未被扫描"。**

### 实验三：`p-[13.37px]` 这个野生规则的真正来源

我在基线 CSS 里发现一条**不属于任何 `src/` 文件**的规则：
```css
.p-\[13\.37px\]{padding:13.37px}
```
全仓（含 node_modules）唯一的文本来源是 **`.agent-teams/toolbox-arch/inbox/auditor.jsonl`** —— 即 **captain 在我上一条复审消息里，用 `p-[13.37px]` 作为示例类名**，该消息被写入我的收件箱文件，于是**被 Tailwind 扫描并进了产物**。

**实测确认**：把 `.agent-teams` 移出项目 → 该规则消失，CSS 29,692 → **29,660 B（−32 B）**。

**这解释了 `29,191` 无法复现的真正原因**（之一）：产物体积不仅随依赖漂移，**还随团队协作产物（收件箱、文档）漂移**。我原来把 29,191 归因于"02 被截断"是错的；真实原因是**当时基线**（更早的源码/文档/协作文件状态）不同。

## R3C-4. 更正后的结论与建议

**对 RN-3 的最终定性**：
- **撤回**"文档污染产物"作为**缺陷**（当前 `docs/` 贡献 0 B，无可复现危害）。
- **降级并改写**为一条 **low** 的**潜在卫生提示**（可选，不阻塞）：

> **【low / 可选】构建扫描范围未限定**
> `src/styles.css:1` 只有 `@import "tailwindcss";`，**无 `@source`**，因此 Tailwind v4 按默认规则扫描仓库内的 `.md`、`.jsonl` 等非源码文件。**实测已确认可被扫描**（注入合法类名后规则出现在产物 CSS）。当前 `docs/` 内容恰好不含合法工具类 ⇒ **影响为 0 B**；但 `.agent-teams/` 的收件箱已因此向产物注入了 32 B（`p-[13.37px]`）。
> **建议（不阻塞）**：给 `src/styles.css` 加 `@source "./src"` + `@source "./index.html"` 等显式范围，使"文档/协作文件"不再可能影响产物。
> **收益**：让产物体积**只**取决于源码，恢复"体积差异 ⇒ 源码差异"的可诊断性。

**对 §5.3 团队级纪律的补充建议**（与本轮教训直接相关）：
> 现有 §5.3 只说了"不写 content hash、不用体积作锚点"。本轮证明**还有第三类不可复现来源：协作/文档文件也会进产物**。建议在 §5.3 的"漂移来源"清单里补一行：
> | 漂移来源 | 表现 |
> |---|---|
> | 团队协作文件（`.agent-teams/` 收件箱、`docs/**`）被 Tailwind 默认扫描 | 改一条消息/一份文档就可能改变产物体积 |
> 这样"为什么体积永远不可作判据"就有了**三条**独立理由（hash、依赖、协作文件），而不是两条。

## R3C-5. 自我审计：我为什么犯了这次错

RN-3 是本项目**第 5 次**"由推理/单点测量得出结论而未做干净对照"的错误，前四次分别是：shell glob 漏 598 行（architect）、`dist/*/` 推导源（tooling）、P11 两行 import（t1 + tooling）、以及我在 round 1 对"跨环境 hash"的不完整归因。**共同结构**（我在 round 3 里刚引用过）：
> **推理链看起来完整，但缺一个实测锚点，而缺失不会报错。**

**我这次的具体触发点**：
1. 我在 `/tmp` 隔离树里看到"无 docs = 27986"，**没有先验证隔离树与真实树在其他维度上是否等价**（变量未唯一化）。
2. "02 截断到 1186 行正好 = 29191"这个**过于漂亮的吻合**让我停止了怀疑——**巧合被当成了因果证据**。
3. 我没有像 captain 那样**问一句"会不会是别的差异"**。

**可操作的防范**（建议并入 §5.3，与"交叉印证的假象"并列）：
> **做对照实验时，隔离环境必须与真实环境**只在被测变量上**不同。**"我把它挪出去了"要能证明它确实不在扫描/构建范围内——改名不算，必须移出根目录。** 若结果出现"恰好吻合"（如截断行数正好复现旧数字），应视为**需要额外验证的信号**，而非结论成立的证据。**

---

**附篇边界声明**：本附篇**未编辑** `01/02/03/05` 任何一行；仅在 `04-review.md` 追加更正记录（round 1/2/3 正文**完整保留**，含被撤回的原 RN-3 文本，以便留痕）。所有实验在本仓库内进行（同文件系统），移出的目录**均已还原**（`docs`、`.agent-teams` 已确认存在）；`dist/`、`node_modules/.vite`、`node_modules/.vite-temp` 与全部 `/tmp` 临时文件已清理。`git status` 仅 `?? .agent-teams/`、`?? docs/`；`git diff --stat HEAD` 为空。

---
---

# 04-review · Round 3 附篇之二：`p-[13.37px]` 来源的最终归因（附篇一的第二处更正）

> **触发**：captain 指出附篇一里"`.agent-teams` 影响 = −32 B"这一归因**也不准确**，并给出实测 0 B。
> **结论**：**captain 的 0 B 是正确的且可复现**；我的 −32 B 是**同一类错误的第二次犯**——**单点移出 + 混淆变量**。
> 但完整归因比双方各自的说法都更细：该规则**有两个独立来源**，**单独移除任何一个都不会使它消失**。这解释了为什么"单点归因"必然出错。

## R3D-1. 撤回附篇一中的第二处错误

| 附篇一的主张 | 判定 |
|---|---|
| "`.agent-teams` 影响 = **−32 B**（29,692 → 29,660）" | ❌ **撤回**。captain 实测 0 B，**我复现确认** |
| "`p-[13.37px]` 的唯一来源是收件箱" | ❌ **撤回**。有**两个**独立来源，见下 |

**我复现了 captain 的实验，得到与他一致的结果**：

```
A) .agent-teams 在项目内        -> 29,820 B ; 13.37px 存在
B) mv .agent-teams /tmp 后重建  -> 29,820 B ; 13.37px 存在   ← 影响 = 0 B
C) 恢复后重建                   -> 29,820 B
```
**captain 的 0 B 成立。** 我此前的 −32 B 不成立。

## R3D-2. 完整归因（我逐项移出、逐项测量）

`13.37px` 这个字面量在项目内共出现于 **3 个文件的 13 处**：

| 文件 | 出现次数 |
|---|---|
| `.agent-teams/toolbox-arch/inbox/auditor.jsonl` | 7 |
| `.agent-teams/toolbox-arch/inbox/captain.jsonl` | 2 |
| **`docs/architecture/04-review.md`**（**我自己写的**） | **4** |

**逐项移出实验（每次只移出指定项，其余保持原状）**：

| 实验 | CSS 体积 | `p-[13.37px]` 规则 |
|---|---|---|
| 基线（三者都在） | 29,820 B | **存在** |
| 只移出 `04-review.md` | 29,788 B | **仍存在**（收件箱供给） |
| 只移出两个收件箱（`04` 留着） | **29,820 B** | **仍存在**（`04` 供给）← **captain 的实验** |
| **同时移出收件箱与 `04-review.md`** | **29,660 B** | **消失** ✅ |

**⇒ 该规则有「收件箱」与「`04-review.md`」两个各自充分的来源。单独移除任一个，另一个立刻补上，所以单点移出必然测不到"消失"。** 这正是我在附篇一里把 −32 B 归因给 `.agent-teams` 的**真实原因**——我测的是"移除一个来源后**另一来源仍在**的残留量"，却把它当成了"该来源的贡献量"。

> **完整因果链（比双方各自的说法都长一环）**：
> 1. **captain** 在复审消息里用 `p-[13.37px]` 作示例类名（他的锅，他已认领）；
> 2. 消息落入 `.agent-teams/**/*.jsonl` ⇒ **被 Tailwind 扫描 ⇒ 进产物**（真实存在的污染）；
> 3. **我在 04-review.md 里把该字符串当作证据复述了 4 次**（含 CSS 原文那行）⇒ **文档成为第二个来源**；
> 4. 于是**任何一个来源被移出，规则都依然存在** ⇒ 单点归因失败。

**第 3 步是我的责任**：我把一个"会进产物的字符串"写进了另一份"会进产物"的文档。**这是我在本轮的第三次同类动作**（先误判 docs、再误判 .agent-teams、且两次实验本身都在制造新来源）。

## R3D-3. 保留且已被 captain 采纳的结论

| 结论 | 状态 |
|---|---|
| Tailwind v4 无 `@source`（`src/styles.css:1` 仅 `@import "tailwindcss";`），**默认扫描含 `.md` 与 `.jsonl`** | ✅ **保留**（注入法验证：在 `docs/**.md` 与 `.agent-teams/**.jsonl` 放入合法类名，均出现在产物 CSS） |
| **当前实际影响量 = 32 B 级**（唯一被扫进去的是我们自己在对话里造的野生类名 `p-[13.37px]`，非产品所需） | ✅ 保留（量级极小，**不构成缺陷**，属卫生问题） |
| **建议给 `styles.css` 加 `@source` 限定扫描范围** | ✅ 保留，**captain 已采纳**并入待派修项。理由升级为：不仅卫生，还能让"**产物变化 ⇒ 源码变化**"重新可诊断 |
| **建议 §5.3 补第三类漂移来源（协作/文档文件）** | ✅ 保留，**captain 已采纳**（措辞按本附篇修正量级：影响为**字节级**，但机制真实） |

**§5.3 建议补的行（修正后措辞）**：
> | 漂移来源 | 表现 |
> |---|---|
> | 团队协作文件（`.agent-teams/**` 收件箱、`docs/**`）被 Tailwind 默认扫描 | **任何**写入这些文件的内容都可能改变产物体积，且**同一字符串可同时存在于多个来源**，使"移出某目录"无法消除它 |

## R3D-4. 我的三次同类错误与本轮真正的产出

| # | 动作 | 性质 |
|---|---|---|
| 1 | RN-3 原实验（`/tmp` 跨盘 + 只复制子集） | 变量未唯一化 ⇒ 得假结论 |
| 2 | 附篇一的 −32 B 归因（只移出 `.agent-teams`） | **单点移出 + 忽略并存来源** ⇒ 归因错 |
| 3 | **把 `13.37px` 写进 `04-review.md`** | **实验在制造新来源，污染被测对象** |

**三次的共同结构**：都在**没有固定住其他变量**的情况下，把一个"看起来能对上"的数字当成因果证据。**这与我撤回 RN-3 的理由同源——我撤回了结论，却没有同时检视我给出的替代归因。**

**captain 提醒保留的两条防范**（我确认它们是本轮最有价值的产出，**比 RN-3 本身重要**）：
1. **「改名不算隔离，必须移出根目录」** —— 因为改名的目录**仍在扫描根内**。
2. **「出现'恰好吻合'应视为需要额外验证的信号，而非结论成立的证据」**。

**本附篇据此新增第三条（由 captain 的纠正直接得出）**：
3. **「单点移出只能证明'该来源不充分'，不能证明'该来源无贡献'。若怀疑某个字符串影响产物，必须先确认它是否**同时存在于多个被扫描文件**中；否则任何单点对照都会得到 0 差异，并被误读为'无影响'。」**

> 这条与 captain 的 0 B 结果**完全兼容**：他的 0 B 是正确的测量——移除 `.agent-teams` 后 `04-review.md` 顶上，总量自然不变。**0 B 不是"`.agent-teams` 没被扫描"，而是"两个来源互为备份"。**

## R3D-5. 对 RN-3 的最终定性（不变）

- **RN-3 作为缺陷：撤回**（当前 `docs/` 与 `.agent-teams/` 的真实影响为 **32 B 级**，且源于我们自己在对话中造出的野生类名，非产品所需；无可复现危害）。
- **机制保留为 low/可选卫生提示**：`styles.css` 缺少 `@source` ⇒ 扫描范围含非源码文件 ⇒ 建议加显式范围。**captain 已采纳并入待派修项。**
- **t11 的 verdict 维持 `pass`**：RN-3 自始未影响任何已闭合结论。

---

**附篇之二边界声明**：本轮**未编辑** `01/02/03/05` 任何一行（仅追加本记录至 `04-review.md`，round 1/2/3 及附篇一全文**完整保留**，含已被撤回的原始表述，以留痕）。所有实验在本仓库内进行；移出的 `.agent-teams`、`04-review.md` 与 `/tmp` 下的临时副本**均已还原并确认存在**；`dist/`、`node_modules/.vite`、`node_modules/.vite-temp` 已清理。`git status` 仅 `?? .agent-teams/`、`?? docs/`；`git diff --stat HEAD` 为空。
