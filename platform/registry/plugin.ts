/**
 * toolbox 注册表插件 —— 单一事实来源的实现。
 *
 * 职责（三件事，全部由 tools/<id>/tool.config.ts 派生，零手写清单）：
 *   1. 扫描 tools/<id>/tool.config.ts，运行时校验（id 与目录名一致、live 工具必备文件）
 *   2. 虚拟模块 virtual:toolbox/registry：导出 TOOLS / LIVE_TOOLS / ALL_TAGS
 *   3. 派生 vite build.rollupOptions.input（多文件与 singlefile 都覆盖——根除 P2：
 *      迁移前单文件模式只构建 lens，新增工具会静默丢失）
 *
 * 失败响亮原则：任何清单问题（缺 index.html、id 不一致、重复 id）都在构建期抛错，
 * 错误信息点名具体工具——绝不静默产出残缺站点。
 */
import { readdirSync, statSync, existsSync, renameSync, rmdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import type { ToolManifest } from '../contract/tool';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
export const TOOLS_ROOT = resolve(PROJECT_ROOT, 'tools');


const VIRTUAL_ID = 'virtual:toolbox/registry';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/** @returns 扫描结果：id（目录名）、manifest（经校验的清单）、dir（绝对路径） */
export interface ScannedTool { id: string; manifest: ToolManifest; dir: string }

export async function scanTools(root: string = TOOLS_ROOT): Promise<ScannedTool[]> {
  const out: ScannedTool[] = [];
  const seenIds = new Map();

  for (const entry of readdirSync(root).sort()) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;

    const cfgPath = join(dir, 'tool.config.ts');
    if (!existsSync(cfgPath)) continue; // 约定即过滤：没有 tool.config.ts 就不是工具

    // 构建期 Node 直读 .ts（类型剥离）。必须用 ESM 动态 import()：
    // 实测 Node 24 中，CJS require 能剥 .ts，但从 ESM 上下文 createRequire
    // 加载 .ts 会 MODULE_NOT_FOUND（剥离器只挂在 CJS 的 require 上）。
    // 约束：tool.config.ts 只用可剥离语法（禁 enum / namespace / 构造函数
    // 参数属性），类型导入用相对路径（Node 不解析 tsconfig 的 paths 别名）。
    const mod = (await import(pathToFileURL(cfgPath).href)) as { default: ToolManifest };
    const manifest = mod.default;

    if (typeof manifest !== 'object' || manifest === null) {
      throw new Error(`[toolbox] 工具 ${entry}：tool.config.ts 缺少 default 导出`);
    }
    if (manifest.id !== entry) {
      throw new Error(`[toolbox] 工具 ${entry}：manifest.id "${manifest.id}" 与目录名不一致`);
    }
    if (seenIds.has(manifest.id)) {
      throw new Error(`[toolbox] id 重复：${manifest.id}（${entry} 与 ${seenIds.get(manifest.id)}）`);
    }
    if (manifest.live) {
      const appPath = join(dir, 'App.tsx');
      const htmlPath = join(dir, 'index.html');
      if (!existsSync(appPath)) {
        throw new Error(`[toolbox] 工具 ${entry}：live=true 但缺少 App.tsx`);
      }
      if (!existsSync(htmlPath)) {
        throw new Error(`[toolbox] 工具 ${entry}：live=true 但缺少 index.html`);
      }
    }
    seenIds.set(manifest.id, entry);
    out.push({ id: entry, manifest, dir });
  }
  return out;
}

/**
 * 由清单派生 rollup input（根除 P2：不再手写入口表）。
 * - 多文件模式：main（门户）+ 每个 live 的 page 工具。
 * - 单文件模式：Rolldown 的 codeSplitting=false 不允许多入口（实测
 *   [INVALID_OPTION]），而单文件的语义是「一个自包含 HTML」。因此取
 *   **恰好一个** live 工具；多于一个时**响亮失败**并点名工具数——
 *   绝不静默挑选（那正是 P2 的失败模式）。
 */
export async function deriveInputs(opts: { singlefile: boolean }, root: string = TOOLS_ROOT) {
  const livePageTools = (await scanTools(root)).filter(
    ({ manifest }) => manifest.live && (manifest.route ?? { kind: 'page' }).kind === 'page',
  );

  if (opts.singlefile) {
    if (livePageTools.length === 0) {
      throw new Error('[toolbox] build:single：注册表中没有任何 live 工具，无可构建的单文件产物');
    }
    if (livePageTools.length > 1) {
      const ids = livePageTools.map((t) => t.id).join(', ');
      throw new Error(
        `[toolbox] build:single：当前有 ${livePageTools.length} 个 live 工具（${ids}）。` +
          '单文件模式的语义是「一个自包含 HTML」，需要先决定打包哪一个（可在 tool.config.ts 加 singlefile 标记，或按 id 显式选择）。',
      );
    }
    const only = livePageTools[0];
    return { [only.id]: join(root, only.id, 'index.html') } as Record<string, string>;
  }

  const input: Record<string, string> = { main: resolve(PROJECT_ROOT, 'index.html') };
  for (const { id } of livePageTools) {
    input[id] = join(root, id, 'index.html');
  }
  return input;
}

