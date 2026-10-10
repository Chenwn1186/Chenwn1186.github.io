# 01 · 现状事实清单（只读审计）

> **审计对象**：`D:/docs/01-my-website`（「我的工具箱」）　
> **审计范围**：当前架构的**扩展瓶颈**——新增一个网页/工具时被迫改动的共享文件，逐条落到**文件名 + 行号**。　
> **审计方式**：只读。本文件是本次审计**唯一**写入磁盘的内容，`src/`、`vite.config.ts`、`scripts/`、`e2e/` 等产品代码一行未改。　
> **审计基线**：git `HEAD = 95c0260`（`git log --oneline`：`95c0260` 补全 HANDOFF 产物体积 → `9a268a2` E2E 套件与交接文档 → `2e2afae3` CI base 判断 → `fe34da3` 初始化）；工作树除未跟踪的 `.agent-teams/` 外干净。　
> **证据口径**：`HANDOFF.md` / `README.md` / `部署指南.md` **一律视为二手信息**，不作为判据；下面每条结论都来自实际源码，文档与代码不符处在 §9 单列。所有行号以本次审计读到的文件内容为准。

---

## 0. 一页结论

**当前架构的扩展单元是「页面」，不是「工具」。** 新增一个工具需要同时改动 **4 类共享产物**（构建入口、门户注册表、物理 HTML 入口、构建期数据/别名），其中 3 处是**手写清单**，1 处是**目录名隐含约定**。任何一个工具作者都必须理解 `vite.config.ts`、`src/portal/tools.tsx`、`src/shared/` 三者才能完成一次新增。

按「改动位置数」排序的扩展瓶颈：

| # | 瓶颈 | 位置 | 性质 |
|---|---|---|---|
| B1 | `input` 硬编码入口表 | `vite.config.ts:21-26` | 手写清单，每加一个工具改一次 |
| B2 | `TOOLS` 手写数组 | `src/portal/tools.tsx:28-46` | 手写清单，含展示文案 + 内联 SVG 图标 |
| B3 | 物理平台入口 HTML | `lens/index.html`（24 行，整份复制为模板） | 每加一个工具复制一份，含 4 处需手改 + 1 段必须保留的内联脚本 |
| B4 | 数据/别名耦合 | `scripts/prepare-data.mjs:27-35` KEEP 白名单 · `:24` 生成路径 · `:87-89` 生成物 · `src/lens/data.ts:16-20` 内联分支 · `vite.config.ts:38-40` `__INLINE_DATA__` · `vite.config.ts:48-50` `@` 别名 | 单一工具的数据管道没有出口 |
| B5 | 无导航骨架 | `src/portal/App.tsx:33-133` vs `src/lens/App.tsx:207-282` | 两个页面各写一套头部/主题/页脚，无共享布局 |
| B6 | 共享层被领域污染 | `src/shared/lib/lens.ts`（206 行，整份镜头领域）· `src/shared/components/LensTip.tsx`（72 行，镜头浮层）· `src/shared/components/ui.tsx:160-187` | 「通用」与「镜头专用」混在同一目录 |
| B7 | 验收与产品耦合 | `e2e/verify.cjs:86,91,94,102,103,143-190` | 断言里硬编码 1617 / 9.5 / 8 张画布 / 100 行等 |
| B8 | 无 lint / format / 单测 / CI 测试门禁 | 根目录无 `eslint*` / `prettier*` / `*.test.*`；`package.json:21-31` 无测试框架；`.github/workflows/deploy.yml:57-60` 只 build | 质量只能靠一条本地手动 E2E |

**最小改动集（结论见 §1.3）**：新增一个**已上线、不需要新数据管道**的工具，要动 **6 个位置**（4 个新建：`src/<tool>/App.tsx`、`src/<tool>.tsx`、`<tool>/index.html`，加工具内的返回链接；2 个修改：`vite.config.ts` 与 `src/portal/tools.tsx`）。其中**共享文件的修改是 2 个**（`vite.config.ts`、`src/portal/tools.tsx`），若新工具需要自己的构建期数据则再 **+2**（`scripts/prepare-data.mjs`、新的 `data.ts` 双模式分支）。文档宣称的「三步法」在**文件层面属实**，在**改动点层面不完整**——两处遗漏见 §1.2。

---

## 1. 新增一个工具：当前真正要改什么

### 1.1 文档声称的「三步法」（二手信息，待验证）

`HANDOFF.md:391-426`（§8.1）与 `README.md:90-133`（「新增一个工具」）给出同一套三步：写页面+入口 → 加入口 HTML → 登记（`vite.config.ts` 的 `input` + `TOOLS` 数组）。`部署指南.md:170-175`（§五「新增一个工具」）给出同一件事的 5 条展开。

### 1.2 逐条到代码验证

| 步骤 | 文档说法 | 代码事实 | 判定 |
|---|---|---|---|
| 第 1 步 写页面 | 新建 `src/新工具/App.tsx` + `src/新工具.tsx` | 确实如此。入口模板见 `src/lens.tsx:1-10`（10 行：`StrictMode` + `createRoot` + `import './styles.css'` + `<LensApp/>`）。**但**：`src/styles.css` 是**全站唯一**的 Tailwind 入口与色板（`src/styles.css:1-72`），每个工具入口都要 `import './styles.css'`（`src/main.tsx:3`、`src/lens.tsx:3`），意味着**每个工具的包都会重复打包整份 Tailwind 产物**——这不是「三步」里的任何一步，而是入口模板隐含的成本。 | 基本属实 + 1 处遗漏 |
| 第 2 步 加入口 HTML | 复制 `lens/index.html`，改 `<title>`、`<meta name="description">`、末尾 `<script src>`；保留防闪白内联脚本 | 属实且**比文档更重**：`lens/index.html` 共 24 行，需要手改的是 3 行（`:6` title、`:7` description、`:22` script src），必须原样保留的是 `:10-18` 的 9 行内联主题脚本与 `:8` 的 `theme-color` meta；`:9` 的 favicon 是 data URI（可复用）。**关键遗漏**：`src/lens/App.tsx:216` 用 `href={import.meta.env.BASE_URL}` 生成「← 返回工具箱」链接——即**返回链接不是 HTML 的一部分，而是写死在工具 App 里的**，模板复制不到。新工具若忘了写这一行，就没有任何回门户的路径。 | 属实 + 1 处遗漏（返回链接） |
| 第 3 步 登记 | `vite.config.ts` 的 `input` 加一项 + `TOOLS` 数组加一项 | 属实。`vite.config.ts:21-26` 的 `input` 是**手写对象字面量**（多文件模式 `main` + `lens` 两项）；`src/portal/tools.tsx:28-46` 是**手写数组**（当前仅 1 项）。 | 属实 |
| （文档未提）数据/别名 | — | 新工具若要用构建期数据：必须自己解决 `__INLINE_DATA__` 分支（现在写死在 `src/lens/data.ts:4,15-20`）、自己的生成物路径（`scripts/prepare-data.mjs:24` 只生成 `src/data/lenses-inline.ts`）、自己的 KEEP 白名单（`scripts/prepare-data.mjs:27-35` 是镜头字段）。新工具若要用 `@/` 别名：`vite.config.ts:48-50` 与 `tsconfig.json:23` 已有，可直接用。 | 遗漏（依赖具体工具） |
| （文档未提）门户可见性 | — | `url` 字段是**相对路径字符串**（`src/portal/tools.tsx:11` 注释、`:33` 值 `'lens/'`），由 `ToolCard.tsx:89` 直接放进 `<a href>`。它**不参与构建**，即：`TOOLS` 里写 `'tools/'` 而同名 HTML 入口没建/没登记，构建仍然成功，只会渲染出一个 404 卡片。反之入口建好但没登记 `TOOLS`，页面可访问但门户不可见。两者之间**没有任何编译期校验**。 | 遗漏（无一致性校验） |

