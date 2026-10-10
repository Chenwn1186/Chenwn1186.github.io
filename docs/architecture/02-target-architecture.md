# 02 · 目标架构：以可维护性为第一约束

> **文档定位**：本文档是「我的工具箱」架构升级的**主设计文档（目标架构 ADR）**。
> 它与 `03-engineering.md`（工程化分册）**共同构成本项目的全部设计交付物**；
> 原计划的 t2（目标架构）与 t3（工程化）已**合并至此二文**，不再另行产出。
> **配套文档**：[`03-engineering.md`](./03-engineering.md) —— 构建自动化、注册表契约、测试分层与 CI 门禁的落地细节
> **上游事实**：[`01-current-state.md`](./01-current-state.md) —— architect 的只读现状审计；本文档的每条现状陈述都与其交叉核对过（核对结果见 §9）
> **状态**：设计提案（不涉及产品代码改动）
> **适用仓库**：`D:/docs/01-my-website`（我的工具箱）
> **基线**：提交 `95c0260`
> **设计目标排序**：**可维护性 > 可扩展性 > 先进性 > 性能**

### 行数口径（统一表述，三方数字已结案）

| 口径 | 命令 | 实测 |
|---|---|---|
| **源码（手写）** | `find src -type f -not -name lenses-inline.ts \| xargs wc -l` | **3377 行 / 24 文件** |
| src 目录总计（含生成物） | `find src -type f \| xargs wc -l` | 3380 行 / 25 文件 |
| 含 e2e + scripts | `find src scripts e2e -type f \| xargs wc -l` | 3955 行 / 29 文件 |

> 本表取代本文档此前「源码 25 个文件 / 3955 行」的错误标注——那是**把「含 e2e+scripts 的 3955 行」错配到「src 的 25 个文件」上**，两个数字各自都是实测正确值，但口径自相矛盾。
> 3377 行扣掉的行数是 `src/data/lenses-inline.ts`（3 行，`prepare-data.mjs` 生成的构建期生成物，见 `.gitignore:28-29`）。
> 该数字与 `HANDOFF.md:22` 的「源码 24 文件 / 3,377 行」**完全吻合**。
> 又：`01-current-state.md` §9 D10 曾判定 HANDOFF 的 3,377 不可信并实测为 2782 行——经验算，**D10 的 2782 与任何一种合理口径都对不上**（src-only 为 3380，含生成物扣除后为 3377），已由 captain 裁定作废。**本文档一律采用上表口径。**

---

## 0. 为什么需要这份文档（用事实说话）

先说结论：当前架构**不是坏的**——它按「页面」切分得很干净，`shared/` 层也真实存在。问题在于**新增一个工具的边际成本没有收敛到零**，而且成本藏在第三个步骤里。

### 0.1 新增工具的真实成本（`README.md` 第 96–140 行明确写了"三步"）

| 步骤 | 动作 | 触碰的文件 | 性质 |
|---|---|---|---|
| 1 | 新建 `src/<tool>/App.tsx` + `src/<tool>.tsx` 入口 | 新文件 ×2 | ✅ 纯新增 |
| 2 | 复制 `lens/index.html` 为 `<tool>/index.html`，改 title/description/script src | 新文件 ×1 | ✅ 纯新增 |
| 3 | **在 `vite.config.ts` 的 `input` 里登记 + 往 `src/portal/tools.tsx` 的 `TOOLS` 数组加一项** | **2 个共享文件** | ❌ **修改共享文件** |

**第 3 步就是全部问题的根源。** 它带来三个具体的、可验证的维护痛点：

**痛点 A — 同一份工具元数据存在两处，且必须手工保持一致。**
`vite.config.ts:21-26` 知道工具存在：

```ts
const input: Record<string, string> = single
  ? { lens: resolve(root, 'lens/index.html') }
  : { main: resolve(root, 'index.html'), lens: resolve(root, 'lens/index.html') };
```

`src/portal/tools.tsx:28-46` 也知道工具存在（名称、简介、图标、标签、主题色）。**「有哪些工具」这个事实被复制了两份，靠人脑同步。** 忘记改 vite 配置 → 构建产物里没有该页面，点卡片 404；忘记改 TOOLS → 页面能访问但门户主页上没有入口。

**痛点 B — `singlefile` 模式的 `input` 是硬编码的特例。**
`vite.config.ts:22` 在单文件模式下**只**构建 `lens`。这意味着新增工具后，`build:single` 会静默地不产出新工具的单文件版。这是一个**沉默失败**：构建成功、退出码 0、产物却缺一块。这类 bug 最贵，因为没人会去测。

**痛点 C — `TOOLS` 数组的 `icon` 字段把 SVG 塞进共享文件。**
`tools.tsx:34-40` 内联了镜头的 SVG 图标。每加一个工具，就往共享文件里塞一段与那个工具强耦合的标记。这个文件会随着工具数量线性膨胀，且每次改动都制造跨工具的 merge 冲突。

### 0.2 第二个结构性问题：`shared/` 里混装了两种寿命完全不同的东西

我逐个追踪了 `shared/` 下每个模块的真实消费者：

| 模块 | 真实消费者 | 结论 |
|---|---|---|
| `shared/useTheme.ts` | portal + lens | ✅ 真基础设施 |
| `shared/components/ui.tsx` | 仅 lens（8 处） | ⚠️ 名义共享 |
| `shared/lib/chart.ts` | 仅 lens（3 处） | ⚠️ 名义共享 |
| `shared/components/ChartBox.tsx` | 仅 lens | ⚠️ 名义共享 |
| **`shared/lib/lens.ts`** | **仅 lens（11 处）** | ❌ **领域代码，放错了地方** |

`shared/lib/lens.ts` 是 206 行的**镜头领域模块**：`Lens` 接口、`METRICS` 八维指标、`BRAND_CN` 50 条品牌中文名、`brandColor` 品牌配色。它被 `shared/` 这个"公共"标签伪装成了通用资产，实际上：

- **它只服务 1 个工具。** 删除镜头工具时，它应该被一起删除——但它躺在 `shared/` 里，删它需要先证明"确实没人用了"，而这个证明成本会随工具数量增长。
- **它污染了新工具的认知起点。** 新工具作者打开 `shared/`，看到 `Lens`、`METRICS`、`BRAND_CN`，第一反应是"这是不是我也该用的东西"。这是一个**错误的引导**。
- **它把领域知识放进了架构层。** 八维评测指标是镜头业务的决策，不是架构决策。

这正是"随删随去"（delete-ability）无法达成的根本原因：**删除一个工具时，它的领域代码散落在共享目录里，无法判定归属。**

### 0.3 第三个问题：测试是"一次性全链路脚本"，不是分层资产

`e2e/verify.cjs` 是 282 行、**49 条断言**的单体脚本（`r.ok(...)` 调用共 49 处），它带来几个可维护性代价：

- **无法定位失败归属。** 它是全链路串行：门户 → 卡片点击 → 镜头页加载 → 筛选 → 排序 → 图表 → 抽屉 → 主题 → 移动端 → CSV。任何一步的等待超时都会污染后续断言。`verify.cjs:107` 点"下一页"、`verify.cjs:154` 点 Nikon Z、`verify.cjs:210` 填价格区间——这些是**共享的可变状态**，第 40 条断言失败的原因可能在第 5 条。
- **新增工具无测试可复用。** 断言里硬编码了 `=== 1617`（`verify.cjs:86`）、`=== 8` 张画布（`verify.cjs:94`）、`'全球镜头数据库'`（`verify.cjs:41`）。这些是镜头业务的数字，新工具一行都用不上。**测试基础设施的复用率是 0。**
- **没有单元测试层。** `package.json` 里**没有任何测试运行器**（我确认过：`node_modules` 中无 vitest / jest / @testing-library）。而 `src/lens/filter.ts`（130 行筛选排序纯函数）、`src/shared/lib/lens.ts` 的 `fmt`/`money`/`focalText`/`esc`/`brandColor` 都是**极佳的单测对象**——纯函数、无 DOM、边界清晰。目前它们 100% 靠 E2E 覆盖，意味着改一个格式化函数的代价是跑一次完整浏览器链路。
- **CI 里根本没跑测试。** `.github/workflows/deploy.yml` 的 `build` job 只有 `npm ci`（`:46`）→ `npm run build`（`:60`）→ `upload-pages-artifact`（`:64`）。`npm run e2e` 从未进入 CI（因为 playwright 被刻意排除在 `devDependencies` 外，见 `e2e/harness.cjs:8-9` 的注释）。**当前的质量门禁只有 `npm run build` 内含的 `tsc --noEmit` 一道。**

### 0.4 第四个问题：数据流水线的产物写入 `src/`

`scripts/prepare-data.mjs:24` 把生成物写到 `src/data/lenses-inline.ts`，`scripts/prepare-data.mjs:23` 写到 `public/data/lenses.json`。这本身是合理的设计（区分 fetch 与内联两条投递路径），但：

- 生成物写在**源码目录内**，靠 `.gitignore` 排除（`.gitignore` 末尾两条）。任何"备份源码"或"打包 src"的操作都会带上 0.9MB 生成物。
- 流水线**硬编码了镜头领域**：`KEEP` 字段表（`prepare-data.mjs:27-35`）、`SCORE_KEYS` 归一化逻辑（`prepare-data.mjs:54-60`）、`minFocus` 里 `🔍` 图标的清洗（`prepare-data.mjs:68`）。`npm run data` 是一个只有镜头能用的动词。
- **没有数据契约验证。** 清洗后只有一行 `console.log`（`prepare-data.mjs:93-98`）报告条数。如果源数据某个字段整体变成 `null`，脚本会**成功地**产出一份字段缺失的 JSON，退出码 0，然后在浏览器里炸掉或显示"—"。

### 0.5 第五个问题：模板复制不到的返回链接（t1 新发现，本文档补入）

`src/lens/App.tsx:212-221` 把「← 返回工具箱」写成：

```tsx
{IS_SINGLE ? (
  <span>单文件版 · 可离线使用</span>
) : (
  <a href={import.meta.env.BASE_URL}>← 返回工具箱</a>
)}
```

**返回链接不是 `index.html` 的一部分，而是写死在工具 App 内部的。** 因此按 README 的"三步法"复制 `lens/index.html` 做模板，**复制不到这个链接**——新工具会做出来一个**没有任何回门户路径的死页面**。这是"三步法在文件层面属实、在改动点层面不完整"的第一处遗漏。

**更关键的是它揭示了正确的抽象方向**：这个链接属于**导航职责**，不应该由每个工具各自实现。第 2 节的分层设计中，它应当由平台层提供的共享布局/导航骨架统一渲染（见 §2.1 的 `platform/ui/Shell.tsx`），工具**完全不写这一行**。这条发现直接支持了"共享布局层"是目标架构的必要组件。

### 0.6 第六个问题：入口样板重复 + `IS_SINGLE` 泄漏（原「Tailwind 重复打包」已被实测证伪）

`src/main.tsx:3` 与 `src/lens.tsx:3` **各自** `import './styles.css'`。而 `src/styles.css`（106 行）是**全站唯一**的 Tailwind 入口与色板（`:1` 导入、`:9-29` 亮色变量、`:30-49` 暗色变量、`:53-72` `@theme inline` 映射）。

