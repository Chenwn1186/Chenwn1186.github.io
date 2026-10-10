/**
 * E2E 验证公共层
 *
 * 为什么是 .cjs 而不是 .mjs：package.json 里 "type": "module"，
 * .js 会被当 ESM。这里刻意用 CommonJS，这样 require('playwright')
 * 在「项目内装了 playwright」和「全局装了 + NODE_PATH」两种情况下都能解析。
 *
 * 依赖：playwright（不进 devDependencies，避免 CI 的 npm ci 顺带下载浏览器）
 *   npm i -D playwright && npx playwright install chromium
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** 被测站点地址。优先级：命令行参数 > BASE_URL 环境变量 > 默认值 */
const BASE = process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:4173';

/** 截图输出目录 */
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.cwd(), '_shots');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    console.error(
      '\n找不到 playwright。请先执行：\n' +
        '  npm i -D playwright\n' +
        '  npx playwright install chromium\n',
    );
    process.exit(3);
  }
}

/**
 * 定位 chromium 可执行文件。
 * 本机 playwright 的期望版本与实际安装的 chromium build 号可能不一致
 * （例如 playwright 1.59-alpha 期望 chromium-1210，实际装的是 1223），
 * 这时 playwright 自己会报 "Executable doesn't exist"，必须显式指定路径。
 */
function findChrome() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    path.join(process.env.HOME || '', '.cache', 'ms-playwright'),
    path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright'),
  ];
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    const dirs = fs
      .readdirSync(root)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const exe = path.join(root, d, rel);
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return undefined; // 交给 playwright 自己找
}

async function launch() {
  const { chromium } = loadPlaywright();
  const exe = findChrome();
  if (exe) console.log('浏览器：', exe);
  return chromium.launch(exe ? { executablePath: exe } : {});
}

/* ---------- 断言收集 ---------- */
function createReporter() {
  const results = [];
  return {
    ok(name, pass, detail) {
      results.push({ name, pass: !!pass, detail });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
    },
    get results() {
      return results;
    },
    summary() {
      const failed = results.filter((r) => !r.pass);
      console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
      if (failed.length) {
        console.log('失败项：');
        failed.forEach((f) => console.log('  -', f.name, f.detail ?? ''));
      }
      return failed.length;
    },
  };
}

/* ---------- 画布健康度 ---------- *
 * 判据：统计 canvas 上「非透明像素」的占比。
 * 真实图表通常 >10%；空状态占位只画一条细线 + 一行字，<1%。
 * 这条判据能抓住「图表整块变白但控制台不报错」这类问题 —— 我们被坑过。 */
async function canvasReport(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('canvas')].map((c, i) => {
      const ctx = c.getContext('2d');
      let painted = 0;
      const colors = new Set();
      try {
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const total = d.length / 4;
        for (let j = 0; j < d.length; j += 4) {
          if (d[j + 3] > 0) {
            painted++;
            if (colors.size < 40 && j / 4 % 37 === 0) colors.add(`${d[j]},${d[j + 1]},${d[j + 2]},${d[j + 3]}`);
          }
        }
        return {
          i,
          w: c.width,
          h: c.height,
          ratio: +(painted / total).toFixed(4),
          colors: colors.size,
          label: c.getAttribute('aria-label') || '',
        };
      } catch (e) {
        return { i, w: c.width, h: c.height, ratio: -1, colors: 0, label: String(e) };
      }
    });
  });
}

/* ---------- 表格操作辅助 ---------- *
 * 数据表在 660px 的滚动容器里，locator.hover/click 的 actionability 判定
 * 会被 sticky 表头和内部滚动搞乱（曾误报「被 canvas 遮挡」）。
 * 这里手动摆好滚动位置，再用真实鼠标坐标操作。 */
async function prepareRow(page, i) {
  await page.evaluate((idx) => {
    const sc = document.querySelector('table').parentElement;
    sc.scrollIntoView({ block: 'center' });
    sc.scrollLeft = 0; // 表格比容器宽，横向归零，否则「对比」按钮跑到视口外
    sc.scrollTop = Math.max(0, idx * 80 - 120);
  }, i);
  await page.waitForTimeout(350);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
}

async function rowRect(page, i, sel) {
  return page.evaluate(
    ([idx, s]) => {
      const sc = document.querySelector('table').parentElement;
      const sr = sc.getBoundingClientRect();
      const tr = document.querySelectorAll('table tbody tr')[idx];
      if (!tr) return { err: 'no row' };
      const el = s ? tr.querySelector(s) : tr;
      if (!el) return { err: 'no el' };
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        scroller: { t: Math.round(sr.top), h: Math.round(sr.height) },
        scrollY: Math.round(window.scrollY),
      };
    },
    [i, sel],
  );
}

/** 该点最上层的元素，用来说明「到底是谁挡住了它」 */
async function hitTest(page, x, y) {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return 'null';
      const label = el.getAttribute('aria-label');
      return `${el.tagName}${el.hasAttribute('data-cmp') ? '[data-cmp]' : ''}${label ? ' ' + label : ''}`;
    },
    [x, y],
  );
}

function ensureShotDir() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return SHOT_DIR;
}

module.exports = {
  BASE,
  SHOT_DIR,
  launch,
  createReporter,
  canvasReport,
  prepareRow,
  rowRect,
  hitTest,
  ensureShotDir,
  findChrome,
};