### 1.3 最小改动集（可执行结论）

以「新增一个叫 `tools` 的工具、已上线、不需要新数据管道」为例，**必须**改动的文件：

1. **新建** `src/tools/App.tsx` —— 工具实现。
2. **新建** `src/tools.tsx` —— 入口挂载，模板见 `src/lens.tsx:1-10`。
3. **新建** `tools/index.html` —— 复制 `lens/index.html:1-24`，改 `:6` / `:7` / `:22`，保留 `:10-18`。
4. **改** `vite.config.ts:21-26` —— 在 `input` 对象里加 `tools: resolve(root, 'tools/index.html')`。**必须同时改 `single` 与多文件两支吗？** 不需要——`:21-22` 的单文件分支刻意只含 `lens`（`HANDOFF.md:637-638` 说明「单文件只构建镜头工具」），若新工具也要单文件版才需动这一支。
5. **改** `src/portal/tools.tsx:28-46` —— 在 `TOOLS` 数组里加一项（含 `id`/`name`/`desc`/`url`/`icon` SVG/`tags`/`meta`/`tint`/`live`），类型定义在 `:3-22`。
6. **改** `src/tools/App.tsx` 里的返回链接 —— 照抄 `src/lens/App.tsx:216`，否则无回门户路径。

**共享文件改动数 = 2 个（`vite.config.ts`、`src/portal/tools.tsx`）**；若新工具需要自己的一份构建期数据，则再 **+2**：`scripts/prepare-data.mjs`（`:24` 输出路径、`:27-35` KEEP 白名单、`:78-91` 写出逻辑，全是镜头专用）与新的 `data.ts` 双模式分支（模板 `src/lens/data.ts:4-23`）。

**换句话说**：当前架构下「新增工具」是一次**跨 4~6 个文件的协同编辑**，且其中 2 个是**全站共享文件**——这正是本团队要消除的瓶颈。

---

## 2. `vite.config.ts`：入口硬编码与 base 推导

文件仅 62 行（`wc -l` 实测），是全部扩展瓶颈的**单一汇聚点**。

### 2.1 `input` 硬编码

```
vite.config.ts:19-26
  const input: Record<string, string> = single
    ? { lens: resolve(root, 'lens/index.html') }
    : { main: resolve(root, 'index.html'), lens: resolve(root, 'lens/index.html') };
```

- 入口表是**手写常量**，与 `src/portal/tools.tsx:28-46` 的 `TOOLS` **列表内容重复**（都记录「有哪些工具」），但**没有任何单一真源**，两处必须人工保持同步。
- `:20` 的注释说明了 `Record<string, string>` 显式标注的原因（Rolldown `InputOption` 类型兼容），属于历史坑，**改动时不能删**。
- `:22` 的单文件分支只含 `lens`：单文件构建产物 `dist-single/` 实测只有 `lens/index.html` + 冗余的 `data/lenses.json`（见 §6.4）。
- **可扩展性判定**：新增第 N 个工具 = 第 N 次修改这个共享文件，**冲突面随工具数线性增长**（每个工具的作者都在改同一个 3 行对象）。

### 2.2 base 推导

```
vite.config.ts:31
  const base = single ? './' : (process.env.VITE_BASE || '/');
```

- 三条互斥分支：单文件模式固定 `'./'`（`:36-37` 注释：`file://` 下 fetch 被同源策略拦）；否则读环境变量 `VITE_BASE`；缺省 `'/'`（用户站假设）。
- 环境变量的注入方是 CI：`.github/workflows/deploy.yml:46-59` 用 shell 把 `github.event.repository.name` 与 `github.repository_owner` 转小写后比较（`:49-51`），用户站输出 `value=/`、项目站输出 `value=/<repo_lc>/`，再以 `env: VITE_BASE`（`:58-59`）传给 `npm run build`（`package.json:10`）。
- **注意**：`VITE_BASE` 只在**构建期**读取，运行时用的是 Vite 注入的 `import.meta.env.BASE_URL`（消费点：`src/lens/data.ts:19` 拼数据 URL、`src/lens/App.tsx:216` 拼返回链接）。因此「换仓库要改 base」实际影响的是**这两处运行时拼串**，而它们已经正确使用 `BASE_URL`——这点是当前架构做得对的地方，迁移时不应破坏。
- **未覆盖的 base 场景**：`npm run dev`（`package.json:8`）不经过 CI，本地开发固定 `base='/'`；`npm run build:single`（`:12`）固定 `'./'`。两者都不可配。

---

## 3. `src/portal/tools.tsx`：`TOOLS` 手写数组与 `Tool` 类型

整份文件 53 行，内容 = 1 个类型 + 1 个数组（1 项）+ 1 个站点常量。

### 3.1 `Tool` 类型（`:3-22`）

9 个字段，全部**必填或近必填**：

| 字段 | 行 | 类型 | 说明（来自源码注释） |
|---|---|---|---|
| `id` | `:5` | `string` | 唯一标识，同时作卡片锚点（**实际未用作 DOM id**，见 §3.3） |
| `name` | `:7` | `string` | 工具名 |
| `desc` | `:9` | `string` | 一句话简介（`README.md:119` 建议 40–70 字） |
| `url` | `:11` | `string` | 子目录写 `"目录名/"`，外链写完整 https |
| `icon` | `:13` | `ReactNode` | **内联 SVG 子元素**（不是组件、不是图标名） |
| `tags` | `:15` | `string[]` | 筛选标签 |
| `meta?` | `:17` | `string` | 卡片底部信息 |
| `tint?` | `:19` | `string` | 主题色（`#RRGGBB`） |
| `live` | `:21` | `boolean` | `false` → 显示「即将上线」 |

**扩展性代价**：`icon` 是 `ReactNode`，意味着新增工具**必须在注册表文件里**（而不是工具自己目录里）写一段 JSX。这是「注册表既是元数据又是视图代码」的直接后果——想把注册表做成自动扫描，必须先决定 `icon` 如何从工具目录外置。

### 3.2 `TOOLS` 数组（`:28-46`）

唯一一项是镜头数据库：`:30-45`。三个字段把**运行时数据事实硬编码进了注册表**：

- `:32` `desc` 内含「1,617 支镜头…覆盖 46 个品牌、41 种卡口」
- `:42` `meta` = `'1,617 支镜头 · 8 项评测维度 · 39 家评测源'`

对照实测数据（`node -e` 读 `scripts/lenses-source.json`）：记录 1617、品牌 46、卡口 41 —— 数值属实，但它们是**数据快照**。数据源一更新（`部署指南.md:167-168` 明确「改数据只需更新源文件」），这两行文案就会**静默过期**，没有任何测试会发现（E2E 不检查卡片文案里的数字，见 §7）。

`src/portal/App.tsx:30` 的 `liveCount` 同理：从 `TOOLS` 里数 `live` 的项数，也是**手写状态**而非真实可达性。

### 3.3 `SITE` 常量与消费点

```
src/portal/tools.tsx:48-53   SITE = { owner, repoName, repoGh, home }
```

- 消费点：`src/portal/App.tsx:111`（`SITE.owner`）、`:112`（`SITE.repoName`）、`:122`（`SITE.owner`）、`:125`（`SITE.repoGh`）。
- `SITE.home` 在 `src/` 内**无任何消费点**（`grep -rn "SITE\."` 只命中上述 4 处 + `:50-52` 定义自身）——死字段。
- `id` 字段同样**无消费点**：`ToolCard.tsx:98` 用的是 `key={t.id}`（React key），`App.tsx` 未用它做锚点或路由。注释 `:4` 声称「同时作为卡片锚点」与代码不符（详见 §9）。