> **⚠️ 本条早先的结论被实测证伪。** 本文档曾写「**每个工具的独立入口都会重复打包一整份 Tailwind 产物**，随工具数量线性增长」——该断言**不成立**。
>
> **实测事实**（本机 `npm run build` 后；命令与结果见下，可复现）：
> ```bash
> $ grep -o 'assets/[^"]*\.css' dist/index.html dist/lens/index.html | sed 's/^[^:]*://' | sort -u
> assets/useTheme-<hash>.css      # 只输出 1 行 ⇒ 两个入口引用的是【同一个】CSS chunk
> $ ls dist/assets/*.css | wc -l
> 1                               # 整站只有这一份 CSS
> ```
> （输出中的 `<hash>` 是占位符：**具体值跨环境变化、不可复现**，故不写入文档——理由见下。）
> **门户与工具入口共享同一个 CSS chunk（单份，约 29 KB）**——Rolldown 的共享 CSS 提取（shared CSS extraction）已经把重复导入**去重**了。因此**不存在**"按工具数线性增长的 Tailwind 体积成本"。
>
> **⚠️ 判据必须是结构不变量，不写具体文件名或字节数。** 上面刻意用 `<hash>` 占位——**content hash 跨环境不可复现**（同一份源码在同环境内连续构建稳定，但 Rolldown/Vite/依赖树一变就不同；本团队实测到过两个不同的值）。**字节数同理**，随依赖与压缩输出浮动。
> **可靠的判据只有两条：「两个入口引用的是否为同一个文件名」与「`dist/assets` 下 CSS 是否只有 1 份」**——前者与 hash 无关，后者与体积无关，可长期复现。这与本文档 MF-5「体积不得作验收锚点」是同一条纪律，已升格为团队级纪律（见 `05-migration-plan.md` §5.3）。
>
> **根因留痕**：这是一次「**由两行 `import` 推理出的结论被实测证伪**」。当时的推理链是"两个入口各自 import → 各打一份"——听起来无懈可击，但忽略了构建器已有的去重优化。**它属于本项目已知的"静默失败家族"的最新一例**：
> | 同类事件 | 推理结论 | 实测结果 |
> |---|---|---|
> | shell glob 无匹配不报错 | 脚本"跑过了"= 成功 | 实际未匹配任何文件也返回 0 |
> | `dist/*/` 作推导源（t7 已废弃） | 数顶层目录 = 卡片数 | `assets/ data/ lens/` = 3，而卡片数 = 1 |
> | **本条 P11（本次修正）** | 两个入口各 import → 各打一份 Tailwind | 共享同一个 CSS chunk，仅 1 份 |
> **共同教训**：凡"由代码结构推理出的量级/计数结论"，**必须实测**；推理只用于提出假设，不用于定论。可复现的验证命令就是上面那条 `grep -o 'assets/[^"]*\.css' ... | sort -u`——**比对两个入口引用的 CSS chunk 文件名是否为同一个**。

**P11 的真实收益（定性已下调为架构一致性，不作独立收益主张）**：

| 维度 | 是否成立 | 说明 |
|---|---|---|
| ~~消除重复打包的体积成本~~ | ❌ **不存在** | Rolldown 已共享 CSS 提取去重（实测见上）。**不得把这条作为收益主张**——它会被实施者照抄成"预期减少 N 份 CSS 体积"，而实际不会有任何体积变化。 |
| **收敛入口样板** | ✅ 成立 | 每个工具的 `src/<tool>.tsx` 都重复 `StrictMode` + `createRoot` + `import './styles.css'`。收敛为 `mountTool(id, App)` 一行后，**样板只存在于平台层**，新增工具不再复制它。 |
| **上移 `IS_SINGLE`** | ✅ 成立 | 当前 `lens/App.tsx:212-213` 让**产品视图**感知构建模式（`IS_SINGLE ? <span>单文件版</span> : <a>返回工具箱</a>`）。上移到 `Shell` 后，**工具不再感知构建模式**——这是 t1 指出的"构建模式泄漏进产品视图的唯一一处"（`01-current-state.md` §6.2）被清除。 |

**对设计的影响**：仍然要求平台层有一个**统一的入口挂载函数**（`platform/runtime/mount.tsx`，见 §2.1），理由**改为**上面两条架构一致性收益（收敛样板 + 上移 `IS_SINGLE`），**而非**体积成本。**`mount.tsx` 的优先级相应下调**（`05-migration-plan.md` §1.4 的 M-3 已据此记录）。

### 0.7 第七个问题：卡片文案里的数据快照会静默过期（t1 的 D12，本文档补入）

`src/portal/tools.tsx` 把**运行时数据事实**硬编码进了注册表：

- `:32` `desc` 里写「1,617 支镜头…覆盖 46 个品牌、41 种卡口」
- `:42` `meta` = `'1,617 支镜头 · 8 项评测维度 · 39 家评测源'`

而 `部署指南.md:167-168` 明确告诉用户：「**改数据**：只要更新 `scripts/lenses-source.json`，推送即可 —— 构建时会自动跑 `npm run data` 重新清洗。」

**两者矛盾**：用户按文档更新数据源后，卡片文案里的数字**不会自动更新**，会静默过期。而且**没有任何检查会发现**——E2E 不校验卡片文案里的数字（`verify.cjs` 对卡片只断言名称与 href）。

**对设计的含义**：这类"展示层硬编码业务数字"的根因是**元数据与数据源没有关联**。设计上的对策有两条，本文档倾向第 2 条：

1. `ToolManifest.meta` 允许写模板串（如 `'{count} 支镜头 · 8 项评测维度'`），构建期用数据产物的统计值填充。
2. **更彻底：`meta` 不写数字，数字由工具自己在页面上渲染**（如 `HeaderSection` 已有的动态统计）。门户卡片只放**不随时间变化**的描述。

**本文档采用第 2 条**，理由：模板串方案引入了"注册表依赖数据产物"的新耦合，而注册表的定位是**轻量清单**（§7.1 要求门户构建产物与工具实现解耦）。数字放进注册表，等于门户必须读取所有工具的数据产物——代价大于收益。**这条同时修正了当前的 `tools.tsx:32,42`。**

### 0.8 问题清单汇总（后续设计逐条对应）

| 编号 | 问题 | 证据位置 | 严重度 |
|---|---|---|---|
| P1 | 工具注册表双写（vite input + TOOLS） | `vite.config.ts:21-26`、`tools.tsx:28-46` | 高 |
| P2 | singlefile 模式 input 硬编码，新增工具静默丢失 | `vite.config.ts:22` | 高 |
| P3 | 图标 SVG 内联进共享文件，线性膨胀 + 冲突 | `tools.tsx:34-40` | 中 |
| P4 | 领域代码放 `shared/`，破坏"随删随去" | `shared/lib/lens.ts` 全文（206 行）、`shared/components/LensTip.tsx`（72 行） | 高 |
| P5 | 无单元测试层，纯函数只靠 E2E | 无测试运行器 | 高 |
| P6 | E2E 单体脚本，无隔离、无复用、硬编码业务数字 | `e2e/verify.cjs:41,86,94` | 中 |
| P7 | CI 无测试门禁，仅 `tsc --noEmit`；`build:single` 完全不在 CI 内 | `deploy.yml:46,60,64` | 高 |
| P8 | 数据流水线硬编码领域、无契约验证、产物入 src/ | `prepare-data.mjs:24,27-35,93-98` | 中 |
| P9 | 无错误边界，工具崩溃可能带走整个页面外壳 | `main.tsx`、`lens.tsx` 无 error boundary | 中 |
| **P10** | **返回链接写死在工具 App 内，模板复制不到 → 新工具无回门户路径** | `src/lens/App.tsx:212-221` | **高** |
| **P11** | **入口样板重复（`StrictMode`+`createRoot`+`import './styles.css'`）且 `IS_SINGLE` 泄漏进产品视图**。~~Tailwind 产物按工具数重复打包~~ **该体积主张已被实测证伪**（Rolldown 共享 CSS 提取去重，两入口引用同一 chunk） | `src/main.tsx:3`、`src/lens.tsx:3`、`src/styles.css` | 低（原判「中」随证伪下调） |
| **P12** | **卡片文案硬编码数据快照，与"改数据源即可"的承诺矛盾且无检查** | `tools.tsx:32,42` vs `部署指南.md:167-168` | 中 |

> P10–P12 来自 architect 的 t1 审计（`01-current-state.md` §1.2、§4.3、§3.2 / D7、D12），经本文档回读代码复核后补入。

### 0.9 与 t1（`01-current-state.md`）的一致性核对

本文档的 P 编号与 t1 的 B 编号**大部分**是两套独立得出的结论（其中 B5/P10/P11/P12 系本文档回读 t1 后补入，非独立得出；此限定避免措辞夸大），为避免下游混淆，逐条对照如下（**以代码为准**）：

| t1 的瓶颈 | 本文档对应 | 判定 |
|---|---|---|
| B1 `input` 硬编码（`vite.config.ts:21-26`） | P1（部分） | ✅ 一致，同位置同行号 |
| B2 `TOOLS` 手写数组（`tools.tsx:28-46`） | P1（部分）、P3（图标内联） | ✅ 一致。**本文档把"双写"合并为 P1 单条**，因为 B1+B2 是同一个根因（无单一真源）的两个表现；t1 分列更利于"数改动点"，本文档合并更利于"定位根因"。两者不矛盾。 |
| B3 物理平台入口 HTML（`lens/index.html` 24 行） | §4.2（构建入口派生）已覆盖 | ✅ 一致（P10 与 B3 无关，见下方独立行）。 |
| B4 数据/别名耦合 | P8 | ✅ 一致。t1 列出 `prepare-data.mjs:24/27-35/87-89` + `data.ts:16-20` + `vite.config.ts:38-40/48-50`，本文档 §0.4 与 §4.4 覆盖同一面。 |
| **B5 无导航骨架** | **本文档原缺，现补入 §0.5 与 §2.1** | ⚠️ **t1 独有且正确**。本文档原稿只处理"注册表/契约/数据"，**漏掉了"两页各写一套顶栏/主题/页脚、无共享 Layout"**（`portal/App.tsx:35-47` vs `lens/App.tsx:211-223`）。已补。 |
| B6 共享层被领域污染 | P4 | ✅ **两方独立得出同一结论**。t1 的度量更细：`shared/` 共 584 行，其中 278 行（48%）是镜头专有；且**门户只依赖 `useTheme` + `ThemeToggle` 两个模块**。本文档补入该量化证据。 |
| B7 验收与产品耦合（`verify.cjs:86,91,94,102,103,143-190`） | P6 | ✅ 一致。t1 列举更全（含":40 卡片数=1 加第 2 个工具必挂"），已补入 §0.3 与 `03-engineering.md` §4.6。 |
| B8 无 lint/format/单测/CI 测试门禁 | P5、P7 | ✅ 一致。t1 补充：`tsconfig.json:25` 的 include 不含 `scripts/` 与 `e2e/`（本文档在 `03-engineering.md` 的 CI 设计中间接受此约束）。 |
| （t1 无） | **P10 返回链接、P11 入口样板/`IS_SINGLE`、P12 数据快照** | t1 独有，本文档补入。**注**：P11 原以「Tailwind 重复打包」名义补入，该体积主张**已被实测证伪**（见 §0.6），现定性下调为架构一致性。 |
| （t1 无） | **P2 singlefile 静默丢失、P9 无错误边界** | **本文档独有**，t1 未列。P2 的证据是 `vite.config.ts:22` + `deploy.yml:60`（CI 从不跑 `build:single`）；P9 的证据是两个入口均无 error boundary。 |

