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

export interface PlatformConsistencyIssue {
  id: string;
  title: string;
  description: string;
  type: IssueType;
  severity: IssueSeverityCP;
  platforms: PlatformType[];
  regionName?: string;
  iosLocation?: NormalizedRect;
  androidLocation?: NormalizedRect;
  isAcceptablePlatformDifference: boolean;
  impact: string;
  suggestion: string;
  /** 0–1, AI confidence score */
  confidence: number;
}

// ── Request / Response ────────────────────────────────────────────────────

export interface AuditOptions {
  ignoreStatusBar: boolean;
  ignoreBottomSafeArea: boolean;
  useNormalizedCoordinates: boolean;
}

export interface CrossPlatformAuditRequest {
  scenario: AuditScenario;
  iosImageUrl: string;
  androidImageUrl: string;
  designImageUrl?: string;
  iosDevice: DeviceProfile;
  androidDevice: DeviceProfile;
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