---

## 4. 无客户端路由的 MPA 结构：收益与代价

### 4.1 构成事实

- 入口 HTML 是**物理文件**：`index.html`（25 行，`src/main.tsx:1-10`）与 `lens/index.html`（24 行，`src/lens.tsx:1-10`）。二者除 title/description/script src 外**逐字相同**（含 `:8` theme-color meta、`:9` 同一份 data-URI favicon、`:10-18` 逐字相同的 9 行内联主题脚本）。
- 源码中**没有路由器**：`package.json:16-20` 的 dependencies 只有 `chart.js` / `react` / `react-dom`——**没有 react-router**。两处 `createRoot`（`src/main.tsx:6`、`src/lens.tsx:6`）各自挂载独立应用树。
- 跳转靠原生 `<a>`：`src/portal/components/ToolCard.tsx:88-95` 渲染 `<a href={tool.url}>`；`src/lens/App.tsx:215-221` 渲染 `<a href={BASE_URL}>`。
- 主题有做「跨页保持」的补偿：`index.html:10-18` 与 `lens/index.html:10-18` 在样式加载前同步读 `localStorage.getItem('theme')` 并给 `<html>` 加 `dark`（消费点 `src/shared/useTheme.ts:5-13, 16-21`）。这是 MPA 下唯一被显式补偿的跨页状态。

### 4.2 收益（已在代码中兑现的部分）

| 收益 | 代码依据 |
|---|---|
| 刷新不 404 | 每个 URL 对应**真实存在的静态文件**（`index.html` / `lens/index.html`），GitHub Pages 直接命中，无需 `try_files` 或 404 回退。产物 `dist-single/lens/index.html` 实测存在即为例证。 |
| 每个工具可独立链接、独立体积 | 工具间**没有共享运行时 chunk**之外的耦合；单文件模式能把一个工具完整内联成 1.48 MB 单 HTML（实测 `dist-single/lens/index.html`，体积见 §6.4）。 |
| 单文件离线可用 | `vite.config.ts:21-22` 单文件分支只打包 `lens`；`define __INLINE_DATA__`（`:38-40`）让 `src/lens/data.ts:15-17` 走内联分支。这是**MPA + 独立入口**才能干净做到的（SPA 里「打包某一个页面」要额外配置）。 |
| 主题不闪白 | 两页各自内联脚本（`index.html:10-18`、`lens/index.html:10-18`），代价是**重复维护两处**。 |

### 4.3 代价（已在代码中兑现的部分）

| 代价 | 代码依据 |
|---|---|
| 工具间跳转整页重载 | `<a href>` 原生导航（`ToolCard.tsx:89`、`App.tsx:216-220`），无预取、无过渡、无 SPA 状态延续。 |
| **无法共享布局与导航** | 门户顶栏在 `src/portal/App.tsx:35-47`（含 `ThemeToggle`，`:45`）；镜头页顶栏在 `src/lens/App.tsx:211-223`（含「← 返回工具箱」+ `ThemeToggle`，`:222`）。**两套实现、两套样式、两套返回逻辑**，没有任何共享的 `Layout` 组件。 |
| HTML 样板重复 | 两份 24/25 行 HTML 逐字重复（favicon data URI、theme-color、防闪白脚本）；第 3 个工具 = 第 3 份复制。 |
| 全站样式重复打包 | 每个工具入口 `import './styles.css'`（`src/main.tsx:3`、`src/lens.tsx:3`），Tailwind 产物在每个入口各出一份。 |
| 跨页状态只能走 localStorage | `useTheme.ts:7` / `:43`（唯一被持久化的跨页状态）；工具内的筛选、排序、对比台状态（`src/lens/App.tsx:34-40`）**完全不可能**跨页共享——连 URL 参数都没用（无 `useSearchParams`、无 `location.search` 读取，`grep` 无命中）。 |

> **对升级方案的含义**：文档 `HANDOFF.md:59` 写着「⚠️ 不要做的事：不要把 MPA 改成 SPA 路由」。就本审计而言，**Mpa 本身不是瓶颈**——瓶颈是「MPA 但**没有共享布局层**」与「入口必须手写登记」。保留物理 HTML 入口 + 引入共享 Layout/导航组件，两条并不冲突；是否引入客户端路由属于**目标架构 ADR 的决策**，本文只提供事实。

---

## 5. `src/shared` 的真实耦合面

目录共 7 个文件（`useTheme.ts` 56 行、`lib/chart.ts` 286 行、`lib/lens.ts` 206 行、`components/ChartBox.tsx` 30 行、`components/LensTip.tsx` 72 行、`components/ThemeToggle.tsx` 33 行、`components/ui.tsx` 187 行）。逐文件判定「通用 vs 领域专有」：

### 5.1 通用能力（可原样保留为框架层）

| 文件 | 判定依据 |
|---|---|
| `src/shared/useTheme.ts`（56 行） | 零领域引用（只 import React）。导出 `Theme`、`applyThemeClass`（`:16-21`）、`useTheme`（`:24-50`）、`ThemeCtx`/`useThemeValue`（`:53-56`）。消费点：`src/portal/App.tsx:5,8`、`src/lens/App.tsx:9,31`、`src/shared/components/ChartBox.tsx:3,16`。**全站通用。** |
| `src/shared/components/ThemeToggle.tsx`（33 行） | 只依赖 `Theme` 类型（`:1`），自绘太阳/月亮 SVG（`:18-33`）。消费点 `src/portal/App.tsx:45`、`src/lens/App.tsx:222`。**全站通用。** |
| `src/shared/components/ChartBox.tsx`（30 行） | 只依赖 `lib/chart` 与 `useThemeValue`。职责是「容器给高度 → canvas 撑满 → 配置变则重建」（`:18-23`）。**通用图表容器。** |
| `src/shared/lib/chart.ts`（286 行） | 依赖 `chart.js` 与 `Theme` 类型，**不引用任何镜头类型**。核心资产：`sanitize()`（`:98-108`）、`dsHealthy()`（`:111-119`）、`drawPlaceholder()`（`:148-176`）、`renderChart()` 唯一建图入口（`:179-257`）、`pointerFromChart()`（`:278-286`）、`CHART_THEME` 查表（`:39-62`）。**通用图表收口层**（含 `ChartTheme` 与 `ChartSpec`，`:12-30`）。 |

### 5.2 通用 UI 原子件（但已混入领域默认值）

`src/shared/components/ui.tsx`（187 行）：

- **纯通用**：`Chip`（`:4-34`）、`Btn`（`:37-63`）、`Tabs<T>`（`:66-97`）、`SectionHead`（`:100-120`）、`ChartCard`（`:126-147`）、`Stat`（`:150-157`）。注意 `ChartCard` 顶部 `:122-125` 的注释记录了「双层高度容器」血泪坑——属通用布局约束，应随组件迁移。
- **含领域默认值**：`ScorePill`（`:160-177`）把「≥8 高分 / ≥6.5 中 / 其余低」的**三档阈值写死在组件里**（`:164-169`）；同一套阈值在 `src/shared/lib/lens.ts:190-193` 的 `scoreClass()` 里**重复实现了一次**（口径必须人工同步）。
- **镜头领域专有**：`BrandTag`（`:180-187`）名字与 `cn`（品牌中文名）参数都是镜头领域概念；调用点 `src/lens/sections/TableSection.tsx:158`。它的 `brand` + `cn` 结构只有镜头表用得上。

