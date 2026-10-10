import { useMemo, useState, type RefObject } from 'react';
import { brandColor, brandLabel, BRAND_CN, fmt, hex2rgba, type Lens } from '../domain/lens';
import {
  chartThemeFor,
  gridStyle,
  NO_GRID,
  pointerFromChart,
  type ChartSpec,
} from '@platform/chart/chart';
import { ChartBox } from '@platform/chart/ChartBox';
import { ChartCard, SectionHead, Tabs } from '@platform/ui/ui';
import type { TipHandle } from '../components/LensTip';
import { useThemeValue } from '@platform/theme/useTheme';

/* ---------- 散点视图定义 ---------- */
interface ScatterDef {
  id: 'sc1' | 'sc2';
  t: string;
  h: string;
  x: (d: Lens) => number | null | undefined;
  y: (d: Lens) => number | null | undefined;
  lo: number;
  hi: number;
  capY?: boolean;
  rev?: boolean;
}

const SCATTER_VIEWS: ScatterDef[][] = [
  [
    {
      id: 'sc1', t: '抗眩光 × 色散',
      h: '横轴抗眩光 → 纵轴色散均值 ↑ · 右上角为全能',
      x: (d) => d.flare,
      y: (d) => ((d.cal ?? 5) + (d.cax ?? 5)) / 2,
      lo: 3, hi: 10.5,
    },
    {
      id: 'sc2', t: '综合分 × 价格',
      h: '横轴综合分 → 纵轴价格 ↑ · 左上角性价比最高（价格轴截顶至 98 分位）',
      x: (d) => d.overall,
      y: (d) => d.price,
      lo: 3, hi: 10.2, capY: true,
    },
  ],
  [
    {
      id: 'sc1', t: '中心锐度 × 边缘锐度',
      h: '横轴中心锐度 → 纵轴边缘锐度 ↑ · 对角线以上＝边缘保持好',
      x: (d) => d.sharp,
      y: (d) => d.edge,
      lo: 4, hi: 10.5,
    },
    {
      id: 'sc2', t: '最大光圈 × 综合分',
      h: '横轴光圈（向左更大）· 纵轴综合分 ↑ · 左上角＝大光圈且高分',
      x: (d) => d.apMax,
      y: (d) => d.overall,
      lo: 1, hi: 10.2, rev: true,
    },
  ],
];

const VIEW_TABS = [
  { value: 0, label: '抗眩光 × 色散 / 综合分 × 价格' },
  { value: 1, label: '锐度配对 / 光圈 × 综合分' },
];

/*
  建散点。两个致命雷区（任一触发都会让 chartArea.height 变 0，整图空白）：
  1. 点里出现 {x:null} / NaN —— 哪怕一个，整条轴的范围计算就被污染 → 图空白。必须过滤。
  2. pointRadius 写成**数组** —— Chart.js 4.x 的数组型 radius 只适用于 line/bar 逐点尺寸，
     scatter + 多数据集 + 上千点时元素计数会被算错，_parsed 长度错乱 → 轴范围解析失败。
     实测对照（1500px 视口）：数组 → areaH=0 ❌；标量 → areaH=274 ✅。
  「气泡大小＝综合分」这种信息交给 tooltip 表达，绝不靠半径数组。
*/
function buildScatter(rows: Lens[], def: ScatterDef, cap = 10) {
  const groups = new Map<string, Lens[]>();
  for (const d of rows) {
    const g = groups.get(d.brand);
    if (g) g.push(d);
    else groups.set(d.brand, [d]);
  }
  const keys = [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length).slice(0, cap);

  const toPoints = (arr: Lens[]) => {
    const pts: { x: number; y: number }[] = [];
    const refs: Lens[] = [];
    for (const d of arr) {
      const x = def.x(d);
      const y = def.y(d);
      if (x == null || y == null || !isFinite(x) || !isFinite(y)) continue;
      pts.push({ x, y });
      refs.push(d);
    }
    return { pts, refs };
  };

  const datasets: Record<string, unknown>[] = [];
  const refsByDs: Lens[][] = [];
  for (const b of keys) {
    const { pts, refs } = toPoints(groups.get(b)!);
    if (!pts.length) continue;
    datasets.push({
      label: brandLabel(b),
      backgroundColor: hex2rgba(brandColor(b), 0.6),
      borderColor: brandColor(b),
      borderWidth: 1,
      pointRadius: 3.4, // 必须是标量
      pointHoverRadius: 6.5,
      pointHitRadius: 12, // 鼠标靠近即可，不用精确压住 3.4px 的点
      data: pts,
    });
    refsByDs.push(refs);
  }
  const rest = rows.filter((d) => !keys.includes(d.brand));
  const restPts = toPoints(rest);
  if (restPts.pts.length) {
    datasets.push({
      label: '其他品牌',
      backgroundColor: 'rgba(156,154,146,.45)',
      borderColor: '#9C9A92',
      borderWidth: 1,
      pointRadius: 3.0,
      pointHoverRadius: 6,
      pointHitRadius: 12,
      data: restPts.pts,
    });
    refsByDs.push(restPts.refs);
  }
  return { datasets, refsByDs };
}

