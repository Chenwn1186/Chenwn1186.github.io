# 项目交接文档 · 伟宁的工具箱

> **文档目的**：把本项目从「个人边做边改」的状态，完整、无歧义地交接给接手的专业团队。
> 读完本文 + `README.md` + `部署指南.md`，接手方应当可以：本地跑起来、改功能、跑通验收、部署上线。
>
> **交接日期**：2026-10-10 　**当前版本**：v1.0.0 　**代码状态**：可构建、可运行、E2E 49/49 通过、**尚未推送到 GitHub**

---

## 0. 一页速览

| 项目 | 说明 |
| --- | --- |
| 项目名 | 伟宁的工具箱（`chenwn-toolbox`） |
| 定位 | 个人工具集合门户。一个主页（工具仪表盘）+ 若干独立工具子页 |
| 当前工具数 | 1 个 —— **全球镜头评测数据库**（1,617 支镜头 / 8 项评测维度） |
| 技术栈 | Vite 8 + React 19 + TypeScript 7 + Tailwind CSS 4 + Chart.js 4 |
| 本地目录 | `D:\docs\01-my-website` |
| 目标仓库 | `github.com/Chenwn1186/Chenwn1186.github.io`（**用户站**，仓库尚未创建） |
| 线上地址 | https://chenwn1186.github.io/ |
| 部署方式 | GitHub Actions 自动构建 → GitHub Pages（免费） |
| 代码量 | 源码 24 文件 / 3,377 行；E2E 2 文件 / 477 行；数据处理 98 行（另有 2 个构建期生成的数据文件，不入库） |
| 验收基准 | `npm run e2e` → **49/49 通过** |
| 阻塞项 | 无。仅剩「建仓库 → 推送 → 开启 Pages」三步人工操作（见第 7 节） |

**一句话交接**：工程骨架、门户、镜头工具、数据流水线、CI、E2E、文档都已就绪且自测通过；接手方拿到仓库后 **第一件该做的事**是照第 6 节把环境跑起来并复现 49/49，之后再动代码。

---

## 1. 需求与设计决策（为什么长成现在这样）

这一节记录了「为什么」——避免接手方按常规直觉改掉一些刻意为之的设计。

### 1.1 需求演进

原状态是**两个手写的单文件 HTML**（`_archive/lens-static.html` 1.2 MB、`_archive/portal-static.html`），
能跑，但不可维护：无模块化、无类型、无组件复用、Chart.js 配置散落各处、改一处要全文搜索。

用户提出四个明确要求：

1. 部署到 GitHub，并且**主页要能承载「后续会不断增加的工具」**；
2. **不用原生 HTML，改用现代技术栈**；
3. **连已有的镜头工具一起重写**（不是只写主页）；
4. 框架选 React，样式选 Tailwind。

### 1.2 关键决策与理由

| 决策 | 选择 | 理由 / 备选为何被否 |
| --- | --- | --- |
| 仓库结构 | **单仓库**，一个 `Chenwn1186.github.io` 仓库，主页在根、工具在子目录 | 用户站天然在域名根，多个工具共享同一份构建与样式基线；多仓库方案下主页要维护跨站链接与品牌一致性，成本更高 |
| 站点类型 | **用户站**（`<用户名>.github.io`） | 部署在 `https://chenwn1186.github.io/` 根路径，`base = "/"`，链接最简单；项目站需要 `/<仓库名>/` 前缀 |
| 前端框架 | **React 19 + TypeScript + Tailwind 4** | 用户指定。React 生态在图表/表格场景最成熟 |
| 构建工具 | **Vite 8**（底层 Rolldown） | 冷启动与构建都快；`@tailwindcss/vite` 官方插件对 Tailwind 4 支持最好 |
| 路由 | **无客户端路由**，走多页（MPA）双 HTML 入口 | 每个工具是独立产品，不需要 SPA 的全站状态共享；MPA 让每个工具的包更小、可直接链接、天然适配 GitHub Pages 静态托管（刷新不 404） |
| 图表库 | **Chart.js 4**，直接 `new Chart()` | **刻意不用 `react-chartjs-2`**：需要命令式控制实例生命周期（销毁/重建/尺寸自检），包装层反而碍事 |
| 部署 | **GitHub Pages + Actions** | 免费、静态托管、与代码仓库同源；额度足够（见 `部署指南.md`） |
| 双构建 | 多文件 `dist/` + 单文件 `dist-single/` | 部署要按需加载；同时用户需要能**离线双击打开**的单文件版分享给别人 |

> ⚠️ **不要做的事**：不要把 MPA 改成 SPA 路由。既是产品决策，也是 GitHub Pages 上最稳的形态。

---

## 2. 技术栈与版本