### 5.3 实为镜头领域专有，却放在 shared

| 文件 | 行 | 判定依据 |
|---|---|---|
| `src/shared/lib/lens.ts` | 全 206 行 | 文件头注释 `:1-5` 自称「门户与镜头工具共用，避免两处各写一份」，但实际消费方**只有镜头工具**：`src/lens/App.tsx:2-6`、`data.ts:1`、`filter.ts:1`、`TableSection.tsx:2-10`、`FilterPanel.tsx:2`、`CompareSection.tsx:2`、`OverviewSection.tsx:2`、`RankingSection.tsx:2`、`HeaderSection.tsx:2`、`NotesSection.tsx:2`、`Drawer.tsx:2-9`、`LensTip.tsx:2`。**门户零引用**（`src/portal/**` 里 grep 不到 `shared/lib/lens`）。内容为 `Lens` 接口（`:7-43`，32 字段）、`METRICS`（`:46-55`，8 项实测分项）、`BARS`（`:60-69`）、`SCORE_KEYS`（`:76`）、品牌固定配色 `FIXED`（`:80-90`）、`PALETTE`（`:92-94`）、`brandColor()`（`:99-108`）、`BRAND_CN`（`:112-164`，**46 个键**，与数据源品牌数一致）、`brandLabel()`（`:167-171`）、`hex2rgba`（`:174-177`）、`fmt`（`:180-183`）、`money`（`:185-187`）、`scoreClass`（`:190-193`）、`focalText`（`:196-199`）、`esc`（`:201-205`）。**除 `esc()` 与 `hex2rgba()` 外，其余全是镜头领域。** |
| `src/shared/components/LensTip.tsx` | 全 72 行 | 组件名即领域名；`tipHtml()`（`:15-26`）逐行消费 `METRICS` / `brandLabel` / `fmt` / `money` / `Lens`；渲染「品牌 · 综合」「评测源 N 家」等镜头语义。消费方仅 `src/lens/App.tsx:7`。**是「命令式浮层」这个通用思路 + 镜头内容耦合的混合体**——通用部分（`useImperativeHandle` + 定位算法 `place()`，`:37-47`）与领域部分（`tipHtml`）没有分离。 |

### 5.4 耦合度量（可复现）

- `src/shared/` → 领域：`lib/lens.ts` 与 `components/LensTip.tsx` 共 **278 行 / 584 行 shared 总行数 ≈ 48%** 是镜头专有。
- `src/portal/` → `src/shared/` 的真实依赖面**只有 2 个模块**：`useTheme`（`App.tsx:5`）与 `ThemeToggle`（`App.tsx:4`）。门户**完全不碰** `lib/lens.ts`、`lib/chart.ts`、`ui.tsx`、`ChartBox`、`LensTip`。
- **含义**：`src/shared` 当前实际上是「镜头工具的私有库 + 两个通用 hook/组件」，放在共享目录只是因为目录名叫 shared。新工具作者面对这个目录**无法判断哪些能安全复用**。

---

## 6. 数据流水线 ↔ 工具代码的耦合

### 6.1 `scripts/prepare-data.mjs`（98 行）

- 路径常量（`:21-24`）：输入 `scripts/lenses-source.json`、输出 `public/data/lenses.json`、输出 `src/data/lenses-inline.ts`。**三个路径全部写死为镜头专属**，没有任何参数化或按工具划分。
- **KEEP 白名单**（`:27-35`，35 个字段）是「前端渲染需要的字段」清单。它与 `src/shared/lib/lens.ts:7-43` 的 `Lens` 接口**必须人工保持同步**（`HANDOFF.md:456` 也承认这一点）。实测：源文件首条记录的 keys 里含 `desc`，而 KEEP 里**没有** `desc`——即源数据有、产物丢弃。
- 清洗逻辑（`:53-71`）三条都是镜头语义：百分制总分归一（`:54-60`，`SCORE_KEYS` 定义在 `:38`，与 `lens.ts:76` 的 `SCORE_KEYS` **重复定义**）、整数去小数（`:63-65`）、最近对焦距离剥离 `🔍` 残留（`:68-71`）。
- 双产物写出（`:78-91`）：同一份 JSON 写两次。`:81-83` 注释解释「`lenses-inline.ts` 刻意写成字符串常量而非数组导出」，否则 `tsc` 要为 1617 个对象逐个推导字面量类型。实测生成物 `src/data/lenses-inline.ts` 大小 **1,127,414 字节**，内容是单行 `export const LENSES_JSON = "<1.1MB 转义字符串>";`。
- 运行统计（`:93-98`）：镜头总数 / 归一化条数 / 清洗条数 / 两产物路径 / 体积。**这些数字没有任何程序消费方**，只打印给人看。

### 6.2 `__INLINE_DATA__` 构建期常量链路

```
vite.config.ts:38-40   define: { __INLINE_DATA__: JSON.stringify(single) }
        ↓
src/lens/data.ts:4     declare const __INLINE_DATA__: boolean
src/lens/data.ts:7     export const IS_SINGLE = __INLINE_DATA__
src/lens/data.ts:15-17 if (__INLINE_DATA__) { const { LENSES_JSON } = await import('../data/lenses-inline'); ... }
src/lens/data.ts:19-22 else { fetch(`${import.meta.env.BASE_URL}data/lenses.json`, {cache:'force-cache'}) }
        ↓
src/lens/App.tsx:212   IS_SINGLE ? <span>单文件版 · 可离线使用</span> : <a href={BASE_URL}>← 返回工具箱</a>
```

- `IS_SINGLE` 被提升为**导出常量**并影响 UI 文案（`:212-213`），这是「构建模式」泄漏进产品视图的唯一一处。
- 两个分支都要能从 `src/data/lenses-inline.ts` 的**相对路径** `../data/lenses-inline` 解析（`:16`），即生成物路径与消费者路径**硬绑定**。
- `declare const`（`:4`）是全局逃逸口：任何工具都可以声明同名常量，**没有类型检查保证它在某次构建里真被 define**。

### 6.3 三处「同一件事的定义散落」

| 概念 | 定义处 |
|---|---|
| 参与归一化的评分子集 | `scripts/prepare-data.mjs:38` `SCORE_KEYS` **和** `src/shared/lib/lens.ts:76` `SCORE_KEYS`（注释 `:75` 自称「清洗脚本与前端共用同一份口径」，实际是两份） |
| 分项指标 | `src/shared/lib/lens.ts:46-55` `METRICS`（前端唯一真源），`scripts` 里以 8 个字段名硬编码在 `:31` KEEP 行内 |
| 数据产物路径 | `scripts/prepare-data.mjs:23-24`、`src/lens/data.ts:16`（相对）、`src/lens/data.ts:19`（运行时 URL） |

### 6.4 产物与构建的实测事实

- `public/data/lenses.json` 实测 **965,979 字节**（≈0.92 MB）；`src/data/lenses-inline.ts` 实测 **1,127,414 字节**。
- 二者均被 `.gitignore:28-29` 排除，`npm run data` 由 `package.json:8-10` 挂在 `dev`/`build`/`build:single` 之前。**因此全新 clone 后不跑 `npm run data` 就 `tsc --noEmit`，会报 `TS2307: Cannot find module '../data/lenses-inline'`**（`HANDOFF.md:169-171, 506` 记录了这个坑；代码依据是 `src/lens/data.ts:16` 的静态可解析 `import`）。
- `dist-single/` 实测同时存在 `lens/index.html` **和** `data/lenses.json`——单文件模式下数据已内联，这份 JSON 是纯冗余（`HANDOFF.md:633-636` 已承认）。根因是 `vite.config.ts:52-60` 未按模式关闭 `copyPublicDir`。

