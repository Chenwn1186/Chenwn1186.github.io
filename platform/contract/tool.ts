/**
 * 工具清单契约 —— 单一事实来源的类型定义。
 *
 * 一个工具 = tools/<id>/ 目录，内含 tool.config.ts（默认导出 ToolManifest）。
 * 构建入口、门户卡片、路由全部由此派生；任何一处都不再手写工具清单。
 */

/** 路由类型：子路径页面或外链 */
export type ToolRoute =
  | { kind: 'page' } // 构建期生成 <id>/index.html
  | { kind: 'external'; href: string }; // 外链，构建期忽略

export interface ToolManifest {
  /** 唯一标识；必须与目录名一致（扫描器校验），同时是路由段 */
  id: string;
  /** 展示名 */
  name: string;
  /** 一句话简介（门户卡片用，建议 40–70 字） */
  desc: string;
  /** 筛选标签 */
  tags: string[];
  /** 主题色 #RRGGBB（可选，缺省用门户兜底色） */
  tint?: string;
  /** 卡片底部补充信息 */
  meta?: string;
  /** false → 门户渲染「即将上线」灰卡，且不纳入构建 */
  live: boolean;
  /** 路由（缺省 { kind: 'page' }） */
  route?: ToolRoute;
  /** 搜索关键词补充（默认 name + desc + tags + meta） */
  keywords?: string[];
}