| 层 | 包 | 版本 | 备注 |
| --- | --- | --- | --- |
| 构建 | `vite` | ^8.3.4 | 底层换成了 Rolldown，个别 Rollup 选项行为有差异 |
| 构建插件 | `@vitejs/plugin-react` | ^6.1.2 | |
| 构建插件 | `@tailwindcss/vite` | ^4.3.3 | Tailwind 4 走 Vite 插件，**无 `tailwind.config.js`** |
| 构建插件 | `vite-plugin-singlefile` | ^2.3.3 | 仅单文件模式启用 |
| 运行时 | `react` / `react-dom` | ^19.3.0 | |
| 图表 | `chart.js` | ^4.5.1 | |
| 样式 | `tailwindcss` | ^4.3.3 | CSS-first 配置，见 `src/styles.css` |
| 语言 | `typescript` | ^7.0.2 | **TS 7 已移除 `baseUrl`**，别名只用 `paths` |
| 类型 | `@types/react` / `@types/react-dom` | ^19.3.0 | |
| 类型 | `@types/node` | ^26.6.5 | 供 `vite.config.ts` / 脚本使用 |
| 运行时 | Node.js | 22 LTS | CI 用 `node-version: 22` |
| E2E | `playwright` | 1.59.x | **不在 `package.json` 里**，见第 6.3 节 |

### Tailwind 4 的三个反直觉点

1. **没有 `tailwind.config.js`**。主题配置写在 `src/styles.css`：`@import "tailwindcss"` + `@theme inline { ... }`。
2. **深色模式要显式声明变体**：`@custom-variant dark (&:where(.dark, .dark *))`。默认那套 `prefers-color-scheme` 不适用于「手动切换」。
3. **自定义颜色走 CSS 变量 + `@theme inline`**，才能同时支持运行时切主题。详见第 5 节。

### TypeScript 7 的注意点

- `baseUrl` **已移除**。`tsconfig.json` 只保留：
  ```json
  "paths": { "@/*": ["./src/*"] }
  ```
  配合 `vite.config.ts` 里的 `resolve.alias` 使用。
- `strict` + `noUnusedLocals` + `noUnusedParameters` **全开**。多余 import 会直接构建失败——这是刻意的，保持代码干净。

---

## 3. 目录结构与文件职责

```
01-my-website/
├── index.html                      # 门户入口 HTML（25 行）
├── lens/index.html                 # 镜头工具入口 HTML（24 行）
├── package.json                    # 脚本与依赖
├── vite.config.ts                  # 双模式 + MPA 双入口 + base 自动切换（62 行）
├── tsconfig.json                   # strict + paths（26 行）
├── README.md                       # 开发者文档（230 行）
├── 部署指南.md                      # GitHub Pages 部署手册（184 行）
├── HANDOFF.md                      # ★ 本文
│
├── .github/workflows/deploy.yml    # CI：构建 + 部署到 Pages（76 行）
├── .gitattributes                  # 强制 LF，避免 Windows 换行噪音
├── .gitignore
│
├── public/
│   ├── .nojekyll                   # ★ 必需，否则 Pages 会吞掉下划线开头的文件
│   └── data/lenses.json            # 数据产物（构建时生成，不入库）
│
├── scripts/
│   ├── lenses-source.json          # ★ 原始数据源（1.21 MB，入库，唯一真源）
│   └── prepare-data.mjs            # 数据流水线（98 行）
│
├── e2e/
│   ├── harness.cjs                 # E2E 公共层：启动浏览器/断言/截图/命中测试（195 行）
│   └── verify.cjs                  # 49 项验收脚本（282 行）
│
└── src/
    ├── styles.css                  # Tailwind 入口 + 语义色板（106 行）
    ├── main.tsx                    # 门户挂载（10 行）
    ├── lens.tsx                    # 镜头工具挂载（10 行）
    │
    ├── data/lenses-inline.ts       # 单文件模式的内联数据（构建时生成，不入库）
    │
    ├── portal/                     # ── 门户主页 ──
    │   ├── App.tsx                 # 搜索/标签筛选/布局（135 行）
    │   ├── tools.tsx               # ★ TOOLS 数组：新增工具的唯一入口（53 行）
    │   └── components/ToolCard.tsx # 工具卡片 / 关于卡片（107 行）
    │
    ├── lens/                       # ── 镜头数据库 ──
    │   ├── App.tsx                 # 全局状态与动作（283 行）
    │   ├── data.ts                 # 数据加载：双模式分支 + 重试（34 行）
    │   ├── filter.ts               # 筛选/排序纯函数（130 行）
    │   ├── components/Drawer.tsx   # 详情抽屉（163 行）
    │   └── sections/
    │       ├── HeaderSection.tsx   # 7 个统计块（72 行）
    │       ├── FilterPanel.tsx     # 筛选面板，46 品牌 chip + 8 分项滑块（346 行）
    │       ├── CompareSection.tsx  # 对比台：雷达 + 逐项柱（168 行）
    │       ├── OverviewSection.tsx # 总览：散点/箱线/密度（434 行）
    │       ├── RankingSection.tsx  # 榜单：8 维度前 20 名（153 行）
    │       ├── TableSection.tsx    # 数据表：17 列 / 分页 / CSV（238 行）
    │       └── NotesSection.tsx    # 数据说明 + 品牌对照表（65 行）
    │
    └── shared/                     # ── 跨工具复用 ──
        ├── useTheme.ts             # 主题 hook + Context（56 行）
        ├── lib/chart.ts            # ★★ Chart.js 唯一收口点（286 行）
        ├── lib/lens.ts             # 领域基础：类型/指标/品牌中文名/格式化（206 行）
        └── components/
            ├── ChartBox.tsx        # 图表画布封装（30 行）
            ├── LensTip.tsx         # 命令式悬停浮层（72 行）
            ├── ThemeToggle.tsx     # 主题切换按钮（33 行）
            └── ui.tsx              # Chip/Btn/Tabs/ChartCard/Stat/...（187 行）
```

