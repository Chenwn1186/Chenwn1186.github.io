import type { ReactNode } from 'react';

export type Tool = {
  /** 唯一标识，同时作为卡片锚点 */
  id: string;
  /** 工具名称 */
  name: string;
  /** 一句话简介 */
  desc: string;
  /** 链接。子目录工具写 "目录名/"，外链写完整 https 地址 */
  url: string;
  /** 卡片图标（内联 SVG 内容，用 currentColor 以跟随主题） */
  icon: ReactNode;
  /** 标签，用于筛选 */
  tags: string[];
  /** 卡片底部补充信息 */
  meta?: string;
  /** 主题色 */
  tint?: string;
  /** false 时显示为「即将上线」 */
  live: boolean;
};

/**
 * 工具清单 —— 新增工具只需在这里加一项，主页会自动生成卡片、收集标签、纳入搜索。
 * 详细字段说明见 README.md
 */
export const TOOLS: Tool[] = [
  {
    id: 'lens',
    name: '全球镜头数据库',
    desc: '收录 1,617 支镜头的八维实测评测数据（锐度 / 色散 / 抗眩光 / 畸变 / 焦外等），覆盖 46 个品牌、41 种卡口，支持多维筛选、排序、CSV 导出与横向对比。',
    url: 'lens/',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.6" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
    tags: ['摄影', '数据可视化', '筛选对比'],
    meta: '1,617 支镜头 · 8 项评测维度 · 39 家评测源',
    tint: '#2F5FD0',
    live: true,
  },
];

export const SITE = {
  owner: '陈伟宁',
  repoName: 'Chenwn1186.github.io',
  repoGh: 'https://github.com/Chenwn1186',
  home: 'https://chenwn1186.github.io',
};
