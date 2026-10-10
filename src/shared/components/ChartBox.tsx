import { useEffect, useRef } from 'react';
import { type ChartSpec, chartThemeFor, destroyChart, renderChart } from '../lib/chart';
import { useThemeValue } from '../useTheme';

interface Props {
  /** 图表配置。请用 useMemo 稳定引用，否则每次渲染都会重建图表 */
  spec: ChartSpec;
  /** 容器高度（Tailwind 类）。canvas 会撑满它 */
  heightClass?: string;
  ariaLabel: string;
}

/** Chart.js 画布。负责「容器给高度 → canvas 撑满 → 配置变则重建」这条链路。 */
export function ChartBox({ spec, heightClass = 'h-[300px]', ariaLabel }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useThemeValue();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    renderChart(canvas, spec, chartThemeFor(theme));
    return () => destroyChart(canvas);
  }, [spec, theme]);

  return (
    <div className={`relative mt-[11px] w-full ${heightClass}`}>
      <canvas ref={ref} role="img" aria-label={ariaLabel} />
    </div>
  );
}
