import { useMemo, useState } from 'react';
import { SITE } from './tools';
import { TOOLS } from 'virtual:toolbox/registry';
import { SoonCard, ToolCard } from './components/ToolCard';
import { ThemeToggle } from '@platform/ui/ThemeToggle';
import { useTheme } from '@platform/theme/useTheme';

export function PortalApp() {
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  /** 所有标签（用于筛选条） */
  const allTags = useMemo(() => {
    const s = new Set<string>();
    TOOLS.forEach((t) => t.tags.forEach((x: string) => s.add(x)));
    return [...s];
  }, []);

  /** 按关键词 + 标签过滤 */
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return TOOLS.filter((t) => {
      if (tag && !t.tags.includes(tag)) return false;
      if (!kw) return true;
      const hay = `${t.name} ${t.desc} ${t.tags.join(' ')} ${t.meta ?? ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }, [q, tag]);

  const liveCount = useMemo(() => TOOLS.filter((t) => t.live).length, []);

  return (
    <div className="mx-auto max-w-[1080px] px-6 max-sm:px-4.5">
      {/* ---------- 顶栏 ---------- */}
      <header className="pt-16 pb-2 max-sm:pt-10">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h1 className="mb-2 text-[29px] leading-tight font-bold tracking-[-0.5px] max-sm:text-[23px]">
              我的工具箱
            </h1>
            <p className="m-0 max-w-[46ch] text-[15px] text-tx2">
              把日常用到的自研工具收在一处。全部是纯前端单文件，零依赖、即开即用。
            </p>
          </div>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      {/* ---------- 搜索 + 筛选 ---------- */}
      <div className="my-[22px] mt-[30px] flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-60 max-w-80 flex-1 basis-60 max-sm:max-w-none max-sm:basis-full">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="pointer-events-none absolute top-1/2 left-2.75 size-3.75 -translate-y-1/2 text-tx3"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索工具…"
            autoComplete="off"
            className="w-full rounded-[10px] border border-line bg-card py-2.25 pr-3 pl-8.25 text-[13.5px] text-tx outline-none transition-all duration-150 placeholder:text-tx3 focus:border-acc focus:ring-3 focus:ring-acc-soft"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {[null, ...allTags].map((t) => {
            const on = tag === t;
            return (
              <button
                key={t ?? '__all'}
                type="button"
                onClick={() => setTag(t)}
                className={
                  'cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-all duration-150 ' +
                  (on
                    ? 'border-acc bg-acc text-white dark:text-[#0F1420]'
                    : 'border-line bg-card text-tx2 hover:border-tx3 hover:text-tx')
                }
              >
                {t ?? '全部'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- 工具网格 ---------- */}
      <main className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-4 pb-2">
        {list.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
        {list.length > 0 && <SoonCard />}
      </main>

      {list.length === 0 && (
        <div className="py-14 text-center text-[13.5px] text-tx3">没有匹配的工具</div>
      )}

      {/* ---------- 关于 ---------- */}
      <section className="mt-9.5 rounded-2xl border border-line bg-card p-6 shadow-card">
        <h3 className="mt-0 mb-2.5 text-sm font-[650] tracking-[-0.1px]">关于这个站点</h3>
        <p className="m-0 text-[13.5px] leading-[1.72] text-tx2">
          这里是 {SITE.owner} 的自研工具集合，目前收录 <b>{liveCount}</b> 个工具。本站部署在 GitHub
          Pages 上，源码仓库为 <code className="rounded-md bg-line2 px-1.5 py-0.5 font-mono text-[12.5px] text-tx">{SITE.repoName}</code>。
        </p>
        <p className="mt-2 mb-0 text-[13.5px] leading-[1.72] text-tx2">
          技术栈：React 19 + TypeScript + Vite + Tailwind CSS 4。各工具本身不依赖任何外部 CDN，可离线运行。
        </p>
      </section>

      {/* ---------- 页脚 ---------- */}
      <footer className="mt-11 flex flex-wrap items-center justify-between gap-3.5 border-t border-line pt-5.5 pb-10 text-[12.5px] text-tx3">
        <span>
          © {new Date().getFullYear()} {SITE.owner}
        </span>
        <a
          href={SITE.repoGh}
          target="_blank"
          rel="noopener"
          className="border-b border-transparent text-tx2 transition-all duration-150 hover:border-acc hover:text-acc"
        >
          GitHub ↗
        </a>
      </footer>
    </div>
  );
}