**文件被标星的含义**：`src/portal/tools.tsx`、`src/shared/lib/chart.ts`、`.nojekyll`、`scripts/lenses-source.json`
是**绝不能无意破坏**的四个点。

**不入库的文件**（由 `.gitignore` 排除，构建时自动生成）：
`public/data/lenses.json`、`src/data/lenses-inline.ts`、`dist/`、`dist-single/`、`_shots/`、`_archive/`、`node_modules/`。

> ⚠️ **接手第一个坑**：因为数据产物不入库，`git clone` + `npm ci` 之后**必须**先跑一次 `npm run data`（或直接 `npm run dev`），
> 否则 `src/data/lenses-inline.ts` 不存在会让 `tsc` 报 `TS2307: Cannot find module '../data/lenses-inline'`。
> 见第 6.2 节。

---

## 4. 功能清单与实现位置

### 4.1 门户主页（`/`）

| 功能 | 位置 |
| --- | --- |
| 工具卡片网格 | `src/portal/App.tsx` + `components/ToolCard.tsx` |
| 关键词搜索（匹配名称/描述/标签） | `src/portal/App.tsx` |
| 标签筛选（自动从 `TOOLS` 收集全部标签 + 「全部」） | `src/portal/App.tsx` |
| 空态提示 | `src/portal/App.tsx` |
| 深浅色切换 + localStorage 持久化 | `src/shared/useTheme.ts` + `components/ThemeToggle.tsx` |
| 关于区（`live: false` 的工具显示「即将上线」） | `src/portal/components/ToolCard.tsx` |
| **新增工具** | 只改 `src/portal/tools.tsx` 的 `TOOLS` 数组（+ 入口文件，见第 8.1 节） |

### 4.2 镜头数据库（`/lens/`）

| 功能 | 实现位置 | 关键参数 |
| --- | --- | --- |
| 数据加载（fetch / 内联双模式 + 失败重试） | `src/lens/data.ts` | `loadLenses()` 全局只加载一次 |
| 统计头 | `sections/HeaderSection.tsx` | 1,617 收录 / 46 品牌 / 41 卡口 / 39 评测源 / 8 维度 / 最高 9.5 / 1,544 含完整规格 |
| 搜索 | `sections/FilterPanel.tsx` | 180 ms 防抖；`filter.ts` 内用 `WeakMap` 缓存搜索索引 |
| 品牌筛选 | 同上 | 46 个 chip |
| 卡口 / 类型 / 特性筛选 | 同上 | 22 个卡口 |
| 焦段区间 | 同上 | 两种语义（等效焦段 / 实际焦段）可切换 |
| 光圈 / 价格 / 重量 / 综合分 | 同上 | 区间或上下限 |
| **8 项分项下限** | 同上 | 锐度、色散(轴向 LoCA)、抗眩光、畸变、焦外、暗角、呼吸效应、对焦速度 |
| 对比台 | `sections/CompareSection.tsx` | **最多 6 支**，默认预置 3 支 E 口；雷达 + 逐项柱，`h-[440px]` |
| 总览散点 | `sections/OverviewSection.tsx` | `SCATTER_VIEWS[2][2]` 两组视图可切换；`priceCap()` / `boxStats()` |
| 品牌四分位箱线 | 同上 | 用 `boxStats()` 自算，不依赖图表库的 boxplot |
| 焦段密度 | 同上 | `FOCAL_BANDS` |
| 专项榜单 | `sections/RankingSection.tsx` | 8 维度可切换，`TOP_N = 20`，显示与榜首差距 |
| 数据表 | `sections/TableSection.tsx` | 17 列，`PAGE_SIZE = 100`（共 17 页），可排序，缺失值永远排最后 |
| CSV 导出 | `src/lens/App.tsx` `exportCsv()` | 导出当前**筛选结果**，文件名形如 `镜头筛选结果_1617支.csv` |
| 详情抽屉 | `components/Drawer.tsx` | Esc 关闭；`aria-hidden` 随状态变；八项分项进度条 |
| 行悬停浮层 | `components/LensTip.tsx` | 命令式 handle，避免 mousemove 触发整树重渲染 |
| 数据口径说明 + 品牌中英文对照 | `sections/NotesSection.tsx` | 6 条口径 + 46 品牌 |

**筛选/排序的纯逻辑**全部在 `src/lens/filter.ts`，不碰 React。`applyFilters()`、`sortVal()`、`sortRows()` 都是纯函数，
这样可以单测、也可以被 E2E 直接断言。

---

## 5. 主题系统（容易踩错的地方）

主题色是「CSS 变量 + Tailwind 语义类」两级结构：

```
src/styles.css
  :root  { --bg: ...; --card: ...; --tx: ...; --acc: ...; --hi/--mid/--lo: ... }
  .dark  { 同名变量换一套深色值 }
  @theme inline {
    --color-bg: var(--bg);        /* → 生成工具类 bg-bg */
    --color-card: var(--card);    /* → bg-card */
    --color-tx2: var(--tx2);      /* → text-tx2 */
    ...
  }
```

组件里只写语义类（`bg-card` / `text-tx2` / `border-line`），不写具体色值。这样切换主题只需要换 `<html>` 上的 `.dark` 类。