---

## 7. 测试与质量现状

### 7.1 E2E：`e2e/verify.cjs`（282 行）+ `e2e/harness.cjs`（195 行）

- **断言数实测 = 49**（`grep -c "r\.ok(" e2e/verify.cjs` → 49）；与 `HANDOFF.md:23, 587` 的「49/49」一致。
- 断言器是**自制**的：`harness.cjs:73-93` 的 `createReporter()`，`ok(name, pass, detail)` 只做数组收集 + 控制台打印，`summary()` 返回失败数并据此 `process.exit`（`verify.cjs:276-278`）。**没有测试框架**。
- 结构：门户段 `verify.cjs:32-74`（12 项）→ 镜头段 `:76-267`（35 项）→ 控制台段 `:269-272`（2 项）。需要**先手工起站**（`HANDOFF.md:534-541`：`npm run build && npm run preview -- --port 4173`），`BASE` 来自 `harness.cjs:17`（命令行参数 > `BASE_URL` > 默认 `http://127.0.0.1:4173`）。

### 7.2 与产品代码的硬编码耦合点（逐条到行）

**A. 数据规模快照（数据一更新即失效，且是硬相等断言）**

| 行 | 断言 | 耦合对象 |
|---|---|---|
| `verify.cjs:86` | `countOf() === 1617` | 数据源记录数 |
| `:141` | `cViltrox > 0 && cViltrox < 1617` | 同上 |
| `:144` | 清空搜索后 `=== 1617` | 同上 |
| `:152` | 重置后 `=== 1617` | 同上 |
| `:157` | Nikon Z 卡口命中 `< 1617` | 同上 |
| `:164` | `≤F1.4` 命中 `< 1617` | 同上 |
| `:106` | `/共\s*1,617\s*支/` | 分页文案格式 `TableSection.tsx:204-205` + 数据规模 |

**B. 数据内容快照**

| 行 | 断言 | 耦合对象 |
|---|---|---|
| `:91` | `statText.includes('9.5')` | **最高综合分恰好 9.5**。`HeaderSection.tsx:67` 用 `fmt(s.best)` 动态计算——数据一改（出现 9.6 或旧榜首被修正），断言就假失败，而代码是对的。注释里的「不是 89.2」还引用了 `prepare-data.mjs:53-60` 的归一化历史。 |
| `:99-101` | 品牌 chip 数 `>= 40`（用 `hasText: /（/` 匹配，依赖 `FilterPanel.tsx:104` 的 `brandLabel()` 渲染成「英文（中文）」格式） | 品牌数 ≥40（当前 46）+ 中文名渲染格式 |
| `:154` | `getByRole('button', {name: /^Nikon Z/})` | 存在以 `Nikon Z` 开头的卡口 chip（`FilterPanel.tsx:115-119`） |
| `:161` | `getByRole('button', {name: /≤F1\.4/})` | `FilterPanel.tsx:169` 的 `≤F${a.toFixed(1)}` 文案 + `AP_STEPS`（`:6`）含 1.4 |
| `:180` | `/轴向色差 LoCA/` | `lens.ts:62` `BARS` 里的文案 |
| `:187,189` | `/锐度配对/`、`/中心锐度 × 边缘锐度/` | `OverviewSection.tsx:65`（VIEW_TABS）与 `:48`（散点标题）文案 |
| `:117` | `/参考价/` 列头 | `TableSection.tsx:36` COLS 文案 |

**C. 视图结构快照**

| 行 | 断言 | 耦合对象 |
|---|---|---|
| `:94` | `rep0.length === 8`（画布数） | 当前恰好 8 张图：`CompareSection.tsx:131,134`（2）+ `OverviewSection.tsx:419`（2）+ `:426,429`（2）+ `RankingSection.tsx:143,148`（2） |
| `:213` | 极端筛选后画布数仍 `=== 8` | 同上 |
| `:103` | `table tbody tr === 100` | `TableSection.tsx:15` `PAGE_SIZE = 100` |
| `:102` | 对比台默认 3 支 | `src/lens/App.tsx:24-28` `DEFAULT_SELECTED` 长度 |
| `:176` | 加入后 4 支 | 同上 + 1 |
| `:40` | `cards.count() === 1` | **工具总数 = 1**——加第 2 个工具，此断言必挂 |
| `:43` | `cardHref === 'lens/'` | `tools.tsx:33` 的相对路径写法（写 `/lens/` 会挂，见 `部署指南.md:183-184`） |
| `:41,85` | 卡片名含「全球镜头数据库」、H1 含「全球镜头评测数据库」 | `tools.tsx:31` 与 `HeaderSection.tsx:38` 文案 |
| `:37` | H1 含「工具箱」 | `src/portal/App.tsx:39` |

**D. DOM 契约（无 `data-testid` 体系，全部依赖业务属性）**

| 行 | 依赖 | 产品侧 |
|---|---|---|
| `:58,232,238,245` | `button[aria-label="切换主题"]` | `ThemeToggle.tsx:10` |
| `:78,82` | `[data-app-ready]` 属性值 = 命中数 | `src/lens/App.tsx:209` `data-app-ready={rows.length}` |
| `:102,176` | `button[aria-label^="移除 "]` | `CompareSection.tsx:157` |
| `:118` | `button[data-cmp]` | `TableSection.tsx:118` |
| `:197` | `button[data-detail]` | `TableSection.tsx:134` |
| `:200-207` | `aside[role=dialog]` 的 `aria-hidden` 与右边界 | `Drawer.tsx:65-72` |
| `:146,210,211` | `input[type=range][data-metric=flare]`、`placeholder="0"` / `"99999"` | `FilterPanel.tsx:340`（data-metric）、`:176,178`（placeholder） |
| `:128` | `[data-tip]` 浮层的 `opacity` / `left` | `LensTip.tsx:53-55,69` |
| `:100` | `button[aria-pressed]` 存在 | `ui.tsx:22`、`TableSection.tsx:120` 等 |

> `HANDOFF.md:433` 明确写着「分项滑块记得带 `data-metric={k}` 属性（E2E 靠它定位）」——即**产品代码为测试让路**，这是测试耦合进入实现层的证据。

**E. 画布健康度判据（这一个是好设计）**

`harness.cjs:99-127` 的 `canvasReport()` 用 `getImageData` 统计非透明像素占比，`verify.cjs:95-97, 192-193, 242-243` 用「`ratio < 0.01` 或 `colors < 3`」判坏。`:119` 同时读取 `aria-label`。这条判据抓的是「画布全白但控制台不报错」这类肉眼难察的故障，**与具体图表数量无关**，迁移时应保留思路（但 8 张画布的数量断言要解耦）。

**F. 交互脆弱点（`harness.cjs` 的三处补丁，说明 UI 结构对测试不友好）**

- `harness.cjs:129-142` `prepareRow()`：手工 `scrollIntoView` + `scrollLeft = 0` + `scrollTop = idx*80-120`（**硬编码行高 80px**），因为 `TableSection.tsx:76` 的 `max-h-[660px]` 内部滚动容器会干扰 Playwright 的 actionability 判定。
- `harness.cjs:144-164` `rowRect()`：同样依赖 `document.querySelector('table').parentElement` 这一**无类名、无 data 属性的结构推断**。
- `harness.cjs:167-177` `hitTest()`：用 `elementFromPoint` 判定「谁挡住了」，是 `verify.cjs:173` 那条「数据表未被图表遮挡」回归守卫的实现——直接对应 `ChartCard`/`ChartBox` 双层高度坑（`ui.tsx:122-125` 注释）。
- `harness.cjs:41-63` `findChrome()`：扫描 `%LOCALAPPDATA%/ms-playwright/chromium-*` 取最新版，绕开版本号不匹配（`:36-40` 注释）。

