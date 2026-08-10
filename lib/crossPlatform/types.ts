// ── Platform primitives ───────────────────────────────────────────────────

export type PlatformType = 'ios' | 'android' | 'web';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface DeviceProfile {
  id: string;
  name: string;
  platform: PlatformType;
  viewport: { width: number; height: number };
  safeArea: SafeAreaInsets;
}

// ── Normalized coordinates (0–1 relative to image dimensions) ────────────

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Audit configuration ───────────────────────────────────────────────────

/** Shared region type across TargetRegion and DrawingRegion */
export type RegionType = 'layout' | 'content' | 'visual' | 'interaction' | 'component';

export interface TargetRegion {
  id: string;
  name: string;
  type: RegionType;
  iosRect?: NormalizedRect;
  androidRect?: NormalizedRect;
}

/**
 * Single-platform annotation drawn by the user on one screenshot.
 * Two DrawingRegions with the same `name` (one iOS, one Android) are merged
 * into one TargetRegion before being sent to the analyzer.
 */
export interface DrawingRegion {
  id: string;
  name: string;
  type: RegionType;
  rect: NormalizedRect;
}

export interface IgnoreRegion {
  id: string;
  name: string;
  platform?: PlatformType;
  rect: NormalizedRect;
  reason: string;
}

export interface AuditScenario {
  id: string;
  name: string;
  description?: string;
  targetRegions?: TargetRegion[];
  ignoreRegions?: IgnoreRegion[];
}

// ── Issue types ───────────────────────────────────────────────────────────

export type IssueType = 'content' | 'layout' | 'style' | 'interaction' | 'platform-specific';
export type IssueSeverityCP = 'critical' | 'high' | 'medium' | 'low';
/** 问题处理状态；跨版本走查时用于流转 */
export type IssueStatusCP = 'pending' | 'deferred' | 'ignored' | 'fixed';

export interface PlatformConsistencyIssue {
  id: string;
  title: string;
  description: string;
  type: IssueType;
  severity: IssueSeverityCP;
  /** 处理状态；未设置时视作 'pending' */
  status?: IssueStatusCP;
  /** 分类标签（如「间距」「对齐」） */
  tags?: string[];
  platforms: PlatformType[];
  regionName?: string;
  iosLocation?: NormalizedRect;
  androidLocation?: NormalizedRect;
  isAcceptablePlatformDifference: boolean;
  impact: string;
  suggestion: string;
  /** 0–1, AI confidence score */
  confidence: number;
  /** true = 用户手工标注；false / undefined = AI 检测 */
  manual?: boolean;
  /**
   * 多模型交叉验证时：这个 issue 由哪个/哪些模型发现
   *  - 单模型运行：undefined（跟 discovery 无关）
   *  - 只主模型发现：主 provider 名（'claude' / 'openai' / 'maas' / 'maas-direct'）
   *  - 只副模型发现：副 provider 名
   *  - 两个模型都发现：'both'
   */
  discoveredBy?: string;
}

// ── Request / Response ────────────────────────────────────────────────────

export interface AuditOptions {
  ignoreStatusBar: boolean;
  ignoreBottomSafeArea: boolean;
  useNormalizedCoordinates: boolean;

  /**
   * 已勾选的忽略规则 id 列表（见 lib/crossPlatform/ignoreRules.ts）
   * 例：['dyn-numbers', 'user-content', 'live-danmaku', 'ecom-price']
   * undefined / 空数组 → prompt 里不加动态内容忽略章节
   */
  ignoreRules?: string[];

  // ── @deprecated 旧字段，仅为兼容旧 session 保留读；新代码不要写 ──
  /** @deprecated 用 ignoreRules 里的 'dyn-numbers' 代替 */
  ignoreDynamicNumbers?: boolean;
  /** @deprecated 用 ignoreRules 里的 'user-content' 代替 */
  ignoreUserContent?: boolean;
  /** @deprecated 用 ignoreRules 里的 'live-stream-view' 等具体维度代替 */
  ignoreMediaContent?: boolean;
  /** @deprecated 用 ignoreRules 里的 'status-badges' 代替 */
  ignoreStatusBadges?: boolean;
}

export interface CrossPlatformAuditRequest {
  scenario: AuditScenario;
  /** iOS 端截图 URL；单端走查时可缺失 */
  iosImageUrl?: string;
  /** Android 端截图 URL；单端走查时可缺失 */
  androidImageUrl?: string;
  /** 设计稿 URL；双端时可选，单端时必需（作为对比基线） */
  designImageUrl?: string;
  /**
   * 设计稿的精简 Figma spec（色值/字号/圆角/尺寸/阴影）；
   * 有时提供给 AI 作为"设计真相"，让走查从"像素反推"升级为"精确比对"。
   * 只有设计稿来自 Figma 时才有值；上传的图片没有此字段。
   */
  designFigmaSpec?: import('../figmaProviders/figmaSpecTypes').FigmaNodeSpec;
  /** iOS 设备配置；iOS 截图存在时应传 */
  iosDevice?: DeviceProfile;
  /** Android 设备配置；Android 截图存在时应传 */
  androidDevice?: DeviceProfile;
  options: AuditOptions;
}

export interface CrossPlatformAuditResult {
  scenarioName: string;
  iosDeviceName: string;
  androidDeviceName: string;
  designFidelity?: { ios: number; android: number };
  platformConsistencyScore: number;
  overallScore: number;
  summary: { critical: number; high: number; medium: number; low: number };
  issues: PlatformConsistencyIssue[];
  ignoredRegions: IgnoreRegion[];
  isMock: boolean;
}

// ── Analyzer interface ────────────────────────────────────────────────────

export interface CrossPlatformAnalyzer {
  readonly name: string;
  analyze(request: CrossPlatformAuditRequest): Promise<CrossPlatformAuditResult>;
}
