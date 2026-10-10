import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * 两种构建模式：
 *   vite build                    → 多文件构建，产物 dist/，用于部署（按需加载、可缓存）
 *   vite build --mode singlefile  → 单文件构建，产物 dist-single/，JS/CSS/数据全内联进 HTML，
 *                                   适合离线双击打开或单文件分享
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'singlefile';

  // 显式标注为 Record<string,string>：否则三元表达式产生的联合类型
  // 会被推断成 { main?: undefined }，与 Rolldown 的 InputOption 不兼容
  const input: Record<string, string> = single
    ? { lens: resolve(root, 'lens/index.html') }
    : {
        main: resolve(root, 'index.html'),
        lens: resolve(root, 'lens/index.html'),
      };

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
      react(),
      tailwindcss(),
      ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
    ],

    resolve: {
      alias: { '@': resolve(root, 'src') },
    },

    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      // 数据文件近 1MB，提到 1.5MB 避免体积警告刷屏
      chunkSizeWarningLimit: 1500,
      // 单文件模式下 vite-plugin-singlefile 会关闭 code splitting，
      // 动态 import 自动内联，无需再配 inlineDynamicImports（配了反而会有警告）
      rollupOptions: { input },
    },
  };
});
