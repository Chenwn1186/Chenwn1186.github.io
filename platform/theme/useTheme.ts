import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function readInitial(): Theme {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* localStorage 可能被禁用，忽略 */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 把主题写到 <html> 的 class 与 meta theme-color 上。幂等，可重复调用。 */
export function applyThemeClass(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#131318' : '#FBFBF9');
}

/** 主题：读写 <html> 的 class 并持久化到 localStorage */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial);

  // 关键：class 必须**同步**落到 <html>，不能只放在 effect 里。
  // React 的 effect 是子先父后，父组件（本 hook）的 effect 最后才跑；
  // 若等到那时才加 dark，子组件里的图表 effect 早就读完成旧主题色了。
  // 这里在渲染期直接写 DOM —— 幂等且完全由 state 推导，StrictMode 重复渲染也无副作用。
  applyThemeClass(theme);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      applyThemeClass(next);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* 忽略写入失败 */
    }
  }, [theme]);

  return { theme, toggle };
}

/* ---------- 供深层子组件（图表）取当前主题 ---------- */
export const ThemeCtx = createContext<Theme>('light');
export function useThemeValue(): Theme {
  return useContext(ThemeCtx);
}
