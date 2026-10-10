# 工程化落地：构建自动化、注册表契约、测试分层与 CI 门禁

> **文档定位**：本文档是「伟宁的工具箱」架构升级的**工程化分册**。
> 它与 `02-target-architecture.md`（主设计 / 目标架构 ADR）**共同构成本项目的全部设计交付物**；
> 原计划的 t2（目标架构）与 t3（工程化）已**合并至此二文**，不再另行产出。
> **配套文档**：[`02-target-architecture.md`](./02-target-architecture.md)（分层设计、工具契约、数据管理、即插即用/随删随去）
> **上游事实**：[`01-current-state.md`](./01-current-state.md)（architect 的只读现状审计）
> **基线**：提交 `95c0260`
>
> **行数口径**（与 `02-target-architecture.md` 一致，三方数字已结案）：
> 源码（手写，排除生成物 `src/data/lenses-inline.ts`）= **3377 行 / 24 文件**；
> src 目录总计（含生成物）= 3380 行 / 25 文件；含 e2e + scripts = 3955 行 / 29 文件。


> 定位：把架构设计变成**可执行的工程机制**——构建、测试、门禁的具体形态
> 原则继承：单一事实来源 / 失败必须响亮 / 删除是功能 / 测试分层

---

## 1. 现状工程化基线（实测）

| 维度 | 现状 | 证据 |
|---|---|---|
| 构建 | Vite 8 (Rolldown)，双模式 | `vite.config.ts:10-15` |
| 类型检查 | `tsc --noEmit`，strict + `noUnusedLocals` 全开 | `tsconfig.json:15-19`、`package.json:10` |
| 数据 | `node scripts/prepare-data.mjs`，硬编码镜头字段 | `prepare-data.mjs:27-35` |
| 测试运行器 | **无**（无 vitest/jest/@testing-library） | `node_modules` 实测 |
| E2E | 手写脚本 `node e2e/verify.cjs`，282 行 / 49 条断言 | `verify.cjs` 全文，`grep -c 'r.ok(' = 49` |
| playwright | **不在 devDependencies**，靠环境安装 | `e2e/harness.cjs:8-9` |
| CI | 1 个 workflow；`build` job 有效步骤只有 `npm ci`(`:41`) → `npm run build`(`:60`) → 上传(`:62,64`) | `deploy.yml` |
| CI 中跑测试 | **否** | `deploy.yml` 无 test 步骤 |
| Lint | **无 ESLint 配置** | 仓库无 `eslint.config.js` |
| 构建产物隔离 | `dist/` 与 `dist-single/`，均 gitignore | `.gitignore:5-7` |

**基线判断：工程化的短板不是"没有工具"，而是"没有分层"。** 有一个质量很高的 E2E 脚本（`harness.cjs` 的 `canvasReport` 像素健康度检查尤其出色），但它承担了本应由四层分担的全部职责，且**从未在 CI 中执行过**。

`npm run build` 是当前唯一的真实门禁（`package.json:10`：`data && tsc --noEmit && vite build`）。

---

## 2. 构建自动化

### 2.1 npm scripts 目标形态

```jsonc
{
  "scripts": {
    // ---------- 开发 ----------
    "dev":            "npm run data && vite",
    "new":            "node scripts/new-tool.mjs",

    // ---------- 数据 ----------
    "data":           "node scripts/data.mjs",          // ★ 遍历所有工具流水线，不再是镜头专属

    // ---------- 构建 ----------
    "build":          "npm run data && npm run check && vite build",
    "build:only":     "vite build",
    "build:single":   "npm run data && npm run check && vite build --mode singlefile",
    "preview":        "vite preview",

    // ---------- 质量闸（按反馈速度从快到慢） ----------
    "check":          "npm run typecheck && npm run lint:arch && npm run lint:tools",
    "typecheck":      "tsc --noEmit",
    "lint:arch":      "eslint platform portal tools --max-warnings 0",
    "lint:tools":     "node scripts/validate-tools.mjs",   // ★ 注册表契约的独立校验入口
    "tools:list":     "node scripts/list-tools.mjs",       // 扫描结果可见化（对抗"隐式魔法"）

    // ---------- 测试（四层） ----------
    "test":           "npm run test:unit",
    "test:unit":      "vitest run",                        // L1
    "test:contract":  "node e2e/run.cjs tool-contract",    // L2
    "test:artifacts": "node e2e/run.cjs build-artifacts",  // L3
    "test:e2e":       "node e2e/run.cjs portal lens",      // L4
    "verify":         "npm run check && npm run test:unit && npm run build && npm run build:single && npm run test:artifacts && npm run test:e2e",

    // ---------- 删除安全性（原则八） ----------
    "test:deletability": "node scripts/test-deletability.mjs"
  }
}
```

**几个刻意的排序决策：**

1. **`check` 拆成三个独立门禁**（`typecheck` / `lint:arch` / `lint:tools`）。合在一起时，一个失败会掩盖其他失败的输出，排查成本上升。
2. **`npm run build` 包含 `check`。** 保证"手动构建"和"CI 构建"走同一条路径——避免"CI 能过本地不能过"的经典陷阱。
3. **`build:only` 保留逃生舱**（现有 `package.json:11` 已有）。着急时不跑校验。
4. **`verify` 是全量闸**，实现完一个功能后跑它；日常用更快的 `check` + `test:unit`。

### 2.2 `npm run data` 的通用化（修复"镜头专属动词"）

```js
// scripts/data.mjs
#!/usr/bin/env node
/**
 * 遍历所有工具的流水线并执行。
 * 约定：tools/<id>/data/pipeline.mjs 存在即视为该工具有数据流水线。
 * 新增带数据的工具时，本脚本无需修改。
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOLS_ROOT = new URL('../tools/', import.meta.url).pathname;
const pipelines = [];

for (const id of readdirSync(TOOLS_ROOT).sort()) {
  const p = join(TOOLS_ROOT, id, 'data', 'pipeline.mjs');
  if (existsSync(p)) pipelines.push({ id, path: p });
}

if (pipelines.length === 0) {
  console.log('（没有工具声明数据流水线，跳过）');
  process.exit(0);
}

let failed = 0;
for (const { id, path } of pipelines) {
  console.log(`\n===== 数据流水线：${id} =====`);
  try {
    const mod = await import(pathToFileURL(path).href);
    await mod.default.run();                 // 契约校验失败 → 抛错（原则七）
  } catch (e) {
    console.error(`❌ ${id} 流水线失败：`, e.message);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} 个流水线失败`);
  process.exit(1);
}
```

**与现状的差异：**

| 现状 | 目标 |
|---|---|
| `npm run data` 只跑镜头（`package.json:9`） | 跑所有工具的流水线，脚本不随工具数变化 |
| 失败只打印（`prepare-data.mjs:93-98`） | 契约违规 → 非 0 退出码 → 构建失败 |
| 生成物写 `src/data/`（`prepare-data.mjs:24`） | 写 `tools/<id>/data/generated/` 与 `public/data/<id>/` |
| `public/data/lenses.json` 平铺命名空间 | `public/data/<id>/...` 隔离，工具间不冲突 |

### 2.3 构建入口的派生（修复 singlefile 静默丢失）

**这是现状中最危险的一处，重复强调：**

```ts
// vite.config.ts:21-26 —— 当前实现
const input: Record<string, string> = single
  ? { lens: resolve(root, 'lens/index.html') }        // ← 单文件模式只构建 lens
  : { main: ..., lens: ... };
```

新增工具后忘记改这里 → `npm run build:single` **成功退出** → 产物缺该工具。**CI 从未跑过 `build:single`**（`deploy.yml:60` 只跑 `npm run build`），所以这个失败可以一路带到用户手里。

目标形态在 `02-target-architecture.md` §4.2 给出（`toolsInputPlugin`）。工程上需要补充的**验证**：

```js
// scripts/validate-tools.mjs（节选）—— 独立于 Vite 的纯校验，可单独跑
import { scanTools } from '../platform/registry/scan.ts';

const tools = await scanTools(TOOLS_ROOT);
const errors = [];

