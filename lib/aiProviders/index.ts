import type { AIProvider } from './types';
import { MockProvider } from './mockProvider';
import { ClaudeProvider } from './claudeProvider';
import { OpenAIProvider } from './openaiProvider';

/**
 * Returns the configured AI provider.
 *
 * Resolution order (server-side env vars):
 *   USE_MOCKS=true      → MockProvider    (global mock override)
 *   AI_PROVIDER=claude  → ClaudeProvider  (requires ANTHROPIC_API_KEY)
 *   AI_PROVIDER=openai  → OpenAIProvider  (requires OPENAI_API_KEY)
 *   (anything else)     → MockProvider    (default — no key needed)
 */
export function getAIProvider(): AIProvider {
  if (process.env.USE_MOCKS === 'true') return new MockProvider();

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

export type { AIProvider, AnalyzeRequest } from './types';
