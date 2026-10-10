# 伟宁的工具箱

自研工具集合的门户站点。纯静态（无后端、无数据库），部署在 GitHub Pages 上，
主页把所有工具收成一张可搜索、可筛选的卡片墙，每个工具占一个子路径。

**线上地址**：https://chenwn1186.github.io
**仓库**：https://github.com/Chenwn1186/Chenwn1186.github.io

---

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 构建 | **Vite 8** | 底层是 Rolldown，构建秒级 |
| 框架 | **React 19 + TypeScript 7** | 严格模式，`noUnusedLocals` 等全部打开 |
| 样式 | **Tailwind CSS 4** | 用 `@theme inline` 接 CSS 变量，没有 `tailwind.config.js` |
| 图表 | **Chart.js 4** | 直接在 `useEffect` 里 `new Chart()`，不引 react-chartjs-2（要自己控制 `destroy`/兜底） |
| 数据 | 构建期 JSON + 运行时 `fetch` | 1,617 条镜头记录，0.92 MB |

页面只有两个入口，**没有客户端路由**（多页应用，不是 SPA）：

| 入口 | 源码 | 线上地址 |
| --- | --- | --- |
| 门户主页 | `index.html` → `src/main.tsx` | `/` |
| 镜头数据库 | `lens/index.html` → `src/lens.tsx` | `/lens/` |

---

## 快速开始

```bash
npm install
npm run dev        # 会先跑一次数据清洗，再启动开发服务器
```

其它命令：

```bash
npm run data          # 只跑数据清洗：scripts/lenses-source.json → public/data/lenses.json
npm run build         # 构建到 dist/      （部署用，多文件）
npm run preview       # 本地预览 dist/
npm run build:single  # 构建到 dist-single/（单文件，可离线双击打开）
npm run build:only    # 跳过类型检查，只构建（着急时用）
```

> `public/data/lenses.json` 与 `src/data/lenses-inline.ts` 都是**生成物**，已在
> `.gitignore` 里排除。`npm run build` / `npm run dev` 都会自动先生成它们，
> 所以你不需要手动跑 `npm run data`（除非只改了数据源想单独验证）。

---

## 目录结构

```
01-my-website/
├── index.html                  # 门户入口
├── lens/index.html             # 镜头工具入口
├── vite.config.ts              # 双模式构建 + MPA 双入口 + base 自动切换
├── tsconfig.json               # strict，路径别名 @/* → src/*
├── scripts/
│   ├── lenses-source.json      # 数据源（1.27 MB，入库）
│   └── prepare-data.mjs        # 清洗脚本
├── public/
│   ├── .nojekyll               # 必须存在，否则 GitHub Pages 会拿 Jekyll 处理
│   └── data/lenses.json        # 生成物（不入库）
└── src/
    ├── main.tsx                # 门户入口
    ├── lens.tsx                # 镜头工具入口
    ├── styles.css              # Tailwind 入口 + 语义色板 + 深色模式
    ├── shared/                 # 两个页面共用的东西
    │   ├── useTheme.ts         # 主题 hook + 主题 Context
    │   ├── lib/lens.ts         # 镜头类型、8 个评分维度、品牌中文名与配色、格式化
    │   ├── lib/chart.ts        # Chart.js 收口层（见下文「图表踩坑」）
    │   └── components/         # ChartBox / LensTip / ui.tsx（Chip、Btn、Tabs 等原子件）
    ├── portal/                 # 门户主页
    │   ├── tools.tsx           # ★ 工具清单——新增工具改这里
    │   ├── App.tsx
    │   └── components/ToolCard.tsx
    └── lens/                   # 镜头数据库
        ├── App.tsx             # 全部状态与动作
        ├── data.ts             # 数据加载（fetch 或内联）
        ├── filter.ts           # 筛选 / 排序纯函数
        ├── sections/           # 6 个区块，一区块一文件
        └── components/Drawer.tsx
```

---

## 新增一个工具

三步，其中第 3 步是模板要改的：

**1. 写页面。** 新建 `src/新工具/App.tsx`，再建入口 `src/新工具.tsx`：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { MyApp } from './新工具/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MyApp />
  </StrictMode>,
);
```

**2. 加入口 HTML。** 复制 `lens/index.html` 为 `新工具/index.html`，改 `<title>`、
`<meta name="description">` 与末尾的 `<script type="module" src="/src/新工具.tsx">`。
（深色防闪白的内联脚本请一并保留。）

**3. 在 `vite.config.ts` 的 `input` 里登记**，再往 `src/portal/tools.tsx` 的 `TOOLS` 数组加一项：

```tsx
{
  id: 'tools',                                  // 唯一标识
  name: '我的新工具',
  desc: '一句话说清它做什么，40–70 字最佳。',
  url: 'tools/',                                // 子目录工具写 "目录名/"，外链写完整 https
  icon: (<><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>),  // 24×24 视框 SVG
  tags: ['效率', '小工具'],
  meta: '2026-10 上线',
  tint: '#3FA46A',
  live: true,                                   // false → 显示「即将上线」
},
```

保存后主页会自动生成卡片、收集标签、纳入搜索 —— 不需要动其它代码。

> **图标**：随便找个开源图标集（Lucide / Tabler），复制 `<path>` 内容即可。
> 用 `stroke="currentColor"` 才能跟随深浅色主题变色。

---

## 数据流水线

`scripts/prepare-data.mjs` 把抓取来的原始数据整理成前端可直接加载的样子，做三件事：

1. **裁剪字段** —— 只留渲染用得到的 30 来个字段，1.27 MB → 0.92 MB
2. **清洗脏数据** —— 源站有 6 条记录的总分误用了百分制（最大 89.2），统一 `/10` 归一到 0–10
3. **规整类型** —— 最近对焦距离里混进了页面图标（如 `"5.0m 🔍 Max Magn"`），共清洗 968 条

产物有两份，内容完全一致，只是投递方式不同：

| 产物 | 用途 |
| --- | --- |
| `public/data/lenses.json` | 多文件构建时运行时 `fetch`（可缓存，首屏 JS 更小） |
| `src/data/lenses-inline.ts` | 单文件构建时 `import` 内联（`file://` 下 fetch 会被同源策略拦掉） |