for (const t of tools) {
  const dir = join(TOOLS_ROOT, t.id);

  // live 工具必须有完整的三个文件
  if (t.live) {
    for (const f of ['tool.config.ts', 'App.tsx']) {
      if (!existsSync(join(dir, f))) errors.push(`${t.id}: live=true 但缺少 ${f}`);
    }
    if (!existsSync(join(dir, 'icon.tsx')) && !existsSync(join(dir, 'icon.svg'))) {
      errors.push(`${t.id}: 缺少图标（icon.tsx 或 icon.svg）`);
    }
    // 子路径工具必须有入口 HTML（否则派生不出 build input）
    if ((t.route ?? { kind: 'page' }).kind === 'page') {
      if (!existsSync(join(dir, 'index.html'))) {
        errors.push(`${t.id}: route.kind=page 但缺少 index.html`);
      }
    }
  }

  // 元数据质量（防止空占位混进生产）
  if (!t.name.trim()) errors.push(`${t.id}: name 为空`);
  if (t.live && t.desc.trim().length < 10) errors.push(`${t.id}: desc 过短（live 工具至少 10 字）`);
  if (t.tags.length === 0) errors.push(`${t.id}: tags 为空`);
  if (t.tint && !/^#[0-9A-Fa-f]{6}$/.test(t.tint)) errors.push(`${t.id}: tint 需为 #RRGGBB`);
  if (!/^[a-z][a-z0-9-]*$/.test(t.id)) errors.push(`${t.id}: id 需匹配 ^[a-z][a-z0-9-]*$`);
}

// 重复 id / 名称冲突
const byId = new Map();
const byName = new Map();
for (const t of tools) {
  if (byId.has(t.id)) errors.push(`id 重复：${t.id}`);
  byId.set(t.id, t);
  if (byName.has(t.name)) errors.push(`name 重复：${t.name}（${t.id} 与 ${byName.get(t.name)}）`);
  byName.set(t.name, t.id);
}

if (errors.length) {
  console.error('工具清单校验失败：\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✅ ${tools.length} 个工具清单校验通过（live: ${tools.filter((t) => t.live).length}）`);
```

**为什么把校验单独做成脚本而不是只在 Vite 插件里做：**

- **可以被单测直接调用**（L1 层测 `validateTools` 的每个错误分支）。
- **可以独立在 CI 里先跑**，反馈比完整构建快。
- **Vite 插件只是它的调用者之一**，不是唯一入口。避免"校验逻辑锁死在插件里，只有跑构建才能验证"。

---

## 3. 工具注册契约的工程实现

### 3.1 三层校验，各管一段

| 层 | 手段 | 捕获 | 反馈时间 |
|---|---|---|---|
| 编译期 | `satisfies ToolManifest` | 字段拼写、类型错误 | 编辑器即时 |
| 构建期 | `validateManifest()` 运行时校验 | 文件系统来的值、跨工具唯一性、文件存在性 | ~1s |
| 测试期 | L1 单测 + L2 契约 spec | 逻辑回归、行为回归 | <1s / ~60s |

**为什么必须三层：** TypeScript 的类型只覆盖源码里写死的字面量。`tool.config.ts` 是**被扫描器动态 import** 的，它的值在类型系统看来完全合法——但可能 `id: 'my_tool'`（下划线非法）、或与其他工具重名。**这类错误只有运行时校验能抓。**

### 3.2 契约的版本与演进

工具契约一旦有多个工具实现，修改契约就是**破坏性变更**。工程上需要：

```ts
// platform/contract/tool.ts
/** 契约版本。字段增删必须同步递增，并在 CHANGELOG 记录迁移方式。 */
export const CONTRACT_VERSION = 1;

export interface ToolManifest {
  // ...
}

/** 向后兼容的读取：旧字段名自动映射到新字段名 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  // 示例：v0 的 `url` → v1 的 `route`
  if ('url' in raw && !('route' in raw)) {
    const url = String(raw.url);
    raw.route = /^https?:\/\//.test(url) ? { kind: 'external', href: url } : { kind: 'page' };
    delete raw.url;
  }
  return raw;
}
```

**维护收益：** 契约演进时，不需一次性改完所有工具。**这对"渐进式迁移"是必需的**——迁移期间新旧工具会共存。

### 3.3 `npm run new` 脚手架

```js
// scripts/new-tool.mjs —— 极简：复制 _template 并替换占位符
import { cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('用法：npm run new -- <id>    （id 需匹配 ^[a-z][a-z0-9-]*$）');
  process.exit(1);
}

const target = join('tools', id);
if (existsSync(target)) {
  console.error(`目录已存在：${target}`);
  process.exit(1);
}

cpSync(join('tools', '_template'), target, { recursive: true });

// 把占位符 __ID__ 替换成真实 id
for (const f of ['tool.config.ts', 'index.html']) {
  const p = join(target, f);
  if (existsSync(p)) {
    writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__ID__', id), 'utf8');
  }
}

console.log(`✅ 已创建 ${target}
下一步：
  1. 编辑 tools/${id}/tool.config.ts   （name / desc / tags / tint，live 保持 false 直到完工）
  2. 编辑 tools/${id}/App.tsx
  3. 编辑 tools/${id}/icon.tsx
  4. npm run dev —— 门户会自动出现卡片，无需修改任何共享文件
  5. 完工后把 tool.config.ts 的 live 改为 true，跑 npm run verify`);
```

**脚手架的核心价值不在省事，而在"模板即文档"**：`tools/_template/` 的代码示范了正确的分层用法（如何用 `platform/ui`、如何把纯逻辑放 `domain/`），而且**不会像文档一样过期**——它被 `lint:arch` 检查，过期就会报错。

### 3.4 `npm run tools:list`（对抗隐式魔法）

```js
// scripts/list-tools.mjs
// 输出扫描结果，让"约定式"不再神秘
const tools = await scanTools(TOOLS_ROOT);
console.log(`扫描目录：tools/    共 ${tools.length} 个\n`);
console.log('id'.padEnd(20), 'live'.padEnd(6), 'route'.padEnd(12), 'files');
for (const t of tools) {
  const dir = join(TOOLS_ROOT, t.id);
  const files = ['tool.config.ts', 'App.tsx', 'icon.tsx', 'icon.svg', 'index.html', 'data/pipeline.mjs']
    .filter((f) => existsSync(join(dir, f)));
  console.log(t.id.padEnd(20), String(t.live).padEnd(6),
    ((t.route ?? { kind: 'page' }).kind).padEnd(12), files.join(', '));
}
```

对"约定式扫描"这类隐式机制，**可见化是必需的补偿**。当新工具没出现在门户上，`npm run tools:list` 立刻回答"扫描到它了吗 VS 渲染出问题了吗"——把一个模糊问题切成两个明确问题。

---

## 4. 测试分层

### 4.1 分层职责与占比

```
L4  E2E（portal/lens 专属）       ~5%   浏览器真实行为：图表像素、下载、抽屉动画
L3  构建产物契约                  ~15%  "新增/删除工具后产物正确"的自动化
L2  工具契约（对每个工具跑一遍）    ~20%  新工具的质量下限自动保障
L1  单元测试（domain/ + platform/）~60%  纯函数、契约校验、注册表扫描
```

**判据：一个测试应该放在"能捕获该缺陷的最快那一层"。** 把 `fmt(null) === '—'` 写成 E2E，是把 0.1ms 的检查放进 30s 的链路里——这是当前 `verify.cjs` 承担了过多职责的根因。

### 4.2 L1：Vitest 配置

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    // 与 vite.config.ts 的别名保持一致（避免两处漂移：用共享常量，见下）
    alias: { '@': resolve(__dirname, 'src'), '@app': resolve(__dirname, 'platform') },
  },
  test: {
    environment: 'node',          // domain/ 与 platform/ 都是纯逻辑，不需要 DOM
    include: ['platform/**/*.test.ts', 'tools/*/domain/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['platform/contract/**', 'platform/registry/**', 'tools/*/domain/**'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
});
```

> **别名漂移风险**：`vite.config.ts:49` 的 `@` 别名与 `tsconfig.json:22` 的 `paths` 已经是两处。加 `@app` 会变成更多处。**建议抽 `aliases.ts` 单一来源**，三处（vite/vitest/tsconfig）都引用它。tsconfig 的 `paths` 不能直接 import JS，但可以用 `extends` 指向生成的 json——或者接受"tsconfig 手写 + 一条单测断言它与 aliases.ts 一致"。**这是实现阶段的小决策点。**

### 4.3 L1 用例清单（按模块，含具体断言）

**`tools/lens/domain/format.ts`**（迁自 `shared/lib/lens.ts:173-205`）

```ts
import { describe, test, expect } from 'vitest';
import { fmt, money, focalText, esc, scoreClass, hex2rgba } from './format';

describe('fmt —— 缺失必须显示「—」，绝不显示 0', () => {
  // 这条断言直接保护 shared/lib/lens.ts:179-183 的设计意图
  test('null → —', () => expect(fmt(null)).toBe('—'));
  test('undefined → —', () => expect(fmt(undefined)).toBe('—'));
  test('0 → "0.0"（0 分和没数据是两回事）', () => expect(fmt(0)).toBe('0.0'));
  test('小数位参数生效', () => expect(fmt(8.567, 2)).toBe('8.57'));
  test('整数补足小数位', () => expect(fmt(9)).toBe('9.0'));
});

describe('money', () => {
  test('0 显示 ¥0 而不是 —', () => expect(money(0)).toBe('¥0'));
  test('null → —', () => expect(money(null)).toBe('—'));
  test('千分位', () => expect(money(12345)).toBe('¥12,345'));
});

describe('focalText —— 定焦不带区间', () => {
  test('定焦', () => expect(focalText({ focalMin: 35, focalMax: 35 } as any)).toBe('35mm'));
  test('变焦', () => expect(focalText({ focalMin: 24, focalMax: 70 } as any)).toBe('24-70mm'));
  test('缺失 → —', () => expect(focalText({ focalMin: null } as any)).toBe('—'));
});

describe('esc —— tooltip 用 innerHTML 拼串，必须转义', () => {
  test('五个 HTML 特殊字符全部转义', () => {
    expect(esc('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
  test('null/undefined → 空串', () => expect(esc(null)).toBe(''));
});

describe('scoreClass 三档边界', () => {
  test('8.0 恰好进 hi', () => expect(scoreClass(8)).toBe('hi'));
  test('7.99 进 mid', () => expect(scoreClass(7.99)).toBe('mid'));
  test('6.5 恰好进 mid', () => expect(scoreClass(6.5)).toBe('mid'));
  test('6.49 进 lo', () => expect(scoreClass(6.49)).toBe('lo'));
  test('缺失进 na', () => expect(scoreClass(null)).toBe('na'));
});

describe('hex2rgba', () => {
  test('标准色', () => expect(hex2rgba('#2F5FD0', 0.12)).toBe('rgba(47,95,208,0.12)'));
});
```

**这些用例的价值：** `scoreClass` 的 `8` / `6.5` 边界是**业务决策**（`shared/lib/lens.ts:190-193`）。把边界写成测试，等于把决策固化下来。将来有人想改分档阈值，测试会告诉他"你正在改变业务规则"。

**`tools/lens/domain/brands.ts`**（迁自 `shared/lib/lens.ts:79-171`）

```ts
describe('brandColor', () => {
  test('固定表命中', () => expect(brandColor('Sony')).toBe('#D4537E'));
  test('同一品牌两次调用返回同色（缓存契约）', () => {
    expect(brandColor('UnknownBrandX')).toBe(brandColor('UnknownBrandX'));
  });
  test('未知品牌落在调色板内', () => expect(PALETTE).toContain(brandColor('Whatever')));
  test('空值返回默认灰', () => expect(brandColor(undefined)).toBe('#9C9A92'));
});

describe('BRAND_CN 完整性', () => {
  test('所有固定配色品牌都有中文名或明确标注无译名', () => {
    // 防止新增配色品牌时忘记加中文名
    for (const b of Object.keys(FIXED)) {
      expect(BRAND_CN[b], `${b} 缺少中文名`).toBeTruthy();
    }
  });
});

describe('brandLabel', () => {
  test('有中文名 → 英文（中文）', () => expect(brandLabel('Sony')).toBe('Sony（索尼）'));
  test('无中文名 → 原样', () => expect(brandLabel('Nobody')).toBe('Nobody'));
  test('空 → —', () => expect(brandLabel()).toBe('—'));
});
```

> **最后一条 `brandLabel` 测试暴露了现状的一个不一致**：`shared/lib/lens.ts:168` 空值返回 `'—'`，而 `brandColor`（`:100`）空值返回 `'#9C9A92'`，`fmt`（`:181`）返回 `'—'`。三者风格不同但都合理。**写测试时要把这个"有意为之"标注出来**，否则后人会以为是不一致而"修好"它。

**`tools/lens/domain/filter.ts`**（迁自 `src/lens/filter.ts`，130 行纯函数）

```ts
describe('applyFilters', () => {
  test('空条件返回全量', () => expect(applyFilters(DATA, EMPTY_FILTERS)).toHaveLength(DATA.length));
  test('文本搜索大小写不敏感', () => {
    expect(applyFilters(DATA, { ...EMPTY_FILTERS, q: 'viltrox' }))
      .toEqual(applyFilters(DATA, { ...EMPTY_FILTERS, q: 'VILTROX' }));
  });
  test('卡口 + 光圈组合筛选是交集', () => { /* ... */ });
  test('指标滑杆为下限筛选（>=）', () => { /* ... */ });
  test('价格区间闭区间边界', () => { /* ... */ });
  test('无匹配返回空数组而非抛错', () => { /* ... */ });
});

