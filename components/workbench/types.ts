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

// ═══════════════════════════════════════════════════════════════════════════
// 批量走查（P1 数据模型 · 不影响现有单画板走查）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 画板平台模式：
 *  - both        ：iOS + Android 双端画板（跨端一致性检查 + 单端质量检查）
 *  - ios-only    ：仅 iOS 单端画板（只做单端 vs 设计稿检查）
 *  - android-only：仅 Android 单端画板（只做单端 vs 设计稿检查）
 */
export type PlatformMode = 'both' | 'ios-only' | 'android-only';

/**
 * Figma frame 引用：批量走查中一个 board 关联的设计稿源信息
 * 缓存 imageUrl 用于叠加对比 / 报告缩略图；Figma URL 有过期时间需按 fetchedAt 判断
 */
export interface FigmaFrameRef {
  /** Figma 文件 key（从 URL 中提取） */
  fileKey: string;
  /** Figma frame 的 node id */
  frameId: string;
  /** frame 显示名（缓存，用于 UI 展示） */
  frameName: string;
  /** 高清 PNG URL（Figma images API 拉取；有过期时间） */
  imageUrl: string;
  /** 缩略图 URL（选择器用） */
  thumbnailUrl?: string;
  /** 拉取时间戳；用于判断 URL 是否需要刷新 */
  fetchedAt: number;
}

/**
 * 单个"画板走查单元"（batch 会话内的一个 tab）
 * 一个 board 承载一次画板级走查：截图 + 设计稿 + AI 结果 + 手工标注
 */
export interface Board {
  /** 稳定 id（uuid） */
  id: string;
  /** 画板名（例如 "首页" / "详情页"） */
  name: string;
  /** 平台模式 */
  platformMode: PlatformMode;

  // ── 研发截图（根据 platformMode 至少有一端） ──
  iosImage: ImageFile | null;
  androidImage: ImageFile | null;

  /**
   * 设计稿参照（P1 只定义类型；P2 手动上传占位；P3 由 Figma 提供）
   *  - designFigma：从 Figma 拉取的 frame 引用（batch 会话必选）
   *  - designImage：手动上传的设计稿图片（P2 过渡方案 / 用户不用 Figma 时）
   * 两个字段互斥优先取 designFigma
   */
  designFigma?: FigmaFrameRef;
  designImage?: ImageFile | null;

  // ── 走查结果与标注 ──
  crossPlatformResult?: CrossPlatformAuditResult | null;

  // ── 版本追溯（灵活版本：允许在 vN 新增 / vN 移除画板） ──
  /** 该画板首次出现的版本号 */
  firstAppearedVersion: number;
  /** 若在某版本被移除，记录版本号；否则 undefined */
  removedInVersion?: number;
}

/**
 * 单个版本（v1 / v2 / v3）—— 每版有独立的截图、标注、走查结果
 * 手动关联通过 issueLinks 表示：本版某问题 id -> 上一版某问题 id
 *
 * ⚠️ 数据模型兼容策略（P1）：
 *   - 单画板走查（session.type === 'single' 或未设置）：使用 iosImage / androidImage 等顶层字段
 *   - 批量走查（session.type === 'batch'）：使用 boards[] + activeBoardId
 *   两者互斥；渲染层用 getActiveContext(session) 统一读取
 */
export interface AuditVersion {
  /** 版本号，从 1 开始，单调递增 */
  v: number;
  /** 可选备注：如"研发首次修复后" */
  label?: string;
  createdAt: number;

  // ── 单画板走查字段（session.type === 'single'） ─────
  iosImage?: ImageFile | null;
  androidImage?: ImageFile | null;
  designRefImage?: ImageFile | null;
  iosRegions?: DrawingRegion[];
  androidRegions?: DrawingRegion[];
  crossPlatformResult?: CrossPlatformAuditResult | null;

  // ── 批量走查字段（session.type === 'batch'） ────────
  /** 本版包含的画板列表；单画板走查保持 undefined */
  boards?: Board[];
  /** 当前展示的画板 id；boards 存在时必填 */
  activeBoardId?: string;

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

  /**
   * 走查类型（P1 新增；默认 'single' 保持兼容）
   *  - single：单画板走查（历史行为）
   *  - batch ：批量走查（多画板 tab）
   */
  type?: 'single' | 'batch';

  /** 若整个 session 关联同一个 Figma 文件（batch 常用） */
  figmaFileKey?: string;

  // ── 会话级元信息（所有版本共享） ────────────────
  iosDevice?: DeviceProfile;
  androidDevice?: DeviceProfile;
  options?: AuditOptions;

  // ── 版本数组（至少 1 个） ─────────────────────
  versions: AuditVersion[];
  /** 当前展示的版本索引（0-based） */
  currentVersionIndex: number;
}

/** 生成一个新的空会话（v1 空版本；默认单画板类型） */
export function createEmptySession(name = '未命名走查'): AuditSession {
  const now = Date.now();
  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    mode: 'cross-platform',
    type: 'single',
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

// ═══════════════════════════════════════════════════════════════════════════
// 批量走查 —— 创建向导中的临时草稿类型（不落入 AuditSession）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 批量截图上传时的单个截图条目（NewAuditDrawer 中的临时状态）
 * P2.3 阶段：仅 file / image / name
 * P2.4 阶段：由 parsePlatformFromName 补充 platform / groupKey
 */
export interface BatchScreenshotItem {
  /** 稳定 id（uuid，用于 React key 与删除） */
  id: string;
  /** 原始 File 对象 */
  file: File;
  /** 加载后的 ImageFile（含 url/width/height） */
  image: ImageFile;
  /** 文件名（含扩展名，展示 & 命名解析用） */
  name: string;
  /** 平台识别结果（P2.4 解析）；null 表示无法识别 */
  platform?: 'ios' | 'android' | null;
  /** 分组键（P2.4 由文件名去掉平台后缀得到） */
  groupKey?: string;
}

