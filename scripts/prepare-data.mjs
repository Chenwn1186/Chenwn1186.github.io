#!/usr/bin/env node
/**
 * 把抓取到的原始镜头数据整理成前端可直接加载的 lenses.json
 *
 *   源：scripts/lenses-source.json
 *   出：public/data/lenses.json     供多文件构建在运行时 fetch
 *       src/data/lenses-inline.ts   供单文件构建直接 import 内联
 *   跑：npm run data
 *
 * 做三件事：
 *   1. 只保留前端用得到的字段，丢弃其余 —— 源文件 1.27MB → 产物约 0.9MB
 *   2. 清洗脏数据：少量记录的总分误用了百分制（如 89.2），统一归一到 0–10
 *   3. 规整数值类型（整数去掉小数点、minFocus 去掉抓取残留的图标字符）
 *
 * 两份产物内容完全相同，只是投递方式不同（fetch vs 打包内联）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, 'lenses-source.json');
const OUT = resolve(here, '..', 'public', 'data', 'lenses.json');
const OUT_INLINE = resolve(here, '..', 'src', 'data', 'lenses-inline.ts');

/** 前端渲染需要的字段（其余丢弃以控制体积） */
const KEEP = [
  'slug', 'name', 'brand', 'mount', 'type',
  'focalMin', 'focalMax', 'ap', 'apMax',
  'price', 'msrp', 'weight', 'year', 'overall',
  'sharp', 'edge', 'vig', 'cal', 'cax', 'dist', 'flare', 'bokeh',
  'n', 'lowconf', 'tags',
  'filterSize', 'minFocus', 'blades', 'stab', 'structure', 'dims', 'af',
  'sources', 'apsc', 'fullframe',
];

/** 评测分统一为 0–10 制 */
const SCORE_KEYS = ['overall', 'sharp', 'edge', 'vig', 'cal', 'cax', 'dist', 'flare', 'bokeh'];

const raw = JSON.parse(readFileSync(SRC, 'utf8'));

const report = { total: raw.length, scoreFixed: 0, minFocusFixed: 0, dropped: 0 };

const out = raw.map((d) => {
  const o = {};
  for (const k of KEEP) {
    let v = d[k];
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    o[k] = v;
  }

  // 清洗 1：总分被误写成百分制（源站个别条目用 0–100 计分）
  for (const k of SCORE_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && v > 10.001) {
      o[k] = Math.round(v / 10 * 10) / 10;
      if (k === 'overall') report.scoreFixed++;
    }
  }

  // 清洗 2：整数去掉多余小数位
  for (const k of ['focalMin', 'focalMax', 'price', 'msrp', 'weight', 'year']) {
    if (typeof o[k] === 'number' && Number.isInteger(o[k])) o[k] = Math.trunc(o[k]);
  }

  // 清洗 3：最近对焦距离里混进了页面图标与无关文案，如 "5.0m 🔍 Max Magn"
  if (typeof o.minFocus === 'string' && /🔍|\s{2,}/.test(o.minFocus)) {
    o.minFocus = o.minFocus.split('🔍')[0].trim().replace(/\s{2,}/g, ' ');
    report.minFocusFixed++;
  }

  return o;
});

const json = JSON.stringify(out);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json, 'utf8');

// 单文件模式用：把整份 JSON 塞进一个字符串常量。
// 之所以不写成 `export const LENSES = [{...}]`——那会让 tsc 为 1617 个对象
// 逐个推导字面量类型，慢得离谱；包成字符串后类型只是 string，JSON.parse 一次即可。
mkdirSync(dirname(OUT_INLINE), { recursive: true });
writeFileSync(
  OUT_INLINE,
  '/* 由 scripts/prepare-data.mjs 生成，请勿手工编辑。数据源：scripts/lenses-source.json */\n' +
    '// @generated\n' +
    `export const LENSES_JSON = ${JSON.stringify(json)};\n`,
  'utf8',
);

console.log('镜头总数        ', report.total);
console.log('归一化总分(脏数据)', report.scoreFixed, '条');
console.log('清洗对焦距离     ', report.minFocusFixed, '条');
console.log('产物            ', OUT);
console.log('                ', OUT_INLINE);
console.log('体积            ', (Buffer.byteLength(json) / 1048576).toFixed(2), 'MB');