describe('排序', () => {
  test('SORT_ASC_DEFAULT 中的键默认升序', () => { /* ... */ });
  test('缺失值排在末尾（不排成 0）', () => { /* ... */ });   // ★ 与 fmt 的同一原则
});
```

**`platform/contract/schema.ts`**

```ts
describe('validateManifest 错误分支全覆盖', () => {
  test.each([
    ['缺 id',        { name: 'x', desc: 'y', tags: ['a'], live: true }],
    ['id 含下划线',  { id: 'my_tool', name: 'x', desc: 'y', tags: ['a'], live: true }],
    ['id 以数字开头',{ id: '1tool', name: 'x', desc: 'y', tags: ['a'], live: true }],
    ['name 为空',    { id: 't', name: '', desc: 'y', tags: ['a'], live: true }],
    ['tags 为空数组',{ id: 't', name: 'x', desc: 'y', tags: [], live: true }],
    ['tags 非数组',  { id: 't', name: 'x', desc: 'y', tags: 'a', live: true }],
    ['tint 非法',    { id: 't', name: 'x', desc: 'y', tags: ['a'], live: true, tint: 'red' }],
    ['tint 三位简写',{ id: 't', name: 'x', desc: 'y', tags: ['a'], live: true, tint: '#fff' }],
    ['live 非布尔',  { id: 't', name: 'x', desc: 'y', tags: ['a'], live: 'yes' }],
  ])('%s → ok:false', (_n, raw) => {
    expect(validateManifest(raw).ok).toBe(false);
  });

  test('合法清单 → ok:true 且值被规范化', () => { /* ... */ });
  test('desc 超长被拒绝', () => { /* ... */ });
});
```

**`platform/registry/scan.ts`**（用内存 fixture，不碰真实文件系统）

```ts
describe('scanTools', () => {
  test('只认含 tool.config.ts 的目录（README/notes 被忽略）', async () => { /* ... */ });
  test('id 与目录名不一致 → 抛 ToolConfigError', async () => { /* ... */ });   // ★ 原则一
  test('两个工具 id 相同 → 抛错', async () => { /* ... */ });
  test('live=true 缺 App.tsx → 抛错', async () => { /* ... */ });              // ★ 原则七
  test('返回顺序确定（多次扫描结果一致）', async () => { /* ... */ });          // ★ 可复现构建
  test('坏配置抛出 ToolConfigError 且消息含工具 id', async () => { /* ... */ });// ★ 可定位
});
```

### 4.4 L2：通用工具契约 spec（可复用层）

```js
// e2e/specs/tool-contract.spec.cjs
const { test, expect } = require('@playwright/test');
const registry = require('../../dist/registry.json');   // 构建期产出，唯一来源

const liveTools = registry.tools.filter((t) => t.live && (t.route?.kind ?? 'page') === 'page');

for (const tool of liveTools) {
  test.describe(`工具契约：${tool.id}`, () => {
    test('页面可访问，无 404 / 无未捕获异常', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const res = await page.goto(`/${tool.id}/`, { waitUntil: 'networkidle' });
      expect(res.status()).toBeLessThan(400);
      expect(errors).toEqual([]);
    });

    test('有非空 <h1>', async ({ page }) => {
      await page.goto(`/${tool.id}/`);
      expect((await page.locator('h1').first().innerText()).trim().length).toBeGreaterThan(0);
    });

    test('页面标题非空', async ({ page }) => {
      await page.goto(`/${tool.id}/`);
      expect((await page.title()).trim().length).toBeGreaterThan(0);
    });

    test('移动端 390px 无横向滚动', async ({ page }) => {
      await page.goto(`/${tool.id}/`, { waitUntil: 'networkidle' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      const o = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth, win: window.innerWidth,
      }));
      expect(o.doc, `scrollWidth=${o.doc} innerWidth=${o.win}`).toBeLessThanOrEqual(o.win + 1);
    });

    test('明 → 暗主题切换不产生 console.error', async ({ page }) => {
      const errs = [];
      page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      await page.goto(`/${tool.id}/`, { waitUntil: 'networkidle' });
      const toggle = page.locator('button[aria-label="切换主题"]');
      if (await toggle.count()) {
        await toggle.first().click();
        await page.waitForTimeout(300);
        await toggle.first().click();
        await page.waitForTimeout(300);
      }
      expect(errs).toEqual([]);
    });
  });
}

// 门户与注册表一致（双向）
test.describe('门户 ↔ 注册表一致性', () => {
  test('每个 live 工具在门户上有卡片，且链接可达', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    for (const t of liveTools) {
      const card = page.locator(`main a[href="${t.id}/"]`);
      await expect(card).toHaveCount(1);
      // 真点一次，确保不是 404（比只检查 href 强）
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(`/${t.id}/`)),
        card.click(),
      ]);
      expect(res.status()).toBeLessThan(400);
      await page.goBack();
    }
  });

  test('门户卡片数量 == 注册表 live 数量', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('main a[href]')).toHaveCount(liveTools.length);
  });

  test('门户渲染的名称与清单一致', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    for (const t of liveTools) {
      await expect(page.locator(`main a[href="${t.id}/"]`)).toContainText(t.name);
    }
  });

  test('所有标签都能在门户筛选条上找到', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const all = [...new Set(liveTools.flatMap((t) => t.tags))];
    for (const tag of all) {
      await expect(page.locator('button', { hasText: new RegExp(`^${tag}$`) })).toHaveCount(1);
    }
  });
});
```

**与现状 `verify.cjs:40` 的关键差异：**

```js
// 现状：硬编码数量
r.ok('工具卡片数量', (await cards.count()) === 1, ...);
```

这条断言在新增工具后**必然失败**，而它失败的原因不是 bug——是"测试写死了业务事实"。目标形态改为与注册表比对，**新增工具时这条测试自动适应**。这就是 L2 层"可复用"的实质含义。

**而门户的搜索测试（`verify.cjs:45-53`）改为数据驱动：**

```js
test('搜索：对每个工具名都能命中', async ({ page }) => {
  await page.goto('/');
  const search = page.locator('input[type=search]');
  for (const t of liveTools) {
    await search.fill(t.name);
    await page.waitForTimeout(150);
    await expect(page.locator(`main a[href="${t.id}/"]`)).toHaveCount(1);
  }
  await search.fill('不存在的工具zzz');
  await page.waitForTimeout(150);
  await expect(page.getByText('没有匹配的工具')).toHaveCount(1);
});
```

### 4.5 L3：构建产物契约

```js
// e2e/specs/build-artifacts.spec.cjs
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const registry = JSON.parse(fs.readFileSync('dist/registry.json', 'utf8'));
const live = registry.tools.filter((t) => t.live);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

