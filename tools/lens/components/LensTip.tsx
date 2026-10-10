import { forwardRef, useImperativeHandle, useRef } from 'react';
import { brandLabel, esc, fmt, METRICS, money, type Lens } from '../domain/lens';

export interface TipHandle {
  /** 在屏幕坐标 (x, y) 处显示某支镜头的浮层 */
  show(x: number, y: number, lens: Lens, extra?: string): void;
  move(x: number, y: number): void;
  hide(): void;
}

const ROW = 'flex justify-between gap-3.5';
const ROW_V = 'tabular-nums';

/** 浮层内容。数据是我们自己的 JSON，仍然统一转义一遍。 */
function tipHtml(d: Lens, extra?: string): string {
  const rows = METRICS.map(
    (m) => `<div class="${ROW}"><span>${esc(m.n)}</span><span class="${ROW_V}">${fmt(d[m.k])}</span></div>`,
  ).join('');
  return `<div class="mb-[3px] text-[12px] font-semibold">${esc(d.name)}</div>
    <div class="${ROW}"><span>${esc(brandLabel(d.brand))} · 综合</span><span class="${ROW_V}">${fmt(d.overall)}</span></div>
    <div class="h-1"></div>${rows}
    <div class="h-1"></div>
    <div class="${ROW}"><span>价格 / 重量</span><span class="${ROW_V}">${esc(money(d.price))} · ${d.weight ? d.weight + 'g' : '—'}</span></div>
    <div class="${ROW}"><span>评测源</span><span class="${ROW_V}">${d.n ?? 0} 家${d.lowconf ? ' ⚠' : ''}</span></div>
    ${extra ? `<div class="h-[3px]"></div><div class="text-[#FFD79A]">${esc(extra)}</div>` : ''}`;
}

/**
 * 全站统一的悬停浮层。
 * 用命令式 handle 而不是 React state：鼠标每移动 1px 都会触发一次，
 * 走 state 会把整棵组件树（含 8 张图表）重渲染一遍，肉眼可见地卡。
 */
export const LensTip = forwardRef<TipHandle>(function LensTip(_props, ref) {
  const el = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => {
    const place = (x: number, y: number) => {
      const t = el.current;
      if (!t) return;
      let left = x + 14;
      let top = y + 14;
      const r = t.getBoundingClientRect();
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      t.style.left = `${Math.max(6, left)}px`;
      t.style.top = `${Math.max(6, top)}px`;
    };
    return {
      show(x, y, lens, extra) {
        const t = el.current;
        if (!t) return;
        t.innerHTML = tipHtml(lens, extra);
        place(x, y); // 先摆位再显形，避免在旧位置闪一下
        t.style.opacity = '1';
      },
      move: place,
      hide() {
        const t = el.current;
        if (t) t.style.opacity = '0';
      },
    };
  }, []);

  return (
    <div
      ref={el}
      data-tip="1"
      aria-hidden="true"
      className="pointer-events-none fixed z-[99] max-w-[260px] rounded-[7px] bg-[rgba(38,37,35,.95)] px-2.75 py-2 text-[11.5px] leading-[1.55] text-white opacity-0 ring-1 ring-white/10 transition-opacity duration-100 dark:bg-[rgba(46,45,52,.97)]"
    />
  );
});
