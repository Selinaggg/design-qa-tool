import type { CrossPlatformAnalyzer } from './types';
import { MockCrossPlatformAnalyzer } from './mockAnalyzer';
import { RealCrossPlatformAnalyzer } from './realAnalyzer';
import type { VisionProviderName } from './vision';

/** 前端 header 可覆盖的 analyzer 配置 */
export interface CrossPlatformOverride {
  /** 'real' | 'mock' | 其它 */
  analyzer?: string | null;
  /** 明文 API key（当 analyzer=real 时传给 RealCrossPlatformAnalyzer） */
  apiKey?: string | null;
  /** 'claude' | 'openai' | 'maas' | 'maas-direct' */
  provider?: string | null;
  /** 模型名（仅 maas-direct 有效；如 qwen3-vl-30b-a3b-instruct） */
  model?: string | null;

  // ── 多模型交叉验证（可选） ──
  /** 副 provider */
  secondaryProvider?: string | null;
  /** 副 provider 的 key（可能与主相同） */
  secondaryApiKey?: string | null;
  /** 副 provider 的模型（仅 maas-direct 有效） */
  secondaryModel?: string | null;
}

/**
 * Resolution order:
 *   USE_MOCKS=true                                    → MockCrossPlatformAnalyzer
 *   override.analyzer=mock                            → MockCrossPlatformAnalyzer
 *   override.analyzer=real + provider + apiKey        → RealCrossPlatformAnalyzer
 *   env CROSS_PLATFORM_ANALYZER=real + env keys       → RealCrossPlatformAnalyzer
 *   (anything else / unset)                           → MockCrossPlatformAnalyzer
 */
export function getCrossPlatformAnalyzer(override?: CrossPlatformOverride): CrossPlatformAnalyzer {
  if (process.env.USE_MOCKS === 'true') return new MockCrossPlatformAnalyzer();

  // 1. 前端 UI 覆盖优先
  if (override?.analyzer) {
    if (override.analyzer === 'mock') return new MockCrossPlatformAnalyzer();
    if (override.analyzer === 'real') {
      const provider = resolveProvider(override.provider);
      const apiKey = override.apiKey || envApiKeyFor(provider);
      if (!apiKey) {
        throw new Error(`Real analyzer requires an API key for provider="${provider}".`);
      }
      // 副 provider（可选）
      const secondaryProvider = override.secondaryProvider
        ? resolveProvider(override.secondaryProvider)
        : null;
      const secondaryApiKey = override.secondaryApiKey || undefined;
      const secondary =
        secondaryProvider && secondaryApiKey
          ? {
              provider: secondaryProvider,
              apiKey: secondaryApiKey,
              model: override.secondaryModel || undefined,
            }
          : undefined;
      return new RealCrossPlatformAnalyzer({
        provider,
        apiKey,
        model: override.model || undefined,
        secondary,
      });
    }
  }

  // 2. env fallback
  const analyzer = process.env.CROSS_PLATFORM_ANALYZER ?? 'mock';
  if (analyzer === 'real') {
    // env 里默认选 Claude（若无 CROSS_PLATFORM_PROVIDER 指定）
    const envProviderRaw = process.env.CROSS_PLATFORM_PROVIDER ?? 'claude';
    const provider = resolveProvider(envProviderRaw);
    const apiKey = envApiKeyFor(provider);
    if (!apiKey) {
      throw new Error(
        `CROSS_PLATFORM_ANALYZER=real but ${envKeyNameFor(provider)} is not set.`,
      );
    }
    return new RealCrossPlatformAnalyzer({
      provider,
      apiKey,
      model: process.env.CROSS_PLATFORM_MODEL || undefined,
    });
  }

  return new MockCrossPlatformAnalyzer();
}

function resolveProvider(name: string | null | undefined): VisionProviderName {
  if (
    name === 'claude' ||
    name === 'openai' ||
    name === 'maas' ||
    name === 'maas-direct' ||
    name === 'maas-openai' ||
    name === 'maas-doubao'
  ) {
    return name;
  }
  return 'claude'; // 默认 claude
}

function envApiKeyFor(provider: VisionProviderName): string | undefined {
  if (provider === 'claude') return process.env.ANTHROPIC_API_KEY;
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  // maas / maas-direct / maas-openai / maas-doubao 四兄弟共用同一个 QST token
  return process.env.MAAS_TOKEN;
}

function envKeyNameFor(provider: VisionProviderName): string {
  if (provider === 'claude') return 'ANTHROPIC_API_KEY';
  if (provider === 'openai') return 'OPENAI_API_KEY';
  return 'MAAS_TOKEN';
}

/** 从 Next.js 请求头解析前端 UI 传入的跨端配置 */
export function readCrossPlatformOverrideFromHeaders(headers: Headers): CrossPlatformOverride {
  // 复用与 aiProviders 同一组 header
  const provider = headers.get('x-ai-provider');
  const apiKey = headers.get('x-ai-key');
  const model = headers.get('x-ai-model');
  const secondaryProvider = headers.get('x-ai-secondary-provider');
  const secondaryApiKey = headers.get('x-ai-secondary-key');
  const secondaryModel = headers.get('x-ai-secondary-model');
  // 用户 UI 填了 key → 视为想走 real
  const analyzer = provider && provider !== 'mock' && apiKey ? 'real' : null;
  return {
    analyzer,
    apiKey,
    provider,
    model,
    secondaryProvider,
    secondaryApiKey,
    secondaryModel,
  };
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
  IssueStatusCP,
  PlatformType,
} from './types';