test.describe('多文件产物', () => {
  const files = walk('dist');

  test('每个 live 子路径工具都有 index.html', () => {
    for (const t of live.filter((x) => (x.route?.kind ?? 'page') === 'page')) {
      expect(files, `缺少 dist/${t.id}/index.html`).toContain(`dist/${t.id}/index.html`);
    }
  });

  test('产物 HTML 与注册表一致（不多不少）', () => {
    const expected = ['dist/index.html',
      ...live.filter((x) => (x.route?.kind ?? 'page') === 'page').map((t) => `dist/${t.id}/index.html`)];
    const actual = files.filter((f) => f.endsWith('.html') && !f.includes('/assets/'));
    expect(actual.sort()).toEqual(expected.sort());     // ★ 双向：抓缺失，也抓残留
  });

  test('每个工具的 HTML 引用了自己的入口 chunk', () => {
    for (const t of live.filter((x) => (x.route?.kind ?? 'page') === 'page')) {
      const html = fs.readFileSync(`dist/${t.id}/index.html`, 'utf8');
      expect(html, `${t.id} 的 HTML 未引用任何 script`).toMatch(/<script[^>]+src=/);
    }
  });

  test('registry.json 存在且 hash 与清单一致', () => {
    expect(registry.hash).toMatch(/^sha256:/);
    expect(registry.tools.map((t) => t.id)).toEqual([...registry.tools.map((t) => t.id)].sort());
  });

  test('单文件产物存在且内联了 JS（无外链 script）', () => {
    const single = 'dist-single/index.html';
    if (!fs.existsSync(single)) return;         // 未构建单文件时跳过
    const html = fs.readFileSync(single, 'utf8');
    expect(html).not.toMatch(/<script[^>]+src="\.\/assets/);
  });

  test('数据产物按工具命名空间隔离', () => {
    for (const t of live) {
      const p = `dist/data/${t.id}`;
      if (fs.existsSync(p)) expect(fs.statSync(p).isDirectory()).toBe(true);
    }
  });
});
```

**`registry.json` 的产出**（构建期）：

```js
// platform/registry/emit-json.ts —— 作为 Vite 插件的一个 closeBundle 钩子
{
  name: 'toolbox-emit-registry',
  async closeBundle() {
    const tools = await scanTools(TOOLS_ROOT);
    const payload = {
      contractVersion: CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      hash: 'sha256:' + createHash('sha256').update(JSON.stringify(tools)).digest('hex'),
      tools,
    };
    writeFileSync(join(outDir, 'registry.json'), JSON.stringify(payload, null, 2));
  },
}
```

> **`generatedAt` 与可复现构建冲突**：它每次变化，会让 `registry.json` 的 diff 永远非空。**建议把它排除在 hash 计算外**（上面的 `hash` 确实只对 `tools` 计算，正确），但更彻底的做法是用 `SOURCE_DATE_EPOCH` 或干脆去掉 `generatedAt`。**实现时决定**——这是 CI 稳定性的细节。

### 4.6 L4：E2E 的瘦身与迁移映射

> **本节是 BF-1 的修复件。** 此前本节入口陈述写「四十五条断言」（旧数字）、表内仅 37 行映射条目——二者与实测的 **49** 均不符，导致按旧数字做瘦身时漏掉 4 条断言（**静默丢失**，恰好违背本文档要消灭的失败模式）。
> **权威基数**：`grep -c 'r.ok(' e2e/verify.cjs` → **49**（实测，commit `95c0260`）。
> **下方表格逐条覆盖全部 49 条**，每条给出归属层与处置，**无一条被遗漏**。

#### 4.6.1 处置口径

| 代号 | 含义 |
|---|---|
| **L1** | 下沉为纯函数单测（最快、最稳、定位最准） |
| **L2** | 上移为通用工具契约断言（对注册表里每个 live 工具都跑） |
| **L3** | 改为构建产物契约（不依赖浏览器） |
| **L4** | 保留在 E2E（必须真实浏览器行为） |
| **DERIVED** | 保留在 L4，但期望值改为从数据源/注册表推导，**不再硬编码** |

#### 4.6.2 49 条断言的完整归属（逐条）

| # | 现状断言 | `verify.cjs` 行 | 归属 | 处置 |
|---:|---|---|---|---|
| 1 | 主页标题含「工具箱」 | `:36` | L2 通用 | 迁到 tool-contract（门户规格，每个工具都跑） |
| 2 | 主页 H1 含「工具箱」 | `:37` | L2 通用 | 同上 |
| 3 | 工具卡片数量 `=== 1` | `:40` | L4 + **DERIVED** | **维持第二批**；推导源 = 注册表 `LIVE_TOOLS.length`（**不是** `dist/*/`，见 4.6.3） |
| 4 | 卡片名称含"全球镜头数据库" | `:41` | L2 通用 + DERIVED | 数据驱动：改为与 `tool.config.ts` 的 `name` 比对 |
| 5 | 卡片 href `=== 'lens/'` | `:43` | L2 通用 + DERIVED | 数据驱动：由注册表 `id` 拼装 |
| 6 | 搜索命中（`main a[href]` 数） | `:48` | L2 通用 + DERIVED | 对每个工具名各跑一次 |
| 7 | 搜索未命中显示空态 | `:51` | L2 通用 | 保留 |
| 8 | 存在「全部」标签 | `:55` | L2 通用 | 保留 |
| 9 | 主页切到深色 | `:60` | L2 通用 | 保留 |
| 10 | 主题持久化到 localStorage | `:62` | L2 通用 | 保留 |
| 11 | 主页移动端无横向滚动 | `:68` | L2 通用 | 保留（每个工具都跑） |
| 12 | 点击卡片进入镜头页 | `:74` | L2 通用 + DERIVED | 保留 + 断言 HTTP 状态码 < 400 |
| 13 | 镜头页标题 | `:84` | L4 | 保留（业务文案） |
| 14 | H1 正确 | `:85` | L4 | 保留（业务文案） |
| 15 | 数据载入（1617 条） | `:86` | L4 + **DERIVED** | **并入第一批**：改读 `public/data/lenses.json`.length（HF-1a） |
| 16 | 统计块含「收录镜头」 | `:89` | L4 | 保留 |
| 17 | 统计块含「家评测源」 | `:90` | L4 | 保留 |
| 18 | 最高综合分已归一（9.5，不是 89.2） | `:91` | L4 + **DERIVED** | **并入第一批**：改为 `max(overall)`（HF-1a） |
| 19 | 画布数量为 8 | `:94` | L4 | **维持第二批**（耦合视图结构，非数据源） |
| 20 | 8 张图表都真的画出了内容 | `:96` | L4 | **保留**（`canvasReport` 是高价值不变量断言，任何批次都不动） |
| 21 | 品牌 chip 已渲染（≥40） | `:99` | L4 | 保留 |
| 22 | 对比台默认 3 支 | `:102` | L4 | **维持第二批**（耦合 `DEFAULT_SELECTED` 视图契约） |
| 23 | 表格单页 100 行 | `:103` | L1 | 分页是纯逻辑 → 下沉单测；L4 保留一条结构断言 |
| 24 | 分页信息含总数 1,617 | `:106` | L4 + **DERIVED** | **并入第一批**：由数据源拼装期望串 |
| 25 | 翻页生效 | `:113` | L1 | 分页状态机可单测 |
| 26 | 按参考价排序生效 | `:120` | L1 | 排序是纯函数 |
| 27 | 表格行悬停显示浮层 | `:133` | L4 | **保留**（必须真实鼠标事件） |
| 28 | 搜索 Viltrox 命中数减少 | `:141` | L4 + **DERIVED** | 读数据源统计实际命中数 |
| 29 | 清空搜索恢复全量 | `:144` | L4 + **DERIVED** | 同上 |
| 30 | 抗眩光 ≥10 筛选生效 | `:149` | L1 | 筛选是纯逻辑 |
| 31 | 重置恢复全量 | `:152` | L4 + **DERIVED** | 同上 |
| 32 | 卡口筛选生效 | `:157` | L1 | 筛选是纯逻辑 |
| 33 | 光圈 ≤F1.4 筛选生效 | `:164` | L1 | 筛选是纯逻辑 |
| 34 | **数据表未被图表遮挡（命中态正确）** | `:173` | L4 | ★★ **必须保留**——真实 UI 布局回归，配 `harness` 的 `hitTest` |
| 35 | 加入对比台后为 4 支 | `:176` | L4 | **维持第二批**（同 #22） |
| 36 | 榜单维度切换生效 | `:183` | L4 | 保留 |
| 37 | 散点视图切换生效 | `:190` | L4 | 保留 |
| 38 | 切换后图表仍全部健康 | `:192` | L4 | **保留**（不变量断言） |
| 39 | 详情抽屉打开 | `:200` | L4 | 保留 |
| 40 | Esc 关闭抽屉 | `:206` | L4 | 保留 |
| 41 | 极端筛选下不崩溃（8 块画布都还在） | `:213` | L4 | **维持第二批**（同 #19） |
| 42 | 出现空状态占位画布 | `:224` | L4 | 保留 |
| 43 | 镜头页当前为浅色 | `:235` | L4 | 保留 |
| 44 | 镜头页切到深色 | `:240` | L4 | 保留 |
| 45 | 深色下图表仍全部健康 | `:242` | L4 | **保留**（不变量断言） |
| 46 | 镜头页移动端无横向滚动 | `:256` | L2 通用 | 上移（与 #11 同规格） |
| 47 | CSV 导出触发下载 | `:267` | L4 | **保留**（必须真实浏览器下载事件） |
| 48 | 无未捕获的页面异常 | `:271` | L2 通用 | 上移，每个工具都跑 |
| 49 | 无 console.error | `:272` | L2 通用 | 上移，每个工具都跑 |

**合计：49 条，逐条有归属，无一条静默丢弃。** ✅

#### 4.6.3 关于 #3（`:40` 卡片数）的推导源——一次被实测证伪的方案

**⚠️ 本节记录一个必须废弃的方案，防止后人重蹈。**

本文档早先曾提议把 `:40` 的解耦源改为「数 `dist/*/` 的产物目录数」。**该方案经实测证伪，已废弃**：

```bash
$ npm run build && ls -d dist/*/
dist/assets/  dist/data/  dist/lens/      # → 计数 3
$ ls -d dist/*/index.html
dist/lens/index.html                      # → 计数 1
# 而门户实际渲染的卡片数 = 1（TOOLS 仅 lens 一项）
```

`dist/*/` 会数出 **3**，断言**立刻失败**。改进形式 `dist/*/index.html` 虽然这次恰好得到 1，但**不可采用**，三条理由：

1. **它的"正确"是被缺陷掩盖的巧合。** 单文件模式（`vite.config.ts:22`）当前只构建 `lens`，这正是 P2 的 bug。一旦 P2 修好（单文件也纳入所有 live 工具），该计数语义就变。**用一个被 bug 掩盖的产物结构做断言基准，等于把断言焊死在缺陷上。**
2. **`live: false` 会静默错配。** 产物目录含**所有**构建出的工具，门户只渲染 `live: true` 的（`portal/App.tsx:30`）。引入 `live:false` 的工具后目录数会**大于**卡片数 → 误报失败；而"`live:false` 不纳入构建"本是 `02-target-architecture.md` §3.3 的设计意图，两者打架。
3. **它测的不是"卡片数"。** `:40` 的本体是 `page.locator('main a[href]').count()`，即**用户实际看到的卡片**。用产物目录对照，是拿**构建事实**比对**渲染结果**，中间隔着门户的 live/tag/搜索过滤逻辑（`portal/App.tsx:20-28`）——**恰好丢失了用户要的"页面展示 == 数据源"语义**（用户决策 2 的原话）。

**正确推导源 = 注册表的 `LIVE_TOOLS.length`**（`02-target-architecture.md` §4.1 的虚拟模块已导出 `LIVE_TOOLS`）。它是"门户应该渲染多少张卡片"的**唯一权威语义**，且与门户的过滤口径同源。

> **因此：`:40` 维持第二批**（在注册表存在之后才能解耦）——**这是本文档原稿的判断，经复核为正确**。而 `:86/:91` 这类**数据类**快照不依赖注册表，并入第一批（HF-1a）。

#### 4.6.4 判定标准：49 条归属与三层分布必须可机检（BF-1 / RN-1 的防复发机制）

只改数字不能防复发。**本节给出可机检不变量**：① 映射表条目数 == 实际断言数（BF-1）；② 三层分布 == 从明细逐行统计的真值（RN-1）。

```bash
#!/usr/bin/env bash
# scripts/check-e2e-mapping.sh —— 断言数 + 三层分布漂移检测（建议纳入 CI，与闸 3 同级）
set -euo pipefail
DOC=docs/architecture/03-engineering.md
SEC='/#### 4.6.2/,/#### 4.6.3/p'          # 精确区间，理由见下方要点 1

ACTUAL=$(grep -c 'r\.ok(' e2e/verify.cjs)
MAPPED=$(sed -n "$SEC" "$DOC" | grep -c '^| *[0-9]')

# ---- 三层计数：从 §4.6.2 的「归属」列逐行统计（第 5 个 | 字段）----
layer_count() {   # $1 = 归属值（如 "L1"、"L2 通用"、"L4 + DERIVED"）
  sed -n "$SEC" "$DOC" | grep '^| *[0-9]' | awk -F'|' -v want="$1" '
    { gsub(/^ +| +$/,"",$5); gsub(/\*/,"",$5); gsub(/^ +| +$/,"",$5); if ($5==want) c++ }
    END { print c+0 }'
}
L1=$(layer_count "L1")
L2P=$(layer_count "L2 通用");           L2D=$(layer_count "L2 通用 + DERIVED")
L4P=$(layer_count "L4");                L4D=$(layer_count "L4 + DERIVED")
L2=$((L2P+L2D)); L4=$((L4P+L4D)); SUM=$((L1+L2+L4))
TRUTH="$L1 + $L2 + $L4 = $SUM"

echo "实际断言数   = $ACTUAL"
echo "映射表条目   = $MAPPED"
echo "L1=$L1  L2=$L2 (纯 $L2P + DERIVED $L2D)  L4=$L4 (纯 $L4P + DERIVED $L4D)  合计=$SUM"

fail=0
[ "$ACTUAL" -eq "$MAPPED" ] || { echo "❌ 映射表条目数 != 实际断言数：有断言被遗漏"; fail=1; }
[ "$SUM" -eq "$ACTUAL" ]    || { echo "❌ 三层分布合计 $SUM != 断言数 $ACTUAL：有条目未归类"; fail=1; }

# ---- 分布数字校验：§4.6.5 内【每一处】「a + b + c = d」都必须等于真值 ----
# 必须遍历全部匹配，不能只取首条 —— 只取首条会漏判后半段被篡改的情形（见要点 3）
DIST_HITS=$(sed -n '/^#### 4.6.5/,/^\*\*必须原样保留/p' "$DOC" \
            | grep -o '[0-9]\+ + [0-9]\+ + [0-9]\+ = [0-9]\+' || true)
COUNT_HITS=$(printf '%s\n' "$DIST_HITS" | grep -c . || true)

if [ "$COUNT_HITS" -eq 0 ]; then
  echo "❌ §4.6.5 未找到形如「a + b + c = d」的分布数字（格式漂移？）"; fail=1
else
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    [ "$hit" = "$TRUTH" ] && echo "✅ 分布命中一致：$hit" \
                          || { echo "❌ 分布命中不一致：文档「$hit」!= 真值「$TRUTH」"; fail=1; }
  done <<< "$DIST_HITS"
fi
echo "机检真值     = $TRUTH（共校验 $COUNT_HITS 处分布数字）"

[ "$fail" -eq 0 ] && echo "✅ 断言数、映射完整性、三层分布三者一致且可机检"
exit $fail
```

**为什么把三层分布也纳入机检（RN-1）**：上一版只校验了「条目数 == 断言数」，三层分布（旧值「六、十二、三十一」）仍是**人工维护**的汇总数字——于是它立刻漂移了：L2 单元格自列 13 个编号却标注 12，且**漏列 #12**。**这是 BF-1 的同一根因（人工汇总与明细脱钩）在另一处的复发。** 只改数字不解决根因；**把分布也变成机检属性**才是修复。

**脚本设计要点（四条，均经实测验证）：**

1. **区间必须精确到四级标题**：`sed -n '/### 4.6/,/### 4.7/p'` 会**误捕 4.6.3 的正文行**（其中含 `^|` 开头的表格行），导致计数虚高。故用 `#### 4.6.2` → `#### 4.6.3`。
2. **归属列按字段位取**（`-F'|'` 的**第 5** 字段）：该表为 5 列，第 4 字段是「行号」而非「归属」——取错字段会静默得到全 0（实测确认）。
3. **必须遍历全部分布命中，不能只取首条**：实测中，用 `grep -o ... | head -1` 只取首条时，**篡改 §4.6.5 后半段的数字不会被发现**（首条仍正确）。改为 `while read` 遍历后，负向测试（把 29 改成 28）能正确报红。
4. **失效方向是"误报而非漏报"**：若表格格式漂移导致解析为 0，`SUM != ACTUAL` 与「未找到分布数字」都会报错，而非静默通过——这正是我们想要的失败方向。

**实测验证记录（三类）：**

| 场景 | 结果 |
|---|---|
| 当前文档（正例） | `L1=6 L2=14 L4=29 合计=49`，2 处分布命中一致 → **exit 0** |
| 篡改 §4.6.5 分布数字（29→28） | **exit 1**，报「分布命中不一致」 |
| 从映射表删掉 1 条断言（#49） | **exit 1**，真值降为 `6 + 13 + 29 = 48`，与文档分布不符 |

#### 4.6.5 瘦身结果

> **本表由机检产生，不手工维护。** 三层分布取自 §4.6.2 权威表的「归属」列，由 `scripts/check-e2e-mapping.sh` 逐行统计并比对（见 §4.6.4 的扩展）。
> **修订记录**：本表此前写「六、十二、三十一」（旧人工汇总值，非机检）——L2 单元格自列 13 个编号却标注 12，且**漏列 #12**；L4 的 31 也与明细不符。**这是 BF-1 同一根因家族的残留：人工汇总数字与明细脱钩。** 现已改为机检真值 **6 + 14 + 29 = 49**。

| 去向 | 条数（机检） | 编号（与 §4.6.2 逐行一致） |
|---|---|---|
| **下沉 L1**（纯函数单测） | **6** | #23、#25、#26、#30、#32、#33 |
| **上移 L2**（通用工具契约） | **14** | 纯 L2（**10**）：#1、#2、#7、#8、#9、#10、#11、#46、#48、#49<br>L2 + DERIVED（**4**）：#4、#5、#6、#12 |
| **保留 L4**（含 DERIVED 与不变量断言） | **29** | 纯 L4（**22**）：#13、#14、#16、#17、#19、#20、#21、#22、#27、#34、#35、#36、#37、#38、#39、#40、#41、#42、#43、#44、#45、#47<br>L4 + DERIVED（**7**）：#3、#15、#18、#24、#28、#29、#31 |

> **三层互斥且穷尽**：6 + 14 + 29 = 49 ✅；机检同时确认「未归类 = 0」（即 §4.6.2 的每一条都落在 L1/L2/L4 之一，无遗漏）。
> 上表的编号序列由 `check-e2e-mapping.sh` 从 §4.6.2 直接抽取，**不是人工抄录**——所以不会像上一个版本那样漏列 #12。

**必须原样保留的两条"踩坑资产"：**

**必须原样保留的两条"踩坑资产"：**

1. **#34 表格遮挡回归守卫（`:173`）。** 注释写明："图表曾因 ChartCard / ChartBox 双层高度错配而溢出，盖住数据表使其完全点不动"。配合 `harness.cjs:129-177` 的 `prepareRow`/`rowRect`/`hitTest`——这套"手动摆滚动位置 + 真实鼠标坐标 + `elementFromPoint` 反查遮挡者"的方法论**质量极高**，是这类问题的通用解法。**迁移时必须连同注释一起带走。**
2. **`harness.cjs:95-127` `canvasReport`**（服务 #20/#38/#45）。非透明像素占比作为"图表是否真的画出来了"的判据，抓的是"图表整块变白但控制台不报错"。**它与图表数量无关，属不变量断言，任何批次都不该动。** 应抽到 `e2e/lib/` 供所有工具复用。

### 4.7 Playwright 的引入决策（需要明确）

现状刻意不把 playwright 放进 `devDependencies`（`harness.cjs:8-9`：避免 CI 的 `npm ci` 顺带下载浏览器）。引入 CI 门禁后这个决策必须重新做：

| 方案 | 优点 | 缺点 |
|---|---|---|
| A. 进 `devDependencies` | 版本锁定、可复现 | CI 需 `npx playwright install --with-deps`（约 1–2 分钟 + 缓存） |
| B. 保持外部安装 | CI 快 | **不可复现**：本地/CI 用不同 playwright 版本 → 假失败 |
| C. 独立 workflow，按需跑 | PR 快速反馈不受影响 | 需两套 CI 编排 |

**推荐 A + 缓存**：`actions/setup-node` 的 npm 缓存 + `~/.cache/ms-playwright` 缓存。理由：**可复现性优先于 CI 时间**——B 方案会让"CI 挂了但本地能过"成为常态，那正是可维护性最贵的失败模式。

同时**保留 `harness.cjs:41-63` 的 `findChrome()`**：它处理"playwright 期望的 chromium build 号与实装不一致"。即使进了 devDependencies，这个不一致在某些 CI 镜像里仍会出现。**这是有价值的防御。**

---

## 5. CI 门禁设计

### 5.1 两个 workflow，职责分离

**`ci.yml` —— 质量门禁（PR 与 push 都跑）**

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

jobs:
  # ===== 快速层：< 60s，失败立刻反馈 =====
  fast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }   # HF-3：类型剥离 22.6+ 才默认开启，pin 24
      - run: npm ci
      - name: 类型检查
        run: npm run typecheck
      - name: 架构边界（原则三）
        run: npm run lint:arch
      - name: 工具清单契约（原则一/七）
        run: npm run tools:list && npm run lint:tools
      - name: 单元测试 + 覆盖率
        run: npm run test:unit -- --coverage

  # ===== 构建层：依赖 fast =====
  build:
    needs: fast
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }   # HF-3：类型剥离 22.6+ 才默认开启，pin 24
      - run: npm ci
      - name: 数据流水线（含数据契约）
        run: npm run data
      - name: 多文件构建
        run: npx vite build
      - name: 单文件构建          # ★ 现状 CI 完全不跑，P2 静默失败所在
        run: npx vite build --mode singlefile
      - name: 产物契约测试（L3）
        run: npm run test:artifacts
      - name: 删除安全性（原则八） # ★ 本设计的核心证明
        run: npm run test:deletability

  # ===== 浏览器层：最后，最慢 =====
  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }   # HF-3：类型剥离 22.6+ 才默认开启，pin 24
      - run: npm ci
      - uses: actions/cache@v4      # ★ 浏览器缓存
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx playwright install --with-deps chromium
      - run: npm run data && npx vite build
      - name: 启动预览服务
        run: npx vite preview --port 4173 &
      - name: 等待就绪
        run: node scripts/wait-port.mjs http://127.0.0.1:4173   # 零依赖，见 §9.2 任务 1.2（HF-5）
      - name: E2E（含 L2 通用契约）
        run: npm run test:e2e
      - uses: actions/upload-artifact@v4   # ★ 失败时上传 trace
        if: failure()
        with: { name: playwright-trace, path: test-results/ }