### ⚠️ 两条硬约束（改主题相关代码前必读）

**(1) `.dark` 类必须在渲染期同步写入，不能只放 effect 里。**

React 的 effect 执行顺序是**子先父后**。`useTheme` 是父级 hook，它的 effect 最后才跑；
如果等到那时才给 `<html>` 加 `.dark`，子组件里图表的 effect 早就用旧主题色画完了。

```ts
// src/shared/useTheme.ts —— applyThemeClass 是幂等的，渲染期直接调
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial);
  applyThemeClass(theme);            // ← 渲染期同步落 class，不是写在 useEffect 里
  ...
}
```

**(2) 图表颜色必须「查表」，不能用 `getComputedStyle` 读 CSS 变量。**

canvas 读不到 CSS 变量，图表色只能由 JS 提供。为什么不用 `getComputedStyle(root).getPropertyValue('--tx')`？
因为切主题的那一帧，变量的新值可能还没生效，读到的是旧值 → 图表颜色永远慢一拍。

```ts
// src/shared/lib/chart.ts —— 按主题名查表（纯函数）
const CHART_THEME: Record<Theme, ChartTheme> = { light: {...}, dark: {...} };
export function chartThemeFor(theme: Theme): ChartTheme { return CHART_THEME[theme] ?? CHART_THEME.light; }
```

`ChartBox` 拿 `useThemeValue()` 得到的 `theme`，再 `chartThemeFor(theme)` 取色 → 主题变了就重画，干净利落。

---

## 6. 数据流水线

### 6.1 数据来源与规模

| 项 | 值 |
| --- | --- |
| 原始数据 | `scripts/lenses-source.json`（1,269,140 字节 ≈ 1.21 MB，**入库**，是唯一真源） |
| 记录数 | 1,617 支镜头 |
| 覆盖 | 46 个品牌、41 种卡口、39 家评测来源 |
| 评测维度 | 8 项（百分制 → 展示时折算成 10 分制总分） |
| 产物 | `public/data/lenses.json`（≈0.92 MB）+ `src/data/lenses-inline.ts` |

### 6.2 流水线做的三件事（`scripts/prepare-data.mjs`）

运行 `npm run data` 的输出：

```
镜头总数 1617
归一化总分(脏数据) 6 条
清洗对焦距离 968 条
体积 0.92 MB
```

1. **裁剪字段** — 只保留渲染用得到的约 30 个字段（含 `dims` 八维分、`af` 对焦等），1.21 MB → 0.92 MB。
2. **归一化脏总分** — 源站有 **6 条**记录的总分误用了百分制（最大 89.2），统一 `/10` 归一到 0–10 分制。
3. **清洗对焦距离** — `minFocus` 字段里混进了页面图标文本（如 `"5.0m 🔍 Max Magn"`），共 **968 条**，剥掉 `🔍` 及其后内容。

### 6.3 双产物：为什么同一份数据要输出两次

| 产物 | 消费方式 | 用在哪个构建 |
| --- | --- | --- |
| `public/data/lenses.json` | 运行时 `fetch()`（`cache: 'force-cache'`） | 多文件构建 `dist/` |
| `src/data/lenses-inline.ts` | 静态 `import`，内联进 JS | 单文件构建 `dist-single/` |

**为什么单文件版必须内联**：`file://` 协议下 `fetch()` 会被浏览器同源策略直接拦掉，
双击打开的单文件版如果还去 fetch，页面就是一片空白。

切换靠编译期常量：

```ts
// vite.config.ts
define: { __INLINE_DATA__: JSON.stringify(single) }

// src/lens/data.ts
declare const __INLINE_DATA__: boolean;
if (__INLINE_DATA__) { const { LENSES_JSON } = await import('../data/lenses-inline'); ... }
else { fetch(`${import.meta.env.BASE_URL}data/lenses.json`) }
```

> ⚠️ **大 JSON 的 TypeScript 类型陷阱**：`lenses-inline.ts` **刻意**写成
> `export const LENSES_JSON = "……json 字符串……"`，而不是 `export const LENSES = [{...}]`。
> 直接导出数组会让 `tsc` 为 1,617 个对象**逐个推导字面量类型**，类型检查慢到不可用。
> 包成字符串后类型只是 `string`，运行时 `JSON.parse` 一次即可。**请不要"优化"成数组导出。**

---

## 7. 构建与部署

### 7.1 npm 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run data` | 只跑数据流水线，生成两份数据产物 |
| `npm run dev` | `data` + `vite`（开发服务器，默认 5173） |
| `npm run build` | `data` + `tsc --noEmit` + `vite build` → `dist/`（**部署用的就是它**） |
| `npm run build:only` | 跳过数据与类型检查，仅 `vite build`（调试构建用） |
| `npm run build:single` | `data` + `tsc --noEmit` + `vite build --mode singlefile` → `dist-single/` |
| `npm run preview` | 预览 `dist/`（默认 4173） |
| `npm run e2e` | 跑 49 项端到端验收（需先起 preview） |

### 7.2 双构建模式对比