**结论：两份文档在「与代码事实的一致性」上无实质冲突**（差异仅为切分粒度 B1+B2 合并为 P1，与各自遗漏：t1 补 B5/P10/P11/P12，本文档补 P2/P9），**但这份一致性不等于两份文档的结论都成立**。

> **⚠️ 新增的实质差异（t10 修正）**：P11 的表述**原先有误**——「Tailwind 产物按工具数重复打包」经实测**证伪**（两个入口引用同一个 CSS chunk，Rolldown 已去重，见 §0.6）。因此：
> - 本表旧版把 P11 与 P10/P12 并列标注为「t1 独有，本文档补入」，**现已把 P11 的定性改为架构一致性**，并在 §0.6 完整留痕证伪过程；
> - **这是一处"两份文档都说对了来源、但本文档的结论本身错了"的差异**——它不影响 §0.9 关于"两者不冲突"的判定（P11 源自 t1 的 D7 观察，双方一致），但**影响 P11 作为收益主张的可信度**。故本结论行据此重新表述：**"无实质冲突"限定于事实来源与切分粒度，不构成对推论正确性的背书**——推论正确性只能由实测背书（这正是 P11、`dist/*/` 两次证伪的共同教训）。

---

## 1. 设计原则（可维护性第一的推论）

这些原则不是口号，每条都对应第 0 节的具体问题，并在第 2–6 节被机制化。

### 原则一：单一事实来源（Single Source of Truth）
**"有哪些工具"必须只有一个权威声明处。** vite 配置、门户卡片、路由、构建产物清单——全部从这一处**派生**，不允许第二处人工维护。

> 对应 P1、P2。这是"新增工具不改共享文件"的充要条件。

### 原则二：新工具的成本必须是 O(1) 个目录
新增一个工具 = 新建 `tools/<id>/` 一个目录，**不触碰该目录之外的任何文件**。删除一个工具 = `rm -rf tools/<id>/`，**不遗留任何孤儿引用**。

> 对应 P1、P2、P3、P4。这条原则同时定义了"即插即用"和"随删随去"——它们是同一枚硬币的两面。

### 原则三：依赖方向单向、可见、可机检
`工具 → 契约 → 基础设施`，绝不反向。工具之间**零依赖**。工具不得 import `tools/` 下的兄弟目录。违反必须被 lint 拦住，而不是靠 code review 自觉。

> 对应 P4。这条让"删除"的推理成本从"全仓库搜索"降到"看一张依赖图"。

### 原则四：领域知识归工具，基础设施归平台
`Lens` 类型、八维指标、品牌中文名 → 属于镜头工具。`useTheme`、`ui.tsx` → 属于平台。
**判定标准：删除所有工具后仍然需要保留的，才是平台。**

> 对应 P4、P8。这是解决"假共享"的判据。

### 原则五：测试分层，成本与反馈速度匹配
纯函数用单元测试（毫秒级）；契约用类型 + 运行时校验（秒级）；集成用构建产物断言；只有真正需要浏览器行为的才上 E2E。
**每一层都必须能回答"是哪一层坏了"。**

> 对应 P5、P6。

### 原则六：契约先于实现，且可运行时校验
工具接口用 TypeScript 定义（编译期），同时在运行时校验（数据/清单来自文件系统时 TS 管不到）。契约文档与契约类型从同一处生成，不允许两处手写。

> 对应 P1、P8。

### 原则七：失败必须响亮（Fail Loud）
新增工具后如果注册表没生效，必须是**构建失败**，不能是"构建成功但页面 404"。所有"沉默的降级"都要转化为显式错误。

> 对应 P2、P8。这是本设计中最容易被低估、但回报最高的一条。

### 原则八：删除是功能，不是清理
"随删随去"必须有**自动化验证**：CI 里跑一个"删掉某个工具后仍能构建通过"的门禁。只把删除写进文档，等于没有。

> 对应 P4。这让"可删除性"从一个愿望变成一个受测属性。

---

## 2. 目标架构：分层设计

### 2.1 目录结构

```
01-my-website/
├── index.html                    # 门户外壳（唯一保留在根的手写 HTML）
├── vite.config.ts                # 通用配置，不再列举工具（见 §4）
├── tsconfig.json                 # 路径别名：@/* 与 @app/*
├── platform/                     # ★ 平台层：删除所有工具后仍需保留
│   ├── contract/
│   │   ├── tool.ts               # 工具清单契约类型（ToolManifest）
│   │   ├── schema.ts             # 同一契约的运行时校验器
│   │   └── index.ts
│   ├── registry/
│   │   ├── scan.ts               # 扫描 tools/*/tool.config.ts → 清单数组
│   │   ├── virtual.ts            # 生成虚拟模块 virtual:toolbox/registry
│   │   └── inputs.ts             # 由清单派生 vite build.rollupOptions.input
│   ├── runtime/
│   │   ├── mount.tsx             # 统一挂载入口（替代每个工具的 <tool>.tsx）
│   │   │                         # ★ 全站唯一 import './styles.css' 的地方（修复 P11）
│   │   ├── ErrorBoundary.tsx     # 工具级错误边界（P9）
│   │   └── ThemeProvider.tsx
│   ├── ui/                       # 原子件（原 shared/components/ui.tsx）
│   │   ├── Shell.tsx             # ★ 共享布局骨架：顶栏 + 「← 返回工具箱」 + ThemeToggle + 页脚
│   │   │                         #   修复 P10（返回链接不再由工具各自写死）
│   │   │                         #   修复 t1 的 B5（两页不再各写一套顶栏/主题/页脚）
│   │   └── ...                   # Chip / Btn / Tabs / SectionHead / ChartCard / Stat 等
│   ├── theme/                    # 原 shared/useTheme.ts
│   ├── chart/                    # 原 shared/lib/chart.ts + ChartBox
│   └── data/                     # 数据加载通用设施（原 lens/data.ts 的通用部分）
├── tools/                        # ★ 工具层：一个工具一个目录，全部自包含
│   ├── lens/
│   │   ├── tool.config.ts        # 唯一元数据声明（契约实现）
│   │   ├── index.html            # 可选：需要独立 <title>/<meta> 时
│   │   ├── App.tsx
│   │   ├── domain/               # ★ 原 shared/lib/lens.ts 迁到这里
│   │   │   ├── model.ts          # Lens 类型
│   │   │   ├── metrics.ts        # METRICS / BARS
│   │   │   ├── brands.ts         # BRAND_CN / brandColor
│   │   │   └── format.ts         # fmt / money / focalText / esc
│   │   ├── data/
│   │   │   ├── load.ts
│   │   │   └── pipeline.mjs      # ★ 原 scripts/prepare-data.mjs 迁到这里
│   │   ├── assets/
│   │   │   └── icon.svg          # ★ 图标外置，不再内联进共享文件（P3）
│   │   ├── sections/             # 原 lens/sections/*
│   │   └── components/
│   └── <next-tool>/              # 新增工具 = 复制这个骨架
├── portal/                       # 门户主页（从注册表读清单渲染卡片）
│   ├── App.tsx
│   └── ToolCard.tsx
└── e2e/
    ├── lib/                      # 抽取的公共层（原 harness.cjs 保留）
    ├── specs/
    │   ├── portal.spec.cjs
    │   ├── lens.spec.cjs
    │   └── tool-contract.spec.cjs   # ★ 对每个工具跑通用契约测试
    └── run.cjs
```

### 2.2 分层的依赖规则（可机检）

```
        ┌──────────────────────────────────────┐
        │            tools/<id>/               │  工具层
        │  （互相之间：零依赖，禁止横向 import） │
        └───────────────┬──────────────────────┘
                        │ 只允许 ↓ 单向
        ┌───────────────▼──────────────────────┐
        │            platform/                 │  平台层
        │  contract / registry / runtime / ui  │
        │  （禁止 import tools/**）             │
        └───────────────┬──────────────────────┘
                        │
        ┌───────────────▼──────────────────────┐
        │  portal/  ← 只读注册表，不 import 工具 │  外壳层
        │           工具内部代码                 │
        └──────────────────────────────────────┘
```

**三条铁律**（用 ESLint `no-restricted-imports` 强制，见 §5.4）：

1. `platform/**` 不得 import `tools/**`（平台不知道任何具体工具）
2. `tools/a/**` 不得 import `tools/b/**`（工具间零耦合 → 删除安全）
3. `portal/**` 不得 import `tools/<id>/` 内部代码，只能读注册表（外壳与实现解耦）
### 2.2b 共享布局骨架 `Shell.tsx`（补 t1 的 B5，修复 P10、P11）

t1 审计发现的两处遗漏（§0.5、§0.6）指向同一个缺失组件：**两页各写一套顶栏/主题/页脚**（`portal/App.tsx:35-47` vs `lens/App.tsx:211-223`），且**返回链接写死在工具内部**（`lens/App.tsx:212-221`）。补上：

```tsx
// platform/ui/Shell.tsx —— 所有工具与门户共用的布局骨架
export function Shell({ children, title }: { children: ReactNode; title?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <ThemeCtx.Provider value={theme}>
      <div className="mx-auto max-w-[1400px] px-5">
        <header className="flex items-center justify-between gap-4 pt-5">
          {/* ★ 工具不再自己写这一行（修复 P10） */}
          {title ? <a href={import.meta.env.BASE_URL}>← 返回工具箱</a> : <span />}
          <ThemeToggle theme={theme} onToggle={toggle} />
        </header>
        {children}
      </div>
    </ThemeCtx.Provider>
  );
}
```

配套的挂载入口（`platform/runtime/mount.tsx`）承担两件事：

```tsx
import './styles.css';                    // ★ 全站唯一一次（修复 P11）

export function mountTool(id: string, App: ComponentType) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ToolErrorBoundary toolId={id}>     {/* P9 */}
        <Shell title={id}><App /></Shell>
      </ToolErrorBoundary>
    </StrictMode>,
  );
}
```

**收益（三项一次到位）：**

| 修复 | 机制 |
|---|---|
| **P10** 新工具无回门户路径 | 返回链接由 `Shell` 统一渲染，工具零代码。复制 `index.html` 不再可能漏掉它。 |
| **P11** 入口样板重复 + `IS_SINGLE` 泄漏<br>~~Tailwind 产物按工具数重复打包~~ | `styles.css` 只在 `mount.tsx` import 一次；工具入口退化为一行 `mountTool('lens', LensApp)`——**收益是收敛入口样板**（每个工具不再复制 `StrictMode`+`createRoot`+`import './styles.css'`）**与上移 `IS_SINGLE`**（工具不再感知构建模式）。<br>**⚠️ 体积收益不存在**：`import` 去重由 Rolldown 的共享 CSS 提取完成，两入口本就引用同一 chunk（实测见 §0.6）。**不得据此主张体积下降。** |
| **B5** 两页各写一套顶栏/主题/页脚 | 顶栏、`ThemeToggle`、页脚、`ThemeCtx.Provider` 收敛到一处。改一次全站生效。 |

