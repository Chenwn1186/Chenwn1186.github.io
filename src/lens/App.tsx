import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BRAND_CN,
  METRICS,
  type Lens,
} from '@/shared/lib/lens';
import { LensTip, type TipHandle } from '@/shared/components/LensTip';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { ThemeCtx, useTheme } from '@/shared/useTheme';
import { applyFilters, EMPTY_FILTERS, SORT_ASC_DEFAULT, type FilterState } from './filter';
import { IS_SINGLE, loadLenses } from './data';
import { HeaderSection } from './sections/HeaderSection';
import { FilterPanel } from './sections/FilterPanel';
import { CompareSection } from './sections/CompareSection';
import { OverviewSection } from './sections/OverviewSection';
import { RankingSection } from './sections/RankingSection';
import { TableSection, type SortState } from './sections/TableSection';
import { NotesSection } from './sections/NotesSection';
import { Drawer } from './components/Drawer';

const MAX_COMPARE = 6;

/** 默认对比：三支最有代表性的 E 口镜头 */
const DEFAULT_SELECTED = [
  'tld-sigma-2845mm-f18-dg-dn-a-sony-e',
  'tld-tamron-35100mm-f28-di-iii-vxd-a078-sony-e',
  'tld-viltrox-lab-af-35mm-f12-asph-ed-if-vcm',
];

