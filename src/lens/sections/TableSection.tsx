import { useMemo, type RefObject } from 'react';
import {
  BRAND_CN,
  brandColor,
  brandLabel,
  fmt,
  METRICS,
  money,
  type Lens,
} from '@/shared/lib/lens';
import { SectionHead, ScorePill, BrandTag } from '@/shared/components/ui';
import type { TipHandle } from '@/shared/components/LensTip';
import { sortRows } from '../filter';

export const PAGE_SIZE = 100;

/** 单元格统一不换行：换行会把行高撑成三四行，一屏能看的条数骤减 */
const TD = 'px-2 py-1.75 align-middle whitespace-nowrap';

interface Col {
  k: string;
  n: string;
  w?: number;
}

const COLS: Col[] = [
  { k: '_sel', n: '', w: 52 },
  { k: 'name', n: '型号', w: 290 },
  { k: 'brand', n: '品牌', w: 150 },
  { k: 'mount', n: '卡口' },
  { k: 'type', n: '类型' },
  { k: 'focalRange', n: '焦段' },
  { k: 'ap', n: '光圈' },
  { k: 'overall', n: '综合' },
  ...METRICS.map((m) => ({ k: m.k as string, n: m.n })),
  { k: 'price', n: '参考价' },
  { k: 'weight', n: '重量' },
  { k: 'filterSize', n: '滤镜' },
  { k: 'n', n: '评测源' },
];

export interface SortState {
  key: string;
  dir: 1 | -1;
}

interface Props {
  rows: Lens[];
  sort: SortState;
  onSort: (key: string) => void;
  page: number;
  onPage: (p: number) => void;
  selected: string[];
  onToggleCompare: (slug: string) => void;
  onOpenDetail: (slug: string) => void;
  tipRef: RefObject<TipHandle | null>;
}

