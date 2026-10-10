import type { ReactNode } from 'react';

/* ---------- 可点选的胶囊（品牌 / 卡口 / 类型 / 特性 / 光圈） ---------- */
export function Chip({
  on = false,
  count,
  onClick,
  title,
  children,
}: {
  on?: boolean;
  count?: number;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={
        'cursor-pointer rounded-2xl border px-2.5 py-[3px] text-[12px] whitespace-nowrap transition-all duration-130 select-none ' +
        (on
          ? 'border-acc bg-acc text-white dark:text-[#0F1420]'
          : 'border-line bg-card text-tx2 hover:border-tx3 hover:text-tx')
      }
    >
      {children}
      {count !== undefined && <span className="ml-1 text-[10.5px] opacity-55">{count}</span>}
    </button>
  );
}

/* ---------- 按钮 ---------- */
export function Btn({
  pri = false,
  onClick,
  disabled,
  children,
}: {
  pri?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'cursor-pointer rounded-lg border px-3.25 py-1.5 font-[inherit] text-[12.5px] transition-all duration-130 disabled:cursor-default disabled:opacity-35 ' +
        (pri
          ? 'border-acc bg-acc text-white hover:opacity-90 dark:text-[#0F1420]'
          : 'border-line bg-card text-tx2 hover:border-tx3 hover:text-tx')
      }
    >
      {children}
    </button>
  );
}

/* ---------- 标签页 ---------- */
export function Tabs<T extends string | number>({
  items,
  value,
  onChange,
  className = '',
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.25 ${className}`}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          aria-pressed={it.value === value}
          className={
            'cursor-pointer rounded-[7px] border px-3 py-1 font-[inherit] text-[12px] transition-all duration-130 ' +
            (it.value === value
              ? 'border-acc bg-acc text-white dark:text-[#0F1420]'
              : 'border-line bg-card text-tx2 hover:border-tx3 hover:text-tx')
          }
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 区块标题 ---------- */
export function SectionHead({
  no,
  title,
  children,
}: {
  no: number | string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <>
      <h2 className="flex items-center gap-2.25 text-[16.5px] font-semibold">
        <span className="inline-flex size-5.25 flex-none items-center justify-center rounded-md bg-tx text-[11.5px] font-semibold text-white dark:text-[#131318]">
          {no}
        </span>
        {title}
      </h2>
      {children && <p className="mt-1.75 mb-3.5 max-w-[920px] text-[13px] text-tx2">{children}</p>}
    </>
  );
}

/* ---------- 图表卡片 ----------
   注意：这里**不**再包一层带高度的容器。高度由内部的 ChartBox 负责，
   两边各包一层会出现「外 300 / 内 520」这种错配，内层溢出卡片、
   直接盖住下一个区块（曾把下面的数据表压得点不动）。 */
export function ChartCard({
  title,
  hint,
  footer,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-card px-[17px] py-[15px]">
      <h3 className="flex flex-wrap items-baseline gap-2 text-[13px] font-semibold">
        {title}
        {hint && <span className="text-[11px] font-normal text-tx3">{hint}</span>}
      </h3>
      {children}
      {footer}
    </div>
  );
}

/* ---------- 统计数字块 ---------- */
export function Stat({ k, l }: { k: ReactNode; l: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-card px-3.5 py-3">
      <div className="text-[21px] leading-[1.2] font-semibold">{k}</div>
      <div className="mt-0.75 text-[11px] text-tx3">{l}</div>
    </div>
  );
}

/* ---------- 分数胶囊 ---------- */
export function ScorePill({ value, text }: { value: number | null | undefined; text: string }) {
  if (value === null || value === undefined) {
    return <span className="text-[#C4C1B9] dark:text-[#55555E]">—</span>;
  }
  const cls =
    value >= 8
      ? 'bg-hi-bg text-hi'
      : value >= 6.5
        ? 'bg-mid-bg text-mid'
        : 'bg-lo-bg text-lo';
  return (
    <span
      className={`inline-block min-w-[31px] rounded-[5px] px-1.5 py-px text-center text-[11.5px] font-semibold tabular-nums ${cls}`}
    >
      {text}
    </span>
  );
}

/* ---------- 品牌小标签（带中文名） ---------- */
export function BrandTag({ brand, cn }: { brand: string; cn?: string }) {
  return (
    <span className="inline-block rounded-[4px] bg-line2 px-1.25 py-px text-[9.5px] font-semibold whitespace-nowrap text-tx2">
      {brand}
      {cn && <i className="ml-0.75 text-[9px] font-normal not-italic text-tx3">{cn}</i>}
    </span>
  );
}
