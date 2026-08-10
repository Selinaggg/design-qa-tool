import type { AIProvider } from './types';
import { MockProvider } from './mockProvider';
import { ClaudeProvider } from './claudeProvider';
import { OpenAIProvider } from './openaiProvider';

/** 前端在 header 里可覆盖的 provider 配置 */
export interface AIProviderOverride {
  /** 'claude' | 'openai' | 'mock' */
  provider?: string | null;
  /** 明文 API key */
  apiKey?: string | null;
}

/**
 * Returns the configured AI provider.
 *
 * Resolution order:
 *   USE_MOCKS=true              → MockProvider (global mock override, ignores everything else)
 *   override.provider = 'mock'  → MockProvider
 *   override.provider + apiKey  → 对应真 provider（前端 UI 传入优先于 env）
 *   env AI_PROVIDER=claude      → ClaudeProvider (requires ANTHROPIC_API_KEY)
 *   env AI_PROVIDER=openai      → OpenAIProvider (requires OPENAI_API_KEY)
 *   (fallback)                  → MockProvider
 */
export function getAIProvider(override?: AIProviderOverride): AIProvider {
  if (process.env.USE_MOCKS === 'true') return new MockProvider();

  // 1. 前端 UI 覆盖优先
  if (override?.provider) {
    if (override.provider === 'mock') return new MockProvider();
    if (override.provider === 'claude') {
      const key = override.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('Claude provider requires an API key (via UI or ANTHROPIC_API_KEY).');
      return new ClaudeProvider(key);
    }
    if (override.provider === 'openai') {
      const key = override.apiKey || process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OpenAI provider requires an API key (via UI or OPENAI_API_KEY).');
      return new OpenAIProvider(key);
    }
    // 未知 provider 名字：忽略，走 env fallback
  }

  // 2. env fallback
  const provider = process.env.AI_PROVIDER;

  if (provider === 'claude') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('AI_PROVIDER is "claude" but ANTHROPIC_API_KEY is not set.');
    return new ClaudeProvider(key);
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('AI_PROVIDER is "openai" but OPENAI_API_KEY is not set.');
    return new OpenAIProvider(key);
  }

  return new MockProvider();
}

/** 从 Next.js 请求头解析前端 UI 传入的 AI 配置 */
export function readAIOverrideFromHeaders(headers: Headers): AIProviderOverride {
  return {
    provider: headers.get('x-ai-provider'),
    apiKey: headers.get('x-ai-key'),
  };
}

export type { AIProvider, AnalyzeRequest } from './types';
