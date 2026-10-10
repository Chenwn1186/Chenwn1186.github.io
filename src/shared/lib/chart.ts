/* ============================================================
   Chart.js 收口层
   —— 所有图表一律经过 renderChart()，这里是唯一的收口点。
      之所以要收口而不是让每个图表各自兜底：下面这些雷分散在七八张图里，
      逐个修必然漏。
   ============================================================ */

import Chart from 'chart.js/auto';
import type { ChartType } from 'chart.js';
import type { Theme } from '../useTheme';

export interface ChartTheme {
  grid: string;
  grid2: string;
  tick: string;
  title: string;
  phLine: string;
  phText: string;
  phHint: string;
}

export interface ChartSpec {
  type: ChartType;
  data: unknown;
  options?: Record<string, unknown>;
  /** 无数据时画在画布中央的说明；缺省用一句通用文案 */
  emptyText?: string;
  /** 无数据时的补充提示（第二行、更淡） */
  emptyHint?: string;
}

const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif';

/* canvas 读不到 CSS 变量，图表色只能由 JS 提供。
   这里刻意写成「按主题名查表」而不是 getComputedStyle 读变量：
   切换主题时子组件的 effect 先于父组件执行，那时 <html> 上的 dark class 还没落，
   getComputedStyle 拿到的是旧主题色 → 图表颜色永远慢一拍。
   查表则是纯函数，拿到 theme 就一定是对的。 */
const CHART_THEME: Record<Theme, ChartTheme> = {
  light: {
    grid: '#EFEDE7',
    grid2: '#EAE8E2',
    tick: '#6B6961',
    title: '#9C9A92',
    phLine: '#E8E5DE',
    phText: '#B5B2AA',
    phHint: '#C9C6BE',
  },
  dark: {
    grid: '#2A2A33',
    grid2: '#26262F',
    tick: '#A7A7B2',
    title: '#7C7C88',
    phLine: '#2E2E37',
    phText: '#84848F',
    phHint: '#5A5A65',
  },
};

export function chartThemeFor(theme: Theme): ChartTheme {
  return CHART_THEME[theme] ?? CHART_THEME.light;
}

/* ---------- Chart.defaults 收口 ---------- */
let defaultsTheme: ChartTheme | null = null;

export function applyChartDefaults(theme: ChartTheme): void {
  if (defaultsTheme === theme) return;
  defaultsTheme = theme;
  Chart.defaults.font.family = FONT;
  Chart.defaults.font.size = 11;
  Chart.defaults.color = theme.tick;
  Chart.defaults.plugins.legend.labels.boxWidth = 9;
  Chart.defaults.plugins.legend.labels.boxHeight = 9;
  // 动画会在快速切换筛选时留下「半渲染」状态（chartArea 未定稿就被下一次 destroy 打断）。
  // 数据量上千时动画也毫无意义，直接关掉最稳。
  Chart.defaults.animation = false;
  (Chart.defaults as any).animations = { colors: false, x: false, y: false };
  (Chart.defaults as any).transitions = {
    active: { animation: { duration: 0 } },
    resize: { animation: { duration: 0 } },
    show: { animations: { colors: false } },
    hide: { animations: { colors: false } },
  };
}

/** 网格 / 无网格的通用轴片段 */
export function gridStyle(theme: ChartTheme) {
  return { color: theme.grid, drawTicks: false };
}
export const NO_GRID = { display: false } as const;
export { FONT };

/* ---------- 合法性清理 ---------- */

/** 递归清理配置里的非法值：NaN / Infinity → null
 *  坐标轴范围一旦被非有限值污染，绘图区高度会变 0，整图空白 */
function sanitize(v: any): any {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === undefined) return v;
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const k in v) o[k] = sanitize(v[k]);
    return o;
  }
  return v;
}

/** dataset 是否「健康」：点必须齐全且坐标有限 */
function dsHealthy(s: any, type?: string): boolean {
  const d = s && s.data;
  if (!Array.isArray(d) || !d.length) return false;
  if (type === 'scatter' || (d[0] && typeof d[0] === 'object' && !Array.isArray(d[0]))) {
    return d.every((p: any) => p && isFinite(p.x) && isFinite(p.y));
  }
  if (Array.isArray(d[0])) return d.every((p: any) => Array.isArray(p) && p.every(isFinite));
  return d.every((v: any) => isFinite(v));
}

/* ---------- 实例登记 ---------- */
const instances = new WeakMap<HTMLCanvasElement, any>();
/** 处于「空状态占位」的画布——窗口尺寸变化时需要重画 */
const placeholders = new Set<HTMLCanvasElement>();
let resizeBound = false;

function bindResize(): void {
  if (resizeBound || typeof window === 'undefined') return;
  resizeBound = true;
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      placeholders.forEach((c) => {
        if (!c.isConnected) return;
        const spec = lastSpec.get(c);
        if (spec) drawPlaceholder(c, spec, lastTheme.get(c)!);
      });
    });
  });
}

const lastSpec = new WeakMap<HTMLCanvasElement, ChartSpec>();
const lastTheme = new WeakMap<HTMLCanvasElement, ChartTheme>();

