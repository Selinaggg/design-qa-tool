import type { ImageFile } from '@/types';
import type {
  DrawingRegion,
  DeviceProfile,
  AuditOptions,
  CrossPlatformAuditResult,
} from '@/lib/crossPlatform';

/** 走查模式（当前只保留跨端走查；类型保留可扩展） */
export type AuditMode = 'cross-platform';

/** 图片来源标签（保留给归档页/未来扩展使用） */
export interface ImageSource {
  origin?: string;
  platform?: string;
}

/** 版本上限（业务约束：手动关联 + 认知负担） */
export const MAX_VERSIONS = 3;

/**
 * 单个版本（v1 / v2 / v3）—— 每版有独立的截图、标注、走查结果
 * 手动关联通过 issueLinks 表示：本版某问题 id -> 上一版某问题 id
 */
export interface AuditVersion {
  /** 版本号，从 1 开始，单调递增 */
  v: number;
  /** 可选备注：如"研发首次修复后" */
  label?: string;
  createdAt: number;

  // ── 版本级素材（每版独立） ─────────────────────
  iosImage?: ImageFile | null;
  androidImage?: ImageFile | null;
  designRefImage?: ImageFile | null;
  iosRegions?: DrawingRegion[];
  androidRegions?: DrawingRegion[];
  crossPlatformResult?: CrossPlatformAuditResult | null;

  /** 手动关联：{ thisVersionIssueId: prevVersionIssueId } —— P2 阶段启用 */
  issueLinks?: Record<string, string>;
}

/**
 * 单次走查会话（内存存储；一次会话可含多个版本）
 * 顶层保留场景元信息（名称、设备、options 由所有版本共享）
 */
export interface AuditSession {
  id: string;
  createdAt: number;
  mode: AuditMode;
  /** 场景/会话名称 */
  name: string;

  // ── 会话级元信息（所有版本共享） ────────────────
  iosDevice?: DeviceProfile;
  androidDevice?: DeviceProfile;
  options?: AuditOptions;

  // ── 版本数组（至少 1 个） ─────────────────────
  versions: AuditVersion[];
  /** 当前展示的版本索引（0-based） */
  currentVersionIndex: number;
}

/** 生成一个新的空会话（v1 空版本） */
export function createEmptySession(name = '未命名走查'): AuditSession {
  const now = Date.now();
  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    mode: 'cross-platform',
    name,
    versions: [
      {
        v: 1,
        createdAt: now,
      },
    ],
    currentVersionIndex: 0,
  };
}