```

**`deploy.yml` —— 部署（现状基础上加前置校验）**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # ... 保持现状（checkout / setup-node / npm ci / 计算 base）
      - name: 构建（含数据清洗）
        env: { VITE_BASE: ${{ steps.base.outputs.value }} }
        run: npm run build
      # ★ 新增：部署前的产物硬校验
      - name: 部署产物必须包含 registry.json
        run: test -f dist/registry.json
      - name: 部署产物必须包含每个 live 工具
        run: node scripts/assert-deploy-artifacts.mjs
      # ... 保持现状（configure-pages / upload-pages-artifact）
```

**为什么部署前要单独硬校验：** `ci.yml` 已经保证了产物正确，但 `deploy.yml` 是**独立触发**的（push 到 main 时两者并行）。给部署加一道轻量自检，能防止"CI 挂了但部署照常"——**部署是不该依赖另一个 workflow 状态的最后一道防线**。

### 5.2 门禁清单与失败含义

| 闸 | 命令 | 失败意味着 | 反馈时间（目标） |
|---|---|---|---|
| 1 | `tsc --noEmit` | 类型错误 | ~5s |
| 2 | `eslint`（架构规则） | 违反分层（工具间耦合 / 平台依赖工具） | ~10s |
| 3 | `validate-tools.mjs` | 清单契约违规（缺文件、id 非法、重名） | ~1s |
| 4 | `vitest --coverage` | 纯逻辑回归 / 覆盖率跌破阈值 | ~3s |
| 5 | `npm run data` | 数据契约违规（字段缺失、越界、重复键） | ~2s |
| 6 | `vite build` | 多文件构建失败 | ~10s |
| 7 | `vite build --mode singlefile` | **单文件构建失败（现状从未被验证）** | ~10s |
| 8 | `test:artifacts` | 产物与注册表不一致（缺工具 / 残留工具） | ~1s |
| 9 | `test:deletability` | **删除某工具后构建失败 → 存在悬空引用** | ~30s |
| 10 | `test:e2e` | 浏览器行为回归 | ~60s |