**注意与 `IS_SINGLE` 的交互**：当前 `lens/App.tsx:212-213` 在单文件模式下把返回链接换成「单文件版 · 可离线使用」文案。这个分支逻辑应随链接一起上移到 `Shell`（由 `Shell` 读构建期常量决定渲染链接还是文案），**工具不再感知构建模式**。这顺带清理了 t1 指出的「构建模式泄漏进产品视图的唯一一处」（`01-current-state.md` §6.2）。


### 2.3 各层职责与"删除判定"

| 层 | 职责 | 删除某工具后 | 判定它是否属于此层 |
|---|---|---|---|
| `tools/<id>/` | 该工具的领域、UI、数据、元数据 | **整体删除** | 只被它自己使用 |
| `platform/` | 跨工具基础设施 | 一行不改 | 删除所有工具后仍需要 |
| `portal/` | 门户外壳 | 一行不改（清单自动少一项） | 与具体工具无关 |
| `e2e/specs/` | 通用契约 + 每工具专属 | 通用 spec 保留，专属 spec 随工具删 | 是否能被多个工具复用 |

**这个表格就是"随删随去"的可操作定义。** 任何模块，如果能明确放进其中一行且不跨行，删除就是安全的。

### 2.4 工具的内部结构（约定优于配置）

工具目录内部采用**约定式**结构，让新工具作者不必重新发明组织方式：

```
tools/<id>/
├── tool.config.ts    ← 必需，默认导出 ToolManifest（契约实现的唯一入口）
├── icon.svg          ← 必需（或 icon.tsx），门户卡片用
├── App.tsx           ← 必需，默认导出 React 组件
├── domain/           ← 纯领域逻辑：类型、常量、纯函数（无 React、无 DOM）
├── data/             ← 数据获取与处理
├── sections/         ← 页面区块，一区块一文件
└── components/       ← 本工具私有组件
```

**`domain/` 是强制的概念边界**：这里放且只放纯函数与类型，**不 import React、不碰 DOM**。这条约束让 §5 的单元测试层有了明确的适用对象——`domain/` 下的一切都必须有单测。当前 `src/lens/filter.ts` 就是天然的 `domain/filter.ts`。

---

## 3. 即插即用：工具契约

### 3.1 契约定义

```ts
// platform/contract/tool.ts

/** 路由类型：子路径或整页外链 */
export type ToolRoute =
  | { kind: 'page' }                       // 构建期生成 <id>/index.html
  | { kind: 'external'; href: string };    // 外链，构建期忽略

export interface ToolManifest {
  /** 唯一标识；同时是目录名与路由段。由扫描器校验与目录名一致。 */
  id: string;

  /** 展示名 */
  name: string;

  /** 一句话简介（门户卡片用，建议 40–70 字） */
  desc: string;

  /** 标签，用于门户筛选 */
  tags: string[];

  /** 主题色 #RRGGBB */
  tint?: string;

  /** 卡片底部补充信息 */
  meta?: string;

  /** false → 门户渲染"即将上线"灰色卡，且不纳入构建 */
  live: boolean;

  /** 路由 */
  route?: ToolRoute;   // 默认 { kind: 'page' }

  /** 搜索关键词补充（默认用 name + desc + tags + meta） */
  keywords?: string[];
}
```

**设计要点：**

- **`id` 由目录名派生、并被校验一致。** 不允许 `id` 与目录名不符——那会制造第二处事实来源，违反原则一。
- **`route` 默认值是 `{ kind: 'page' }`。** 绝大多数工具只需要放一个 `tool.config.ts`，什么都不写就自动成为可访问页面。
- **`icon` 不在契约里。** 它是 `icon.svg` 文件，由构建期读取（见 §4.3）。这是对 P3 的直接修复：图标属于工具目录，不属于共享文件。若需要动态图标（跟随主题的多色图标），提供 `icon.tsx` 作为备选，由扫描器检测存在性。

### 3.2 一个真实工具的最小实现

```ts
// tools/lens/tool.config.ts
// ⚠️ 必须是相对路径，不能用 @app/* 别名——构建期 Node 直读 .ts 时不解析 tsconfig 的 paths（见 §7.6.1）
import type { ToolManifest } from '../../platform/contract/tool';

export default {
  id: 'lens',
  name: '全球镜头数据库',
  desc: '收录 1,617 支镜头的八维实测评测数据（锐度 / 色散 / 抗眩光 / 畸变 / 焦外等），覆盖 46 个品牌、41 种卡口，支持多维筛选、排序、CSV 导出与横向对比。',
  tags: ['摄影', '数据可视化', '筛选对比'],
  meta: '1,617 支镜头 · 8 项评测维度 · 39 家评测源',
  tint: '#2F5FD0',
  live: true,
} satisfies ToolManifest;
```

**对比当前实现，这解决了什么：**

| 当前 | 目标 |
|---|---|
| `tools.tsx` 里手写 `url: 'lens/'` | 由 `id` 自动派生，不会写错 |
| `tools.tsx` 里内联 6 行 SVG | `tools/lens/icon.svg` 一个文件 |
| `vite.config.ts` 里手写 `lens: resolve(...)` | 扫描器自动收集（§4.2） |
| 改 `desc` 要打开 `portal/` 下的共享文件 | 改自己目录里的文件，无冲突面 |

`satisfies ToolManifest` 是关键：**编译期校验字段拼写和类型，同时保留字面量类型用于后续推导。** 写错 `tint` 为 `tintt` 会立刻报错。

### 3.3 契约的运行时校验（原则六）

TypeScript 管不到"从文件系统读出来的东西"。因此契约必须有一份运行时校验器：

```ts
// platform/registry/scan.ts（节选）
import { validateManifest } from '@app/contract/schema';

export async function scanTools(root: string): Promise<ToolManifest[]> {
  const ids = await listToolDirs(root);          // 只认含 tool.config.ts 的目录
  const out: ToolManifest[] = [];

  for (const id of ids) {
    const mod = await import(pathToFileURL(join(root, id, 'tool.config.ts')).href);
    const raw = mod.default;

    // 运行时校验：字段类型、枚举值、必填项
    const r = validateManifest(raw);
    if (!r.ok) {
      throw new ToolConfigError(id, r.errors);   // ← 构建期直接失败（原则七）
    }

    // id 与目录名必须一致（防止第二处事实来源）
    if (r.value.id !== id) {
      throw new ToolConfigError(id, [`id "${r.value.id}" 与目录名 "${id}" 不一致`]);
    }

    // 唯一性：id 重复 → 失败
    if (out.some((t) => t.id === id)) {
      throw new ToolConfigError(id, ['id 重复']);
    }

    // live 工具必须有 App.tsx 与图标
    if (r.value.live && !(await exists(join(root, id, 'App.tsx')))) {
      throw new ToolConfigError(id, ['live=true 但缺少 App.tsx']);
    }

    out.push(r.value);
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));  // 确定性顺序
}
```

**四个刻意的设计选择：**

1. **错误的配置让构建失败，而不是产生坏产物。** 对应原则七。这是把 P2（silent failure）从"可能发生"变成"不可能发生"。
2. **确定性排序。** 扫描文件系统得到的顺序在不同 OS 上可能不同。显式排序保证构建产物可复现——否则 CI 与本地 diff 会无意义地抖动。
3. **只认含 `tool.config.ts` 的目录。** 这样工具目录里可以有 `README.md`、`notes/` 等辅助内容而不被误认为工具。**约定即过滤。**
4. **`live: false` 不纳入构建。** 让"即将上线"的占位工具（当前 `SoonCard` 的用途）可以先进仓库、后补实现。

---

## 4. 构建自动化：从双写注册表到零配置

### 4.1 虚拟模块：把注册表变成编译期派生

```ts
// platform/registry/virtual.ts
export const VIRTUAL_ID = 'virtual:toolbox/registry';
export const RESOLVED_ID = '\0' + VIRTUAL_ID;

export function registryPlugin(root: string): Plugin {
  return {
    name: 'toolbox-registry',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    async load(id) {
      if (id !== RESOLVED_ID) return;

      const tools = await scanTools(root);

      // 生成 ESM 源码。图标以 URL 形式导入，Vite 会正确处理资源。
      const imports = tools.map(
        (t, i) => `import icon${i} from ${JSON.stringify(`/tools/${t.id}/icon.svg`)};`
      );

      const entries = tools.map((t, i) => `{
        id: ${JSON.stringify(t.id)},
        name: ${JSON.stringify(t.name)},
        desc: ${JSON.stringify(t.desc)},
        tags: ${JSON.stringify(t.tags)},
        tint: ${JSON.stringify(t.tint ?? null)},
        meta: ${JSON.stringify(t.meta ?? null)},
        live: ${t.live},
        route: ${JSON.stringify(t.route ?? { kind: 'page' })},
        keywords: ${JSON.stringify(t.keywords ?? [])},
        iconUrl: icon${i},
      }`);

      return `${imports.join('\n')}

export const TOOLS = [${entries.join(',\n')}];

export const LIVE_TOOLS = TOOLS.filter((t) => t.live);
export const ALL_TAGS = [...new Set(TOOLS.flatMap((t) => t.tags))];

// HMR：工具目录增删时让 Vite 重新扫描
if (import.meta.hot) {
  import.meta.hot.accept(() => import.meta.hot.invalidate());
}
`;
    },

    // 监听 tools/ 下的 tool.config.ts 与 icon，改动即触发重新扫描
    async watchChange(id) {
      if (/\/tools\/[^/]+\/(tool\.config\.ts|icon\.[a-z]+)$/.test(id)) {
        const mod = this.getModuleById(RESOLVED_ID);
        if (mod) this.moduleGraph.invalidateModule(mod);
      }
    },

    // 目录增删不会触发 watchChange，需显式声明
    configureServer(server) {
      server.watcher.on('addDir', invalidateIfToolDir);
      server.watcher.on('unlinkDir', invalidateIfToolDir);
    },
  };
}
```

**门户主页从此变成：**

```tsx
// portal/App.tsx（核心部分）
import { TOOLS, ALL_TAGS } from 'virtual:toolbox/registry';

export function PortalApp() {
  const allTags = ALL_TAGS;                       // 不再 useMemo 手工收集
  const list = /* 按 q / tag 过滤，逻辑不变 */;
  const liveCount = TOOLS.filter((t) => t.live).length;
  // ...渲染完全不变
}
```

**这是对 P1 的彻底修复。** 门户不再"知道工具列表"，它只"消费注册表"。新增工具时 `portal/App.tsx` 一行不改。

### 4.2 构建入口：由注册表清单派生（修复 P2）

```ts
// vite.config.ts（目标形态）
export default defineConfig(({ mode }) => {
  const single = mode === 'singlefile';

  return {
    plugins: [
      registryPlugin(TOOLS_ROOT),
      // ★ 由注册表派生 input，不再手写
      toolsInputPlugin(TOOLS_ROOT, { multiFile: !single }),
      react(),
      tailwindcss(),
      ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
    ],
    // ...
  };
});
```