export function LensApp() {
  const { theme, toggle } = useTheme();
  const [data, setData] = useState<Lens[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: 'overall', dir: -1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [drawerSlug, setDrawerSlug] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const tipRef = useRef<TipHandle>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  /* ---------- 载入数据 ---------- */
  const load = useCallback(() => {
    setError(null);
    setData(null);
    loadLenses()
      .then(setData)
      .catch((e: Error) => setError(e.message || '数据加载失败'));
  }, []);
  useEffect(load, [load]);

  const bySlug = useMemo(() => {
    const m = new Map<string, Lens>();
    for (const d of data ?? []) m.set(d.slug, d);
    return m;
  }, [data]);

  // 默认选中的三支里若有不存在的（数据更新后 slug 变了），自动剔除
  useEffect(() => {
    if (!data) return;
    setSelected((cur) => (cur.length ? cur.filter((s) => bySlug.has(s)) : cur));
  }, [data, bySlug]);

  const rows = useMemo(() => (data ? applyFilters(data, f) : []), [data, f]);
  const selectedLenses = useMemo(
    () => selected.map((s) => bySlug.get(s)).filter((d): d is Lens => !!d),
    [selected, bySlug],
  );

  /* ---------- 动作 ---------- */
  const patch = useCallback((p: Partial<FilterState>) => {
    setF((prev) => ({ ...prev, ...p }));
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setF(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const say = useCallback((msg: string) => {
    setFlash(msg);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  }, []);

  const toggleCompare = useCallback(
    (slug: string) => {
      setSelected((cur) => {
        if (cur.includes(slug)) return cur.filter((x) => x !== slug);
        if (cur.length >= MAX_COMPARE) {
          say(`最多同时对比 ${MAX_COMPARE} 支`);
          return cur;
        }
        return [...cur, slug];
      });
    },
    [say],
  );

  const addFromDrawer = useCallback(
    (slug: string) => {
      setSelected((cur) => {
        if (cur.includes(slug)) return cur;
        if (cur.length >= MAX_COMPARE) {
          say(`最多同时对比 ${MAX_COMPARE} 支`);
          return cur;
        }
        return [...cur, slug];
      });
      setDrawerOpen(false);
    },
    [say],
  );

  const selectTop = useCallback(() => {
    setSelected(rows.slice(0, MAX_COMPARE).map((d) => d.slug));
    document.getElementById('compare-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [rows]);

  const onSort = useCallback((key: string) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: (cur.dir * -1) as 1 | -1 }
        : { key, dir: SORT_ASC_DEFAULT.includes(key) ? 1 : -1 },
    );
    setPage(1);
  }, []);

  const openDetail = useCallback((slug: string) => {
    setDrawerSlug(slug);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const exportCsv = useCallback(() => {
    const head = ['品牌', '品牌中文名', '型号', '卡口', '类型', '焦段', '最大光圈', '综合',
      ...METRICS.map((m) => m.n), '参考价(¥)', 'MSRP($)', '重量(g)', '滤镜口径', '最近对焦',
      '光圈叶片', '防抖', '镜组结构', '上市年', '评测源', '低置信度'];
    const lines = [head.join(',')];
    for (const d of rows) {
      lines.push([
        d.brand,
        BRAND_CN[d.brand] || '',
        `"${(d.name || '').replace(/"/g, '""')}"`,
        `"${d.mount || ''}"`,
        d.type,
        d.focalMin != null ? `${d.focalMin}${d.focalMin !== d.focalMax ? '-' + d.focalMax : ''}mm` : '',
        d.ap,
        d.overall ?? '',
        ...METRICS.map((m) => d[m.k] ?? ''),
        d.price ?? '',
        d.msrp ?? '',
        d.weight ?? '',
        d.filterSize || '',
        d.minFocus || '',
        d.blades || '',
        d.stab || '',
        `"${d.structure || ''}"`,
        d.year ?? '',
        d.n ?? '',
        d.lowconf ? '是' : '否',
      ].join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `镜头筛选结果_${rows.length}支.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /* ---------- 加载 / 出错 ---------- */
  if (error) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 py-16">
        <h1 className="mb-2 text-[22px] font-bold">数据加载失败</h1>
        <p className="mb-4 text-[13.5px] text-tx2">{error}</p>
        <p className="mb-5 text-[12.5px] text-tx3">
          多数情况是 <code className="rounded bg-line2 px-1.5 py-0.5 font-mono">data/lenses.json</code>{' '}
          未能取到：本地直接双击打开 HTML 会被浏览器的同源策略拦掉，请改用本地服务器访问，或使用单文件版本。
        </p>
        <button
          type="button"
          onClick={load}
          className="cursor-pointer rounded-lg border border-line bg-card px-3.25 py-1.5 text-[12.5px] hover:border-tx3"
        >
          重新加载
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 py-24 text-center text-[13.5px] text-tx3">
        正在载入镜头数据…
      </div>
    );
  }

  return (
    <ThemeCtx.Provider value={theme}>
      <div className="mx-auto max-w-[1400px] px-5 pb-15" data-app-ready={rows.length}>
        {/* 顶栏 */}
        <div className="flex items-center justify-between gap-4 pt-5">
          {IS_SINGLE ? (
            <span className="text-[12.5px] text-tx3">单文件版 · 可离线使用</span>
          ) : (
            <a
              href={import.meta.env.BASE_URL}
              className="border-b border-transparent text-[12.5px] text-tx2 transition-all duration-150 hover:border-acc hover:text-acc"
            >
              ← 返回工具箱
            </a>
          )}
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>

        <HeaderSection data={data} />

        <FilterPanel
          data={data}
          f={f}
          patch={patch}
          resultCount={rows.length}
          onReset={reset}
          onSelectTop={selectTop}
          onExportCsv={exportCsv}
        />

        <div id="compare-anchor" />
        <CompareSection
          selected={selectedLenses}
          onRemove={toggleCompare}
          tipRef={tipRef}
        />

        <OverviewSection rows={rows} tipRef={tipRef} />
        <RankingSection rows={rows} tipRef={tipRef} />

        <TableSection
          rows={rows}
          sort={sort}
          onSort={onSort}
          page={page}
          onPage={setPage}
          selected={selected}
          onToggleCompare={toggleCompare}
          onOpenDetail={openDetail}
          tipRef={tipRef}
        />

        <NotesSection data={data} />

        <footer className="mt-8.5 border-t border-line pt-4 pb-2 text-center text-[11.5px] text-tx3">
          数据抓取于 dcaid.com · 分数为多站实测均值 · 仅供选购参考，不构成购买建议
        </footer>
      </div>

      <Drawer
        lens={drawerSlug ? (bySlug.get(drawerSlug) ?? null) : null}
        open={drawerOpen}
        selected={!!drawerSlug && selected.includes(drawerSlug)}
        onClose={closeDrawer}
        onAdd={addFromDrawer}
      />

      <LensTip ref={tipRef} />

      {flash && (
        <div className="fixed bottom-6.5 left-1/2 z-200 -translate-x-1/2 rounded-lg bg-[rgba(38,37,35,.94)] px-4.5 py-2.25 text-[13px] text-white shadow-card-hi">
          {flash}
        </div>
      )}
    </ThemeCtx.Provider>
  );
}
