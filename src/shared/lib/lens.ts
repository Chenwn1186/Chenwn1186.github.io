/* ============================================================
   镜头领域基础模块
   —— 类型、评分维度、品牌中文名与配色、格式化工具。
      门户与镜头工具共用，避免两处各写一份。
   ============================================================ */

export interface Lens {
  slug: string;
  name: string;
  brand: string;
  mount: string;
  type: string;
  focalMin: number | null;
  focalMax: number | null;
  ap: string;
  apMax: number;
  price?: number;
  msrp?: number;
  weight?: number;
  year?: number;
  dims?: string;
  overall?: number | null;
  sharp?: number | null;
  edge?: number | null;
  vig?: number | null;
  cal?: number | null;
  cax?: number | null;
  dist?: number | null;
  flare?: number | null;
  bokeh?: number | null;
  n?: number;
  lowconf?: boolean;
  tags?: string[];
  filterSize?: string;
  minFocus?: string;
  blades?: string;
  stab?: string;
  structure?: string;
  af?: string;
  sources?: string[];
  apsc?: boolean;
  fullframe?: boolean;
}

/** 八个实测分项。顺序决定雷达图轴序与表格列序。 */
export const METRICS = [
  { k: 'sharp', n: '中心锐度' },
  { k: 'edge', n: '边缘锐度' },
  { k: 'vig', n: '暗角控制' },
  { k: 'cal', n: '横向色差' },
  { k: 'cax', n: '轴向色差' },
  { k: 'dist', n: '畸变控制' },
  { k: 'flare', n: '抗眩光' },
  { k: 'bokeh', n: '焦外成像' },
] as const;

export type MetricKey = (typeof METRICS)[number]['k'];

/** 排行榜的可切换维度。顺序＝榜单标签页顺序。 */
export const BARS: { k: MetricKey; n: string }[] = [
  { k: 'flare', n: '抗眩光' },
  { k: 'cax', n: '轴向色差 LoCA' },
  { k: 'cal', n: '横向色差' },
  { k: 'sharp', n: '中心锐度' },
  { k: 'edge', n: '边缘锐度' },
  { k: 'bokeh', n: '焦外成像' },
  { k: 'vig', n: '暗角控制' },
  { k: 'dist', n: '畸变控制' },
];

export const METRIC_LABEL: Record<string, string> = Object.fromEntries(
  METRICS.map((m) => [m.k, m.n]),
);

/** 参与「总分归一化」的字段——清洗脚本与前端共用同一份口径 */
export const SCORE_KEYS: MetricKey[] = METRICS.map((m) => m.k);

/* ---------- 品牌配色 ---------- */
/** 常见品牌固定色，其余按名称哈希取色 */
const FIXED: Record<string, string> = {
  Viltrox: '#7F77DD', Tamron: '#1D9E75', Sigma: '#378ADD',
  Sony: '#D4537E', Canon: '#C05621', Nikon: '#B8860B',
  Fujifilm: '#0E7C7B', Panasonic: '#4A6FA5', Leica: '#A32D2D',
  Zeiss: '#2D6EA3', Samyang: '#7A6BAD', Laowa: '#3E8E7E',
  TTArtisan: '#C77D3A', '7Artisans': '#8A5A44', Sirui: '#5B8C5A',
  Voigtlander: '#6B5B95', Meike: '#4E7C9B', Yongnuo: '#B5651D',
  Tokina: '#3D7B7B', 'Zhongyi (Mitakon)': '#8B6F47', Pentax: '#A8443E',
  'OM System': '#3E7C8F', Olympus: '#5A7D9A', KamLan: '#9B6B43',
  Rokinon: '#6E7B8B', Thypoch: '#7B6E9B', 'Brightin Star': '#8B7B5A',
};