`toolsInputPlugin` 在 `config` 钩子里返回派生的 input：

```ts
// platform/registry/inputs.ts
export function toolsInputPlugin(root: string, opts: { multiFile: boolean }): Plugin {
  return {
    name: 'toolbox-inputs',
    enforce: 'pre',

    async config(config, env) {
      const tools = (await scanTools(root)).filter(
        (t) => t.live && (t.route ?? { kind: 'page' }).kind === 'page'
      );

      const input: Record<string, string> = {
        main: resolve(root, '..', 'index.html'),
      };
      for (const t of tools) {
        input[t.id] = resolve(root, `../tools/${t.id}/index.html`);
      }

      return { build: { rollupOptions: { input } } };
    },
  };
}
```

**关键行为：`singlefile` 模式下，所有 live 工具都自动纳入，不再只有 lens。** 这修复了 P2 的静默丢失。

**并且，如果某个 `live: true` 的工具缺少 `index.html`，`enforce: 'pre'` 的 config 钩子会抛出明确的错误**，而不是让 rolldown 报一个难懂的"entry not found"。这可以进一步在 `scanTools` 里前置校验（§3.3 已提及）。

### 4.3 图标外置的三条投递路径

图标从内联 SVG 变成文件后，需要处理三种消费场景：

| 消费方 | 方式 | 说明 |
|---|---|---|
| 门户卡片 | `<img src={iconUrl}>` | 虚拟模块里 `import icon` 得到 hash URL，可缓存 |
| 需要 `currentColor` 跟随主题 | `icon.svg` 内用 `stroke="currentColor"` + 门户侧用 CSS mask，或提供 `icon.tsx` | 保留当前"跟随主题"能力（当前 `tools.tsx:12` 注释明确要求） |
| `<link rel="icon">` | 构建期把 `icon.svg` 复制为 `dist/<id>/favicon.svg` | 由 `renderBuiltUrl` 或 copy 插件处理 |

> **注意**：当前 `ToolCard.tsx:44-52` 把 SVG 当作内联 `<svg>` 渲染，所以 `currentColor` 生效。改成 `<img>` 后颜色会固定。为保留主题跟随，**推荐 `icon.tsx` 方案**：工具目录提供 `icon.tsx` 默认导出一个渲染 `<path>` 的组件，扫描器生成 `icon: () => import('/tools/<id>/icon.tsx')` 的懒加载引用。这样图标仍在工具目录内（修复 P3），但保持颜色语义。§5 的契约定型时以此为准。

### 4.4 数据流水线改为"工具自带"（修复 P8）

每个需要构建期数据处理的工具自带一个 `pipeline.mjs`：

```js
// tools/lens/data/pipeline.mjs
import { definePipeline } from '@app/data/pipeline';

export default definePipeline({
  id: 'lens',
  source: './raw/lenses-source.json',

  // 输出到 tools/lens/data/generated/，而不是 src/ 或 public/（修复 P8 第二节）
  outputs: [
    { kind: 'fetch',  path: 'data/lenses.json' },   // → public/data/lens/lenses.json
    { kind: 'inline', path: 'lenses-inline.ts' },   // → tools/lens/data/generated/
  ],

  // 字段白名单
  keep: [/* ... */],

  // ★ 数据契约：清洗后必须满足，否则 pipeline 失败退出（原则七）
  contract: {
    minRows: 1000,
    fields: {
      slug:   { type: 'string',  required: true, unique: true },
      name:   { type: 'string',  required: true },
      brand:  { type: 'string',  required: true },
      overall:{ type: 'number',  nullable: true, range: [0, 10] },
      // ...
    },
  },

  transform(row, report) { /* 原逻辑搬这里 */ },
  summary(report) { /* 打印，同时作为 CI 可断言的输出 */ },
});
```

```js
// scripts/data.mjs（统一的 npm run data）
import { runPipelines } from '@app/data/pipeline';
await runPipelines(await scanToolPipelines(TOOLS_ROOT));   // 跑所有工具的流水线
```

**改进点：**

1. **`npm run data` 不再是镜头专属动词。** 它遍历所有工具的流水线。新增带数据的工具时，脚本一行不改。
2. **数据契约让坏数据炸在构建期，而不是运行期。** 当前 `prepare-data.mjs:93-98` 只打印条数；目标是 `overall` 字段如果全为 `null` 或超出 `[0,10]`，**pipeline 退出码非 0，构建失败**。
3. **生成物不再落 `src/`。** 落在工具目录的 `generated/`（gitignore）或 `public/data/<id>/`（命名空间隔离，避免工具间数据文件名冲突）。当前 `public/data/lenses.json` 是一个**平铺的全局命名空间**，第二个工具若也叫 `data.json` 就会冲突。
4. **`unique: true` 校验 `slug`。** 当前流水线没有去重检查；重复 slug 会让 `App.tsx:56` 的 `Map` 静默覆盖。

---

## 5. 测试方案：四层金字塔

### 5.1 分层总览

```
   L4  E2E（浏览器行为）        ~5%   必要但慢，只测"非浏览器不可"的行为
   ─────────────────────────────────────────────
   L3  构建产物契约（产物断言）  ~15%  「新增工具后产物完整」的自动化保证
   ─────────────────────────────────────────────
   L2  工具契约测试（注册表）    ~20%  对每个工具跑同一套通用断言
   ─────────────────────────────────────────────
   L1  单元测试（纯函数）        ~60%  快、稳、定位精确
```

**反金字塔是错误的。** 当前项目是 100% L4，这正是 P5/P6 的代价来源。

### 5.2 L1 单元测试（新增，修复 P5）

**选型：Vitest**。理由：与 Vite 同源、复用 `vite.config.ts` 的别名与 TS 配置、零额外构建配置。这是"先进性"在此处的正确含义——不是选最新奇的工具，而是选**维护成本最低**的工具。

**测试对象（由原则四的 `domain/` 边界直接给出）：**

| 模块 | 测试内容（举例） |
|---|---|
| `tools/lens/domain/format.ts` | `fmt(null)` → `'—'`（**不是 `'0.0'`**，见 `shared/lib/lens.ts:180-183` 的显式设计）；`money(0)` → `'¥0'`；`focalText({focalMin:35,focalMax:35})` → `'35mm'`（定焦不带区间，`lens.ts:198`） |
| `tools/lens/domain/brands.ts` | `brandColor('Sony')` → 固定色；同名两次调用返回**同一色**（`lens.ts:99-108` 的缓存契约）；未知品牌落在调色板内 |
| `tools/lens/domain/metrics.ts` | `METRICS` 长度 8；`METRIC_LABEL` 与 `METRICS` 一一对应；`SCORE_KEYS` 与 `METRICS` 同源（`lens.ts:76`） |
| `tools/lens/domain/filter.ts` | `applyFilters` 各维度边界；组合筛选；空结果；排序方向；`SORT_ASC_DEFAULT` 的升降序语义 |
| `platform/contract/schema.ts` | 缺字段 / 错类型 / `id` 含非法字符 / `tint` 非 `#RRGGBB` 都返回 `ok: false` |
| `platform/registry/scan.ts` | 用**内存 fixture 目录**测：正常工具、缺 `tool.config.ts`、`id` 与目录名不符、重复 id、`live:true` 缺 `App.tsx` —— 全部必须抛错 |

**验收标准**：`domain/` 下每个导出函数至少 1 条用例；`platform/contract` 与 `platform/registry` 的错误分支 100% 覆盖。CI 用 `--coverage` 并对这两条设阈值。

**关键价值**：改一个格式化函数，反馈从"跑 49 条浏览器断言约 30 秒"降到"跑 200 条单测约 0.5 秒"。这就是维护成本的实质差异。

### 5.3 L2 工具契约测试（通用，可复用）

这是**当前最缺失、收益最高**的一层：一套断言，对**每个**工具都跑。

```js
// e2e/specs/tool-contract.spec.cjs
// 对注册表里每个 live 工具跑同一套结构断言
const { TOOLS } = require('../lib/registry.cjs');   // 构建期产出的 registry.json

for (const tool of TOOLS.filter((t) => t.live)) {
  describe(`工具契约：${tool.id}`, () => {
    test('页面可访问且无未捕获异常', async ({ page }) => { /* ... */ });
    test('页面标题非空且不与其他工具重复', async ({ page }) => { /* ... */ });
    test('门户卡片链接可达（不 404）', async ({ page }) => { /* ... */ });
    test('有 <h1> 且非空', async ({ page }) => { /* ... */ });
    test('移动端 390px 无横向滚动', async ({ page }) => { /* ... */ });
    test('明暗主题切换不报错', async ({ page }) => { /* ... */ });
    test('无 console.error', async ({ page }) => { /* ... */ });
  });
}
```

**为什么这一层是关键：**

- **它把"新工具的质量下限"自动化了。** 当前 `verify.cjs` 里"移动端无横向滚动"（`:256`）、"无 console.error"（`:272`）这些检查**写得很好但只服务镜头**。抽成通用 spec 后，每个新工具自动获得同样的保障。
- **它同时是"随删随去"的验证。** 删除工具目录后，这个 spec 自动少跑一组，且不会有悬空引用——因为列表来自注册表。
- **它不含任何业务数字。** 这是与当前 `verify.cjs` 最大的区别（对比 `verify.cjs:86` 的 `=== 1617`）。

**数据来源**：构建期把 `scanTools()` 的结果写一份 `registry.json` 到 `dist/`，E2E 直接读。避免 E2E 里重新实现扫描逻辑（否则又是两处事实来源，违反原则一）。

### 5.4 L3 构建产物契约测试（修复 P2 的可验证性）

```js
// e2e/specs/build-artifacts.spec.cjs
const registry = readJson('dist/registry.json');
const htmlFiles = glob('dist/**/*.html');

for (const tool of registry.filter((t) => t.live && t.route?.kind !== 'external')) {
  test(`产物包含 ${tool.id}/index.html`, () => {
    assert(htmlFiles.includes(`dist/${tool.id}/index.html`));
  });
  test(`${tool.id} 的 HTML 引用了它自己的入口 chunk`, () => { /* ... */ });
}

test('产物 HTML 不多不少，与注册表一致', () => {
  const expected = new Set(['index.html', ...liveTools.map((t) => `${t.id}/index.html`)]);
  assert.deepEqual(new Set(htmlFiles), expected);   // ★ 双向校验
});
```

**"不多不少"是双向断言**：既抓"新增工具但产物缺失"（P2），也抓"删除了工具但产物还在"（残留检测）。这是原则七与原则八的自动化落点。

### 5.5 L4 E2E（瘦身，修复 P6）

现有 `verify.cjs` 的 282 行拆成：

| 目标文件 | 内容 | 变化 |
|---|---|---|
| `e2e/specs/portal.spec.cjs` | 主页标题、卡片、搜索、筛选、主题、移动端 | 保留，**去掉硬编码卡片数量 1**，改为与注册表比对 |
| `e2e/specs/lens.spec.cjs` | 镜头专属：1617 条、8 张画布、筛选项、CSV、抽屉、浮层 | 保留（这些确实需要浏览器） |
| `e2e/specs/tool-contract.spec.cjs` | 通用契约 | **新增** |
| `e2e/specs/build-artifacts.spec.cjs` | 产物断言 | **新增** |
| `e2e/lib/` | 原 `harness.cjs`（`canvasReport`/`prepareRow`/`rowRect`/`hitTest` 全部保留） | 原样迁移，**这些工具函数质量很高** |

