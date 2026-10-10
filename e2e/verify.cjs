/**
 * E2E 验收：门户主页 + 镜头数据库（多文件构建）
 *
 * 用法（先另开一个终端把站点跑起来）：
 *   npm run build && npm run preview -- --port 4173
 *   npm run e2e
 *
 * 也可指定地址：node e2e/verify.cjs http://127.0.0.1:5173   （vite dev 也行）
 */
'use strict';

const path = require('node:path');
const {
  BASE, SHOT_DIR, launch, createReporter, canvasReport,
  prepareRow, rowRect, hitTest, ensureShotDir,
} = require('./harness.cjs');

(async () => {
  const r = createReporter();
  ensureShotDir();
  const shot = (n) => path.join(SHOT_DIR, n);

  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  /* ==================== 门户主页 ==================== */
  console.log('\n===== 门户主页 =====');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  r.ok('主页标题', (await page.title()).includes('工具箱'), await page.title());
  r.ok('主页 H1', (await page.locator('h1').first().innerText()).includes('工具箱'));

  const cards = page.locator('main a[href]');
  r.ok('工具卡片数量', (await cards.count()) === 1, `count=${await cards.count()}`);
  r.ok('卡片名称', (await cards.first().innerText()).includes('全球镜头数据库'));
  const cardHref = await cards.first().getAttribute('href');
  r.ok('卡片链接指向 lens/', cardHref === 'lens/', String(cardHref));

  const search = page.locator('input[type=search]');
  await search.fill('镜头');
  await page.waitForTimeout(150);
  r.ok('搜索命中', (await page.locator('main a[href]').count()) === 1);
  await search.fill('不存在的工具zzz');
  await page.waitForTimeout(150);
  r.ok('搜索未命中显示空态', (await page.getByText('没有匹配的工具').count()) === 1);
  await search.fill('');
  await page.waitForTimeout(150);

  r.ok('存在「全部」标签', (await page.locator('button', { hasText: /^全部$/ }).count()) >= 1);
  await page.screenshot({ path: shot('portal-light.png'), fullPage: true });

  await page.locator('button[aria-label="切换主题"]').click();
  await page.waitForTimeout(250);
  r.ok('主页切到深色', (await page.evaluate(() => document.documentElement.classList.contains('dark'))) === true);
  const stored = await page.evaluate(() => localStorage.getItem('theme'));
  r.ok('主题持久化到 localStorage', stored === 'dark' || stored === 'light', `theme=${stored}`);
  await page.screenshot({ path: shot('portal-dark.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const pOv = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  r.ok('主页移动端无横向滚动', pOv.doc <= pOv.win + 1, `scrollWidth=${pOv.doc} innerWidth=${pOv.win}`);
  await page.screenshot({ path: shot('portal-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.locator('main a[href]').first().click();
  await page.waitForURL(/\/lens\/?$/, { timeout: 15000 });
  r.ok('点击卡片进入镜头页', page.url().includes('/lens'), page.url());

  /* ==================== 镜头数据库 ==================== */
  console.log('\n===== 镜头数据库 =====');
  await page.waitForSelector('[data-app-ready]', { timeout: 20000 });
  await page.waitForTimeout(900);

  const countOf = () =>
    page.evaluate(() => Number(document.querySelector('[data-app-ready]').getAttribute('data-app-ready')));

  r.ok('镜头页标题', (await page.title()).includes('镜头'), await page.title());
  r.ok('H1 正确', (await page.locator('h1').first().innerText()).includes('全球镜头评测数据库'));
  r.ok('数据载入（1617 条）', (await countOf()) === 1617, `命中 ${await countOf()}`);

  const statText = await page.locator('header').first().innerText();
  r.ok('统计块含「收录镜头」', statText.includes('收录镜头'));
  r.ok('统计块含「家评测源」', statText.includes('家评测源'));
  r.ok('最高综合分已归一（9.5，不是 89.2）', statText.includes('9.5'));

  const rep0 = await canvasReport(page);
  r.ok('画布数量为 8', rep0.length === 8, `count=${rep0.length}`);
  const bad0 = rep0.filter((c) => c.ratio < 0.01 || c.colors < 3);
  r.ok('8 张图表都真的画出了内容', bad0.length === 0,
    bad0.length ? JSON.stringify(bad0) : rep0.map((c) => c.ratio).join(' '));

  r.ok('品牌 chip 已渲染（≥40）',
    (await page.locator('button[aria-pressed]', { hasText: /（/ }).count()) >= 40,
    `count=${await page.locator('button[aria-pressed]', { hasText: /（/ }).count()}`);
  r.ok('对比台默认 3 支', (await page.locator('button[aria-label^="移除 "]').count()) === 3);
  r.ok('表格单页 100 行', (await page.locator('table tbody tr').count()) === 100);

  const pagerText = await page.locator('table').locator('xpath=..').locator('xpath=..').innerText();
  r.ok('分页信息含总数 1,617', /共\s*1,617\s*支/.test(pagerText));
  await page.getByRole('button', { name: /下一页/ }).click();
  await page.waitForTimeout(300);
  const page2 = await page.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find((s) => /第\s*\d+\s*\/\s*\d+\s*页/.test(s.textContent || ''));
    return el ? el.textContent.trim() : '';
  });
  r.ok('翻页生效', /第\s*2\s*\//.test(page2), page2);
  await page.getByRole('button', { name: /首页/ }).click();
  await page.waitForTimeout(300);

  await page.getByRole('columnheader', { name: /参考价/ }).click();
  await page.waitForTimeout(300);
  const firstRow = await page.locator('table tbody tr').first().innerText();
  r.ok('按参考价排序生效', /¥\d/.test(firstRow), firstRow.split('\t').filter(Boolean).slice(-4).join(' | '));

  // 悬停浮层
  await prepareRow(page, 0);
  const p0 = await rowRect(page, 0, null);
  await page.mouse.move(p0.x, p0.y);
  await page.waitForTimeout(350);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('[data-tip]');
    return t
      ? { op: getComputedStyle(t).opacity, left: t.style.left, text: (t.textContent || '').slice(0, 24) }
      : null;
  });
  r.ok('表格行悬停显示浮层', !!tip && tip.op === '1' && parseFloat(tip.left) > 0, JSON.stringify(tip));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);

  // 筛选
  await page.locator('input[placeholder^="搜索型号"]').fill('Viltrox');
  await page.waitForTimeout(600);
  const cViltrox = await countOf();
  r.ok('搜索 Viltrox 命中数减少', cViltrox > 0 && cViltrox < 1617, `命中 ${cViltrox}`);
  await page.locator('input[placeholder^="搜索型号"]').fill('');
  await page.waitForTimeout(600);
  r.ok('清空搜索恢复全量', (await countOf()) === 1617);

  await page.locator('input[type=range][data-metric=flare]').fill('10');
  await page.waitForTimeout(600);
  const cFlare = await countOf();
  r.ok('抗眩光 ≥10 筛选生效', cFlare > 0 && cFlare < 1617, `命中 ${cFlare}`);
  await page.getByRole('button', { name: '重置全部条件' }).click();
  await page.waitForTimeout(600);
  r.ok('重置恢复全量', (await countOf()) === 1617);

  await page.getByRole('button', { name: /^Nikon Z/ }).first().click();
  await page.waitForTimeout(600);
  const cMount = await countOf();
  r.ok('卡口筛选生效', cMount > 0 && cMount < 1617, `Nikon Z 命中 ${cMount}`);
  await page.getByRole('button', { name: '重置全部条件' }).click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /≤F1\.4/ }).click();
  await page.waitForTimeout(600);
  const cAp = await countOf();
  r.ok('光圈 ≤F1.4 筛选生效', cAp > 0 && cAp < 1617, `命中 ${cAp}`);
  await page.getByRole('button', { name: '重置全部条件' }).click();
  await page.waitForTimeout(600);

  // 对比 + 数据表遮挡回归守卫
  await prepareRow(page, 0);
  const cmp = await rowRect(page, 0, 'button[data-cmp]');
  const cmpHit = await hitTest(page, cmp.x, cmp.y);
  // 回归守卫：图表曾因 ChartCard / ChartBox 双层高度错配而溢出，盖住数据表使其完全点不动
  r.ok('数据表未被图表遮挡（命中态正确）', cmpHit.includes('[data-cmp]'), cmpHit);
  await page.mouse.click(cmp.x, cmp.y);
  await page.waitForTimeout(600);
  r.ok('加入对比台后为 4 支', (await page.locator('button[aria-label^="移除 "]').count()) === 4);

  // 榜单维度切换
  const rankBefore = await page.locator('h3', { hasText: /排行/ }).first().innerText();
  await page.getByRole('button', { name: /轴向色差 LoCA/ }).click();
  await page.waitForTimeout(700);
  const rankAfter = await page.locator('h3', { hasText: /排行/ }).first().innerText();
  r.ok('榜单维度切换生效', rankBefore !== rankAfter, `${rankBefore} → ${rankAfter}`);

  // 散点视图切换
  const scBefore = await page.locator('h3', { hasText: /抗眩光 × 色散/ }).count();
  await page.getByRole('button', { name: /锐度配对/ }).click();
  await page.waitForTimeout(800);
  const scAfter = await page.locator('h3', { hasText: /中心锐度 × 边缘锐度/ }).count();
  r.ok('散点视图切换生效', scBefore === 1 && scAfter === 1, `${scBefore} → ${scAfter}`);
  const rep1 = await canvasReport(page);
  r.ok('切换后图表仍全部健康', rep1.filter((c) => c.ratio < 0.01).length === 0,
    rep1.map((c) => c.ratio).join(' '));

  // 详情抽屉
  await prepareRow(page, 2);
  const det = await rowRect(page, 2, 'button[data-detail]');
  await page.mouse.click(det.x, det.y);
  await page.waitForTimeout(600);
  r.ok('详情抽屉打开', (await page.evaluate(() => {
    const a = document.querySelector('aside[role=dialog]');
    return a ? a.getAttribute('aria-hidden') === 'false' && a.getBoundingClientRect().right <= window.innerWidth + 2 : false;
  })) === true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  r.ok('Esc 关闭抽屉',
    (await page.evaluate(() => document.querySelector('aside[role=dialog]')?.getAttribute('aria-hidden') === 'true')) === true);

  // 空状态占位
  await page.locator('input[placeholder="0"]').fill('1');
  await page.locator('input[placeholder="99999"]').fill('2');
  await page.waitForTimeout(800);
  r.ok('极端筛选下不崩溃（8 块画布都还在）', (await canvasReport(page)).length === 8);
  const ph = await page.evaluate(() => {
    let n = 0;
    [...document.querySelectorAll('canvas')].forEach((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let painted = 0;
      for (let j = 3; j < d.length; j += 4) if (d[j] > 0) painted++;
      if (painted / (d.length / 4) < 0.01) n++;
    });
    return n;
  });
  r.ok('出现空状态占位画布', ph >= 1, `placeholders=${ph}`);
  await page.screenshot({ path: shot('lens-empty-filter.png') });
  await page.getByRole('button', { name: '重置全部条件' }).click();
  await page.waitForTimeout(800);

  // 主题
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (await isDark()) {
    await page.locator('button[aria-label="切换主题"]').click();
    await page.waitForTimeout(800);
  }
  r.ok('镜头页当前为浅色', (await isDark()) === false);
  await page.screenshot({ path: shot('lens-light-full.png'), fullPage: true });

  await page.locator('button[aria-label="切换主题"]').click();
  await page.waitForTimeout(900);
  r.ok('镜头页切到深色', (await isDark()) === true);
  const repDark = await canvasReport(page);
  r.ok('深色下图表仍全部健康', repDark.filter((c) => c.ratio < 0.01).length === 0,
    repDark.map((c) => c.ratio).join(' '));
  await page.screenshot({ path: shot('lens-dark-full.png'), fullPage: true });
  await page.locator('button[aria-label="切换主题"]').click();
  await page.waitForTimeout(700);

  // 移动端
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const lOv = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    body: document.body.scrollWidth,
  }));
  r.ok('镜头页移动端无横向滚动', lOv.doc <= lOv.win + 1,
    `scrollWidth=${lOv.doc} innerWidth=${lOv.win} body=${lOv.body}`);
  await page.screenshot({ path: shot('lens-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(500);

  // CSV 导出
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    page.getByRole('button', { name: /导出当前结果为 CSV/ }).click(),
  ]);
  r.ok('CSV 导出触发下载', !!download, download ? await download.suggestedFilename() : 'no download');

  /* ==================== 控制台 ==================== */
  console.log('\n===== 控制台 =====');
  r.ok('无未捕获的页面异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  r.ok('无 console.error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();

  const failed = r.summary();
  if (failed === 0) console.log(`截图输出到 ${SHOT_DIR}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常：', e);
  process.exit(2);
});