### 7.3 单元测试 / lint / format / 类型检查

| 项 | 实测 | 依据 |
|---|---|---|
| 单元测试 | **无**。仓库内无 `*.test.*` / `*.spec.*`（除 e2e 两个 `.cjs`） | 文件清单 |
| 测试框架 | **无**。`package.json:21-31` devDependencies 无 vitest/jest/@playwright/test | `package.json` |
| lint | **无**。根目录无 `eslint.config.*` / `.eslintrc*`（`ls -a` 实测），`package.json:7-15` 无 `lint` 脚本 | 实测 |
| format | **无**。无 `.prettierrc*` / `.editorconfig` | 实测 |
| 类型检查 | **有但只做 `--noEmit`**：`package.json:10,12` 的 `build`/`build:single` 里跑 `tsc --noEmit`；**单独脚本不存在**（没有 `npm run typecheck`），想单独跑只能手敲 `npx tsc --noEmit` | `package.json:7-15` |
| 类型严格度 | 高：`tsconfig.json:16-20` 打开 `strict` / `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` / `noUncheckedSideEffectImports`；`:25` 只 include `["src","vite.config.ts"]` —— **`scripts/` 与 `e2e/` 不在类型检查范围内**（`.mjs`/`.cjs` 也不被 TS 覆盖） | `tsconfig.json` |
| 路径别名 | `tsconfig.json:23` `"@/*": ["./src/*"]`（无 `baseUrl`）+ `vite.config.ts:48-50` 的 `resolve.alias`。**两处必须同步**，改一处漏一处会出现「编辑器不报错但构建失败」（或反之）。 | 实测 |

### 7.4 playwright 依赖

- **不在 `package.json`**：`devDependencies`（`:21-31`）无 playwright；`package-lock.json` 的 `packages[""].devDependencies`（`:15-25`）也无 —— `grep -c '"node_modules/playwright' package-lock.json` 实测 **0**。
- **不在 `node_modules`**：实测 `node_modules/playwright` 与 `node_modules/@playwright` 均不存在 → **本机现在跑不了 `npm run e2e`**，会走 `harness.cjs:26-32` 的报错分支并以 `exit(3)` 退出。
- 设计意图写在 `harness.cjs:8` 注释与 `HANDOFF.md:544-560`：避免 `npm ci` 顺带下载浏览器。代价是：**验收套件默认不可运行**，`npm run e2e`（`package.json:14`）在干净环境里必然失败。

### 7.5 CI

`.github/workflows/deploy.yml`（76 行）**只构建、不测试**：

- 触发：`push` 到 `main` + `workflow_dispatch`（`:14-17`）。
- build job（`:30-66`）：`checkout@v4` → `setup-node@v4`（`node-version: 22`, `cache: npm`，`:35-38`）→ `npm ci`（`:41`）→ 计算 base（`:46-55`）→ `npm run build`（`:57-60`，只注入 `VITE_BASE`）→ `configure-pages@v5`（`:62`）→ `upload-pages-artifact@v3`（`:64-66`）。
- **没有**：`npm run e2e`、单测、lint、`npm run build:single`（单文件构建**完全不在 CI 覆盖内**，只有 `HANDOFF.md:673` 手工步骤第 7 条提到）。
- 因此 CI 的唯一质量门禁 = `tsc --noEmit`（`package.json:10`）+ `vite build` 是否成功。**49 项 E2E 不在门禁内**。
- deploy job（`:68-76`）：`needs: build` → `actions/deploy-pages@v4`，`environment: github-pages`。
- 权限与并发（`:19-27`）：`contents: read` / `pages: write` / `id-token: write`，`group: pages` + `cancel-in-progress: true`。
- 依赖 CI 的两个前提：`package-lock.json` 必须入库（`.gitattributes:15` 把它标为 `-diff linguist-generated`；`.gitignore` 未排除）与 `public/.nojekyll`（`部署指南.md:154`）。

### 7.6 质量现状小结

对「新增工具」这件事而言，**当前的测试体系不提供任何保护**：

- `verify.cjs:40` 断言「工具卡片数量 === 1」——**第 2 个工具上线即挂**；
- 没有任何断言检查「`TOOLS` 里的 url 与 `vite.config.ts` 的 input 是否一致」；
- 没有任何断言覆盖「入口 HTML 的 title/description 是否正确填写」；
- 没有 lint 强制工具目录的结构；
- `scripts/`、`e2e/` 与全部 HTML 都在 `tsconfig.json:25` 的 include 之外。

---

## 8. 其他相关事实（供目标架构参考）

### 8.1 样式系统（全站单点）

`src/styles.css`（106 行）是全站样式唯一入口：Tailwind 导入（`:1`）、`@custom-variant dark`（`:4`）、`:root` 亮色变量（`:9-29`）、`.dark` 暗色变量（`:30-49`）、`@theme inline` 映射为语义类（`:53-72`）、base 层（`:74-102`）。每个入口 `import './styles.css'`（`src/main.tsx:3`、`src/lens.tsx:3`）。**没有 `tailwind.config.js`**（Tailwind 4 CSS-first，`:53-72`）；根目录实测无该文件。这套结构**天然就是共享的**，是当前架构里最健康的一层。

### 8.2 主题系统的两条硬约束（改动态包时必须遵守）

- `.dark` class 必须在**渲染期同步**写入 `<html>`：`src/shared/useTheme.ts:27-31`（含 `:27-29` 的原因注释：React effect 子先父后）。消费者 `ChartBox.tsx:21` 依赖它。
- 图表颜色必须**查表**，不能用 `getComputedStyle` 读 CSS 变量：`src/shared/lib/chart.ts:34-38`（原因注释）+ `CHART_THEME`（`:39-58`）+ `chartThemeFor()`（`:60-62`）。

### 8.3 体积与构建实测

| 项 | 值 | 来源 |
|---|---|---|
| `scripts/lenses-source.json` | 1,269,140 字节（≈1.21 MB） | 实测 |
| `public/data/lenses.json` | 965,979 字节（≈0.92 MB） | 实测 |
| `src/data/lenses-inline.ts` | 1,127,414 字节 | 实测 |
| `_archive/lens-static.html` | 1,210,654 字节（重构前的单文件版） | 实测 |
| `_archive/portal-static.html` | 14,229 字节 | 实测 |
| `dist-single/` | 含 `lens/index.html` + 冗余 `data/lenses.json` | 实测目录 |

（`_archive/` 被 `.gitignore:24` 排除但**存在于工作树**，是重构前的静态版回退参考。）

### 8.4 与「工具即插件」目标直接相关的三条现状

1. **入口登记分散在 3 个地方且无一致性校验**：`vite.config.ts:21-26`（构建）、`src/portal/tools.tsx:28-46`（展示）、物理 `*/index.html`（路由）。三者任一遗漏都不会报错。
2. **目录约定无强制**：`lens/` 目录名同时承担 URL 路径（`tools.tsx:33` `'lens/'`）、入口 HTML 位置（`vite.config.ts:25`）、源码目录名（`src/lens/`）三重语义，但三者**没有任何自动关联**。
3. **共享层没有边界**：`src/shared/` 混装通用能力与镜头专有代码（§5），新工具作者无法安全复用。

---

## 9. 文档与代码不符处（显式列出）

> **复核状态（2026-10 修订）**：本节全部 13 条已由 architect 逐条重跑命令复核。原 D10 已被证伪并**撤回**（见 §9.1），D13 由「未验证」升级为「已验证为真」，其余 11 条保持成立。**本清单不含未复核条目。**