**改用 Playwright Test 而非手写 `r.ok`**，因为需要：
- **测试隔离**：Playwright 默认每个 test 独立 context。当前 `verify.cjs` 的共享页面状态是最大的可维护性负债——`verify.cjs:107` 翻页后，后续所有断言的起始状态都被改变了。
- **失败重试与 trace**：`--trace on-first-retry` 在失败时留下可回放的记录，而不是仅一张截图。
- **并发**：目前是纯串行，约 30 秒；按 spec 分片后并行。

**注意**：`harness.cjs:41-63` 的 `findChrome()` 处理了"playwright 期望的 chromium build 号与实际安装不一致"的问题，这**必须保留**。同时 `harness.cjs:8-9` 说明 playwright 刻意不进 `devDependencies`（避免 CI `npm ci` 下载浏览器）——这个决策在引入 CI 门禁后需要重新评估（见 §6.3）。

### 5.6 测试与分层的对应关系（可维护性收益表）

| 改动类型 | 触发哪层 | 反馈时间（目标） |
|---|---|---|
| 改格式化/筛选纯函数 | L1 单测 | < 1s |
| 改工具元数据 | L1 契约校验 + L2 | < 1s |
| 新增工具 | L1 + L2 + L3 | < 60s |
| 删除工具 | L3（残留检测）+ L2 | < 60s |
| 改共享 UI 组件 | L2（全工具）+ L4 | ~2min |
| 改构建配置 | L3 全部 + L4 | ~3min |

**这张表就是"可维护性"的量化定义**：常见改动的反馈成本。

---

## 6. 工程化与 CI 门禁

### 6.1 新增工具的标准流程（对比 §0.1）

```bash
npm run new -- my-tool        # 脚手架：从 tools/_template 复制并改 id
# 编辑 tools/my-tool/App.tsx、tool.config.ts、icon.tsx
npm run dev                   # 自动出现在门户，无需改任何共享文件
npm run verify                # L1+L2+L3+L4 全跑
```

**关键：整个过程没有第 3 步"去改共享文件"。** 这就是目标达成的判据。

脚手架 `tools/_template/` 内容：`tool.config.ts`（含 `TODO` 注释与 `live: false` 默认值）、`App.tsx`（Hello World + 正确使用平台层）、`icon.tsx`、`domain/index.ts`（空 + 说明注释）。**模板本身也是一个"文档"**：它示范了正确的分层用法，且因为是代码，不会像文档一样过期。

### 6.2 CI 门禁（修复 P7）

```yaml
# .github/workflows/ci.yml —— PR 与 push 都跑
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }   # HF-3：类型剥离 22.6+ 才默认开启，pin 24
      - run: npm ci

      # 闸 1：静态检查（当前唯一门禁，保留）
      - name: 类型检查
        run: npx tsc --noEmit

      # 闸 2：分层依赖规则（原则三）
      - name: 架构边界检查
        run: npm run lint:arch

      # 闸 3：数据流水线（含数据契约，原则七）
      - name: 数据流水线
        run: npm run data

      # 闸 4：单元测试 + 覆盖率阈值
      - name: 单元测试
        run: npm run test:unit -- --coverage

      # 闸 5：多文件构建
      - name: 构建
        run: npx vite build
      # 闸 6：单文件构建（当前 CI 完全不跑！P2 的静默失败就在这）
      - name: 单文件构建
        run: npx vite build --mode singlefile

      # 闸 7：产物契约（L3）
      - name: 产物契约测试
        run: npm run test:artifacts

      # 闸 8：E2E（含通用工具契约 L2）
      - name: 安装浏览器
        run: npx playwright install --with-deps chromium   # 仅 CI 需要：runner 无本机那份 chromium-1223（HF-2）
      - name: E2E
        run: npm run test:e2e

      # 闸 9：删除安全性（原则八）★
      - name: 删除任一工具后仍可构建
        run: npm run test:deletability
```

**三个当前缺失、必须补上的闸：**

1. **闸 6（单文件构建）**：当前 `deploy.yml` 只跑 `npm run build`（多文件）。`build:single` 从未被 CI 验证过。而它恰恰是 P2 静默失败的所在地。
2. **闸 9（删除安全性）** —— 见 `03-engineering.md` §5.3，这是"随删随去"的自动化证明。
3. **闸 2（架构边界）** —— 见 §6.3。

### 6.3 架构边界检查（修复 P4 的自动化）

用 ESLint + `no-restricted-imports` 把原则三变成机器规则：

```js
// eslint.config.js（flat config，节选）
export default [
  {
    files: ['platform/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/tools/*', '**/tools/*'], message: '平台层不得依赖任何具体工具（原则三）' },
        ],
      }],
    },
  },
  {
    files: ['tools/*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/tools/*/**', '!**/tools/<self>/**'],
            message: '工具之间必须零依赖——否则无法单独删除（原则二/三）' },
        ],
      }],
      // 原则四：domain/ 必须是纯的
      'no-restricted-imports': ['error', {
        paths: [{ name: 'react', message: 'domain/ 必须无 React 依赖，才能被单测覆盖' }],
      }],
    },
  },
  {
    files: ['tools/*/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage'],
    },
  },
];
```

> `tools/<self>` 在 ESLint 里需要用 `settings` 动态注入，或用自定义 rule。**这部分需要实现时验证**——`no-restricted-imports` 的 `group` 不支持"排除自己"。备选方案是写一个 ~30 行的自定义 rule：解析 import 路径，若指向 `tools/<other>/` 则报错。**这是本设计中最需要在实现阶段验证的技术点**（见 §8 风险表 R3）。

**为什么必须自动化而不是写文档：** 原则三一旦靠自觉，第一个赶工的 PR 就会破坏它。而破坏之后，删除成本立刻回到"全仓库搜索"——整份设计就失效了。

### 6.4 可删除性测试（原则八的落地）★

这是本设计中最能体现"可维护性第一"的机制：

```js
// scripts/test-deletability.mjs
// 对每个 live 工具：在临时副本里删掉它，验证仓库仍能构建、仍能通过产物契约
import { mkdtempSync, cpSync, rmSync } from 'node:fs';

const tools = await scanTools(TOOLS_ROOT);
let failed = 0;

for (const tool of tools.filter((t) => t.live)) {
  const tmp = mkdtempSync(join(tmpdir(), 'del-'));
  cpSync('.', tmp, { recursive: true, filter: skipHeavy });   // 跳过 node_modules/dist

  // 1. 删除该工具目录——这是唯一的操作
  rmSync(join(tmp, 'tools', tool.id), { recursive: true });

  // 2. 构建必须仍然成功（若 portal/ 或 platform/ 硬编码了它 → 失败）
  const build = spawnSync('npx', ['vite', 'build'], { cwd: tmp });
  if (build.status !== 0) {
    console.error(`❌ 删除 ${tool.id} 后构建失败——存在悬空引用`);
    failed++;
  }

  // 3. 产物中不得残留该工具的痕迹
  const registry = readJson(join(tmp, 'dist', 'registry.json'));
  if (registry.some((t) => t.id === tool.id)) {
    console.error(`❌ 删除 ${tool.id} 后注册表仍有它`);
    failed++;
  }

  rmSync(tmp, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
```

**这个脚本的价值：**

- **它把"随删随去"从文档承诺变成 CI 事实。** 任何人在 `portal/` 或 `platform/` 里硬编码一个工具名，这个闸立刻红。
- **它同时是重构安全网。** 迁移期间（§7），每完成一个阶段就跑一次，能立刻发现"某个引用还没解耦"。
- **它给出了"删除安全"的可操作定义**：`rm -rf tools/<id>/ && 构建通过 && 注册表无残留`。

**性能说明**：每个工具一次完整构建，工具数 N 时是 N 次构建。工具少时（当前 1 个）可忽略；工具多时（10+）建议只跑增量：`vite build --mode deletability` 只做扫描 + input 派生校验，不做完整打包。**实现时先做简单版本，按需优化。**

### 6.5 Turbo/Moon 之类的任务编排：**不建议引入**

值得明确说"不"。理由：

- 当前只有 5 个 npm script、1 个包、构建耗时以秒计（README 称 Vite 8 + Rolldown "构建秒级"）。**引入编排器的收益为负**——它增加一个抽象层、一个配置文件、一个 CI 依赖，而解决的"多包增量构建"问题在这个仓库不存在。
- **可维护性第一意味着要抵抗"先进性"的诱惑。** 单体仓库 + npm scripts 是这里正确的复杂度。

若未来出现"多工具共享一个 npm 包"的需求，再评估 workspace + 编排器。**现在引入就是过度设计。**

---

## 7. 高级特性（服务于可维护性，而非炫技）

判断标准：**每一条都必须能回答"它降低了什么维护成本"。** 不能回答的，不写进设计。

### 7.1 工具懒加载与代码分割

**成本：** 门户主页当前会 `import` 所有工具的元数据。若 `tool.config.ts` 里 import 了重依赖（如某个工具想复用 `chart.js` 做预览图），门户就被拖慢。

**机制：** 注册表的虚拟模块**只**包含序列化后的纯数据（见 §4.1，全部是 `JSON.stringify` 的字面量），图标用 `import iconUrl` 单独引用。**工具的实现代码永远不进门户的依赖图。**

**维护收益：** 门户的构建产物体积与工具数量**解耦**。新增工具不会让门户变慢——否则工具一多，门户首屏就会退化，而那时排查"是哪个工具的元数据拖慢了门户"成本极高。

### 7.2 工具级错误边界（修复 P9）

```tsx
// platform/runtime/mount.tsx
export function mountTool(id: string, App: ComponentType) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ToolErrorBoundary toolId={id}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ToolErrorBoundary>
    </StrictMode>,
  );
}
```

当前 `main.tsx` 与 `lens.tsx` 都没有错误边界。工具内部一个未捕获的渲染错误会白屏，用户看到的是崩溃，且没有任何线索指明是哪个工具。

**维护收益：** 错误页显示 `toolId` 与可复制的错误详情。用户报"某个工具坏了"时，`toolId` 直接定位问题目录——**从"用户描述三个页面特征"变成"一个 id"**。

### 7.3 注册表的确定性契约（构建可复现）

`scanTools()` 显式排序（§3.3）。更进一步：把清单哈希写入产物。

```json
// dist/registry.json
{ "generatedAt": "...", "tools": [...], "hash": "sha256:..." }
```

**维护收益：** CI 可以断言"两次构建的 `registry.json` 相同"。捕获任何非确定性来源（文件系统顺序、时间戳、哈希种子）。**非确定构建是维护噩梦**——它让"本地能跑 CI 不能跑"成为常态，而这类问题的排查成本极高。

### 7.4 工具元数据的单一来源（原则六）——**已按 t4 建议砍掉 schema 推导方案**

