import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toolboxRegistryPlugin, urlLayoutPlugin } from './platform/registry/plugin';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * 两种构建模式：
 *   vite build                    → 多文件构建，产物 dist/，用于部署（按需加载、可缓存）
 *   vite build --mode singlefile  → 单文件构建，产物 dist-single/，JS/CSS/数据全内联进 HTML，
 *                                   适合离线双击打开或单文件分享
 *
 * 构建入口（input）不再手写：由 platform/registry/plugin.ts 从 tools/<id>/tool.config.ts
 * 派生（单一事实来源）。单文件与多文件模式统一派生——迁移前的 P2 缺陷
 * （单文件只构建 lens，新增工具静默丢失）由此根除。
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'singlefile';

  // 部署在用户站根路径 https://chenwn1186.github.io/
  // 若日后改成「项目站」（https://用户名.github.io/仓库名/），
  // 只需 VITE_BASE=/仓库名/ npm run build，无需改代码。
  const base = single ? './' : (process.env.VITE_BASE || '/');

  return {
    base,

    // 单文件模式下把数据内联进包：file:// 下 fetch 会被同源策略拦掉。
    // 定义成字面量后，data.ts 里那个 fetch 分支会被静态求值掉，不会产生多余 chunk。
    define: {
      __INLINE_DATA__: JSON.stringify(single),
    },

    plugins: [
      toolboxRegistryPlugin(),
      // 把 dist[-single]/tools/<id>/ 重排为 dist[-single]/<id>/（URL 契约 /<id>/）。
      // 两种模式都需要：单文件也是每工具一个 HTML（只是资源内联）。
      urlLayoutPlugin(resolve(root, single ? 'dist-single' : 'dist')),
      react(),
      tailwindcss(),
      ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
    ],

    resolve: {
      alias: {
        '@': resolve(root, 'src'),
        // 平台层别名：工具与门户引用 platform/ 的统一入口。
        // 依赖铁律（oxlint 强制）：platform/** 不得 import tools/**。
        '@platform': resolve(root, 'platform'),
      },
    },

    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      // 数据文件近 1MB，提到 1.5MB 避免体积警告刷屏
      chunkSizeWarningLimit: 1500,
      // 单文件模式下 vite-plugin-singlefile 会关闭 code splitting，
      // 动态 import 自动内联，无需再配 inlineDynamicImports（配了反而会有警告）
      // input 由 toolbox-registry 插件派生（见上），此处不再手写
    },
  };
});
