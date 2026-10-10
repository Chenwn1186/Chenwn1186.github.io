import type { CSSProperties } from 'react';
import type { ToolManifest } from '@platform/contract/tool';

/** #RRGGBB → rgba()，用于生成主题色的浅色底 */
function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const FALLBACK = '#2F5FD0';

/** 工具卡片。已上线的渲染成 <a>，未上线的渲染成不可点的灰色卡 */
export function ToolCard({ tool }: { tool: ToolManifest & { iconUrl?: string | null } }) {
  const tint = tool.tint ?? FALLBACK;
  const style = {
    '--tint': tint,
    '--tint-soft': hexA(tint, 0.12),
  } as CSSProperties;

  const body = (
    <>
      {/* 顶部彩条 */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] opacity-90"
        style={{ background: 'var(--tint)' }}
      />

      <span
        className="grid size-10.5 place-items-center rounded-[11px] transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105"
        style={{ background: 'var(--tint-soft)', color: 'var(--tint)' }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5.5"
        >
          <img src={`/tools/${tool.id}/icon.svg`} alt="" width="22" height="22" />
        </svg>
      </span>

      <h2 className="mt-3.5 mb-1.5 flex items-center gap-2 text-[16.5px] leading-snug font-[650] tracking-[-0.2px]">
        {tool.name}
        <span className="ml-auto text-[15px] text-tx3 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--tint)]">
          →
        </span>
      </h2>

      <p className="m-0 flex-1 text-[13.5px] leading-[1.62] text-tx2">{tool.desc}</p>

      {tool.tags.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {tool.tags.map((t) => (
            <span key={t} className="rounded-md bg-line2 px-2 py-[2.5px] text-[11px] whitespace-nowrap text-tx2">
              {t}
            </span>
          ))}
        </div>
      )}

      {tool.meta && (
        <div className="mt-3.5 flex items-center gap-1.5 border-t border-line2 pt-3 text-[11.5px] text-tx3">
          <i className="size-1.5 shrink-0 rounded-full bg-[#3FA46A] dark:bg-[#4FC77E]" />
          {tool.meta}
        </div>
      )}
    </>
  );

  const base =
    'group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-card transition-all duration-200';

  if (!tool.live) {
    return (
      <div className={`${base} opacity-60`} style={style}>
        {body}
      </div>
    );
  }

  return (
    <a
      href={tool.route?.kind === 'external' ? tool.route.href : `${tool.id}/`}
      className={`${base} cursor-pointer hover:-translate-y-0.75 hover:border-line2 hover:shadow-card-hi`}
      style={style}
    >
      {body}
    </a>
  );
}

/** 网格末尾的虚线占位卡，暗示站点还在持续更新 */
export function SoonCard() {
  return (
    <div className="flex min-h-[196px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-5 text-center">
      <span className="mb-2.5 text-[26px] leading-none text-tx3">＋</span>
      <b className="block text-[13.5px] font-semibold text-tx2">更多工具</b>
      <span className="mt-1 block text-xs text-tx3">持续添加中</span>
    </div>
  );
}