| | 多文件 `dist/` | 单文件 `dist-single/` |
| --- | --- | --- |
| 命令 | `npm run build` | `npm run build:single` |
| 入口 | `index.html` + `lens/index.html` | 只有 `lens/index.html` |
| 数据 | `fetch` 外部 JSON | 内联进 JS |
| 产物大小 | `dist/` 约 1.5 MB（JS ≈486 KB / gzip ≈161 KB，CSS ≈28 KB） | `lens/index.html` = 1,475,600 字节（≈1.41 MiB，gzip ≈ 304 KB） |
| base | `VITE_BASE` 或 `/` | `./` |
| `file://` 双击可开 | ❌ | ✅ |
| 用途 | **部署到 Pages** | 离线/分享单文件 |

### 7.3 base 路径规则（改仓库名必看）

| 仓库名 | 站点类型 | URL | base |
| --- | --- | --- | --- |
| `Chenwn1186.github.io` | 用户站 | `https://chenwn1186.github.io/` | `/`（默认） |
| `任意名字` | 项目站 | `https://chenwn1186.github.io/仓库名/` | `/仓库名/` |

CI 里已自动判断（`.github/workflows/deploy.yml` 的「计算 base 路径」步骤）：
用 shell 的 `tr` 把仓库名和用户名转小写后比较，因为 **GitHub 表达式没有转小写函数**，
而 Pages 域名一律小写、仓库名却可能含大写。本地手动构建时则通过 `VITE_BASE` 环境变量传入。

### 7.4 CI 流程（`.github/workflows/deploy.yml`）

触发：推送到 `main`，或手动 `workflow_dispatch`。

```
build:   checkout → setup-node(22, cache npm) → npm ci
       → 计算 base 路径 → npm run build（VITE_BASE 注入）
       → configure-pages → upload-pages-artifact(path: dist)
deploy:  needs: build → deploy-pages@v4   (environment: github-pages)
```

权限：`contents: read` / `pages: write` / `id-token: write`；并发组 `pages` 且 `cancel-in-progress: true`。

### 7.5 待执行的部署三步（**尚未完成，需人工操作**）

1. 在 GitHub 建仓库 `Chenwn1186.github.io`（**公开**，免费账号 Pages 不支持私有仓库）。
2. 本地配好认证后推送：
   ```bash
   cd D:/docs/01-my-website
   git remote add origin git@github.com:Chenwn1186/Chenwn1186.github.io.git
   git push -u origin main
   ```
   （HTTPS + PAT 亦可，详见 `部署指南.md` 第 2 步。**注意本仓库已是 `main` 分支**，无需再 `git init -b main`。）
3. 仓库 **Settings → Pages → Source 必须选「GitHub Actions」**，不能选 "Deploy from a branch"。
   这是最容易漏的一步——选错则 Actions 跑成功但站点不更新。

完整的额度说明、认证方式、常见坑、日常维护见 `部署指南.md`。

---

## 8. 二次开发常见任务

### 8.1 新增一个工具（三步）

**第 1 步：写页面 + 入口。**
新建 `src/新工具/App.tsx`，再建 `src/新工具.tsx`：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { MyApp } from './新工具/App';

createRoot(document.getElementById('root')!).render(<StrictMode><MyApp /></StrictMode>);
```

**第 2 步：加入口 HTML。**
复制 `lens/index.html` → `新工具/index.html`，改 `<title>`、`<meta name="description">`
与末尾 `<script type="module" src="/src/新工具.tsx">`。**深色防闪白的内联脚本请保留。**

**第 3 步：登记。**
在 `vite.config.ts` 的 `input` 加一项，再往 `src/portal/tools.tsx` 的 `TOOLS` 数组加一项：

```tsx
{
  id: 'tools',                                   // 唯一标识
  name: '我的新工具',
  desc: '一句话说清它做什么，40–70 字最佳。',
  url: 'tools/',                                 // 子目录工具写 "目录名/"；外链写完整 https
  icon: (<><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>),  // 24×24 视框 SVG
  tags: ['效率', '小工具'],
  meta: '2026-10 上线',
  tint: '#3FA46A',
  live: true,                                    // false → 卡片显示「即将上线」
}
```

主页会自动生成卡片、收集标签、纳入搜索，**不需要改其它代码**。
图标建议从 Lucide / Tabler 复制 `<path>`，用 `stroke="currentColor"` 才能跟随主题变色。

### 8.2 新增一个筛选维度

1. `src/shared/lib/lens.ts` — 在 `METRICS`（分项指标）或 `FilterState` 相关定义里加字段；
2. `src/lens/filter.ts` — `applyFilters()` 里加判断，`FilterState` / `EMPTY_FILTERS` 补默认值；
3. `src/lens/sections/FilterPanel.tsx` — 加 UI 控件；分项滑块记得带 `data-metric={k}` 属性（E2E 靠它定位）；
4. 若要进 CSV 或表格，同步 `TableSection.tsx` 的 `COLS` / `App.tsx` 的 `exportCsv()`。

### 8.3 改图表

**所有图表改动都必须经过 `src/shared/lib/chart.ts` 的 `renderChart()`。**
不要绕开它直接 `new Chart()`——那 8 个坑（见第 9 节）就是靠这一处收口解决的。

新增图表时，用 `<ChartCard>` + `<ChartBox>` 组合：

```tsx
<ChartCard title="标题" hint="副标题">
  <ChartBox spec={spec} heightClass="h-[300px]" ariaLabel="可访问性描述" />
