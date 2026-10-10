import { useEffect } from 'react';
import {
  brandColor,
  brandLabel,
  fmt,
  METRICS,
  money,
  type Lens,
} from '../domain/lens';
import { Btn } from '@platform/ui/ui';

interface Props {
  lens: Lens | null;
  /** 打开状态。关闭时仍挂载，靠 translate 做滑出动画 */
  open: boolean;
  selected: boolean;
  onClose: () => void;
  onAdd: (slug: string) => void;
}

export function Drawer({ lens, open, selected, onClose, onAdd }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = lens;
  const color = d ? brandColor(d.brand) : '#9C9A92';

  const kv: [string, string][] = d
    ? [
        ['品牌', brandLabel(d.brand)],
        ['卡口', d.mount || '—'],
        ['类型', d.type],
        ['焦段', d.focalMin != null
          ? `${d.focalMin}${d.focalMin !== d.focalMax ? '–' + d.focalMax : ''}mm`
          : '—'],
        ['最大光圈', d.ap],
        ['最近对焦', d.minFocus || '—'],
        ['滤镜口径', d.filterSize || '—'],
        ['光圈叶片', d.blades || '—'],
        ['重量', d.weight ? d.weight + 'g' : '—'],
        ['尺寸', d.dims || '—'],
        ['镜组结构', d.structure || '—'],
        ['防抖', d.stab || '—'],
        ['对焦', d.af || '—'],
        ['参考价', money(d.price)],
        ['上市年', d.year ? String(d.year) : '—'],
      ]
    : [];

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={
          'fixed inset-0 z-79 bg-black/25 transition-opacity duration-220 ' +
          (open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')
        }
      />
      <aside
        role="dialog"
        aria-label="镜头详情"
        aria-hidden={!open}
        className={
          'fixed top-0 right-0 z-80 h-full w-[min(560px,100%)] overflow-y-auto border-l border-line bg-card px-6.5 py-6 shadow-card-hi transition-transform duration-220 ease-out ' +
          (open ? 'translate-x-0' : 'translate-x-full')
        }
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情"
          className="absolute top-4 right-4.5 cursor-pointer text-[20px] leading-none text-tx3 hover:text-tx"
        >
          ✕
        </button>

        {d && (
          <>
            <h3 className="mb-1 pr-7.5 text-[18px] font-semibold">{d.name}</h3>
            <div className="mb-4 text-[12.5px] text-tx2">
              {brandLabel(d.brand)} · {d.mount || '—'} · 综合 <b className="text-tx">{fmt(d.overall)}</b> ·{' '}
              {d.n ?? 0} 家评测源
              {d.lowconf && <span className="text-[#B07A22]"> · ⚠ 低置信度</span>}
            </div>

            <div className="mt-4.5">
              <div className="mb-1.75 text-[11px] font-semibold tracking-[0.4px] text-tx3 uppercase">
                八项分项评分
              </div>
              {METRICS.map((m) => {
                const v = d[m.k];
                return (
                  <div
                    key={m.k}
                    className="mb-1.25 grid grid-cols-[96px_1fr_40px] items-center gap-2"
                  >
                    <span className="text-[12px] text-tx2">{m.n}</span>
                    <span className="h-2.25 overflow-hidden rounded-[4px] bg-line2">
                      <span
                        className="block h-full rounded-[4px] transition-[width] duration-300"
                        style={{
                          width: `${v == null ? 0 : (v / 10) * 100}%`,
                          background: color,
                        }}
                      />
                    </span>
                    <span className="text-right text-[12px] font-semibold tabular-nums">
                      {fmt(v)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4.5">
              <div className="mb-1.75 text-[11px] font-semibold tracking-[0.4px] text-tx3 uppercase">
                完整规格
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.25 text-[12.5px]">
                {kv.map(([k, v]) => (
                  <div key={k} className="contents">
                    <div className="text-tx3">{k}</div>
                    <div className="break-words">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4.5">
              <div className="mb-1.75 text-[11px] font-semibold tracking-[0.4px] text-tx3 uppercase">
                评测来源 ({(d.sources ?? []).length})
              </div>
              {(d.sources ?? []).length === 0 ? (
                <div className="border-b border-line2 py-1.5 text-[12px] text-tx3">无明细来源</div>
              ) : (
                (d.sources ?? []).map((s) => (
                  <div
                    key={s}
                    className="flex justify-between gap-2.5 border-b border-line2 py-1.5 text-[12px]"
                  >
                    <span>{s}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4.5">
              <Btn pri onClick={() => onAdd(d.slug)} disabled={selected}>
                {selected ? '✓ 已在对比台' : '加入对比台'}
              </Btn>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