| # | 文档位置 | 文档说法 | 代码事实 | 影响 |
|---|---|---|---|---|
| D1 | `README.md:75` | `components/` = `ChartBox / LensTip / ui.tsx` | 实际还有 `ThemeToggle.tsx`（33 行，消费点 `portal/App.tsx:45`、`lens/App.tsx:222`） | 低（文档遗漏） |
| D2 | `README.md:71-75`、`HANDOFF.md:152-161` | `shared/` 是「两个页面共用的东西 / 跨工具复用」 | `lib/lens.ts`（206 行）只被 `src/lens/**` 的 11 个文件引用、`LensTip.tsx`（72 行）只被 `src/lens/**` 的 5 个文件引用，**两者门户零引用**；`src/portal/**` 对 shared 的 import 实测只有 2 行（`App.tsx:4` `ThemeToggle`、`App.tsx:5` `useTheme`） | **高**（误导新工具作者复用错误的东西） |
| D3 | `HANDOFF.md:600` | `BRAND_CN` 有 **46 条** | 实测 `src/shared/lib/lens.ts:112-164` = **46 个键** ✅ 与文档一致（初次人工点算曾误记为 52，已用脚本复核纠正） | 无（一致） |
| D4 | `HANDOFF.md:272` | 原始数据 1,269,140 字节 ≈ 1.21 MB | 实测 `scripts/lenses-source.json` = **1,269,140 字节** ✅ 精确一致 | 无（一致） |
| D5 | `README.md:19`、`HANDOFF.md:276` | 产物 ≈0.92 MB | 实测 965,979 字节 = 0.921 MB ✅ | 一致 |
| D6 | `tools.tsx:4`（自身注释） | `id` 「唯一标识，同时作为卡片锚点」 | 源码中 `Tool.id` 的**唯一**消费点是 `src/portal/App.tsx:98` 的 `key={t.id}`（React key），**未生成任何 DOM 锚点**（全仓 grep `锚点` 只命中该注释本身）；`SITE.home`（`tools.tsx:52`）全仓**零消费点**（grep `SITE.home` 无输出） | 中（注释描述的能力不存在，若被当作锚点入口使用会踩空） |
| D7 | `README.md:113`、`HANDOFF.md:409-410` | 三步法：第 3 步「`input` 加一项 + `TOOLS` 加一项」即为全部 | 尚有 2 处未列：**工具 App 内的返回链接**（`src/lens/App.tsx:216` 用 `import.meta.env.BASE_URL`，模板复制不到）与**每个入口 `import './styles.css'`**（`src/main.tsx:3`/`src/lens.tsx:3`，重复打包 Tailwind 产物） | **高**（按文档操作会做出没有回门户路径的工具） |
| D8 | `HANDOFF.md:23`、`README.md`（无） | 「E2E 49/49 通过」是可复现基准线 | 断言数 49 属实；但 **playwright 不在 `package.json`、不在 `package-lock.json`、也不在 `node_modules`**（三处实测均为 0/不存在），干净环境必然走 `harness.cjs:26-32` 的 `exit(3)` | 中（基准线当前不可复现） |
| D9 | `HANDOFF.md:433` | 「分项滑块记得带 `data-metric={k}` 属性（E2E 靠它定位）」 | 属实：全仓 `data-metric` 只有 2 处——产品侧 `FilterPanel.tsx:340` 与测试侧 `e2e/verify.cjs:146`。文档把它当规范陈述，未标注这是**产品代码为测试让路**的技术债 | 中 |
| D11 | `HANDOFF.md:637-638` | 「单文件模式只构建镜头工具，门户不进单文件包——这是有意的」 | 与代码一致（`vite.config.ts:21-22` 单文件分支只含 `lens`）；但同一文档 `:633-636` 承认 `dist-single/data/lenses.json` 冗余，实测该文件确实存在于 `dist-single/data/` | 一致（已自认） |
| D12 | `部署指南.md:167-168` | 「改数据：只要更新 `scripts/lenses-source.json`，推送即可」 | 构建侧属实（`package.json` 的 `build` = `npm run data && tsc --noEmit && vite build`，确实先跑 data）；**但**连带修改有 2 处文档未提：`src/portal/tools.tsx:32,42` 的数字文案（硬编码「1,617 / 46 / 41 / 39」）不会自动更新；E2E 的 `verify.cjs:86`（`=== 1617`）与 `:91`（`includes('9.5')`）会失败 | 中（文档漏了这两处连带修改） |
| D13 | `HANDOFF.md:343`、`:639` | `dist-single/lens/index.html` = 1,475,600 字节 | 实测该文件**存在且恰为 1,475,600 字节** ✅ 完全准确（`:639` 第二次引用同一数字也一致） | 无（一致；原标记为「未验证」，经实测升级为已验证为真） |

> D3/D4/D5/D11/D13 五条经复核**与代码一致**，保留在此仅为「已核对过、无需再查」的记录，不构成缺陷。
> **【t9 追加 · 指向 `03-engineering.md` 的处置说明（不改动上方任何审计结论与行号）】**
> D13 的实测值 **1,475,600 字节**在其**当时的构建环境**下成立，但**不可作为可长期复现的不变量**：`03-engineering.md` 的复审实测在同一基线重建后得 **1,476,952 字节**（差 +1,352 ≈ +0.09%），差异来自 `vite-plugin-singlefile` / Rolldown 的内联与压缩输出**随依赖版本漂移**。
> 因此该数字的正确用法是「**参考量级（≈1.47 MB）**」，**不得作为验收锚点或 CI 门禁**——详见 `03-engineering.md` §5.2 的 MF-5 处置。本条仅补充使用边界，**不推翻 D13 的实测真实性**（当时确实为 1,475,600）。
> 同理适用于 D5（`public/data/lenses.json` 0.92 MB）：仍吻合，但同属量级参考。


> **【t13 追加批注 · 不改动上方任何原文与行号】关于「重复打包 Tailwind 产物」这一主张已被实测证伪**
> 本文件有三处提到「每个工具的包都会重复打包整份 Tailwind 产物」：§1.2 表格第 1 步行（`:42`）、§4.3 代价表「全站样式重复打包」行（`:167`）、以及 D7（`:414`）。
> **这三处的"重复打包"推断不成立。** `02-target-architecture.md` §0.6 已记录实测证伪：`dist/index.html` 与 `dist/lens/index.html` **引用同一个 CSS chunk**，且 `dist/assets` 下 CSS **只有 1 份**——Rolldown 的共享 CSS chunk 提取已经去重。
> **证伪的根因**：该推断只依据「两个入口各有一行 `import './styles.css'`」这个**源码形态**，**没有验证构建产物**（本文件 D7 与 `02` §0.6 共享同一个未验证前提，属"交叉印证的假象"）。
> **判据口径**：采用**结构不变量**——「两入口是否引用同一 CSS 文件名」+「`dist/assets` 下 CSS 是否仅 1 份」，**不写 content hash、不用产物体积作锚点**（该值跨环境/依赖漂移，不可复现；详 `05-migration-plan.md` §5.3 团队级纪律）。
> **三处中仍成立的部分**：`src/main.tsx:3` 与 `src/lens.tsx:3` 各自 `import './styles.css'` 是**事实**，且"入口样板重复"确实存在（`StrictMode`+`createRoot`+该 `import` 被逐工具复制）——只是它**不产生**体积成本，其真实收益是**收敛入口样板 + 上移 `IS_SINGLE`**（`02` §0.6、`05` §1.4 M-3）。
> **本条为追加批注，不修改 D7 及其余审计记录的原文**，以保持只读审计产出的可追溯性。

### 9.1 原 D10 撤回声明