</ChartCard>
```

> ⚠️ **`ChartCard` 不负责高度，高度一律由 `ChartBox` 的 `heightClass` 决定。**
> 两边各包一层会出现「外 300 / 内 520」的错配，内层 canvas 溢出卡片、直接盖住下一个区块
> ——曾经把下面的数据表压到完全点不动。E2E 里有专门的回归断言守着这条（见第 9.2 节）。

### 8.4 更新数据

覆盖 `scripts/lenses-source.json` → `npm run data` → 检查输出里的记录数与清洗条数 → 跑 `npm run e2e`。
若字段结构变了，同步 `prepare-data.mjs` 的 `KEEP` 白名单与 `src/shared/lib/lens.ts` 的 `Lens` 接口。

---

## 9. 已知坑与硬约束（**接手方最该读的一节**）

这一节是项目最贵的资产：每条都是实际踩过、定位过、修好的。**改对应代码前请先读完。**

### 9.1 Chart.js 八大雷区（全部收口在 `src/shared/lib/chart.ts`）

| # | 现象 | 根因 | 已采用的解法 |
| --- | --- | --- | --- |
| 1 | 图表整体不显示 / 轴范围离谱 | 数据里有 `NaN`/`Infinity`，污染坐标轴自动范围 | `sanitize()` 递归把非有限数转 `null` |
| 2 | 散点图 + 多数据集 + 千点时区**高度算成 0** | `pointRadius` 传**数组**会让 Chart.js 的 `_parsed` 错乱 | **必须传标量**。实测：数组 → `chartArea.height = 0`；标量 → `274` |
| 3 | 手设的轴范围被无视 | `suggestedMin/Max` 只是"建议"，会被数据极值覆盖 | 用显式 `min` / `max` |
| 4 | 空数据集渲染出一张 0 高度白图，看着像坏了 | 无数据时 Chart.js 不报错，就画个空的 | 自绘占位文案 `drawPlaceholder()`，不 `new Chart()` |
| 5 | 悬停没反应 | 默认 `intersect: true`，必须精确命中点 | `{ mode: 'nearest', intersect: false }` + 设 `pointHitRadius` |
| 6 | 横向柱状图悬停错位 / 拿不到元素 | `mode: 'index'` 在 `indexAxis: 'y'` 上索引算错，`els` 恒为空 | **一律用 `nearest`** |
| 7 | `chartArea` 变成 0 | 轴 `title` 或对数轴把轴宽撑爆 | 渲染后自检 `chartArea`，必要时 `resize()` 甚至强制尺寸重建 |
| 8 | 截图/首次渲染抓到半透明的中间帧 | 动画未结束 | `Chart.defaults.animation = false` |

另外封装了：

```ts
// Chart.js 传进 onHover 的**不是**原生事件，而是 { type, chart, native, x, y }，
// 其中 x/y 是画布内相对坐标，**没有 clientX/clientY**。
// 直接用 e.clientX 会得到 undefined → style.left = "NaNpx" → 浮层位置全乱。
export function pointerFromChart(e: any, chart: any): { x: number; y: number }
```

### 9.2 布局：双层高度容器（已修，有回归守卫）

- **错误写法**：`<ChartCard heightClass="h-[520px]"><ChartBox heightClass="h-[520px]">` —— 外面那层会按默认 `h-[300px]` 生效，
  内层 520px 的 canvas 溢出卡片 220px，**盖住下一个区块**。
- **症状**：数据表完全点不动，Playwright 报 `<canvas> intercepts pointer events`。
- **正确做法**：`ChartCard` 不管高度，高度只由 `ChartBox` 决定。
- **回归守卫**（`e2e/verify.cjs` 里）：
  ```js
  r.ok('数据表未被图表遮挡（命中态正确）', cmpHit.includes('[data-cmp]'), cmpHit);
  ```
  它用 `document.elementFromPoint()` 取「加入对比」按钮中心的真实命中元素，必须是 `BUTTON[data-cmp]` 而不是 `CANVAS`。

### 9.3 React 陷阱：effect 顺序

见第 5 节。一句话：**主题 class 渲染期同步写，图表色查表取。**

### 9.4 TypeScript / 工程陷阱

| 现象 | 原因 | 解法 |
| --- | --- | --- |
| `TS2307: Cannot find module '../data/lenses-inline'` | 该文件未生成 | 先 `npm run data` |
| `TS2339: Property 'datasetIndex' does not exist` | 自定义 `HoverEl` 接口缺字段 | 补齐接口 |
| tsc 极慢 | 大 JSON 被推导成 1,617 个字面量类型 | 保持 `LENSES_JSON` 为字符串常量 |
| `noUnusedLocals` 报错 | 遗留 import 未删 | 删掉即可（这是有意的约束） |
| Rolldown 报 `InputOption` 类型不兼容 | 三元表达式的联合类型被推成 `{ main?: undefined }` | 显式标注 `const input: Record<string, string>` |
| 单文件构建警告 `inlineDynamicImports is ignored` | singlefile 插件已关掉 code splitting | 不要在 `rollupOptions` 里配 `inlineDynamicImports` |
| `LF will be replaced by CRLF` 刷屏 | Windows 换行 | `.gitattributes` 已设 `* text=auto eol=lf` |

### 9.5 E2E 相关的坑

| 现象 | 原因 | 解法 |
| --- | --- | --- |
| Playwright 报 `Executable doesn't exist at ...chromium_headless_shell-1210` | 本地实装的 chromium build 号与 playwright 期望的不一致 | `harness.cjs` 的 `findChrome()` 扫描 `ms-playwright/chromium-*` 取最新版，显式传 `executablePath` |
| 误报「表格行悬停无浮层」「加入对比台失败」 | 表格在 660px 内部滚动容器里，Playwright 的 actionability 判定被 sticky 表头搞乱；`scrollIntoView` 还会把表格滚出视口 | `prepareRow()` 手动 `scrollIntoView` + **`scrollLeft = 0`** + `scrollTop = idx*80-120`，再用 `mouse.move` 走真实坐标；断言用 `elementFromPoint` |
| 主题断言顺序依赖，偶发误报 | 上一个测试把 localStorage 设成了 dark | 断言前先**归一化到浅色**，再切深色 |
| `node -e` 内联脚本语法报错 | 正则/引号在 shell 里被吃掉 | 写成临时 `.mjs` / `.cjs` 文件再执行 |

