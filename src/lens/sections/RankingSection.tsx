import { useMemo, useState, type RefObject } from 'react';
import { BARS, brandColor, brandLabel, fmt, hex2rgba, type Lens } from '@/shared/lib/lens';
import { chartThemeFor, gridStyle, NO_GRID, pointerFromChart, type ChartSpec } from '@/shared/lib/chart';
import { ChartBox } from '@/shared/components/ChartBox';
import { ChartCard, SectionHead, Tabs } from '@/shared/components/ui';
import type { TipHandle } from '@/shared/components/LensTip';
import { useThemeValue } from '@/shared/useTheme';

const TOP_N = 20;

/** 名称过长时截断，避免与条形区重叠 */
const shortName = (s: string) => (s.length > 26 ? s.slice(0, 25) + '…' : s);

interface HoverEl {
  index: number;
}

export function RankingSection({ rows, tipRef }: { rows: Lens[]; tipRef: RefObject<TipHandle | null> }) {
  const theme = useThemeValue();
  const ct = chartThemeFor(theme);
  const [idx, setIdx] = useState(0);
  const metric = BARS[idx];

  const top = useMemo(
    () =>
      rows
        .filter((d) => d[metric.k] != null)
        .sort((a, b) => (b[metric.k] as number) - (a[metric.k] as number))
        .slice(0, TOP_N),
    [rows, metric],
  );

  const top1Spec = useMemo<ChartSpec>(() => {
    const colors = top.map((d) => hex2rgba(brandColor(d.brand), d.lowconf ? 0.32 : 0.8));
    const borders = top.map((d) => brandColor(d.brand));
    const floor = top.length ? (top[top.length - 1][metric.k] as number) : 0;
    return {
      type: 'bar',
      emptyText: `当前筛选下没有「${metric.n}」评分的镜头`,
      emptyHint: '（换个评测维度或放宽筛选试试）',
      data: {
        labels: top.map((d, i) => `${i + 1}. ${shortName(d.name)}`),
        datasets: [
          {
            data: top.map((d) => d[metric.k] as number),
            backgroundColor: colors,
            borderColor: borders,
            borderWidth: top.map((d) => (d.lowconf ? 1.2 : 0)),
            borderRadius: 2,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        // 横条必须放宽命中区。默认 intersect:true 要求鼠标精确压在那根细条上，
        // 条形右侧、行间空白完全无响应，用起来就像「悬停坏了」。
        // indexAxis:y 下 mode:'index' 会算错索引，所以用 nearest。
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { min: Math.max(0, floor - 1.5), max: 10, grid: gridStyle(ct) },
          y: { grid: NO_GRID, ticks: { font: { size: 10 }, autoSkip: false, crossAlign: 'far' } },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        onHover: (e: unknown, els: HoverEl[], chart: unknown) => {
          const tip = tipRef.current;
          if (!tip) return;
          if (!els.length) return tip.hide();
          const d = top[els[0].index];
          if (!d) return tip.hide();
          const p = pointerFromChart(e, chart);
          tip.show(p.x, p.y, d, `${metric.n} ${fmt(d[metric.k] as number)}`);
        },
      },
    };
  }, [top, metric, tipRef, ct]);

  const top2Spec = useMemo<ChartSpec>(() => {
    const mx = top.length ? (top[0][metric.k] as number) : 10;
    const colors = top.map((d) => hex2rgba(brandColor(d.brand), d.lowconf ? 0.32 : 0.8));
    const borders = top.map((d) => brandColor(d.brand));
    return {
      type: 'bar',
      emptyText: `当前筛选下没有「${metric.n}」评分的镜头`,
      data: {
        labels: top.map((d) => brandLabel(d.brand)),
        datasets: [
          {
            label: '榜首',
            data: top.map(() => mx),
            backgroundColor: 'rgba(150,150,145,.32)',
            borderRadius: 2,
          },
          {
            label: '该型号',
            data: top.map((d) => d[metric.k] as number),
            backgroundColor: colors,
            borderColor: borders,
            borderWidth: 0,
            borderRadius: 2,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { min: 0, max: 10, grid: gridStyle(ct) },
          y: { grid: NO_GRID, ticks: { font: { size: 9.5 }, autoSkip: false } },
        },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 10.5 } } },
          tooltip: { enabled: false },
        },
        onHover: (e: unknown, els: HoverEl[], chart: unknown) => {
          const tip = tipRef.current;
          if (!tip) return;
          if (!els.length) return tip.hide();
          const d = top[els[0].index];
          if (!d) return tip.hide();
          const p = pointerFromChart(e, chart);
          tip.show(p.x, p.y, d, `${metric.n} ${fmt(d[metric.k] as number)}`);
        },
      },
    };
  }, [top, metric, tipRef, ct]);

  return (
    <section className="mt-7.5">
      <SectionHead no={4} title="色散与抗眩光专项">
        <b className="text-tx">横向色差</b>在画面边缘、后期可一键校正；
        <b className="text-tx">轴向色差（LoCA）</b>在焦外高光边缘、后期校不掉——这是大光圈镜头的真正分水岭。
        八张榜单共用同一批数据，方便横向比对。
      </SectionHead>

      <Tabs
        items={BARS.map((b, i) => ({ value: i, label: b.n }))}
        value={idx}
        onChange={setIdx}
        className="mb-2.5"
      />

      <ChartCard title={`${metric.n} 排行`} hint={`前 ${TOP_N} 名`}>
        <ChartBox spec={top1Spec} heightClass="h-[520px]" ariaLabel={`${metric.n} 排行前 20 名`} />
      </ChartCard>

      <div className="mt-3.5">
        <ChartCard title={`${metric.n} 分数`} hint="与榜首的差距（灰条为榜首分数）">
          <ChartBox spec={top2Spec} heightClass="h-[520px]" ariaLabel={`${metric.n} 上榜型号与榜首的差距`} />
        </ChartCard>
      </div>
    </section>
  );
}