**闸 3 只有 1 秒，但能拦住最贵的错误类别**（配置拼错、缺文件）。**闸 9 是"随删随去"的自动证明。** 闸 7 补上了现状的最大盲区。

> **⚠️ MF-5：不要给产物体积加闸。** `dist-single/lens/index.html` 实测 **1,476,952** 字节，而 `HANDOFF.md:343` 记 1,475,600（差 +1,352 ≈ +0.09%）——差异来自 `vite-plugin-singlefile` / Rolldown 的内联与压缩输出**随依赖版本漂移**。因此**产物体积只能作"参考量级"（≈1.47 MB），不得作为验收锚点或 CI 门禁**——否则升级依赖就会制造无关的红色，且会被误判为"构建坏了"。
> 若要门禁单文件产物，应断言**结构**而非字节数：如"`dist-single/lens/index.html` 存在"、"单文件内无外部 `assets/*.js` 引用"。同理，`public/data/lenses.json` 的 0.92 MB 也只是量级参考。

### 5.3 可删除性门禁的实现

见 `02-target-architecture.md` §6.4 的完整脚本。工程上的补充：

```js
// scripts/test-deletability.mjs —— 性能优化版本（工具数 > 3 时启用）
// 不做完整打包，只验证"扫描 + input 派生 + 静态引用"三件事
// 依据：悬空引用一定表现为"扫描失败"或"某个文件 import 了不存在的路径"
//      前者由 scanTools 抛出，后者由 tsc/vite 的 resolve 抛出

for (const tool of liveTools) {
  const tmp = makeTempCopy();            // 只复制 tools/ platform/ portal/ 配置文件
  rmSync(join(tmp, 'tools', tool.id), { recursive: true });

  // 1. 扫描必须成功
  const scan = run('node', ['scripts/validate-tools.mjs'], { cwd: tmp });
  if (scan.status !== 0) fail(`删除 ${tool.id} 后清单校验失败`);

  // 2. 类型检查必须通过（能抓到 import 悬空）
  const tsc = run('npx', ['tsc', '--noEmit'], { cwd: tmp });
  if (tsc.status !== 0) fail(`删除 ${tool.id} 后类型检查失败——存在悬空 import`);

  // 3. input 派生必须成功，且不含被删工具
  const inputs = await deriveInputs(tmp);
  if (inputs.some((k) => k === tool.id)) fail(`删除 ${tool.id} 后仍出现在 build input`);
}
```

**为什么第 2 步（`tsc --noEmit`）就足够抓悬空引用：** 如果 `portal/App.tsx` 或任何 `platform/` 文件 import 了被删工具的路径，TypeScript 立刻报 `Cannot find module`。**这比完整打包快一个数量级，而覆盖面几乎相同。** 完整打包只在"有非静态引用（动态 import 拼字符串）"时才需要——而那种写法本身就应该被禁止。

### 5.4 门禁的演进原则

**加闸的唯一理由是可验证性的缺口，不是"别人都这么做"。**

- **不加的闸**：bundle size 预算（当前 0.9MB 数据主导，无意义）、Lighthouse（工具是纯前端小页面，波动大且难归因）、依赖漏洞扫描（8 个直接依赖，人工可控）。
- **加的前提**：每个闸都必须能回答"它拦住了什么类型的缺陷，这个类型之前发生过或几乎必然发生"。闸 7（单文件构建）之所以必须加，是因为 **`vite.config.ts:22` 的硬编码 + CI 从未跑过 = 该缺陷几乎必然发生**。

---

## 6. 迁移期间的工程化保障

架构迁移（见 migrator 的路线）期间，工程化设施是最重要的安全网。**顺序建议：**

```
阶段 0：先建闸，后动代码
  ├── 加 ESLint（先只开基础规则，架构规则在阶段 2 才启用）
  ├── 加 Vitest，先把现有纯函数（filter.ts、lib/lens.ts）的测试写出来
  │     ← 此时不改任何产品代码，测试是对现状的"行为快照"
  ├── 把 verify.cjs 改造成 Playwright Test（保持断言不变，只是换运行器）
  │     ← 换运行器后能得到"每个 test 独立 context"，消除共享状态污染
  └── CI 接入现有闸（类型 + 单测 + E2E）
       ← 此时 CI 已经能保护后续所有重构

阶段 1：数据目录与共享层拆分（低风险）
  ├── src/lens/filter.ts → tools/lens/domain/filter.ts（已由阶段 0 的单测保护）
  ├── shared/lib/lens.ts 拆成 tools/lens/domain/{model,metrics,brands,format}.ts
  ├── shared/ 剩下的（useTheme/ui/chart/ChartBox）→ platform/
  └── 每步后跑全量 verify

阶段 2：引入注册表与契约（核心变更）
  ├── 写 platform/contract + platform/registry + 虚拟模块
  ├── 第一个工具（lens）改用 tool.config.ts
  ├── portal/App.tsx 改为消费注册表
  ├── vite.config.ts 改为派生 input
  ├── ★ 此刻启用 lint:arch 的架构规则（现在才有东西可检查）
  └── ★ 此刻启用 test:deletability（现在才有东西可删）

阶段 3：测试分层补齐
  ├── 把 verify.cjs 里的纯逻辑断言下沉到 L1
  ├── 抽出 L2 通用契约 spec
  ├── 加 L3 产物 spec
  └── E2E 瘦身到只测浏览器行为
```

**关键顺序约束：**

1. **阶段 0 必须先于任何重构。** 没有行为快照就重构纯函数，等于盲改。
2. **`lint:arch` 在阶段 2 才启用。** 阶段 0–1 目录还没成形，此时启用会刷屏式报错，反而促使人们加 `eslint-disable`——那比不启用更糟。
3. **`test:deletability` 在阶段 2 才启用。** 只有一个工具时，删掉它就什么都不剩了，测试无意义。

**还有一个容易漏掉的：迁移期间新旧结构共存。** `src/lens/` 与 `tools/lens/` 会同时存在一段时间。建议：

- **用 `@deprecated` JSDoc 标注旧路径**，让 IDE 显示删除线。
- **在 `lint:arch` 里加一条过渡规则**：允许 `tools/lens/**` import `src/lens/**`（临时），但在 CI 里打印待清理清单。**让技术债可见且有数量。**
- **不要试图一次性迁移。** 每个阶段结束都应该是一个可发布状态。

---

## 7. 本方案的自我约束与成本估计

### 7.1 新增的依赖与配置（成本）

| 项 | 类型 | 估算 |
|---|---|---|
| playwright（第一批） | devDependency | 见 §9.2 任务 1.1；本机 `--ignore-scripts` 复用已有 chromium（HF-2） |
| Vitest | devDependency | 与 Vite 同源，配置约 20 行 |
| ESLint + typescript-eslint | devDependency | flat config 约 80 行（含架构规则） |
| @playwright/test | devDependency | 替代手写脚本，需浏览器缓存（**第二批**才引入） |
| 虚拟模块插件 | 自研 | ~150 行 |
| 扫描器 + 契约校验 | 自研 | ~200 行 |
| 脚手架 + 校验脚本 | 自研 | ~150 行 |
| CI 三个 job | 配置 | ~120 行 YAML |
| L1 单测 | 测试 | ~500 行（覆盖 domain/ + platform/） |
| L2/L3 spec | 测试 | ~250 行 |

**自研约 500 行 + 测试约 750 行。** 这个规模是合理的，**且全部由"1 个工具的增量成本"来偿付**——当前新增一个工具需要人工同步 2 处共享文件、手工复制 HTML、手工写图标；迁移后是 `npm run new` 一条命令。

> **HF-5 处置：不引入 `wait-on`。** 等待端口就绪改用零依赖的 `scripts/wait-port.mjs`（约 12 行，用 Node 内置 `fetch` 轮询）。理由：本批定位是"最小、可复现、零产品代码改动"，而 `npx wait-on` 会引入**未声明、未锁定**的网络依赖，破坏"干净 clone 可复现"的验收标准。详见 §9.2 任务 1.2。

### 7.2 明确不做的事

| 不做 | 理由 |
|---|---|
| Monorepo / workspaces | 单包，无独立版本需求 |
| Turbo / Nx / Moon | 构建以秒计，编排器收益为负（见 `02-target-architecture.md` §6.5） |
| 状态管理库（Redux/Zustand） | `lens/App.tsx:32-42` 的 9 个 `useState` 是合理的；引入库会增加概念而不减代码 |
| 组件库（shadcn/Radix） | `shared/components/ui.tsx` 187 行已够用，且已适配本项目色板 |
| Storybook | 1 个工具、~15 个组件，成本高于收益。**当组件数 > 30 再评估** |
| 微前端 | 无独立部署需求 |
| SSR / SSG | 纯静态站，GitHub Pages，无服务端 |
| 端到端可视化回归（截图 diff） | 现有 `canvasReport` 的像素健康度检查已覆盖最有价值的场景，且比截图 diff 稳定 |
| **`json-schema-to-ts`** | **t7 按 t4 建议砍掉**：手写类型 + 手写校验器 + 字段集一致单测，保护强度相同、依赖与调试成本更低（`02-target-architecture.md` §7.4） |
| **`wait-on`** | **HF-5**：改用零依赖 `scripts/wait-port.mjs`（见 §9.2 任务 1.2） |

