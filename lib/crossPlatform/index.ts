import type { CrossPlatformAnalyzer } from './types';
import { MockCrossPlatformAnalyzer } from './mockAnalyzer';
import { RealCrossPlatformAnalyzer } from './realAnalyzer';

/**
 * Resolution order (server-side env vars):
 *   USE_MOCKS=true                  → MockCrossPlatformAnalyzer
 *   CROSS_PLATFORM_ANALYZER=real    → RealCrossPlatformAnalyzer (stub — throws until implemented)
 *   (anything else / unset)         → MockCrossPlatformAnalyzer
 */
export function getCrossPlatformAnalyzer(): CrossPlatformAnalyzer {
  if (process.env.USE_MOCKS === 'true') return new MockCrossPlatformAnalyzer();

  const analyzer = process.env.CROSS_PLATFORM_ANALYZER ?? 'mock';

  if (analyzer === 'real') {
    return new RealCrossPlatformAnalyzer();
  }

  return new MockCrossPlatformAnalyzer();
}

export type {
  CrossPlatformAnalyzer,
  CrossPlatformAuditRequest,
  CrossPlatformAuditResult,
  PlatformConsistencyIssue,
  DeviceProfile,
  IgnoreRegion,
  TargetRegion,
  DrawingRegion,
  NormalizedRect,
  RegionType,
  AuditOptions,
  IssueType,
  IssueSeverityCP,
  PlatformType,
} from './types';