> **处置说明（t7）**：本节原设计引入 `manifestSchema` + `FromSchema<typeof schema>` 做"类型由 schema 派生"，并在 R4 承认"可能引入 `json-schema-to-ts`"。**经 t4 评审判定为过度设计，已砍掉。** 本节保留并改写，是为了记录取舍理由，而非推荐该方案。

**为什么砍掉**：对**当前 1 个工具**的仓库，`satisfies ToolManifest`（§3.2）+ **手写** `validateManifest()`（§3.3）**已经足够**——它同样实现了「编译期字段校验 + 运行时校验」这两个目标。而 schema 推导带来的价值（跨语言消费 schema、schema 即文档）要等到"工具数量多到 schema 需要被外部消费"时才出现，**那不在可预见范围内**（用户第一约束是可维护性，不是规模）。

引入 `json-schema-to-ts` 的代价是具体的：**多一个类型依赖、多一层类型推导魔法、多一处"推导失败时错误信息难懂"的调试面**。按本文档自己的原则（§7.2"拒绝任何不能降低维护成本的先进性"），这个交换不成立。

**采用 t4 建议的 R4 退路：手写类型 + 手写校验器 + 一条"字段集一致"单测。**

```ts
// platform/contract/tool.ts —— 手写类型（唯一真源）
export interface ToolManifest {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  tint?: string;
  meta?: string;
  live: boolean;
  route?: ToolRoute;
  keywords?: string[];
}

// platform/contract/schema.ts —— 手写校验器（保持轻量，无依赖）
export function validateManifest(raw: unknown): ValidationResult {
  // 逐字段校验：类型、枚举、正则、长度、必填
  // 实现见 §3.3 的 scanTools 调用点
}
```

**"字段集一致"单测——这是取代 schema 推导的关键机制：**

```ts
// platform/contract/contract.test.ts（L1 层）
import { describe, test, expect } from 'vitest';
import type { ToolManifest } from './tool';
import { manifestFieldNames } from './schema';   // 校验器内部维护的字段名清单

describe('契约类型与校验器字段集一致', () => {
  test('校验器的字段集 == 类型的字段集', () => {
    // 用 satisfies 强制编译器枚举类型的全部键，防止任一侧新增字段后漏改
    const fromType = {
      id: '', name: '', desc: '', tags: [], tint: '', meta: '', live: false,
      route: undefined, keywords: [],
    } satisfies Required<Record<keyof ToolManifest, unknown>>;

    expect(new Set(Object.keys(fromType))).toEqual(new Set(manifestFieldNames));
  });
});
```

**这条单测就是"单一来源"的保障**——它把"类型与校验器两处手写会不会漂移"从**人工纪律**变成**可机检的不变量**。加字段时若只改一处，测试立刻红。

> **⚠️ 机制边界（必须写清，否则会被误当成完整的类型保护）**：该单测只保证字段**「名」集合**一致（`keys` 相同），**不保证字段「类型」一致**。例如把 `tint` 从 `string` 改成 `number`，字段名集合不变，**这条单测仍会通过**。
> **类型一致性由 `satisfies ToolManifest` 在编译期兜底**（§3.2）：`tool.config.ts` 里 `satisfies` 会让字段类型错误在 `tsc` 阶段就报错。两者是**互补**关系，不可互相替代：
>
> | 关注点 | 保障机制 | 时机 |
> |---|---|---|
> | 字段**名**集合一致 | 本节的「字段集一致」单测 | 测试期 |
> | 字段**类型**正确 | `satisfies ToolManifest`（§3.2） | 编译期 |
> | 运行时值的合法性（正则/长度/枚举） | `validateManifest()`（§3.3） | 运行/构建期 |
>
> 前提是 `tools/**` 必须已在 `tsconfig.json` 的 `include` 内（§7.6.2 的 HF-4）——否则 `satisfies` 这一层根本不生效。

**代价对比：**

| 方案 | 依赖 | 保护强度 | 调试成本 |
|---|---|---|---|
| `FromSchema` + `json-schema-to-ts` | +1 类型依赖 | 强（自动同步） | 高（推导错误难懂） |
| **手写类型 + 手写校验器 + 一致单测** | **0** | **强（单测强制同步）** | **低（错误直白）** |

**结论：选后者。** 保护强度相同，依赖与调试成本更低。

### 7.5 前瞻性扩展点（明确标注为"暂不实现"）

以下能力**现在不需要**，但分层设计让它们未来可低成本加装。写出来是为了证明架构的开放性，同时明确它们不在本次迁移范围：

| 能力 | 接入点 | 触发条件 |
|---|---|---|
| 工具级权限声明（如"需要网络"） | `ToolManifest.capabilities` | 出现第一个需要联网的工具 |
| 工具间通信总线 | `platform/runtime/bus.ts` | 出现第一个需要联动的工具对 |
| 工具独立版本/变更日志 | `ToolManifest.version` | 出现第一个对外部使用者的破坏性变更 |
| 客户端路由（SPA 化） | 替换 `platform/runtime/mount.tsx` | 出现"工具间需要保持状态跳转"的需求 |
| 工具级 i18n | `ToolManifest.locales` | 出现第一个多语言需求 |

**为什么不现在做**：每一项都是一个抽象层。原则四（领域归工具、基础设施归平台）已经保证——**当需求真的出现时，加装的成本是局部的**，不需要重写。

---


### 7.6 构建期 TypeScript 直读的硬约束（HF-3）与 tsconfig 覆盖面（HF-4）

这两条是"迁移步骤清单漏项"，不是架构问题——但漏掉它们会让新架构**在最需要保护的地方失去保护**。

#### 7.6.1 HF-3：Node 直读 `.ts` 的语法与解析边界

设计让构建期 Node 直接 `import()` 工具的 `tool.config.ts`（§4.1 的 `scanTools`、`03-engineering.md` §3.3）。这依赖 Node 的**类型剥离**（type stripping），有四个必须写明的边界：

**① 硬失败语法。** 下列语法会抛 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`（**不是警告，是崩溃**）：

| 语法 | 结果 |
|---|---|
| `enum` | ❌ 硬失败 |
| `namespace` | ❌ 硬失败 |
| 构造函数参数属性（`constructor(public a: number)`） | ❌ 硬失败 |
| `export const x: number = 1` | ✅ 可剥离 |
| `export function f(a: string): string` | ✅ 可剥离 |
| `import type { T } from '...'` | ✅ 语法可剥离（但见 ②） |

**约束**：`tool.config.ts` **必须只使用可剥离语法**。这条不能只写在文档里——**必须由 L2 契约测试或 lint 规则强制**（`03-engineering.md` §3.1 的三层校验）。否则工具作者写了个 `enum`，构建直接崩，而错误信息是 Node 内部的，**不指向是哪个工具**。

**② Node 不解析 tsconfig 的 `paths` 别名。** §3.2 的示例写的是：

```ts
import type { ToolManifest } from '@app/contract/tool';   // ❌ Node 直读时解析失败
```

`@app/*` 是 `tsconfig.json` 的 `paths` 别名，**Node 的模块解析器不认识它**。`import type` 的**语法**能被剥离，但**解析器仍需处理该 specifier**——这一步会失败。

**可用的替代写法（三选一）：**

```ts
// 方案 A（推荐）：纯字面量 + 相对路径导入类型
import type { ToolManifest } from '../../platform/contract/tool';
export default { id: 'lens', /* ... */ } satisfies ToolManifest;

// 方案 B：完全不 import 类型，靠 JSDoc 断言（牺牲编译期校验，不推荐）
/** @type {import('../../platform/contract/tool').ToolManifest} */
export default { id: 'lens', /* ... */ };