---

## 10. E2E 验收：方法与通过标准

### 10.1 为什么交接要给一套 E2E

「49/49 通过」是**可复现的基准线**。接手方改完代码后，跑一次就知道有没有把东西改坏——
尤其是那些肉眼看不出来的（图表画了但高度是 0、数据表被 canvas 盖住）。

### 10.2 怎么跑

```bash
# 终端 1：起站点
npm run build && npm run preview -- --port 4173

# 终端 2：跑验收
npm run e2e
# 或指定地址（vite dev 也行）：
node e2e/verify.cjs http://127.0.0.1:5173
```

### 10.3 Playwright 依赖说明（**重要**）

`playwright` **没有**写进 `package.json` / `devDependencies`。原因：它只是验收工具，不是产品依赖，
且会拖慢 `npm ci`。接手方两种接法：

```bash
# 方案 A：项目内装（推荐正式团队使用）
npm i -D playwright && npx playwright install chromium
npm run e2e

# 方案 B：复用外部已装的 playwright（通过 NODE_PATH 指向 node_modules）
#   e2e/*.cjs 用 CommonJS + require('playwright')，两种布局都能解析
NODE_PATH=/path/to/node_modules npm run e2e
```

`harness.cjs` 刻意用 `.cjs` 后缀：`package.json` 里是 `"type": "module"`，
`.js` 会被当 ESM，而 CommonJS 的 `require` 在「项目内装了」和「全局装了 + NODE_PATH」两种情况下都能工作。

### 10.4 覆盖范围（49 项）

- **门户主页（12 项）**：标题 / H1 / 卡片数量与名称 / 卡片 href 指向 `lens/` / 搜索命中 / 搜索空态 / 「全部」标签 /
  浅色与深色截图 / 主题持久化到 localStorage / 390px 无横向滚动 / 点击卡片跳转。
- **镜头数据库（35 项）**：标题 / H1 / 1,617 条载入 / 统计块 / 最高分 9.5（归一化生效）/ 8 块画布**逐张像素健康度** /
  46 品牌 chip / 对比台默认 3 支 / 表格 100 行 / 17 页分页 / 翻页 / 按参考价排序 / 行悬停浮层 /
  **数据表未被图表遮挡（回归守卫）** / 加入对比变 4 支 / 榜单维度切换 / 散点视图切换 / 抽屉开与 Esc 关 /
  极端筛选空态占位 / 浅色截图 / 切深色 / 深色下图表健康 / 移动端无横向滚动 / CSV 下载 /
  搜索降噪 / 抗眩光筛选 / 重置 / 卡口筛选 / 光圈筛选。
- **控制台（2 项）**：无未捕获异常 / 无 `console.error`。

### 10.5 核心判据：canvas 像素健康度

`harness.cjs` 的 `canvasReport()` 用 `getImageData` 统计**非透明像素占比**。这是区分两种状态的硬指标：

| 状态 | 非透明像素占比 |
| --- | --- |
| 真实画出了图表 | **> 10%**（实测 0.10 ~ 0.67） |
| 空状态占位（只画了一行提示字） | **< 1%** |

比 Playwright 自带的截图肉眼比对更可靠，也比「canvas 存在」这种弱断言强得多。

### 10.6 当前基准（2026-10-10 实跑）

```
===== 汇总：49/49 通过 =====
```

截图输出到 `_shots/`（已 gitignore）。**接手方验收第一件事：复现这 49/49。**

---

## 11. 数据源与版权说明

- 镜头数据由本项目自行整理自公开的第三方镜头评测网站，原始聚合结果保存在 `scripts/lenses-source.json`。
- 评测分数是**第三方评测机构的口径**，不代表厂商官方标称值；不同评测源之间评分标准并不统一，
  本项目做的是「归一化到同一 0–10 量纲后横向比较」，**不是绝对精度排序**。这一点在页面 `NotesSection` 里已向用户明示。
- 数据仅用于个人学习 / 研究展示。**若计划商用或公开大规模分发，接手方需自行确认各评测源的使用条款。**
- 品牌名与商标归各自权利人所有；项目内的品牌中文名对照表（`src/shared/lib/lens.ts` 的 `BRAND_CN`，46 条）为官方中文名的整理。

---

## 12. 待办与改进建议

### 12.1 必须先做（阻塞上线）