后者刻意写成 `export const LENSES_JSON = "……"` 而不是直接导出数组 —— 直接导出会让
tsc 为 1,617 个对象逐个推导字面量类型，慢得离谱；包成字符串后类型只是 `string`。

---

## 图表踩坑（改图表前请先读这段）

Chart.js 有几个雷会让图表「整块变白但控制台不报错」，我们全踩过。
所有兜底都收口在 `src/shared/lib/chart.ts` 的 `renderChart()` 里，**不要在图表组件里各写一遍**。

| 雷 | 症状 | 对策 |
| --- | --- | --- |
| 数据点出现 `{x:null}` / `NaN` | 轴范围被污染 → `chartArea.height = 0` → 全白 | `sanitize()` 递归把非有限数变成 `null` |
| `pointRadius` 写成**数组** | scatter + 多数据集 + 上千点时 `_parsed` 长度错乱 → 全白 | scatter 一律用标量半径；实测 数组→areaH=0，标量→areaH=274 |
| `suggestedMin/Max` | 只是「建议」，Chart.js 仍会纳入数据极值 → 轴范围失控 | 用显式 `min` / `max` |
| 空数据集 | Chart.js 渲染成 0 高度白图 | `renderChart()` 自己画「本图无数据」占位文案 |
| 悬停不响应 | 默认要精确压住 3.4px 的点 | `interaction: { mode: 'nearest', intersect: false }` + `pointHitRadius` |
| `mode: 'index'` + `indexAxis: 'y'` | Chart.js 4.x 下索引算错，`els` 恒空 → 悬停全失效 | 横向条形图也用 `nearest` |
| 轴 `title` / 对数轴 | 撑大轴宽 → 只剩 `chartArea = 0` | 不设轴 title（说明写在卡片 h3），价格轴不用对数 |
| 动画 | 快速切筛选时留下半渲染状态 | `Chart.defaults.animation = false` |

另外两条**布局**上的经验（血泪，曾让整张数据表点不动）：

- `ChartCard` 只负责边框和内边距，**不包高度容器**；高度一律由 `ChartBox` 决定。
  两边各包一层会出现「外 300 / 内 520」的错配，内层溢出卡片、盖住下一个区块。
- 切换主题时，`<html>` 的 `dark` class 必须在**渲染期**同步写入（见 `useTheme.ts`）。
  React 的 effect 是子先父后，若等 effect 才加 class，子组件里的图表读到的永远是旧主题色。

---

## 主题系统

- 所有颜色走 CSS 变量（`src/styles.css` 的 `:root` / `.dark`），组件里只用 `bg-card`、`text-tx2`
  这类语义类名；切主题只改 `<html>` 的 class，颜色整体跟随。
- `@custom-variant dark (&:where(.dark, .dark *))` 把深色模式从「跟随系统」改成 class 驱动，
  这样才能手动切换。
- 首屏防闪白：两个 `index.html` 的 `<head>` 里都有一段内联脚本，在样式加载前就把
  `dark` class 打到 `<html>` 上。
- 图表颜色（网格、刻度、占位文字）由 `chart.ts` 里的 `CHART_THEME[theme]` 查表提供 ——
  刻意不用 `getComputedStyle` 读变量，因为那会踩到上面说的 effect 顺序问题。

---

## 部署

推到 GitHub 后由 Actions 自动构建并发布（`.github/workflows/deploy.yml`）。
详细步骤、认证方式与常见坑见 **[部署指南.md](部署指南.md)**。

需要手动部署时：

```bash
npm run build
# 然后把 dist/ 的内容推到 Pages 分支，或用 Actions 页面上的 Run workflow
```

### base 路径（换仓库时必看）

| 仓库形态 | 线上地址 | base |
| --- | --- | --- |
| 用户站：仓库名 = `<用户名>.github.io` | `https://<用户名>.github.io/` | `/` |
| 项目站：仓库名随便 | `https://<用户名>.github.io/<仓库名>/` | `/<仓库名>/` |

`vite.config.ts` 默认按「用户站」用 `/`；工作流里会自动判断并注入 `VITE_BASE`。
要手动覆盖：

```bash
VITE_BASE=/my-repo/ npm run build
```

---

## 两个构建版本的区别

| | `dist/`（多文件） | `dist-single/lens/index.html`（单文件） |
| --- | --- | --- |
| 用途 | 部署到 GitHub Pages | 存 U 盘 / 发微信 / 离线打开 |
| 数据 | 运行时 fetch `data/lenses.json` | 整个 JSON 内联进 HTML |
| 体积 | JS 489 KB（gzip 158 KB）+ 数据 944 KB | 一个 1.48 MB 的 HTML（gzip 304 KB） |
| 双击打开 | ✗ 会被 `file://` 同源策略拦掉 | ✓ 可用 |
| 含门户主页 | ✓ | ✗（单文件只打包镜头工具） |
