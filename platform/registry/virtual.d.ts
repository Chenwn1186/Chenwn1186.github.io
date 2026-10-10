/**
 * virtual:toolbox/registry 的类型声明。
 * 实际内容由 platform/registry/plugin.ts 在构建期生成（扫描 tools/<id>/tool.config.ts）。
 * 这里声明形状，让 TS 对门户的消费代码做完整类型检查。
 */
declare module 'virtual:toolbox/registry' {
  import type { ToolManifest } from '../../contract/tool';

  export type RegistryEntry = ToolManifest & { iconUrl: string | null };

  export const TOOLS: RegistryEntry[];
  export const LIVE_TOOLS: RegistryEntry[];
  export const ALL_TAGS: string[];
}
