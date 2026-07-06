import type { AnalysisResult } from '@/types';

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
    },
    {
      id: '2',
      severity: 'Major',
      title: '正文字号不一致',
      description: '正文字体大小为 13px，设计规范要求 14px。',
      impact: '阅读体验下降，与其他页面视觉不统一。',
      suggestion: '将正文 font-size 改为 14px。',
    },
    {
      id: '3',
      severity: 'Major',
      title: '卡片圆角偏大',
      description: '线上卡片圆角为 12px，规范要求 8px。',
      impact: '整体视觉风格偏移，与设计系统不一致。',
      suggestion: '将 border-radius 从 12px 改为 8px。',
    },
    {
      id: '4',
      severity: 'Major',
      title: '模块间距不足',
      description: '模块间距为 16px，规范要求 24px。',
      impact: '页面视觉呼吸感不足，内容显得拥挤。',
      suggestion: '将模块间的 margin-bottom 从 16px 调整为 24px。',
    },
    {
      id: '5',
      severity: 'Minor',
      title: '标题字重偏轻',
      description: '标题字重为 500，规范建议使用 600。',
      impact: '标题层级区分度略有下降。',
      suggestion: '将标题 font-weight 从 500 改为 600。',
    },
  ],
};
