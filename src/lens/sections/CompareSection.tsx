import { useMemo, type RefObject } from 'react';
import { brandColor, fmt, hex2rgba, METRICS, type Lens } from '@/shared/lib/lens';
import {
  chartThemeFor,
  gridStyle,
  NO_GRID,
  pointerFromChart,
  type ChartSpec,
} from '@/shared/lib/chart';
import { ChartBox } from '@/shared/components/ChartBox';
import { ChartCard, SectionHead } from '@/shared/components/ui';
import type { TipHandle } from '@/shared/components/LensTip';
import { useThemeValue } from '@/shared/useTheme';

interface Props {
  selected: Lens[];
  onRemove: (slug: string) => void;
  tipRef: RefObject<TipHandle | null>;
}

const EMPTY_TEXT = '尚未选择对比镜头';
const EMPTY_HINT = '（在下方表格点「加入对比」，最多 6 支）';

interface HoverEl {
  datasetIndex: number;
  index: number;
}

export function CompareSection({ selected, onRemove, tipRef }: Props) {
  const theme = useThemeValue();
  const ct = chartThemeFor(theme);

  const radarSpec = useMemo<ChartSpec>(
    () => ({
      type: 'radar',
      emptyText: EMPTY_TEXT,
      emptyHint: EMPTY_HINT,
      data: {
        labels: METRICS.map((m) => m.n),
        datasets: selected.map((d) => ({
          label: d.name,
          data: METRICS.map((m) => d[m.k] ?? 0),
          borderColor: brandColor(d.brand),
          backgroundColor: hex2rgba(brandColor(d.brand), 0.12),
          pointBackgroundColor: brandColor(d.brand),
          pointRadius: 3, // 标量，不用数组
          pointHitRadius: 14, // 顶点只有 3px，放宽命中区
          borderWidth: 2,
          borderDash: d.lowconf ? [4, 3] : [],
        })),
      },
      options: {
        // 雷达顶点小到几乎点不中，nearest + intersect:false 才算「能悬停」
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          r: {
            min: 0,
            max: 10,
            ticks: { stepSize: 2, backdropColor: 'transparent', color: ct.tick, font: { size: 9 } },
            grid: { color: ct.grid2 },
            angleLines: { color: ct.grid2 },
            pointLabels: { font: { size: 10.5 }, color: ct.tick },
          },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        onHover: (e: unknown, els: HoverEl[], chart: unknown) => {
          const tip = tipRef.current;
          if (!tip) return;
          if (!els.length) return tip.hide();
          const d = selected[els[0].datasetIndex];
          const m = METRICS[els[0].index];
          if (!d || !m) return tip.hide();
          const p = pointerFromChart(e, chart);
          tip.show(p.x, p.y, d, `${m.n} ${fmt(d[m.k])}`);
        },
      },
    }),
    [selected, tipRef, ct],
  );

  const barsSpec = useMemo<ChartSpec>(
    () => ({
      type: 'bar',
      emptyText: EMPTY_TEXT,
      emptyHint: EMPTY_HINT,
      data: {
        labels: METRICS.map((m) => m.n),
        datasets: selected.map((d) => ({
          label: d.name,
          data: METRICS.map((m) => d[m.k] ?? 0),
          backgroundColor: hex2rgba(brandColor(d.brand), d.lowconf ? 0.38 : 0.78),
          borderColor: brandColor(d.brand),
          borderWidth: 1,
          borderRadius: 2,
        })),
      },
      options: {
        // 未选镜头时也要能悬停，所以不能用 index 模式
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { grid: NO_GRID, ticks: { font: { size: 9.5 } } },
          y: { min: 0, max: 10, grid: gridStyle(ct) },
        },
        plugins: {
          legend: { display: selected.length > 0, position: 'bottom', labels: { font: { size: 10 } } },
          tooltip: { enabled: false },
        },
        onHover: (e: unknown, els: HoverEl[], chart: unknown) => {
          const tip = tipRef.current;
          if (!tip) return;
          if (!els.length) return tip.hide();
          const d = selected[els[0].datasetIndex];
          const m = METRICS[els[0].index];
          if (!d || !m) return tip.hide();
          const p = pointerFromChart(e, chart);
          tip.show(p.x, p.y, d, `${m.n} ${fmt(d[m.k])}`);
        },
      },
    }),
    [selected, tipRef, ct],
  );

  return (
    <section className="mt-7.5">
      <SectionHead no={2} title="对比台">
        点击表格中的「对比」按钮加入；最多同时 6 支。雷达图为八维叠加，低置信度型号以虚线绘制。
      </SectionHead>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-3.5 max-md:grid-cols-1">
        <ChartCard title="八维雷达叠加" hint="越靠外越好">
          <ChartBox spec={radarSpec} heightClass="h-[440px]" ariaLabel="所选镜头的八维雷达叠加图" />
        </ChartCard>
        <ChartCard title="逐项得分对比" hint="按 0–10 显示">
          <ChartBox spec={barsSpec} heightClass="h-[440px]" ariaLabel="所选镜头的逐项得分对比" />
        </ChartCard>
      </div>

      <div className="mt-2.75 flex flex-wrap items-center gap-1.5">
        {selected.length === 0 ? (
          <span className="text-[12.5px] text-tx3">
            未选择 —— 在下方表格点「对比」加入；最多 6 支
          </span>
        ) : (
          selected.map((d) => (
            <span
              key={d.slug}
              className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-line2 px-2 py-[3px] text-[11.5px]"
            >
              <i
                className="inline-block size-1.75 flex-none rounded-[2px]"
                style={{ background: brandColor(d.brand) }}
              />
              <b className="font-semibold">{d.name}</b>
              <button
                type="button"
                onClick={() => onRemove(d.slug)}
                aria-label={`移除 ${d.name}`}
                className="cursor-pointer text-[13px] leading-none text-tx3 hover:text-lo"
              >
                ✕
              </button>
            </span>
          ))
        )}
      </div>
    </section>
  );
}