// 方案 C：让 scanTools 不做 Node 直读，改用 esbuild/vite 的 transform API 读取
//           （多一个构建依赖，但彻底绕开剥离限制）
```

**本文档采用方案 A**：相对路径是 Node 原生支持的，`import type` 可剥离，且保留 `satisfies` 的编译期字段校验。代价是路径不如别名好看——**这是为"构建期可执行"付出的、可接受的代价**。

> **⚠️ 这是实现阶段第一优先验证项**（与 R3 同级）。`import type` 被**剥离**与**解析器仍要处理 specifier** 是两件事，必须在真实 Node 上实测方案 A。

**③ Node 版本下限。** 类型剥离在 **22.6+ 才默认开启**；22.0–22.5 需 `--experimental-strip-types`。而 `deploy.yml:37` 用的是 `node-version: 22`——**若 CI 落在 22.0–22.5，`scanTools` 会在 CI 上崩而本机正常**，正是本文档 §7.3 声称要消灭的"本地能跑 CI 不能跑"。

**处置**：CI 的 `node-version` 显式 **pin 到 `24`**（本机已验证为 24.x），或至少写 `22.6`。**并把"构建期 TS 直读"列为该决策的理由**，避免后人以为可以随便降版本。

> **⚠️ 现状需随迁移修改（HF-3 佐证补全）**：`deploy.yml:37` 的 `node-version: 22` 是**当前仓库的现状**，属于迁移时必须一并改掉的一项。本设计已把该改动写进迁移步骤（`03-engineering.md` §7.4 的 HF-3 条目）：引入 `tool.config.ts` 的**同一批**里把 `deploy.yml` 的 `node-version` 一并提到 24。
> **为什么不能"以后再说"**：`node-version: 22` 在 Actions 里会解析到 **22.x 的最新补丁**，而非固定 22.0。若解析结果落在 **22.0–22.5**，类型剥离需 `--experimental-strip-types` 才生效，`scanTools` 直接崩；而本机是 24.x，**本地测试永远抓不到这个失败**。这正是"本地能跑 CI 不能跑"的典型成因，**也说明"pin 主版本号"不足以表达下限约束——必须 pin 到 `24`（或显式写 `22.6`）**。
> **验收入口**：迁移批次须包含 `grep -n 'node-version' .github/workflows/*.yml` 的人工确认，期望结果为 `24`。

#### 7.6.2 HF-4：把新架构目录纳入 `tsconfig.json` 的 `include`

**现状**：`tsconfig.json:25` 是 `"include": ["src", "vite.config.ts"]`。

**后果**：目标架构把大量新代码放在 `platform/`（`platform/contract/tool.ts`、`platform/registry/virtual.ts`、`platform/registry/inputs.ts`、`platform/runtime/mount.tsx`），并让 `scripts/validate-tools.mjs` 引用 `platform/registry/scan.ts`。但 **`platform/`、`scripts/`、`tools/` 都不在 include 内**：

1. 这些新代码里**任何类型错误都不会被 `tsc --noEmit` 捕获**——而 CI 门禁的核心（§6.1 闸 1）就是 `tsc`。**新代码在类型检查的盲区里。**
2. 更关键：§3.2 强调 `satisfies ToolManifest` 是"编译期校验字段拼写"的关键机制——**但 `tools/**/tool.config.ts` 同样不在 include 内**，这个机制**在最需要它的地方（新增工具）根本不生效**。

**改动（必须与引入 `platform/` 在同一个提交内完成）：**

```jsonc
// tsconfig.json
{
  "compilerOptions": { /* 保持不变，特别是 strict / noUnusedLocals */ },
  "include": ["src", "platform", "scripts", "tools", "e2e", "vite.config.ts"]
}
```

**验证命令：**

```bash
npx tsc --noEmit   # 退出码 0
# 且必须验证"盲区已消除"——故意在 platform/ 里引入一个类型错误，tsc 必须报错：
echo 'export const bad: number = "x";' > platform/__typeprobe.ts
npx tsc --noEmit ; echo "exit=$?  # 期望非 0（证明 platform/ 已被检查）"
rm platform/__typeprobe.ts
```

**副作用与注意**：

- `e2e/*.cjs` 是 CommonJS，在 `moduleResolution: "bundler"` 下可能报错。当前 `skipLibCheck: true` 有帮助，但**必须实测**。若报错，退路是只加 `"platform", "scripts", "tools"`，暂不加 `"e2e"`（E2E 的 `.cjs` 本就不被 TS 覆盖，t1 §7.3 已记录该事实）。
- **必须在第二批、与 `platform/` 同批完成**，否则会有一个"新代码无类型保护"的窗口期（`03-engineering.md` §9.5 已列为入口条件）。


#### 7.6.3 文件拆分标准（1200/800 护栏触发时遵循；t16 落定）

> 护栏（1200 行 = error / 800 行 = warning）的作用是**防倒退**，不是制造拆分任务。当前 27 个源文件最大 434 行（`tools/lens/sections/OverviewSection.tsx`），全部远低于阈值——**本节是给未来触发时的操作规程，不是现在的待办**。

**核心原则：拆分按「职责」切，不按行数机械切割。**

**禁止的拆法**（为压行数而拆，制造碎片化文件）：

- 把一个组件的 JSX 按行号对半切成两个文件；
- 把一组内聚的常量挪到独立文件「只是为了行数」；
- 为凑行数把 3 行的辅助函数抽成独立模块（每个文件都有打开成本与引用成本）。

**正确的拆法**（按职责，先问"这里面有几种东西"）：

| 识别出的职责 | 去向 | 判据 |
|---|---|---|
| **纯计算**（无 React、无 DOM、给定输入必得确定输出） | `tools/<id>/domain/` | 可单测、可复用、不依赖组件生命周期。例：`priceCap()`、`boxStats()` |
| **视图配置**（数据驱动的常量表，如 `SCATTER_VIEWS`、列定义） | `domain/` 或组件文件顶部（若仅单组件使用） | 若被多个 section 共享 → domain；仅一处用 → 留原文件 |
| **渲染**（JSX + hooks） | 留在 `sections/` | 一个 section = 一个用户可见区块，不因行数再切 |
| **通用逻辑**（被 ≥2 个工具需要） | `platform/` | 提升前先确认不是"单工具的领域知识"（原则四） |

**以 `OverviewSection.tsx`（434 行）为例的目标形态**（未来触发 800 警戒线时执行）：

```
tools/lens/
├── domain/
│   └── stats.ts          ← priceCap()、boxStats()（纯计算，补 L1 单测）
└── sections/
    └── OverviewSection.tsx  ← SCATTER_VIEWS 配置 + 三张图表渲染（保留）
```

拆完后预期：`OverviewSection.tsx` 降到 ~300 行、`domain/stats.ts` ~120 行。**这个拆法之所以对，是因为拆出来的东西有独立价值（可单测的纯计算），而不是因为它让行数变小。**

**拆分时的硬性要求**：

1. **行为等价**：拆分前后 E2E 49/49 必须全绿；任何用户可见行为不得变化（本仓库目前的保障是 E2E；L1 单测建立后，被抽出的纯计算必须同时补单测）。
2. **一次一个文件**：不批量拆；每个文件的拆分单独提交，绿了再拆下一个。
3. **护栏是症状不是病**：若某文件增长到触发 1200，先问"它是不是承担了两种职责"——若职责单一但行数多（如长配置表），**允许保留**，护栏的 warning 就是为此设计的（提示而非阻塞）；error 触发才必须处理。
4. **记录**：拆分时在本文件追加一条记录（哪个文件、拆出了什么、为什么这样切），供下一次触发时参考。
5. **关联决策点**：单文件模式当前只支持"恰好一个 live 工具"（Rolldown `codeSplitting=false`，实测 [INVALID_OPTION]）；未来出现第 2 个工具时的候选方案与触发条件见 `05-migration-plan.md` §10.8。

## 8. 风险、权衡与待验证项

### 8.1 风险表

| 编号 | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 虚拟模块的 HMR 在工具目录**增删**时可能不触发 | 开发体验退化：新增工具后需手动重启 dev server | §4.1 已写 `addDir`/`unlinkDir` 监听；实现时**必须实测**"新建目录 → 门户立刻出现卡片" |
| R2 | 单文件模式下虚拟模块与 `viteSingleFile` 的交互 | 可能产生多余 chunk 或内联失败 | 现有 `vite.config.ts:36-40` 的 `__INLINE_DATA__` 机制是同一类问题的成功先例；实现时先做这一模式的冒烟测试 |
| R3 | `no-restricted-imports` 无法表达"禁止 import 兄弟工具但允许自己" | 原则三无法用标准 lint 规则表达 | 退路：写 ~30 行自定义 ESLint rule。**这是实现阶段第一优先验证项** |
| R4 | ~~`FromSchema` 需额外类型依赖~~ **已决定不引入**（t7 处置） | 原拟引入 `json-schema-to-ts` 做类型推导 | **已采纳 R4 退路**：手写类型 + 手写校验器 + 一条"字段集一致"单测（§7.4）。保护强度相同，依赖与调试成本更低 |
| R5 | 一次性大重构会丢失现有行为 | 高风险，尤其 `App.tsx` 的 283 行状态逻辑 | §9 的渐进式迁移路线；每步后跑现有 E2E 作为回归网 |
| R6 | 删除测试（`03-engineering.md` §5.3）随工具数增长而变慢 | CI 时间上升 | 先用增量模式（只验扫描 + input 派生）；超过 10 个工具再优化 |
| R7 | 引入 Vitest/ESLint/Playwright Test 增加 CI 时间与依赖 | CI 从"只有一个 tsc 闸"变成 9 个闸 | 分层：`tsc` + 单测 + 产物契约放在最前面的快闸；E2E 放最后。**快闸 <30s 反馈，慢闸才需要等** |
| R8 | `icon.tsx` 动态 import 与 `<img>` 两条路径的取舍未定 | 可能丢失图标跟随主题能力 | §4.3 已分析：推荐 `icon.tsx`；实现时先验证 `currentColor` 是否仍然生效 |

### 8.2 明确的权衡取舍

**取舍一：虚拟模块 vs. 代码生成脚本。**
- 虚拟模块：零中间产物、永远新鲜、HMR 友好；但依赖 Vite 插件 API，调试稍难。
- 生成脚本（`npm run gen:registry`）：产物可见可 diff；但多一个生成物、多一处可能过期、HMR 需要额外处理。
- **选择虚拟模块**，因为"产物可能过期"正是我们要消灭的失败模式（原则七）。

**取舍二：约定式扫描 vs. 显式注册文件。**
- 显式 `tools/index.ts` 手动维护数组：更简单；但这**就是**当前的 `TOOLS` 数组问题换了个位置。
- **选择扫描**，因为无维护成本才是目标。代价是"隐式魔法"——用 `npm run tools:list` 命令缓解（列出扫描到的工具与来源）。

**取舍三：`portal/` 是否也变成一个工具？**
不做。门户是**外壳**，它有不同于工具的生命周期（它是唯一总被访问的页面）。把它塞进 `tools/` 会让"删除所有工具后门户还应该存在"这个事实变得不清晰。**外壳与工具分离是刻意的。**

### 8.3 本设计的必要条件（失败即设计失效）

诚实地说，以下条件若不满足，收益会大幅缩水：

1. **工具数量会增长。** 如果永远只有 1 个工具，本设计的全部基础设施收益为零，只有成本。**这是最重要的前提。** 团队目标（"新增第 2 到第 N 个工具"）已确认这个前提成立。
2. **架构边界能被 lint 强制。** 见 R3。若无法自动化，原则三退化为文档，价值减半。
3. **测试分层的反馈速度优势真实存在。** 单测必须真的快（<2s），否则没人会跑。

---

## 9. 与既有文档/事实的一致性声明

本设计的每一条问题陈述都对应可验证的代码位置（见 §0.5 表）。以下是有意**保留**的现有设计——它们质量高，不应在迁移中被改坏：

| 现有设计 | 位置 | 为什么保留 |
|---|---|---|
| 双构建模式（多文件 + 单文件） | `vite.config.ts:16-31` | 单文件版"离线双击打开"是真实用户价值 |
| `__INLINE_DATA__` 构建期常量 + DCE | `vite.config.ts:38-40`、`lens/data.ts:15-18` | 优雅地让两条投递路径共享同一份代码 |
| 数据包装成 JSON 字符串而非字面量数组 | `prepare-data.mjs:81-83` 注释 | 避免 tsc 为 1617 个对象推导字面量类型（实测过的性能决策） |
| CSS 变量 + `@theme inline` 语义色板 | `styles.css:10-40, 54-78` | 主题切换只需改 `<html>` class |
| `useTheme` 在渲染期同步写 DOM | `shared/useTheme.ts:27-31` | 注释里解释了 React effect 子先父后的真实坑 |
| `fmt()` 缺失显示 `—` 而非 `0` | `shared/lib/lens.ts:179-183` | 领域语义正确的决策 |
| `canvasReport` 像素占比健康度检查 | `e2e/harness.cjs:95-127` | 能抓"图表变白但无报错"，注释说明被坑过 |
| `findChrome()` 显式定位可执行文件 | `e2e/harness.cjs:41-63` | 处理 playwright 与 chromium build 号不一致 |
| base 路径 shell 判断（含转小写） | `deploy.yml:46-55` | GitHub 表达式无转小写函数，注释已说明 |
| 深色防闪白内联脚本 | `index.html:12-20` | 在样式表加载前定主题 |

**这些注释记录了踩过的坑，是本仓库最有价值的资产之一。迁移时必须原样带走。** 反过来——本设计引入的任何新机制，都应该配上同等质量的"为什么"注释，否则下一个维护者会把它当成可以随便简化的样板代码。

---

## 10. 结论

**一句话：当前架构的问题是"工具清单被写进了两个共享文件，且领域代码伪装成共享资产"；解法是"工具即目录、注册表即派生、边界即 lint 规则"。**

三条可检验的达成标准：

1. **新增工具不修改任何共享文件**（`git status` 只显示 `tools/<new>/` 下的新文件）。
2. **删除任一工具后构建仍然通过、产物无残留**（CI 闸 9 自动证明）。
3. **改动纯函数的反馈时间从 ~30s 降到 <1s**（L1 单测层）。

以及一条自我约束：**本设计拒绝任何不能降低维护成本的"先进性"。** 没有引入 monorepo 编排器、没有引入状态管理库、没有引入微前端。这些在"1 个包、5 个脚本、2 个页面"的规模上都是纯负债。**可维护性第一，意味着要同时抵抗"不改"和"改太多"两种冲动。**

> **配套文档**：[`03-engineering.md`](./03-engineering.md)（构建自动化、注册表契约、测试分层与 CI 门禁的落地细节）
> 迁移路线见 migrator 的产出，本设计只定义目标形态与判定标准。
