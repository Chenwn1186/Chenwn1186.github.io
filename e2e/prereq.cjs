/**
 * E2E 前置数据自检
 *
 * 为什么需要它：`public/data/lenses.json` 与 `src/data/lenses-inline.ts` 都是
 * `scripts/prepare-data.mjs` 的**构建期生成物**，且被 .gitignore 排除。
 * 干净 clone 后它们**不存在**。而 `npm run e2e` 与 `npm run build`/`npm run dev`
 * 不同——后两者内部都会先跑 `npm run data`，**唯独 e2e 不跑**。
 *
 * 于是漏跑时会发生什么：verify.cjs 顶部 `require('../public/data/lenses.json')`
 * 抛 MODULE_NOT_FOUND，进程 exit 2 崩溃。**这是"失败响亮但原因误导人"**：
 * 退出码看起来像脚本自身出错，而不是"少跑了一个前置步骤"。
 *
 * 本模块把那类误导性崩溃转成明确指引。两道断言：
 *   ① 文件缺失        → 提示「请先跑 npm run data」
 *   ② 文件存在但空数组 → 同样失败（生成物损坏 / 数据源为空）
 *
 * 用法：在 verify.cjs 顶部 `require('./prereq.cjs').assertDataReady()`。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** 生成物清单：路径 + 人类可读用途 + 是否为 JSON 数组（需要 length 校验） */
const ARTIFACTS = [
  { rel: 'public/data/lenses.json', purpose: '多文件构建时前端 fetch 的数据（≈0.92 MB）', isArray: true },
  { rel: 'src/data/lenses-inline.ts', purpose: '单文件构建时内联进包的数据', isArray: false },
];

function fail(lines) {
  console.error('\n========================================');
  console.error('E2E 前置检查失败');
  console.error('========================================');
  lines.forEach((l) => console.error(l));
  console.error('\n修复：在仓库根目录执行');
  console.error('  npm run data');
  console.error('然后再跑 npm run e2e。');
  console.error('\n（提示：这两个文件是构建期生成物，被 .gitignore 排除，');
  console.error('  干净 clone 下不存在。npm run build / npm run dev 内部会自动跑 data，');
  console.error('  但 npm run e2e 不会——所以必须手动先跑一次。）');
  console.error('');
  process.exit(2);
}

/**
 * 断言生成物齐备且非空。失败即 exit 2 并给出可执行指引。
 * @returns {{ lensCount: number }} 数据条数，供调用方直接使用（避免重复读文件）
 */
function assertDataReady() {
  const missing = [];
  const empty = [];

  for (const a of ARTIFACTS) {
    const abs = path.join(ROOT, a.rel);
    if (!fs.existsSync(abs)) {
      missing.push(a);
      continue;
    }
    // 空数组 = 生成物损坏（或数据源为空），同样不可用于验收
    if (a.isArray) {
      try {
        const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
        if (!Array.isArray(parsed) || parsed.length === 0) {
          empty.push({ ...a, detail: Array.isArray(parsed) ? 'length === 0' : '不是 JSON 数组' });
        }
      } catch (e) {
        empty.push({ ...a, detail: `JSON 解析失败：${e.message}` });
      }
    } else if (fs.statSync(abs).size === 0) {
      empty.push({ ...a, detail: '文件为空（0 字节）' });
    }
  }

  if (missing.length || empty.length) {
    const lines = [];
    if (missing.length) {
      lines.push('缺失的生成物：');
      missing.forEach((a) => lines.push(`  ✗ ${a.rel}    —— ${a.purpose}`));
    }
    if (empty.length) {
      lines.push('');
      lines.push('存在但不可用的生成物：');
      empty.forEach((a) => lines.push(`  ✗ ${a.rel}    —— ${a.detail}`));
      lines.push('  （存在但内容为空/损坏，说明 data 跑失败了，请重跑）');
    }
    fail(lines);
  }

  const lensCount = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/data/lenses.json'), 'utf8'),
  ).length;
  return { lensCount };
}

module.exports = { assertDataReady, ARTIFACTS };