/** 价格轴用 p98 截顶：27 万和 400 块同框，绝大多数点会挤成一条线 */
function priceCap(rows: Lens[], def: ScatterDef): number | undefined {
  if (!def.capY) return undefined;
  const vals = rows
    .map((d) => def.y(d))
    .filter((v): v is number => v != null && isFinite(v))
    .sort((a, b) => a - b);
  if (!vals.length) return undefined;
  const p98 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.98))];
  return Math.ceil(p98 / 500) * 500;
}

/* ---------- 四分位 ---------- */
function boxStats(arr: number[]) {
  const a = arr.slice().sort((x, y) => x - y);
  const q = (p: number) => {
    const i = (a.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  };
  return { min: a[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: a[a.length - 1], n: a.length };
}

const FOCAL_BANDS: [number, number][] = [
  [8, 14], [14, 20], [20, 24], [24, 28], [28, 35], [35, 50], [50, 70],
  [70, 85], [85, 105], [105, 135], [135, 200], [200, 300], [300, 500], [500, 2000],
];

interface HoverEl {
  datasetIndex: number;
  index: number;
}

export function OverviewSection({ rows, tipRef }: { rows: Lens[]; tipRef: RefObject<TipHandle | null> }) {
  const theme = useThemeValue();
  const ct = chartThemeFor(theme);
  const [view, setView] = useState(0);
  const defs = SCATTER_VIEWS[view];

  const scatters = useMemo(
    () =>
      defs.map((def) => {
        const { datasets, refsByDs } = buildScatter(rows, def);
        const yMax = priceCap(rows, def);
        const opts: Record<string, unknown> = {
          // 散点是 3.4px 的小圆点，默认必须精确压住才响应，几乎「悬停不了」。
          // point 模式 + intersect:false：鼠标落在最近的点的 hitRadius 内即命中。
          interaction: { mode: 'point', intersect: false },
          scales: {
            x: {
              grid: gridStyle(ct),
              // 必须显式 min/max，不能用 suggestedMin/suggestedMax：
              // suggested* 只是「建议」，Chart.js 仍会把数据极值纳入计算，
              // 一旦有超预期极值，轴范围失控 → 刻度标签变宽 → 绘图区横向被挤爆。
              min: def.lo,
              max: def.hi,
              reverse: def.rev ?? false,
              ticks: { maxTicksLimit: 6, font: { size: 9.5 } },
            },
            y: {
              grid: gridStyle(ct),
              // 同样用显式 max：suggestedMax 只是建议，Chart.js 会向上取整到 12，
              // 而所有评分都 ≤10，白白浪费两成绘图高度。价格轴另用 p98 截顶。
              max: yMax != null ? yMax : def.hi,
              ticks: { maxTicksLimit: 6, font: { size: 9.5 }, autoSkip: true },
            },
          },
          plugins: {
            legend: { display: false }, // 图例交给 canvas 外的 HTML，避免挤占绘图高度
            tooltip: { enabled: false },
          },
          onHover: (e: unknown, els: HoverEl[], chart: unknown) => {
            const tip = tipRef.current;
            if (!tip) return;
            if (!els.length) return tip.hide();
            const d = refsByDs[els[0].datasetIndex]?.[els[0].index];
            if (!d) return tip.hide();
            const p = pointerFromChart(e, chart);
            tip.show(p.x, p.y, d);
          },
        };
        const spec: ChartSpec = {
          type: 'scatter',
          data: { datasets },
          options: opts,
          emptyText:
            def.t === '综合分 × 价格'
              ? '当前筛选下没有同时具备「综合分」和「参考价」的镜头'
              : '当前筛选下没有可用于此图的评分数据',
          emptyHint:
            def.t === '综合分 × 价格'
              ? '（老式卡口的镜头在评测站上通常没有零售价，可换个卡口试试）'
              : '（试试放宽筛选条件）',
        };
        return { def, spec };
      }),
    [defs, rows, tipRef, ct],
  );

  /** 散点图例（HTML，置于 canvas 外） */
  const legend = useMemo(() => {
    const bc = new Map<string, number>();
    for (const d of rows) bc.set(d.brand, (bc.get(d.brand) ?? 0) + 1);
    const top = [...bc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { top, more: bc.size > top.length };
  }, [rows]);

  /* ---------- 品牌箱线 ---------- */
  const brandBoxSpec = useMemo<ChartSpec>(() => {
    const g = new Map<string, number[]>();
    for (const d of rows) {
      if (d.overall == null) continue;
      const arr = g.get(d.brand);
      if (arr) arr.push(d.overall);
      else g.set(d.brand, [d.overall]);
    }
    const ent = [...g.entries()]
      .filter(([, v]) => v.length >= 3)
      .map(([k, v]) => ({
        k,
        ...boxStats(v),
        lens: rows.filter((d) => d.brand === k && d.overall != null),
      }))
      .sort((a, b) => b.med - a.med)
      .slice(0, 18);
    // 各品牌综合分最高的那支，作为悬停浮层的样本
    const best = ent
      .map((e) => e.lens.slice().sort((x, y) => (y.overall ?? 0) - (x.overall ?? 0))[0])
      .filter(Boolean);

    return {
      type: 'bar',
      emptyText: '当前筛选下没有品牌达到 ≥3 支有综合分的镜头',
      emptyHint: '（四分位统计至少需要 3 个样本，可放宽筛选）',
      data: {
        labels: ent.map((e) =>
          BRAND_CN[e.k] ? `${e.k}（${BRAND_CN[e.k]}） (${e.n})` : `${e.k} (${e.n})`,
        ),
        datasets: [
          {
            label: '四分位区间',
            data: ent.map((e) => [e.q1, e.q3]),
            backgroundColor: ent.map((e) => hex2rgba(brandColor(e.k), 0.42)),
            borderColor: ent.map((e) => brandColor(e.k)),
            borderWidth: 1,
            borderRadius: 2,
            borderSkipped: false,
          },
          {
            label: '中位数',
            data: ent.map((e) => e.med),
            backgroundColor: ent.map((e) => brandColor(e.k)),
            barPercentage: 0.28,
            categoryPercentage: 0.7,
            borderRadius: 2,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        // 横向条形图不能用 mode:'index'（Chart.js 4.x 在 indexAxis:y 下会算错索引，
        // els 恒空 → 悬停全失效）。nearest 按几何距离取最近元素，横竖都对。
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: {
            min: 4,
            max: 10,
            grid: gridStyle(ct),
            title: { display: true, text: '综合分', color: ct.title, font: { size: 10.5 } },
          },
          y: { grid: NO_GRID, ticks: { font: { size: 10 }, autoSkip: false } },
        },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 10.5 } } },
          tooltip: { enabled: false },
        },
        onHover: (e: unknown, els: HoverEl[], chart: unknown) => {
          const tip = tipRef.current;
          if (!tip) return;
          if (!els.length) return tip.hide();
          const e0 = ent[els[0].index];
          const sample = best[els[0].index];
          if (!e0 || !sample) return tip.hide();
          const p = pointerFromChart(e, chart);
          tip.show(
            p.x,
            p.y,
            sample,
            `品牌统计 · ${e0.n} 支 · 中位 ${fmt(e0.med)}（区间 ${fmt(e0.q1)}–${fmt(e0.q3)}，极值 ${fmt(e0.min)}–${fmt(e0.max)}）`,
          );
        },
      },
    };
  }, [rows, tipRef, ct]);

  /* ---------- 焦段密度 ---------- */
  const focalSpec = useMemo<ChartSpec>(() => {
    const labels = FOCAL_BANDS.map(([a, b]) => `${a}–${b}`);
    const inBand = FOCAL_BANDS.map(([a, b]) =>
      rows.filter((d) => d.focalMin != null && d.focalMin < b && d.focalMax != null && d.focalMax >= a),
    );
    const primes = FOCAL_BANDS.map(([a, b]) =>
      rows.filter((d) => d.focalMin != null && d.type === '定焦' && d.focalMin >= a && d.focalMin < b).length,
    );
    const zooms = FOCAL_BANDS.map(([a, b]) =>
      rows.filter((d) => d.focalMin != null && d.type === '变焦' && d.focalMin >= a && d.focalMin < b).length,
    );
    // 每个焦段里综合分最高的镜头，供悬停浮层展示
    const rep = inBand.map(
      (b) => b.filter((d) => d.overall != null).sort((x, y) => (y.overall ?? 0) - (x.overall ?? 0))[0] ?? b[0] ?? null,
    );

    return {
      type: 'bar',
      emptyText: '当前筛选下没有可用的焦段数据',
      emptyHint: '（部分老镜头缺少焦段字段）',
      data: {
        labels,
        datasets: [
          { label: '定焦', data: primes, backgroundColor: 'rgba(63,111,181,.75)', borderRadius: 2, stack: 's' },
          { label: '变焦', data: zooms, backgroundColor: 'rgba(127,119,221,.75)', borderRadius: 2, stack: 's' },
        ],
      },
      options: {
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: {
            stacked: true,
            grid: NO_GRID,
            ticks: { font: { size: 9.5 }, maxRotation: 60, minRotation: 45 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: gridStyle(ct),
            title: { display: true, text: '镜头数', color: ct.title, font: { size: 10.5 } },
          },
        },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 10.5 } } },
          tooltip: { enabled: false },
        },
        onHover: (e: unknown, els: HoverEl[], chart: unknown) => {
          const tip = tipRef.current;
          if (!tip) return;
          if (!els.length) return tip.hide();
          const i = els[0].index;
          const d = rep[i];
          if (!d) return tip.hide();
          const p = pointerFromChart(e, chart);
          tip.show(p.x, p.y, d, `${labels[i]}mm 焦段 · 定焦 ${primes[i]} 支 / 变焦 ${zooms[i]} 支`);
        },
      },
    };
  }, [rows, tipRef, ct]);

  const scatterLegend = (
    <div className="mt-2 flex flex-wrap gap-3.25 text-[11.5px] text-tx2">
      {legend.top.map(([b]) => (
        <span key={b}>
          <i className="mr-1.25 inline-block size-2 rounded-[2px]" style={{ background: brandColor(b) }} />
          {b}
        </span>
      ))}
      {legend.more && (
        <span>
          <i className="mr-1.25 inline-block size-2 rounded-[2px] bg-[#9C9A92] opacity-55" />
          其他品牌
        </span>
      )}
      <span className="text-tx3">悬停查看综合分 · 无该项评分的镜头不显示</span>
    </div>
  );

  return (
    <section className="mt-7.5">
      <SectionHead no={3} title="总览分布">
        全部基于当前筛选结果实时重绘。
      </SectionHead>

      <Tabs items={VIEW_TABS} value={view} onChange={setView} className="mb-2.5" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-3.5 max-md:grid-cols-1">
        {scatters.map(({ def, spec }) => (
          <ChartCard key={def.id} title={def.t} hint={def.h} footer={scatterLegend}>
            <ChartBox spec={spec} heightClass="h-[300px]" ariaLabel={`${def.t} 散点图`} />
          </ChartCard>
        ))}
      </div>

      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-3.5 max-md:grid-cols-1">
        <ChartCard title="各品牌综合分分布" hint="箱线区间：中位 / 四分位 / 极值">
          <ChartBox spec={brandBoxSpec} heightClass="h-[300px]" ariaLabel="各品牌综合分四分位分布" />
        </ChartCard>
        <ChartCard title="焦段覆盖密度" hint="按镜头覆盖的焦段统计（堆叠：定焦 / 变焦）">
          <ChartBox spec={focalSpec} heightClass="h-[300px]" ariaLabel="焦段覆盖密度分布" />
        </ChartCard>
      </div>
    </section>
  );
}
