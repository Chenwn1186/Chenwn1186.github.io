// tools/lens/tool.config.ts —— 这个工具的唯一元数据声明。
// 新增字段时在此处加；类型校验由 satisfies 在编译期完成（tsconfig include 必须含 tools/）。
// ⚠️ id 必须与目录名一致（扫描器强校验）；icon 不在此处——它是 tools/lens/icon.svg 文件。
import type { ToolManifest } from '../../platform/contract/tool';

export default {
  id: 'lens',
  name: '全球镜头数据库',
  desc: '收录 1,617 支镜头的八维实测评测数据（锐度 / 色散 / 抗眩光 / 畸变 / 焦外等），覆盖 46 个品牌、41 种卡口，支持多维筛选、排序、CSV 导出与横向对比。',
  tags: ['摄影', '数据可视化', '筛选对比'],
  tint: '#2F5FD0',
  live: true,
} satisfies ToolManifest;
