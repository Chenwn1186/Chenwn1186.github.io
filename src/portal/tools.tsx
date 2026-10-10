/**
 * 站点常量 —— 此文件不再手写工具清单。
 *
 * 工具清单的唯一真源是 tools/<id>/tool.config.ts；门户经由
 * 'virtual:toolbox/registry'（platform/registry/plugin.ts 生成）消费，
 * 新增工具时本文件零改动。
 *
 * P12 处置：meta 里的数字快照（1617/46/41）已随注册表迁移移除——
 * 数字应由工具在页面上动态渲染（HeaderSection 已有），卡片只放不随时间变化的描述。
 */
export const SITE = {
  owner: '陈伟宁',
  repoName: 'Chenwn1186.github.io',
  repoGh: 'https://github.com/Chenwn1186',
  home: 'https://chenwn1186.github.io',
};
