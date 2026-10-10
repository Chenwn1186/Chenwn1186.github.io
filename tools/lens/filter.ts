import type { Lens, MetricKey } from './domain/lens';

export type FocalMode = 'cover' | 'intersect';

export interface FilterState {
  q: string;
  brand: string[];
  mount: string[];
  type: string[];
  tag: string[];
  ap: number | null;
  focalMin: number | null;
  focalMax: number | null;
  focalMode: FocalMode;
  priceMin: number | null;
  priceMax: number | null;
  weightMax: number | null;
  overallMin: number | null;
  /** 各分项的最低分。0 / 缺省＝不限 */
  scoreMin: Partial<Record<MetricKey, number>>;
  hideLowconf: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  q: '',
  brand: [],
  mount: [],
  type: [],
  tag: [],
  ap: null,
  focalMin: null,
  focalMax: null,
  focalMode: 'cover',
  priceMin: null,
  priceMax: null,
  weightMax: null,
  overallMin: null,
  scoreMin: {},
  hideLowconf: false,
};

/** 搜索索引：把可搜字段拼成一条小写串，只算一次 */
const hayCache = new WeakMap<Lens, string>();
function haystack(d: Lens): string {
  let h = hayCache.get(d);
  if (h === undefined) {
    h = [d.name, d.brand, d.mount, d.focalMin ?? '', d.focalMax ?? '', d.ap, (d.tags ?? []).join(' ')]
      .join(' ')
      .toLowerCase();
    hayCache.set(d, h);
  }
  return h;
}

/** 全部条件为「与」关系 */
export function applyFilters(data: Lens[], f: FilterState): Lens[] {
  const q = f.q.trim().toLowerCase();
  const out: Lens[] = [];

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (f.brand.length && !f.brand.includes(d.brand)) continue;
    if (f.mount.length && !f.mount.includes(d.mount)) continue;
    if (f.type.length && !f.type.includes(d.type)) continue;
    if (f.tag.length) {
      let ok = false;
      for (const t of f.tag) if ((d.tags ?? []).includes(t)) { ok = true; break; }
      if (!ok) continue;
    }
    if (f.ap !== null && d.apMax > f.ap + 1e-9) continue;

    if (d.focalMin !== null && d.focalMax !== null) {
      const lo = f.focalMin === null ? -Infinity : f.focalMin;
      const hi = f.focalMax === null ? Infinity : f.focalMax;
      if (f.focalMode === 'cover') {
        // 完全落在区间内
        if (d.focalMin < lo || d.focalMax > hi) continue;
      } else if (d.focalMax < lo || d.focalMin > hi) continue;
    } else if (f.focalMin !== null || f.focalMax !== null) continue;

    if (f.priceMin !== null && !(d.price !== undefined && d.price >= f.priceMin)) continue;
    if (f.priceMax !== null && !(d.price !== undefined && d.price <= f.priceMax)) continue;
    if (f.weightMax !== null && !(d.weight !== undefined && d.weight <= f.weightMax)) continue;
    if (f.overallMin !== null && !(d.overall != null && d.overall >= f.overallMin)) continue;
    if (f.hideLowconf && d.lowconf) continue;

    let bad = false;
    for (const k in f.scoreMin) {
      const mn = f.scoreMin[k as MetricKey];
      if (mn === undefined || mn === null) continue;
      const v = d[k as MetricKey];
      if (!(v != null && v >= mn)) { bad = true; break; }
    }
    if (bad) continue;

    if (q && haystack(d).indexOf(q) === -1) continue;
    out.push(d);
  }
  return out;
}

/* ---------- 排序 ---------- */
export const SORT_ASC_DEFAULT = ['name', 'brand', 'mount', 'type', 'ap', 'focalRange', 'price', 'weight', 'filterSize'];

export function sortVal(d: Lens, k: string): number | string | null {
  if (k === 'focalRange') return (d.focalMin ?? 999999) * 10000 + (d.focalMax ?? 999999);
  if (k === 'ap') return d.apMax;
  if (k === '_sel') return null;
  const v = (d as unknown as Record<string, unknown>)[k];
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'number' ? v : String(v);
}

/** 缺失值永远排最后，其次按名称兜底，保证排序稳定可预期 */
export function sortRows(rows: Lens[], key: string, dir: 1 | -1): Lens[] {
  return rows.slice().sort((a, b) => {
    const x = sortVal(a, key);
    const y = sortVal(b, key);
    const xn = x === null;
    const yn = y === null;
    if (xn && yn) return (a.name || '').localeCompare(b.name || '', 'zh');
    if (xn) return 1;
    if (yn) return -1;
    if (x === y) return (a.name || '').localeCompare(b.name || '', 'zh');
    if (typeof x === 'string' || typeof y === 'string') {
      return dir * String(x).localeCompare(String(y), 'zh');
    }
    return dir * ((x as number) - (y as number));
  });
}
