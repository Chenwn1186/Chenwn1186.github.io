import type { Lens } from './domain/lens';

/** 由 vite.config.ts 的 define 注入：单文件模式下数据直接内联进包，不走 fetch */
declare const __INLINE_DATA__: boolean;

/** 单文件模式（无服务器、可 file:// 双击打开）。构建期常量，可被 DCE 消除。 */
export const IS_SINGLE = __INLINE_DATA__;

let pending: Promise<Lens[]> | null = null;

async function fetchData(): Promise<Lens[]> {
  // 单文件模式：内联数据。file:// 下 fetch 会被同源策略拦掉，只有内联才能双击打开。
  // __INLINE_DATA__ 是构建期常量，多文件构建时这个分支会被静态求值掉，
  // 连带 dynamic import 一起被 DCE，不会产生多余 chunk。
  if (__INLINE_DATA__) {
    const { LENSES_JSON } = await import('../../src/data/lenses-inline');
    return JSON.parse(LENSES_JSON) as Lens[];
  }
  const url = `${import.meta.env.BASE_URL}data/lenses.json`;
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`数据加载失败（HTTP ${res.status}）`);
  return (await res.json()) as Lens[];
}

/** 全局只加载一次；失败后允许重试 */
export function loadLenses(): Promise<Lens[]> {
  if (!pending) {
    pending = fetchData().catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}
