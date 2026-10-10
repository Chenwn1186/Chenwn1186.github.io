/**
 * tools/lens 入口 —— 一行挂载。
 * 迁移前的 src/lens.tsx（StrictMode + createRoot + import styles + App）已由
 * platform 的挂载约定吸收；样式 import 保留在此入口（Tailwind 需要每个入口都
 * 引一次，Rolldown 会做共享 CSS 提取去重——实测两入口共享同一 chunk）。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles.css';
import { LensApp } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LensApp />
  </StrictMode>,
);