原 §9 曾有一条 **D10**，声称「`HANDOFF.md:22` 的『源码 24 文件 / 3,377 行』不准确，实测 2,782 行」，并据此推论「交接文档的基准数字不可信」。**该条撤回，论断不成立。**

- **错误根因**：我的行数统计用了 `ls src/*.tsx src/*/*.tsx src/*/*.ts src/*/*/*.tsx` 这一 shell glob。它**只匹配到 22 个文件**，静默漏掉了 `src/shared/lib/chart.ts`、`src/shared/lib/lens.ts`（两个最大的文件，共 492 行）与 `src/styles.css`。漏掉的正是 595 行的差额来源。glob 不匹配时不报错，我也没有对「文件数」做一致性检查——这是本次审计最严重的取证失误。
- **正确事实**（由 captain 实测并已由我逐条复现）：

| 口径 | 命令 | 结果 |
|---|---|---|
| src 目录总计（含生成物） | `find src -type f \| wc -l` / `find src -type f -print0 \| xargs -0 wc -l \| tail -1` | **25 个文件 / 3,380 行** |
| **源码**（排除 `src/data/lenses-inline.ts`，该生成物仅 3 行） | 同上 + `! -name 'lenses-inline.ts'` | **24 个文件 / 3,377 行** |
| 含 e2e/scripts 的全部代码 | `find src scripts e2e -type f -print0 \| xargs -0 wc -l \| tail -1` | **29 个文件 / 3,955 行** |

  即 `HANDOFF.md:22` 的「源码 24 文件 / 3,377 行」**完全吻合**，交接文档在这个数字上是可信的。

- **后续统一口径**（本文档及下游所有文档一律采用）：「源码」= **3,377 行 / 24 文件**（src 下手写代码，排除 `src/data/lenses-inline.ts` 生成物）；「含 e2e/scripts 的全部代码」= **3,955 行 / 29 文件**；「src 目录总计（含生成物）」= **3,380 行 / 25 文件**。引用时必须写明口径。

> **对本文档其他章节的影响**：§10 曾把「3,271 行」列为实测源码行数，同样源自该错误 glob，**一并作废**，以本节口径为准。§0 与其余章节**未**引用行数，不受影响。

---

## 10. 审计覆盖与可复现命令

**读过的全部源文件**（行数为 `wc -l` 实测）：`index.html`(25) `lens/index.html`(24) `vite.config.ts`(62) `tsconfig.json`(26) `package.json`(32) `.gitignore`(36) `.gitattributes`(15) `.github/workflows/deploy.yml`(76) `scripts/prepare-data.mjs`(98) `e2e/harness.cjs`(195) `e2e/verify.cjs`(282) `src/styles.css`(106) `src/main.tsx`(10) `src/lens.tsx`(10) `src/portal/App.tsx`(135) `src/portal/tools.tsx`(53) `src/portal/components/ToolCard.tsx`(107) `src/shared/useTheme.ts`(56) `src/shared/lib/chart.ts`(286) `src/shared/lib/lens.ts`(206) `src/shared/components/ChartBox.tsx`(30) `src/shared/components/LensTip.tsx`(72) `src/shared/components/ThemeToggle.tsx`(33) `src/shared/components/ui.tsx`(187) `src/lens/App.tsx`(283) `src/lens/data.ts`(34) `src/lens/filter.ts`(130) `src/lens/components/Drawer.tsx`(163) `src/lens/sections/HeaderSection.tsx`(72) `src/lens/sections/FilterPanel.tsx`(346) `src/lens/sections/CompareSection.tsx`(168) `src/lens/sections/OverviewSection.tsx`(434) `src/lens/sections/RankingSection.tsx`(153) `src/lens/sections/TableSection.tsx`(238) `src/lens/sections/NotesSection.tsx`(65) + 文档三份（`README.md` 230 / `HANDOFF.md` 678 / `部署指南.md` 184）。

**复现本次事实的命令**：

```bash
cd /d/docs/01-my-website
git log --oneline -5                      # HEAD = 95c0260
git status --porcelain                    # 仅 ?? .agent-teams/
grep -c "r\.ok(" e2e/verify.cjs            # 49
grep -c '"node_modules/playwright' package-lock.json   # 0
ls -a | grep -iE 'eslint|prettier|editorconfig'        # 无输出
ls -l public/data/lenses.json src/data/lenses-inline.ts # 965979 / 1127414
node -e "const d=require('./scripts/lenses-source.json');console.log(d.length)"  # 1617

# 行数口径（§9.1，必须用 find，不要用 shell glob —— 我最初用 glob 漏了 3 个文件）
find src -type f | wc -l                                             # 25 文件
find src -type f -print0 | xargs -0 wc -l | tail -1                  # 3380 行（含生成物）
find src -type f ! -name 'lenses-inline.ts' | wc -l                  # 24 文件 ← 源码
find src -type f ! -name 'lenses-inline.ts' -print0 | xargs -0 wc -l | tail -1   # 3377 行 ← 源码
find src scripts e2e -type f -print0 | xargs -0 wc -l | tail -1      # 3955 行（含 e2e/scripts）
```

**本次审计明确未做的事**：未运行任何构建（`npm run build` / `build:single`）、未启动开发服务器、未跑 E2E（本机无 playwright，§7.4）、未修改任何产品代码。`docs/architecture/01-current-state.md` 是本次唯一写入的文件。

**审计中自我纠正的三处**：① `BRAND_CN` 初次人工点算得 52 个键，脚本复核后为 **46**，文档原说法正确（D3 已改为「一致」）；② `scripts/lenses-source.json` 初次记录为 1,210,654 字节（那是 `_archive/lens-static.html` 的大小，文件串了），复核为 **1,269,140 字节**（D4 已改为「一致」）；③ **源码行数**：初次用 shell glob 统计得 2,782 行，该 glob 静默漏掉 `src/shared/lib/{chart,lens}.ts` 与 `src/styles.css` 共 3 个文件，正确值为 **3,377 行 / 24 文件**（详见 §9.1，原 D10 已撤回）。教训：**涉及「全量」的统计必须用 `find` 遍历并在结果里核对文件数**，glob 无匹配时不报错，是静默错误的温床——这与本项目 `vite.config.ts` 入口漏登记导致构建成功但产物残缺属同类失败模式。

---

## 11. 交给下一环的问题（不是结论，是需要架构决策的开放项）

1. **单一真源放在哪**：`vite.config.ts` 的 `input`、`tools.tsx` 的 `TOOLS`、物理 `*/index.html` 三者如何收敛为一个（或两个）可自动推导的真源？
2. **`icon: ReactNode` 的外置**：把图标留在集中注册表（当前做法）与放进工具目录，哪个对「不改共享文件」更可行？
3. **共享层的切分线**：`src/shared` 应拆成「框架层（useTheme / ui / chart / ChartBox / ThemeToggle）」与「领域包（lens 相关）」两处吗？拆完门户/新工具的依赖面是否只剩框架层？
4. **MPA 是否保留**：§4 的事实显示瓶颈在「无共享布局」而非「无路由」，两条路线（保留物理 HTML + 共享 Layout / 引入客户端路由）各自的迁移成本需要 ADR 定夺。
5. **测试门禁**：`verify.cjs:40`（卡片数=1）与 `:86`（1617）这类快照断言，改成「从数据/注册表推导期望值」是否可行（`canvasReport` 式的不变量断言应保留）？
6. **数据管道出口**：`prepare-data.mjs` 与 `src/lens/data.ts` 的镜头专属链路，如何泛化为「每个工具声明自己的数据产物」而不破坏 `__INLINE_DATA__` 单文件能力？