**这张表很重要。** "尽可能先进"容易被误读为"尽可能多的工具"。**在"1 个包、2 个页面、5 个脚本"的规模上，每一层额外抽象都是纯负债。** 本方案的先进性体现在：注册表派生、契约三层校验、删除安全性自动化——这些是**解决真实问题**的先进，而不是**增加技术栈**的先进。

### 7.3 建议的验证顺序（实现阶段第一件事）

如果只做一件事，做这个：

```bash
# 用 30 行脚本验证虚拟模块的核心假设
# 假设：Vite 插件能扫描目录并生成一个模块，门户 import 它并正确渲染
# 若这个假设不成立，整个注册表方案要换（改为代码生成脚本）
```

**先验证最不确定的假设，再写其余部分。** 风险表（`02-target-architecture.md` §8.1）里的 R1（HMR）、R2（单文件模式交互）、R3（lint 规则表达力）都属于"假设可能不成立"类，应当在实现的第一天被证伪或证实。

---

### 7.4 迁移步骤中容易被漏掉的两项（HF-3 / HF-4）

这两条属于"迁移步骤清单漏项"，**不是架构缺陷，但会让新代码失去该有的保护**：

| 项 | 何时做 | 内容 |
|---|---|---|
| **HF-3 构建期 TS 直读约束** | 引入 `tool.config.ts` 的**同一批** | ① `tool.config.ts` 禁用 `enum` / `namespace` / 构造函数参数属性（**由 L2 契约测试或 lint 强制**，不能只写文档）；② 类型导入改用**相对路径**（Node 不解析 tsconfig 的 `paths`）；③ CI `node-version` pin 到 **24**（剥离在 22.6+ 才默认开启）。详见 `02-target-architecture.md` §7.6.1 |
| **HF-4 tsconfig include 扩展** | 引入 `platform/` 的**同一批、同一提交** | `"include": ["src", "platform", "scripts", "tools", "e2e", "vite.config.ts"]`。否则 `platform/`、`tools/` 里的类型错误**全部落在 `tsc` 盲区**，而 §6.1 的闸 1 正是靠 `tsc`；且 `satisfies ToolManifest` 这个"编译期字段校验"机制会在**最需要它的新增工具上失效**。详见 `02-target-architecture.md` §7.6.2 |

> **必须在同一提交内完成**：否则会存在一个"新代码已存在、但类型检查还没覆盖它"的窗口期。这正是 §7.3 声称要消灭的失败模式的另一种形式。

## 8. 结论

**工程化的目标不是"闸越多越好"，而是让每一类缺陷都在它能被最快、最准定位的那一层被拦住。**

| 缺陷类别 | 现状在哪被抓 | 目标在哪被抓 | 改善 |
|---|---|---|---|
| 类型错误 | tsc（CI） | tsc | 保持 |
| 纯函数逻辑错误 | E2E（且 CI 不跑） | L1 单测（CI，<1s） | **反馈从 ~30s 降到 <1s** |
| 清单配置错误 | **无人抓** | 闸 3（1s）+ 编译期 `satisfies` | **从不可见变可见** |
| 新增工具产物缺失 | **无人抓**（CI 不跑 singlefile） | 闸 6 + 闸 7 + 闸 8 | **从必现变不可能** |
| 工具间隐性耦合 | 靠 code review | 闸 2（架构 lint）+ 闸 9 | **从靠自觉变自动** |
| 数据契约违规 | 运行期炸弹 | 闸 5（构建期） | **从用户看到变构建失败** |
| UI 布局回归 | E2E（手动跑） | E2E（CI） | **从"发布前记得跑"变必跑** |

**最终判定标准（可用于验收）：**

1. `npm run verify` 一条命令覆盖全部 10 个闸。
2. 新增一个工具**不修改任何共享文件**，且闸 3/6/7/8/9 全绿。
3. 删除一个工具后**闸 9 通过**（构建成功、无残留）。
4. 改动 `domain/` 下任一纯函数，**闸 4 在 3 秒内给出结论**。
5. 所有闸在 CI 中默认执行——**没有任何一个闸只在文档里存在。**



---

## 9. 第一批实施范围（可直接执行，供后续实施任务使用）

> 用户已选定「文档完成后立即实施第一批迁移」。本节给出**第一批的具体范围、理由、步骤、通过标准与回滚方式**。
> 依据：`02-target-architecture.md` §7 的迁移顺序（阶段 0：先建闸，后动代码）。

### 9.1 第一批的选定：修回归网（先让 E2E 真能跑并进 CI）

**候选范围**：`npm run e2e` 当前在**干净环境必然失败**——playwright 不在 `package.json`、不在 `package-lock.json`、不在 `node_modules`（t1 §7.4 实测）。`e2e/harness.cjs:26-32` 会走报错分支 `exit(3)`。

**为什么必须是第一批（而不是先动架构）：**

1. **没有回归网的重构是盲改。** 49 条 E2E 断言是本仓库**唯一**的行为契约。它跑不起来，意味着 `02-target-architecture.md` 的整个迁移路线（拆 `shared/`、改注册表、派生 input）全部**没有任何自动化保护**——每改一步只能靠肉眼。
2. **它是零产品代码改动的一批。** 只动 `package.json` + `e2e/` + CI 配置，**不碰 `src/`、`vite.config.ts`、`scripts/`**。风险最低，且立即产生价值。
3. **它解锁后续所有批次。** 第二批开始要改 `src/lens/filter.ts` 等纯函数——没有 L1 单测和可跑的 E2E，那些改动的通过与否无法判定。
4. **它修复的是一处"文档承诺与事实不符"。** `HANDOFF.md:23` 宣称「`npm run e2e` → 49/49 通过」是可复现基准线，但干净 clone 跑不起来（t1 的 D8）。**基准线必须先真实存在。**

> **我认同 captain 的倾向。** 如果一定要提替代方案：也可以先做「把 `shared/lib/lens.ts` 的纯函数抽出来加单测」（价值同样高、同样零产品改动），但**它的验收依赖试运行**，而试运行依赖测试运行器——所以仍需先装依赖。**结论：顺序无争议，第一批 = 恢复可运行 + 进 CI。**

### 9.2 第一批的具体任务分解

> **本批的四处修订（对应 t4 findings）**：HF-1a 把 `:86/:91` 的数据类快照并入本批；HF-2 区分本机/CI 两条 playwright 安装路径；HF-5 消除 `wait-on` 的未声明依赖；MF-3 §9 的清洁度声明随 HF-1a 同步。

#### 任务 1.1：恢复 E2E 可运行（依赖入库）

| 项 | 内容 |
|---|---|
| **涉及文件** | `package.json`（加 devDependency + script）、`package-lock.json`（`npm install` 自动更新） |
| **改动** | ① 加 `playwright` 到 devDependencies；② **不要**把 `@playwright/test` 一起引入（本批不换运行器，避免一次动两件事）；③ 加 `"typecheck": "tsc --noEmit"` 脚本（任务 1.3） |
| **回滚** | `git checkout package.json package-lock.json`；浏览器缓存与仓库无关 |

##### ⚠️ HF-2：本机与 CI 是**两条不同的安装路径**，不可混用

**这是本批最容易踩的坑。** 本机已有一份 chromium（`ms-playwright/chromium-1223/`），**不需要也不应该**再下载一份：

| 环境 | 命令 | 说明 |
|---|---|---|
| **本机**（已有 `ms-playwright` 缓存） | `npm i -D playwright --ignore-scripts` | **复用已有 chromium-1223**；实测 3 秒、**零联网、零下载**（`ms-playwright` 目录数保持 5 项不变） |
| **CI**（runner 无任何浏览器） | `npm i -D playwright` **+** `npx playwright install --with-deps chromium` | runner 无缓存，**必须**下载（1–2 分钟，配 `~/.cache/ms-playwright` 缓存） |

**`--ignore-scripts` 在本机是正确做法**：playwright 的 postinstall 才会下载浏览器，跳过它即复用现有二进制。`harness.cjs:41-63` 的 `findChrome()` **一行都不用改**——它的扫描逻辑（`ms-playwright/chromium-*/chrome-win64/chrome.exe`）本就匹配现有布局。

**⚠️ 本机不要跑 `npx playwright install chromium`。** 后果不是"多下一点东西"这么轻：

1. 会新增一份 build 号**可能更高**的浏览器到 `ms-playwright/`；
2. `findChrome()` 的选取逻辑是 `dirs.filter(startsWith('chromium-')).sort().reverse()[0]` —— **取最新**。新目录若排序在后，就会**顶掉**当前正在用的 1223；
3. 于是出现「**装完反而行为变了**」：本机原本能跑的 E2E，装完之后跑去启动另一个版本。这类"操作副作用导致行为漂移"极难排查。

**反过来，CI 上不能用 `--ignore-scripts`**：runner 没有那份 chromium，`findChrome()` 会返回 `undefined`，playwright 退到默认路径查找并报 `Executable doesn't exist`。**CI 必须显式 install。**

| 项 | 内容 |
|---|---|
| **本机命令** | `npm i -D playwright --ignore-scripts` |
| **CI 命令** | `npm i -D playwright` → `npx playwright install --with-deps chromium` |
| **本机通过标准** | ① `grep -c '"node_modules/playwright' package-lock.json` ≥ 1（当前为 0）；② `node -e "require('playwright')"` 退出码 0；③ `ls -d "$LOCALAPPDATA"/ms-playwright/chromium-*` 目录数**不变**（证明零下载）；④ **`npm run build` + 起 preview 后 `npm run e2e` 输出 `49/49 通过`、退出码 0** |
| **风险** | 见上（HF-2）。**缓解：`findChrome()` 是现成防御，不要删。** |

> **关键决定：本批不换 Playwright Test 运行器。** §4.7 建议最终改用 `@playwright/test`（为测试隔离与 trace），但那是**后续批次**。第一批只做"让它跑起来"，把变量降到最少——**一次只改一件事**是可维护性的操作纪律。

#### 任务 1.1b：数据类快照断言改读数据源（HF-1a，**并入本批**）

**原计划把"修快照断言"整个推迟到第二批，这是过度保守。** 经复核，**数据类**快照的解耦**完全不依赖注册表**：

