import type { AnalysisResult } from '@/types';

/**
 * Mock 走查结果：每条问题都带上归一化坐标（0-1），用于在对比图上贴编号徽章。
 * 坐标含义：
 *  - 只有 x/y  → 视为"点位"，贴一个小圆徽章
 *  - 有 width/height → 视为"矩形框"，描边 + 左上角贴徽章
 */
export const MOCK_ANALYSIS_RESULT: AnalysisResult = {
  summary:
    '发现 5 个设计走查问题，其中 1 个严重问题、3 个主要问题、1 个次要问题。',
  issues: [
    {
      id: '1',
      severity: 'Critical',
      title: '主色调不符合规范',
      description: '页面按钮颜色为 #1890FF，设计规范要求 #1677FF。',
      impact: '品牌一致性受损，用户可能对页面的信任度降低。',
      suggestion: '将所有主色调实例从 #1890FF 替换为 #1677FF。',
      tags: ['颜色', '静态'],
      status: 'pending',
      designLocation: { x: 0.08, y: 0.82, width: 0.84, height: 0.08 },
      liveLocation: { x: 0.08, y: 0.82, width: 0.84, height: 0.08 },
    },
    {
      id: '2',
      severity: 'Major',
      title: '正文字号不一致',
      description: '正文字体大小为 13px，设计规范要求 14px。',
      impact: '阅读体验下降，与其他页面视觉不统一。',
      suggestion: '将正文 font-size 改为 14px。',
      tags: ['字号', '静态'],
      status: 'pending',
      designLocation: { x: 0.08, y: 0.55, width: 0.84, height: 0.08 },
      liveLocation: { x: 0.08, y: 0.55, width: 0.84, height: 0.08 },
    },
    {
      id: '3',
      severity: 'Major',
      title: '卡片圆角偏大',
      description: '线上卡片圆角为 12px，规范要求 8px。',
      impact: '整体视觉风格偏移，与设计系统不一致。',
      suggestion: '将 border-radius 从 12px 改为 8px。',
      tags: ['圆角', '静态'],
      status: 'pending',
      designLocation: { x: 0.05, y: 0.12, width: 0.9, height: 0.48 },
      liveLocation: { x: 0.05, y: 0.12, width: 0.9, height: 0.48 },
    },
    {
      id: '4',
      severity: 'Major',
      title: '模块间距不足',
      description: '模块间距为 16px，规范要求 24px。',
      impact: '页面视觉呼吸感不足，内容显得拥挤。',
      suggestion: '将模块间的 margin-bottom 从 16px 调整为 24px。',
      tags: ['间距', '静态'],
      status: 'pending',
      designLocation: { x: 0.5, y: 0.68 },
      liveLocation: { x: 0.5, y: 0.65 },
    },
    {
      id: '5',
      severity: 'Minor',
      title: '标题字重偏轻',
      description: '标题字重为 500，规范建议使用 600。',
      impact: '标题层级区分度略有下降。',
      suggestion: '将标题 font-weight 从 500 改为 600。',
      tags: ['字重', '静态'],
      status: 'pending',
      designLocation: { x: 0.12, y: 0.68, width: 0.5, height: 0.05 },
      liveLocation: { x: 0.12, y: 0.68, width: 0.5, height: 0.05 },
    },
  ],
};