/** 画「本图无数据」——Chart.js 对空数据集会渲染成 0 高度白图，用户看到的就是图没了。
 *  宁可画一句明确的说明。 */
function drawPlaceholder(canvas: HTMLCanvasElement, spec: ChartSpec, theme: ChartTheme): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // 用 100% 撑满父容器再量尺寸：既拿到真实容器高度，又不会把容器顶宽
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  const r = canvas.getBoundingClientRect();
  const w = Math.round(r.width) || 600;
  const h = Math.round(r.height) || 300;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = theme.phLine;
  ctx.fillRect(0, h / 2 - 1, w, 1);
  ctx.fillStyle = theme.phText;
  ctx.font = `12.5px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.emptyText || '当前筛选条件下没有可用于此图的数据', w / 2, h / 2 - 12);
  if (spec.emptyHint) {
    ctx.fillStyle = theme.phHint;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(spec.emptyHint, w / 2, h / 2 + 12);
  }
}

/** 唯一的建图入口。重复调用同一画布会先销毁旧实例。 */
export function renderChart(canvas: HTMLCanvasElement, spec: ChartSpec, theme: ChartTheme): void {
  bindResize();
  const prev = instances.get(canvas);
  if (prev) {
    try {
      prev.destroy();
    } catch {
      /* 忽略：销毁失败也要继续，否则整个 render 会中断 */
    }
    instances.delete(canvas);
  }
  placeholders.delete(canvas);
  lastSpec.set(canvas, spec);
  lastTheme.set(canvas, theme);

  applyChartDefaults(theme);

  // 1) 清掉非法数值
  const cfg: any = sanitize({
    type: spec.type,
    data: spec.data,
    options: spec.options ?? {},
    _emptyText: spec.emptyText,
    _emptyHint: spec.emptyHint,
  });

  // 2) 剔除不健康的 dataset（空数据 / 含非有限坐标）
  if (cfg.data && Array.isArray(cfg.data.datasets)) {
    cfg.data.datasets = cfg.data.datasets.filter((s: any) => dsHealthy(s, cfg.type));
    if (cfg.type === 'bar' || cfg.type === 'line' || cfg.type === 'radar') {
      const maxN = cfg.data.datasets.reduce((a: number, s: any) => Math.max(a, s.data.length), 0);
      if (Array.isArray(cfg.data.labels) && maxN > 0 && cfg.data.labels.length > maxN) {
        cfg.data.labels = cfg.data.labels.slice(0, maxN);
      }
    }
  }

  // 3) 全空 → 画占位提示，不 new Chart
  const total = Array.isArray(cfg.data?.datasets)
    ? cfg.data.datasets.reduce((a: number, s: any) => a + s.data.length, 0)
    : 0;
  if (total === 0) {
    drawPlaceholder(canvas, spec, theme);
    placeholders.add(canvas);
    instances.set(canvas, {
      _placeholder: true,
      chartArea: { width: canvas.clientWidth, height: canvas.clientHeight },
      canvas,
      destroy() {},
      resize() {},
    });
    return;
  }

  cfg.options = { responsive: true, maintainAspectRatio: false, ...cfg.options };
  const chart = new Chart(canvas, cfg as any);
  instances.set(canvas, chart);

  // 4) 渲染后自检：chartArea 高度为 0 说明仍有未预料的布局崩坏。
  //    先 resize()，仍不行就强制指定画布尺寸后重建一次。
  requestAnimationFrame(() => {
    const ch = instances.get(canvas);
    if (!ch || ch._placeholder || !ch.chartArea) return;
    if (ch.chartArea.height <= 0 || ch.chartArea.width <= 0) {
      try {
        ch.resize();
        if (ch.chartArea.height <= 0) {
          const { width, height } = canvas.getBoundingClientRect();
          canvas.width = Math.round(width) || 600;
          canvas.height = Math.round(height) || 300;
          ch.destroy();
          instances.set(canvas, new Chart(canvas, cfg as any));
        }
      } catch {
        /* 忽略：宁可图难看，也不能让整个渲染崩掉 */
      }
    }
  });
}

export function destroyChart(canvas: HTMLCanvasElement): void {
  const prev = instances.get(canvas);
  if (prev) {
    try {
      prev.destroy();
    } catch {
      /* 忽略 */
    }
    instances.delete(canvas);
  }
  placeholders.delete(canvas);
}

/**
 * 从 Chart.js 的 onHover 事件里取屏幕坐标。
 * 注意：Chart.js 传进 onHover 的并非原生事件，而是 { type, chart, native, x, y }，
 * 其中 x/y 是**画布内**相对坐标，**没有** clientX/clientY。
 * 直接用 e.clientX 会得到 undefined → NaNpx → 浮层位置错乱。
 */
export function pointerFromChart(e: any, chart: any): { x: number; y: number } {
  const native = e?.native;
  if (native && typeof native.clientX === 'number') {
    return { x: native.clientX, y: native.clientY };
  }
  const r = chart?.canvas?.getBoundingClientRect?.();
  if (r) return { x: r.left + (e?.x ?? 0), y: r.top + (e?.y ?? 0) };
  return { x: 0, y: 0 };
}
