import { useEffect, useMemo, useRef, useState } from 'react';
import { brandLabel, METRICS, type Lens, type MetricKey } from '../domain/lens';
import { Btn, Chip, SectionHead } from '@platform/ui/ui';
import type { FilterState, FocalMode } from '../filter';

const AP_STEPS = [1.2, 1.4, 1.8, 2.0, 2.8, 4.0];
/** 主要品牌靠前，其余按机型数量降序 */
const MAIN_BRANDS = ['Sony', 'Canon', 'Nikon', 'Sigma', 'Tamron', 'Viltrox', 'Fujifilm',
  'Panasonic', 'Leica', 'Zeiss', 'Samyang', 'Laowa'];
const MAX_MOUNT_CHIPS = 22;

interface Props {
  data: Lens[];
  f: FilterState;
  patch: (p: Partial<FilterState>) => void;
  resultCount: number;
  onReset: () => void;
  onSelectTop: () => void;
  onExportCsv: () => void;
}

export function FilterPanel({ data, f, patch, resultCount, onReset, onSelectTop, onExportCsv }: Props) {
  const [advanced, setAdvanced] = useState(true);

  /* ---------- 各维度的候选项与数量（基于全量数据，不随筛选变化） ---------- */
  const opt = useMemo(() => {
    const brand = new Map<string, number>();
    const mount = new Map<string, number>();
    const type = new Map<string, number>();
    const tag = new Map<string, number>();
    const apCount = new Map<number, number>();
    for (const d of data) {
      brand.set(d.brand, (brand.get(d.brand) ?? 0) + 1);
      const m = d.mount || '未知';
      mount.set(m, (mount.get(m) ?? 0) + 1);
      type.set(d.type, (type.get(d.type) ?? 0) + 1);
      for (const t of d.tags ?? []) tag.set(t, (tag.get(t) ?? 0) + 1);
      for (const a of AP_STEPS) if (d.apMax <= a + 1e-9) apCount.set(a, (apCount.get(a) ?? 0) + 1);
    }
    const brands = [...brand.entries()].sort((a, b) => {
      const ia = MAIN_BRANDS.indexOf(a[0]);
      const ib = MAIN_BRANDS.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }
      return b[1] - a[1];
    });
    const mounts = [...mount.entries()].sort((a, b) => b[1] - a[1]);
    const tags = [...tag.entries()].sort((a, b) => b[1] - a[1]);
    return { brands, mounts, types: [...type.entries()], tags, apCount };
  }, [data]);

  const toggleIn = (key: 'brand' | 'mount' | 'type' | 'tag', v: string) => {
    const cur = f[key];
    patch({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<FilterState>);
  };

  const anyFilter =
    f.q !== '' ||
    f.brand.length + f.mount.length + f.type.length + f.tag.length > 0 ||
    f.ap !== null ||
    f.focalMin !== null ||
    f.focalMax !== null ||
    f.priceMin !== null ||
    f.priceMax !== null ||
    f.weightMax !== null ||
    f.overallMin !== null ||
    f.hideLowconf ||
    Object.values(f.scoreMin).some((v) => v);

  return (
    <section className="mt-7.5">
      <SectionHead no={1} title="检索与筛选">
        所有条件为「与」关系，实时生效。焦段筛选可选<b className="text-tx">「完全落在区间内」</b>或
        <b className="text-tx">「与区间有交集」</b>两种语义；8 个分项各自带最低分滑块，
        可以直接要求「抗眩光 ≥8 且轴向色差 ≥8」。
      </SectionHead>

      <div className="rounded-[10px] border border-line bg-card px-4.5 py-4">
        {/* 搜索行 */}
        <div className="mb-3.75 flex flex-wrap items-center gap-2.5">
          <SearchBox value={f.q} onCommit={(q) => patch({ q })} />
          <Btn onClick={() => setAdvanced((v) => !v)}>
            {advanced ? '收起高级筛选' : '展开高级筛选'}
          </Btn>
        </div>

        {advanced && (
          <>
            {/* 品牌 */}
            <div className="flex flex-wrap gap-4">
              <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
                <div className="text-[11px] font-semibold tracking-[0.4px] text-tx3 uppercase">
                  品牌
                  <span className="ml-1.5 text-[10.5px] normal-case">
                    （共 {opt.brands.length} 个，按机型数量排序）
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.25">
                  {opt.brands.map(([b, c]) => (
                    <Chip key={b} on={f.brand.includes(b)} count={c} onClick={() => toggleIn('brand', b)}>
                      {brandLabel(b)}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            {/* 卡口 / 类型 / 特性 */}
            <div className="mt-3.25 flex flex-wrap items-start gap-4">
              <Group label="卡口 / 画幅">
                <Scrollable>
                  {opt.mounts.slice(0, MAX_MOUNT_CHIPS).map(([m, c]) => (
                    <Chip key={m} on={f.mount.includes(m)} count={c} onClick={() => toggleIn('mount', m)}>
                      {m}
                    </Chip>
                  ))}
                </Scrollable>
              </Group>
              <Sep />
              <Group label="类型">
                {opt.types.map(([t, c]) => (
                  <Chip key={t} on={f.type.includes(t)} count={c} onClick={() => toggleIn('type', t)}>
                    {t}
                  </Chip>
                ))}
              </Group>
              <Sep />
              <Group label="特性">
                <Scrollable>
                  {opt.tags.map(([t, c]) => (
                    <Chip key={t} on={f.tag.includes(t)} count={c} onClick={() => toggleIn('tag', t)}>
                      {t}
                    </Chip>
                  ))}
                </Scrollable>
              </Group>
            </div>

            {/* 数值区间 */}
            <div className="mt-3.25 flex flex-wrap items-start gap-4">
              <Group label="焦段区间（mm）">
                <div className="flex items-center gap-1.75 text-[12.5px] text-tx2">
                  <NumInput value={f.focalMin} onChange={(v) => patch({ focalMin: v })} placeholder="8" />
                  <span className="text-[11.5px] text-tx3">至</span>
                  <NumInput value={f.focalMax} onChange={(v) => patch({ focalMax: v })} placeholder="1200" />
                </div>
                <div className="mt-0.75 flex gap-1.25">
                  {([['cover', '完全落在区间内'], ['intersect', '与区间有交集']] as [FocalMode, string][]).map(
                    ([m, lb]) => (
                      <Chip key={m} on={f.focalMode === m} onClick={() => patch({ focalMode: m })}>
                        {lb}
                      </Chip>
                    ),
                  )}
                </div>
              </Group>
              <Sep />
              <Group label="最大光圈 ≤">
                {AP_STEPS.map((a) => (
                  <Chip
                    key={a}
                    on={f.ap === a}
                    count={opt.apCount.get(a) ?? 0}
                    onClick={() => patch({ ap: f.ap === a ? null : a })}
                  >
                    {`≤F${a.toFixed(1)}`}
                  </Chip>
                ))}
              </Group>
              <Sep />
              <Group label="价格（¥，按 MSRP 折算）">
                <div className="flex items-center gap-1.75 text-[12.5px] text-tx2">
                  <NumInput value={f.priceMin} onChange={(v) => patch({ priceMin: v })} placeholder="0" />
                  <span className="text-[11.5px] text-tx3">至</span>
                  <NumInput value={f.priceMax} onChange={(v) => patch({ priceMax: v })} placeholder="99999" />
                </div>
              </Group>
              <Sep />
              <Group label="重量 ≤ (g)">
                <NumInput value={f.weightMax} onChange={(v) => patch({ weightMax: v })} placeholder="不限" />
              </Group>
              <Sep />
              <Group label="综合分 ≥">
                <NumInput
                  value={f.overallMin}
                  onChange={(v) => patch({ overallMin: v })}
                  placeholder="不限"
                  step={0.1}
                />
              </Group>
            </div>

            {/* 分项滑块 */}
            <div className="mt-3.25 flex flex-wrap gap-4">
              <div className="flex flex-[1_1_100%] flex-col gap-1.5">
                <div className="text-[11px] font-semibold tracking-[0.4px] text-tx3 uppercase">
                  各分项评分下限
                </div>
                <div className="flex flex-wrap gap-3">
                  {METRICS.map((m) => (
                    <ScoreSlider
                      key={m.k}
                      metricKey={m.k}
                      label={m.n}
                      value={f.scoreMin[m.k] ?? 0}
                      onChange={(v) =>
                        patch({ scoreMin: { ...f.scoreMin, [m.k]: v > 0 ? v : undefined } })
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 动作条 */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line2 pt-3.25">
          <Btn pri onClick={onReset} disabled={!anyFilter}>
            重置全部条件
          </Btn>
          <Btn onClick={() => patch({ hideLowconf: !f.hideLowconf })}>
            {f.hideLowconf ? '✓ ' : ''}只显示评测源 ≥3 的型号
          </Btn>
          <Btn onClick={onSelectTop}>将当前结果加入对比（前 6 支）</Btn>
          <Btn onClick={onExportCsv}>导出当前结果为 CSV</Btn>
          <span className="ml-auto text-[12.5px] text-tx2">
            命中 <b className="text-[15px] text-tx">{resultCount.toLocaleString('en-US')}</b> /{' '}
            {data.length.toLocaleString('en-US')} 支
          </span>
        </div>
      </div>
    </section>
  );
}

/* ---------- 局部小组件 ---------- */

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[11px] font-semibold tracking-[0.4px] text-tx3 uppercase">{label}</div>
      <div className="flex flex-wrap items-center gap-1.25">{children}</div>
    </div>
  );
}

const Sep = () => <div className="hidden w-px self-stretch bg-line md:block" />;

const Scrollable = ({ children }: { children: React.ReactNode }) => (
  <div className="flex max-h-[104px] flex-wrap gap-1.25 overflow-y-auto pr-0.5">{children}</div>
);

function SearchBox({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | undefined>(undefined);

  // 外部重置时同步回本地输入框
  useEffect(() => setLocal(value), [value]);

  const onInput = (v: string) => {
    setLocal(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onCommit(v.trim()), 180);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <label className="relative min-w-55 flex-[1_1_220px]">
      <span className="pointer-events-none absolute top-1/2 left-2.75 -translate-y-1/2 text-[14px] text-tx3">
        ⌕
      </span>
      <input
        type="text"
        value={local}
        autoComplete="off"
        onChange={(e) => onInput(e.target.value)}
        placeholder='搜索型号 / 品牌 / 焦段 / 光圈，如 "35mm F1.4"、"Viltrox"、"24-70"'
        className="w-full rounded-lg border border-line bg-card py-2.25 pr-3.25 pl-8.5 text-[13.5px] text-tx outline-none transition-colors duration-150 placeholder:text-tx3 focus:border-acc focus:ring-3 focus:ring-acc-soft"
      />
    </label>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  step?: number;
}) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') return onChange(null);
        const n = parseFloat(v);
        onChange(isFinite(n) ? n : null);
      }}
      className="w-17.5 rounded-[7px] border border-line bg-card px-2 py-1.25 text-[12.5px] text-tx outline-none transition-colors duration-150 placeholder:text-tx3 focus:border-acc"
    />
  );
}

function ScoreSlider({
  metricKey,
  label,
  value,
  onChange,
}: {
  metricKey: MetricKey;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex min-w-27 flex-col gap-0.5">
      <div className="text-[11.5px] text-tx2">
        {label} ≥ <b className="font-semibold text-tx">{value > 0 ? value.toFixed(1) : '不限'}</b>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={value}
        aria-label={`${label}最低分`}
        data-metric={metricKey}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-4 w-full accent-acc"
      />
    </div>
  );
}