export function TableSection({
  rows, sort, onSort, page, onPage, selected, onToggleCompare, onOpenDetail, tipRef,
}: Props) {
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort.key, sort.dir]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * PAGE_SIZE;
  const slice = useMemo(() => sorted.slice(start, start + PAGE_SIZE), [sorted, start]);

  return (
    <section className="mt-7.5">
      <SectionHead no={5} title="完整数据表">
        点击表头排序，点击行首「对比」加入对比台，点击型号名查看完整规格与评测来源。
        每页 {PAGE_SIZE} 条，共 {pages.toLocaleString('en-US')} 页。
      </SectionHead>

      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        <div className="max-h-[660px] overflow-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {COLS.map((c) => {
                  const active = sort.key === c.k;
                  return (
                    <th
                      key={c.k || '_sel'}
                      style={c.w ? { width: c.w } : undefined}
                      onClick={c.k === '_sel' ? undefined : () => onSort(c.k)}
                      className={
                        'sticky top-0 z-2 border-b border-line bg-line2 px-2 py-2 text-left text-[11px] font-semibold whitespace-nowrap ' +
                        (c.k === '_sel' ? '' : 'cursor-pointer select-none hover:bg-line ') +
                        (active ? 'text-tx' : 'text-tx2')
                      }
                    >
                      {c.n}
                      {c.k !== '_sel' && (
                        <span className={'ml-0.75 text-[9px] ' + (active ? 'opacity-100' : 'opacity-28')}>
                          {active && sort.dir > 0 ? '▲' : '▼'}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slice.map((d) => {
                const isSel = selected.includes(d.slug);
                return (
                  <tr
                    key={d.slug}
                    className={'border-b border-line2 ' + (isSel ? 'bg-acc-soft' : 'hover:bg-line2/60')}
                    onMouseEnter={(e) => tipRef.current?.show(e.clientX, e.clientY, d)}
                    onMouseMove={(e) => tipRef.current?.move(e.clientX, e.clientY)}
                    onMouseLeave={() => tipRef.current?.hide()}
                  >
                    <td className={TD}>
                      <button
                        type="button"
                        data-cmp={d.slug}
                        onClick={() => onToggleCompare(d.slug)}
                        aria-pressed={isSel}
                        className={
                          'cursor-pointer rounded-md border px-2 py-0.5 text-[11px] transition-colors duration-130 ' +
                          (isSel
                            ? 'border-acc bg-acc text-white dark:text-[#0F1420]'
                            : 'border-line bg-card text-tx2 hover:border-tx3 hover:text-tx')
                        }
                      >
                        {isSel ? '✓' : '对比'}
                      </button>
                    </td>
                    <td className={TD}>
                      <button
                        type="button"
                        data-detail={d.slug}
                        onClick={() => onOpenDetail(d.slug)}
                        title={`${d.name} —— 点击查看详情`}
                        className="block cursor-pointer text-left text-[12.5px] font-semibold hover:text-acc"
                      >
                        <span className="flex items-center gap-1.25">
                          <span
                            className="size-1.75 flex-none rounded-[2px]"
                            style={{ background: brandColor(d.brand) }}
                          />
                          <span className="max-w-[248px] truncate">{d.name}</span>
                          {d.lowconf && (
                            <span className="flex-none text-[10px] text-[#B07A22]">⚠</span>
                          )}
                        </span>
                        {d.tags && d.tags.length > 0 && (
                          <span className="mt-px block max-w-[278px] text-[10.5px] font-normal whitespace-normal text-tx3">
                            {d.tags.join(' · ')}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className={TD}>
                      <span title={brandLabel(d.brand)}>
                        <BrandTag brand={d.brand} cn={BRAND_CN[d.brand]} />
                      </span>
                    </td>
                    <td className={TD + ' text-[11.5px] text-tx2'}>{d.mount || '—'}</td>
                    <td className={TD}>{d.type}</td>
                    <td className={TD + ' tabular-nums'}>
                      {d.focalMin != null
                        ? `${d.focalMin}${d.focalMin !== d.focalMax ? '-' + d.focalMax : ''}mm`
                        : '—'}
                    </td>
                    <td className={TD}>{d.ap}</td>
                    <td className={TD}>
                      <ScorePill value={d.overall} text={fmt(d.overall)} />
                    </td>
                    {METRICS.map((m) => {
                      const v = d[m.k];
                      return (
                        <td key={m.k} className={TD}>
                          <ScorePill value={v ?? null} text={fmt(v)} />
                        </td>
                      );
                    })}
                    <td className={TD + ' tabular-nums'}>{money(d.price)}</td>
                    <td className={TD + ' tabular-nums'}>{d.weight ? d.weight + 'g' : '—'}</td>
                    <td className={TD}>{d.filterSize || '—'}</td>
                    <td className={TD + ' text-center'}>{d.n ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {slice.length === 0 && (
            <div className="px-4 py-16 text-center text-[13px] text-tx3">
              当前筛选条件下没有匹配的镜头 —— 试试放宽条件，或点「重置全部条件」。
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.25 border-t border-line2 px-3 py-3 text-[12.5px] text-tx2">
          <PageBtn disabled={cur === 1} onClick={() => onPage(1)}>
            « 首页
          </PageBtn>
          <PageBtn disabled={cur === 1} onClick={() => onPage(cur - 1)}>
            ‹ 上一页
          </PageBtn>
          <span>
            第 <b className="text-tx">{cur}</b> / {pages} 页 · 共{' '}
            {sorted.length.toLocaleString('en-US')} 支 · 本页 {slice.length} 支
          </span>
          <PageBtn disabled={cur === pages} onClick={() => onPage(cur + 1)}>
            下一页 ›
          </PageBtn>
          <PageBtn disabled={cur === pages} onClick={() => onPage(pages)}>
            末页 »
          </PageBtn>
        </div>
      </div>
    </section>
  );
}

function PageBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer rounded-[7px] border border-line bg-card px-2.75 py-1 text-[12.5px] text-tx2 transition-colors duration-130 disabled:cursor-default disabled:opacity-35 enabled:hover:border-tx3 enabled:hover:text-tx"
    >
      {children}
    </button>
  );
}