/**
 * 产物路径映射：Rolldown 以 HTML 文件相对 root 的**目录结构**决定输出位置
 * （实测 key='lens' 仍产出 dist/tools/lens/index.html），因此 tools/lens/index.html
 * 会天然产出到 dist/tools/lens/。而迁移前的 URL 契约是 /lens/（门户卡片、E2E、
 * 既有书签都依赖它）。为保持 URL 等价，用 entryFileNames 显式映射：
 *   tools/<id>/index.html → dist/<id>/index.html
 * 主门户仍为 dist/index.html。
 */
export function deriveOutputEntryFileNames(): string {
  return 'tools/[name]/index.html';
}


/**
 * URL 布局重排（closeBundle）：Rolldown 以 HTML 相对 root 的目录结构决定产物位置
 * （实测 key 与 entryFileNames 都改变不了 HTML 落点），tools/<id>/index.html 会
 * 产出到 dist/tools/<id>/。而 URL 契约是 /<id>/（门户卡片 href、E2E 断言、既有
 * 书签都依赖）。用文件系统 rename 完成映射，成功/失败都响亮。
 */
export function urlLayoutPlugin(outDir: string): Plugin {
  return {
    name: 'toolbox-url-layout',
    apply: 'build',
    closeBundle() {
      const toolsDir = resolve(outDir, 'tools');
      if (!existsSync(toolsDir)) return; // 单文件模式或无工具时无事可做
      for (const id of readdirSync(toolsDir)) {
        const from = resolve(toolsDir, id);
        const to = resolve(outDir, id);
        if (!statSync(from).isDirectory()) continue;
        if (existsSync(to)) {
          throw new Error(`[toolbox-url-layout] 目标已存在，拒绝覆盖：${to}`);
        }
        renameSync(from, to);
      }
      // tools/ 目录空了就删掉，避免产物里留下空目录
      if (readdirSync(toolsDir).length === 0) rmdirSync(toolsDir);
    },
  };
}

export function toolboxRegistryPlugin(): Plugin {
  return {
    name: 'toolbox-registry',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    // 派生构建入口（P2 根除点）。单文件模式显式用 env.mode 判断。
    async config(userConfig, env) {
      const singlefile = env.mode === 'singlefile';
      const input = await deriveInputs({ singlefile });
      // 同时写 rollupOptions 与 rolldownOptions：Vite 8 解析产物里两者并存，
      // 默认 main input 挂在 rollupOptions 上——实测只写 rolldownOptions 时
      // resolved input 仍是 {main, lens} 两个入口，singlefile 因
      // codeSplitting=false 而 [INVALID_OPTION]。显式覆盖两处。
      return {
        build: {
          ...userConfig.build,
          rollupOptions: { ...userConfig.build?.rollupOptions, input },
          rolldownOptions: { ...userConfig.build?.rolldownOptions, input },
        },
      };
    },

    async load(id) {
      if (id !== RESOLVED_ID) return;
      const tools = await scanTools();
      const entries = tools.map(({ manifest }) => {
        const m = manifest;
        const route = m.route ?? { kind: 'page' };
        return `  {
    id: ${JSON.stringify(m.id)},
    name: ${JSON.stringify(m.name)},
    desc: ${JSON.stringify(m.desc)},
    tags: ${JSON.stringify(m.tags)},
    tint: ${JSON.stringify(m.tint ?? null)},
    meta: ${JSON.stringify(m.meta ?? null)},
    live: ${m.live ? 'true' : 'false'},
    route: ${JSON.stringify(route)},
    keywords: ${JSON.stringify(m.keywords ?? [])},
    iconUrl: null, // icon 由门户按 id 约定取 /tools/<id>/icon.svg（vite 静态资源管线处理）
  }`;
      });

      return `// 由 toolbox-registry 插件生成——请勿手写。真源：tools/<id>/tool.config.ts
export const TOOLS = [
${entries.join(',\n')}
];

export const LIVE_TOOLS = TOOLS.filter((t) => t.live);
export const ALL_TAGS = [...new Set(TOOLS.flatMap((t) => t.tags))];
`;
    },
  };
}
