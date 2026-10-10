// !/usr/bin/env bash
// 依赖铁律的可机检实现（t15）
// 
// 为什么有这个脚本：oxlint 1.87 的 no-restricted-imports 在「目录扫描」模式下
// 对相对路径 specifier（如 '../lens/filter'）的 glob 匹配不可靠——单文件模式
// 能命中，目录扫描会漏（base 推断不同）。铁律不能建立在"有时能命中"上，
// 所以 ②（工具间零横向依赖）用确定性文本扫描兜底；①③ 用 oxlint（它们匹配
// 的是绝对形态的 specifier 或 cwd 相对路径，实测可靠）。
// 
// 用法：node e2e/check-iron-laws.mjs   （exit 0 = 全部通过；package.json 的 lint 脚本已按此路径接线）
'use strict';

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const TOOLS = join(ROOT, 'tools');

let failed = 0;

/**
 * 铁律②：工具间零横向依赖。
 * 对 tools/ 下每个工具目录，扫描其 .ts/.tsx 的 import 语句，
 * 解析相对 specifier 是否逃逸到兄弟工具目录。
 */
console.log('铁律②（工具间零横向依赖）—— 文本扫描');
const toolDirs = readdirSync(TOOLS).filter((d) => statSync(join(TOOLS, d)).isDirectory());

for (const dir of toolDirs) {
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const src = readFileSync(p, 'utf8');
      const re = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1] || m[2] || m[3];
        if (!spec || !spec.startsWith('.')) continue; // 只关心相对路径
        // 解析出绝对路径，再判断是否落在另一个工具目录内
        const baseDir = join(p, '..');
        const abs = join(baseDir, spec);
        const rel = relative(TOOLS, abs);
        if (rel.startsWith('..') || rel.split(/^[/\\]/)[0] === '') continue;
        const targetTool = rel.split(/[\\/]/)[0];
        if (targetTool && targetTool !== dir) {
          console.error(`  ✗ 铁律②违例：${relative(ROOT, p)} import '${spec}' → 工具 ${targetTool}`);
          failed++;
        }
      }
    }
  };
  walk(join(TOOLS, dir));
}
console.log(`  扫描 ${toolDirs.length} 个工具目录`);

console.log('');
console.log('铁律①/③（platform 禁 import tools；portal 只读注册表）—— oxlint');
// 由 package.json 的 lint 脚本分别跑：
//   oxlint platform --config scripts/oxlint.iron-platform.json
//   oxlint src/portal --config scripts/oxlint.iron-portal.json
// 此处不再重复（避免双跑），只负责铁律②。

if (failed) {
  console.error(`\n❌ ${failed} 处依赖铁律违例`);
  process.exit(1);
}
console.log('\n✅ 依赖铁律②通过（①③由 oxlint 配置承担）');