const PALETTE = ['#7F77DD', '#1D9E75', '#378ADD', '#D4537E', '#C05621', '#B8860B',
  '#0E7C7B', '#4A6FA5', '#A32D2D', '#2D6EA3', '#7A6BAD', '#3E8E7E', '#C77D3A',
  '#8A5A44', '#5B8C5A', '#6B5B95', '#4E7C9B', '#B5651D', '#3D7B7B', '#8B6F47'];

const _colorCache: Record<string, string> = {};

/** 品牌色：固定表优先，否则按名称哈希落在调色板上（同一品牌永远同色） */
export function brandColor(b?: string): string {
  if (!b) return '#9C9A92';
  const fixed = FIXED[b];
  if (fixed) return fixed;
  const hit = _colorCache[b];
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) >>> 0;
  return (_colorCache[b] = PALETTE[h % PALETTE.length]);
}

/* ---------- 品牌官方中文名 ----------
   均取自品牌方官网 / 官方电商旗舰店使用的中文名；确无官方中文名的注明「无官方译名」。 */
export const BRAND_CN: Record<string, string> = {
  /* 日系原厂 */
  Sony: '索尼',
  Canon: '佳能',
  Nikon: '尼康',
  Fujifilm: '富士',
  Panasonic: '松下',
  Olympus: '奥林巴斯',
  'OM System': '奥之心',
  Pentax: '宾得',
  Sigma: '适马',
  Tamron: '腾龙',
  Tokina: '图丽',
  Cosina: '确善能',
  Voigtlander: '福伦达',
  /* 德系 */
  Leica: '徕卡',
  Zeiss: '蔡司',
  'Carl Zeiss': '卡尔·蔡司',
  /* 韩系 */
  Samyang: '森养·三阳',
  'LK Samyang': '森养·三阳',
  Samsung: '三星',
  /* 中国品牌 */
  Viltrox: '唯卓仕',
  Laowa: '老蛙',
  'Venus Optics': '长庚光学',
  TTArtisan: '铭匠',
  '7Artisans': '七工匠',
  Yongnuo: '永诺',
  Meike: '美科',
  AstrHori: '岩石星',
  Sirui: '思锐',
  'Brightin Star': '星曜',
  'Zhongyi Mitakon': '中一光学',
  'Mitakon Zhongyi': '中一光学',
  Pergear: '珀影',
  Kase: '卡色',
  NiSi: '耐司',
  'SG-Image': '深光',
  Thypoch: '叙',
  'Light Lens Lab': '光影镜头实验室',
  Mandler: '曼德勒',
  Artralab: '阿特拉',
  'Artra Lab': '阿特拉',
  Artizlab: '阿蒂兹',
  Funleader: '饭粒',
  /* 其他 */
  Hasselblad: '哈苏',
  Irix: '爱丽克斯',
  Lomography: '乐魔',
  GIZMON: '无官方译名',
};

/** 「英文名（中文名）」；无中文名时原样返回 */
export function brandLabel(b?: string): string {
  if (!b) return '—';
  const cn = BRAND_CN[b];
  return cn ? `${b}（${cn}）` : b;
}

/* ---------- 格式化 ---------- */
export function hex2rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 数值展示：缺失一律显示「—」，绝不显示 0（0 分和没数据是两回事） */
export function fmt(v: number | null | undefined, d = 1): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(d);
}

export function money(v?: number | null): string {
  return v || v === 0 ? '¥' + Number(v).toLocaleString('en-US') : '—';
}

/** 分数胶囊的三档分类 */
export function scoreClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'na';
  return v >= 8 ? 'hi' : v >= 6.5 ? 'mid' : 'lo';
}

/** 焦段展示：定焦不带区间 */
export function focalText(d: Lens): string {
  if (d.focalMin == null) return '—';
  return d.focalMin === d.focalMax ? `${d.focalMin}mm` : `${d.focalMin}-${d.focalMax}mm`;
}

/** HTML 转义——tooltip 用 innerHTML 拼串，品牌/型号名虽是我们自己的数据，也照转不误 */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