- [ ] 建仓库 `Chenwn1186.github.io` → `git remote add origin …` → `git push -u origin main`
- [ ] Settings → Pages → **Source 选 GitHub Actions**
- [ ] 推送后确认 Actions 绿灯，访问 https://chenwn1186.github.io/ 与 `/lens/`

### 12.2 建议优先处理（工程健壮性）

- [ ] **把 `npm run data` 前置到 `postinstall`**，或在 README/CI 里更醒目地提示新生 `/` 会导致 `tsc` 报 `TS2307`。
      当前是「clone + `npm ci` 后必须先 build 一次」的隐性依赖，对外部团队不友好。
- [ ] **把 `playwright` 收进 `devDependencies`**，并把 `e2e/verify.cjs` 拆成多个 spec 文件；
      或者直接迁移到 Playwright Test Runner（`@playwright/test`），获得重试、并行、报告与 CI 集成。
- [ ] **给 `src/lens/filter.ts` 补单元测试**（纯函数，最好测，目前只靠 E2E 覆盖）。
- [ ] **在 CI 里加一道 `npm run e2e`**（起 preview + Playwright），把 E2E 从「本地可选」变成「合并门禁」。
- [ ] **`public/.nojekyll` 请勿删除** —— 少了它，Pages 会用 Jekyll 处理，以下划线开头的产物会被吞掉。

### 12.3 功能与体验（按优先级）

- [ ] 数据更大时（>5,000 支）考虑把筛选/排序挪进 Web Worker，`filter.ts` 已是纯函数，迁移成本低。
- [ ] 表格虚拟滚动（当前每页 100 条，17 页分页；行数再多就该换虚拟列表）。
- [ ] 对比台的对比结果可导出为图片 / 分享链接（URL 带参数）。
- [ ] 新增工具时把 `TOOLS` 做成从目录自动扫描（当前是手写数组，5 个工具以内手写反而更清晰）。
- [ ] 多语言（当前仅中文；`BRAND_CN` 这类映射已经数据结构化，i18n 改造不难）。
- [ ] 为镜头页加 `<link rel="canonical">` 与结构化数据（SEO）。

### 12.4 已知但暂不处理

- **`dist-single/` 目录实为 2.4 MB，但真正的单文件产物只有 1.5 MB。** 多出来的 ≈944 KB 是
  `public/data/lenses.json` 被 Vite 原样拷进了 `dist-single/data/` —— 单文件模式下数据已内联进 HTML，
  这份 JSON 是纯冗余。要消除，可在 `vite.config.ts` 里按模式覆盖 `build.copyPublicDir`，
  或在单文件模式下把数据产物输出到 `dist/` 专属目录。**不影响功能，接手方可择机优化。**
- 单文件模式**只构建镜头工具**（`input` 里只有 `lens`），门户主页不进单文件包——这是有意的，
  单文件的用途是「把某个工具单独发给别人」，门户没有这个需求。
- 单文件产物大小：`dist-single/lens/index.html` = **1,475,600 字节**（≈1.41 MiB，gzip ≈ 304 KB）；
  多文件产物：`dist/assets` 508 KB + `dist/data` 944 KB + 两个 HTML 入口。

---

## 13. 仓库与联系信息

| 项 | 值 |
| --- | --- |
| 本地路径 | `D:\docs\01-my-website` |
| 目标远程 | `git@github.com:Chenwn1186/Chenwn1186.github.io.git` |
| 当前分支 | `main` |
| 现有提交 | `fe34da3` 初始化 → `2eafae3` CI base 路径改用 shell 判断 → `（本次）e2e + 交接文档` |
| 站点地址 | https://chenwn1186.github.io/ |
| 镜头工具 | https://chenwn1186.github.io/lens/ |
| 仓库归属 | GitHub `Chenwn1186` |
| 待补 | GitHub 仓库**尚未创建**，尚未添加 `origin` 远程 |

**目录里另外两份文档的分工**：

- `README.md` —— **开发者日常文档**：怎么跑、怎么加工具、图表踩坑速查。
- `部署指南.md` —— **GitHub Pages 部署手册**：额度、认证、建仓库、常见坑、日常维护。
- `HANDOFF.md`（本文）—— **交接总纲**：项目为什么这样设计、交了什么、还剩什么。

---

## 14. 接手清单（照着打勾即可）

1. [ ] `cd D:\docs\01-my-website && npm ci`
2. [ ] `npm run data`（**必做**，否则 `tsc` 会报 `TS2307`）
3. [ ] `npm run build` —— 确认 0 错误
4. [ ] 终端 1：`npm run preview -- --port 4173`
5. [ ] 终端 2：装好 playwright 后 `npm run e2e` —— **确认 49/49 通过**
6. [ ] 浏览器打开 `http://127.0.0.1:4173/` 与 `/lens/`，点一遍：筛选、排序、翻页、对比、抽屉、CSV、切主题
7. [ ] `npm run build:single` → 双击 `dist-single/lens/index.html` 确认离线可开
8. [ ] 读完第 5 节（主题）、第 9 节（坑）、第 8 节（二次开发）
9. [ ] 建仓库 → 推送 → 开启 Pages（Source = GitHub Actions）
10. [ ] 上线后按第 12.1 节验证两个 URL

有任何一步对不上，请先回到第 9 节对照排查——**大概率是那份清单里的某一条。**
