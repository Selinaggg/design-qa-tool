export interface ImageFile {
  file: File;
  url: string;
  width: number;
  height: number;
  /**
   * 图片来源（可选；默认视为 'upload'）
   * - 'upload'：用户本地上传
   * - 'figma'：通过 /api/figma-export 从 Figma 拉取；未来 P4 可据此实现"刷新"能力
   */
  source?: 'upload' | 'figma';
}

export type ComparisonMode = 'side-by-side' | 'slider' | 'diff';

export type IssueSeverity = 'Critical' | 'Major' | 'Minor';

/** 问题处理状态（人工判定 + 状态流转） */
export type IssueStatus = 'pending' | 'deferred' | 'ignored' | 'fixed';

/**
 * 归一化坐标（0-1，相对于图片尺寸），支持点或框两种形态：
 *  - 只有 x/y → 点位（贴一个圆形编号徽章）
 *  - 有 width/height → 矩形框（描边 + 左上角贴编号徽章）
 */
export interface IssueLocation {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  impact: string;
  suggestion: string;
  /** 问题在设计稿上的位置（可选） */
  designLocation?: IssueLocation;
  /** 问题在线上/研发稿上的位置（可选） */
  liveLocation?: IssueLocation;
  /** 处理状态，默认 pending */
  status?: IssueStatus;
  /** 子类型标签，例如 "字号" "圆角" "颜色" "间距"，用于右栏展示 */
  tags?: string[];
}

export interface AnalysisResult {
  issues: Issue[];
  summary: string;
}

/**
 * Alignment strategies for future versions.
 * 'none' is the MVP behavior: require identical dimensions.
 */
export type AlignmentStrategy =
  | 'none'            // MVP: require identical dimensions, show error otherwise
  | 'scale-to-design' // v2: scale live image to match design width proportionally
  | 'crop-top'        // v2: crop both to the smaller dimension, aligned from top-left
  | 'smart';          // v3: AI-assisted feature detection for alignment

export interface ImageProcessingOptions {
  alignment: AlignmentStrategy;
}