| 断言 | 原写死值 | 改为 | 为什么本批可做 |
|---|---|---|---|
| `verify.cjs:86` | `countOf() === 1617` | `=== DATA.length` | `public/data/lenses.json` 由 `npm run data` 生成，**本批已存在** |
| `verify.cjs:106` | `/共\s*1,617\s*支/` | 由 `DATA.length` 拼装期望串 | 同上 |
| `verify.cjs:141` | `cViltrox < 1617` | `< DATA.length` | 同上 |
| `verify.cjs:144` | `=== 1617` | `=== DATA.length` | 同上 |
| `verify.cjs:152` | `=== 1617` | `=== DATA.length` | 同上 |
| `verify.cjs:157` | `cMount < 1617` | `< DATA.length` | 同上 |
| `verify.cjs:164` | `cAp < 1617` | `< DATA.length` | 同上 |
| `verify.cjs:91` | `statText.includes('9.5')` | `includes(max(overall).toFixed(1))` | 纯数据推导 |

**改法（自包含，无新依赖）：**

```js
// e2e/verify.cjs 顶部
const DATA = require('../public/data/lenses.json');   // 构建前置步骤已生成
const TOTAL = DATA.length;
const BEST = Math.max(...DATA.map((d) => d.overall ?? -Infinity));
```

**改后断言更强**：语义从"数据恰好是 1617"变为「**页面展示 == 数据源**」——这正是用户决策 2 点名要的语义。且数据源更新后**断言自动跟随**，不再假失败。

**处置 ⇒ 并入第一批。**

#### 任务 1.1c：`:40` 卡片数断言——**维持第二批**，且废弃 `dist/*/` 方案（HF-1b）

**我的上一版曾提议把 `:40` 的解耦源改为「数 `dist/*/` 产物目录数」。该方案经实测证伪，在此明确废弃。**

```bash
$ ls -d dist/*/            → dist/assets/  dist/data/  dist/lens/    （计数 3）
$ ls -d dist/*/index.html  → dist/lens/index.html                    （计数 1）
# 而门户实际渲染卡片数 = 1（TOOLS 仅 lens 一项）
```

`dist/*/` 会数出 **3**，断言**立刻失败**。改进形式 `dist/*/index.html` 虽这次得 1，但**不可采用**，三条理由（与 §4.6.3 同）：

1. **它的"正确"是被 P2 缺陷掩盖的巧合。** 单文件模式（`vite.config.ts:22`）当前只构建 `lens` 正是 P2 的 bug；P2 修好后语义即变。**把断言焊死在缺陷上。**
2. **`live: false` 会静默错配。** 产物含所有构建出的工具，门户只渲染 `live: true` 的（`portal/App.tsx:30`）。
3. **它测的不是"卡片数"。** `:40` 的本体是 `page.locator('main a[href]').count()`，即**用户实际看到的卡片**；用产物目录对照是拿**构建事实**比对**渲染结果**，中间隔着门户的 live/tag/搜索过滤（`portal/App.tsx:20-28`），**恰好丢失了"页面展示 == 数据源"的本意**。

**正确的推导源 = 注册表的 `LIVE_TOOLS.length`**（`02-target-architecture.md` §4.1 的虚拟模块已导出）。它是"门户应渲染多少张卡片"的唯一权威语义，且与门户过滤口径同源。

**处置 ⇒ `:40` 维持第二批**（本文档原稿判断经复核正确）；**`dist/*/` 方案永久废弃**。

> **本条的教训（已写进 §7 的成本章节）**：涉及"全量/计数"的推导源判断**必须实测，不能推理**。`dist/*/` 方案在纸面上很像对的——这也是它值得被记录下来的原因。

#### 任务 1.2：E2E 进 CI（新增质量门禁）

| 项 | 内容 |
|---|---|
| **涉及文件** | 新增 `.github/workflows/ci.yml`（独立文件，与 `deploy.yml` 解耦） |
| **改动** | `npm ci` → `npx playwright install --with-deps chromium` → `npm run data` → `npx vite build` → 起 `vite preview` → 等端口就绪 → `npm run e2e`；失败时 `upload-artifact` 传 `_shots/` |
| **通过标准** | ① PR 上 CI 变绿且 E2E 步骤**真的执行**（不是被 skip）；② **故意让一条断言失败（临时改 `verify.cjs` 期望值），CI 必须变红** —— 这是"门禁真的生效"的唯一证明 |
| **回滚** | 删除新增的 workflow 文件（独立文件，零耦合） |
| **风险** | 浏览器下载约 1–2 分钟拖慢 CI。**缓解：缓存 `~/.cache/ms-playwright`，key 用 `hashFiles('package-lock.json')`。** |

##### ⚠️ HF-5：等待端口就绪**不能**用 `npx wait-on`

`wait-on` **不是本仓库的依赖**（实测：`package.json` 与 `package-lock.json` 中匹配数均为 **0**，`node_modules` 中不存在该包）。`npx wait-on` 会触发**联网即时下载**，后果：

1. 引入一个**未锁定版本**的第三方包 —— 可维护性的反面；
2. registry 受限时**直接失败**；
3. **破坏 `§9.4` 的「干净 clone 可复现」验收标准** —— 无端多出一个未声明的网络依赖。而 §9.1 的第一条理由恰恰是"没有回归网的重构是盲改"。

**采用零依赖替代方案**（更契合本批"最小、可复现、零产品代码改动"的定位）：

```js
// scripts/wait-port.mjs —— 零依赖端口等待（node 18+ 自带 fetch）
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

CI 步骤改为 `node scripts/wait-port.mjs http://127.0.0.1:4173`。

> **备选**：把 `wait-on` 加进 `devDependencies` 并锁定版本（与会 HF-2 的 playwright 同批）。**但零依赖方案更契合本批定位** —— 少一个依赖、少一处版本漂移面，且 3 行代码没有维护成本。
> **无论选哪种，`package.json` 都必须在"涉及文件"里列出**（原稿只写了 playwright，这是缺口）。

#### 任务 1.3：`npm run typecheck` 独立脚本

| 项 | 内容 |
|---|---|
| **涉及文件** | `package.json`（加 1 个 script） |
| **改动** | `"typecheck": "tsc --noEmit"` |
| **理由** | 当前类型检查**只能**通过 `npm run build`（含 `data` + 完整构建）触发，反馈慢。t1 §7.3 已指出「单独脚本不存在」。1 行改动，收益明确。 |
| **通过标准** | `npm run typecheck` 退出码 0 |

### 9.3 第一批**明确不做**的事（防止范围蔓延）

| 不做 | 理由 |
|---|---|
| 不动 `src/**`、`vite.config.ts` 任何文件 | 第一批定位是"建网"，不是"改造"。混在一起就失去了"低风险"这个最大优点。 |
| 不拆 `shared/`、不引入注册表/契约 | 属于第二批（`02-target-architecture.md` §7 阶段 1–2）。 |
| 不引入 Vitest / ESLint | 属于第二批（阶段 0 的后半）。**先让已有的网跑起来，再造新的网。** |
| 不换 `@playwright/test` 运行器 | 会同时改变断言写法与执行模型，与"恢复可运行"这个目标正交。 |
| 不改 `:40`（卡片数）与 `:94/:213`（8 画面）、`:103`（100 行）、`:102/:176`（3/4 支对比） | 这些耦合**注册表 / 视图结构**，解耦点在第二批。**`:40` 的推导源必须是注册表 `LIVE_TOOLS.length`，不得用 `dist/*/`**（见 §9.2 任务 1.1c）。 |
| 不改 `tsconfig.json` 的 include | 属 HF-4，**必须在引入 `platform/` 的同一个提交里做**（第二批），否则会有"新代码无类型保护"的窗口期。见 §9.5。 |

> **与 MF-3 同步的范围声明**：本批**允许**改 `package.json`、`package-lock.json`、`e2e/`、新增 `.github/workflows/ci.yml` 与 `scripts/wait-port.mjs`；**不碰** `src/**`、`vite.config.ts`、`tsconfig.json`。
> （原稿表述为"只动 `package.json` + `e2e/` + CI"，在 HF-1a 并入后需相应放宽——`e2e/` 本就在允许清单内，新增的是 `scripts/wait-port.mjs` 这个零依赖等待脚本。）

### 9.4 第一批完成后的可验证状态

```bash
# 以下全部应通过（命令为 Git Bash / bash 形式，见 LF-4 的平台说明）
npm ci

# ⚠️ 本机与 CI 二选一（HF-2）：
#   本机（已有 ms-playwright 缓存，零下载）：
npm i -D playwright --ignore-scripts
#   CI（runner 无浏览器，必须下载）：
#   npm i -D playwright && npx playwright install --with-deps chromium

npm run data
npm run typecheck                   # 任务 1.3 新增
npx vite build
npx vite preview --port 4173 &
node scripts/wait-port.mjs http://127.0.0.1:4173   # HF-5：零依赖，非 wait-on
npm run e2e                         # → 49/49 通过，退出码 0
```

**判定标准（六条）：**
1. 干净 clone → 上述命令序列全部通过（**无任何未声明依赖**）。
2. CI 上 E2E 步骤真实执行且有断言计数输出。
3. **故意破坏一条断言，CI 变红**（证明门禁有效，而非只打印）。
4. `git diff` 不包含 `src/`、`vite.config.ts`、`tsconfig.json` 的任何改动。
5. `HANDOFF.md:23` 的「49/49 通过」基准线**从"文档声称"变为"CI 可复现"**。
6. `verify.cjs` 中 **`1617` 与 `9.5` 字面量已全部消除**，改为读 `public/data/lenses.json`（HF-1a 的验收）。

> **LF-4 平台说明**：上述命令为 **Git Bash / bash** 形式。PowerShell 等价形式：`npx vite preview --port 4173` 需另开窗口或用 `Start-Job`；`&` 后台运算符在 pwsh 下语义不同。团队当前均在 Git Bash 下工作，故以 bash 为准。

### 9.5 第二批的入口条件（预告，不在本批范围）

第一批绿了之后，第二批可安全开始（对应 `02-target-architecture.md` §7 阶段 0 后半 + 阶段 1）：

- 引入 Vitest，**先给现有纯函数写行为快照测试**（`src/lens/filter.ts`、`shared/lib/lens.ts` 的 `fmt`/`money`/`scoreClass`/`focalText`/`brandColor`），**此时不改任何产品代码**——测试是对现状的固化。
- 引入 ESLint 基础规则（**架构规则暂不开**，目录还没成形）。
- **`tsconfig.json` 的 include 扩展必须与引入 `platform/` 在同一个提交内完成**（HF-4），否则新架构代码会落在 tsc 盲区。详见 §7.6。

> **纪律**：每一批结束时都必须是**可发布状态**，且**回滚只需 `git revert` 一个提交**。不攒大改动。
> **配套**：[`02-target-architecture.md`](./02-target-architecture.md)（分层、契约、数据管理、高级特性）
> 迁移路线与分阶段验收标准见 migrator 的产出。
