import type { VisionClient } from './types';
import { ClaudeVisionClient } from './claudeVision';
import { OpenAIVisionClient } from './openaiVision';
import { MaasClaudeVisionClient } from './maasClaudeVision';
import { MaasDirectVisionClient } from './maasDirectVision';

export type VisionProviderName = 'claude' | 'openai' | 'maas' | 'maas-direct';

/**
 * 根据 provider 名字返回具体 VisionClient。
 * model 参数仅 maas-direct 使用（不同模型走同一网关）；其他 provider 忽略。
 */
export function createVisionClient(
  provider: VisionProviderName,
  apiKey: string,
  model?: string,
): VisionClient {
  if (provider === 'claude') return new ClaudeVisionClient(apiKey);
  if (provider === 'openai') return new OpenAIVisionClient(apiKey);
  if (provider === 'maas') return new MaasClaudeVisionClient(apiKey);
  if (provider === 'maas-direct') return new MaasDirectVisionClient(apiKey, model);
  throw new Error(`Unknown vision provider: ${provider}`);
}

export type { VisionClient, VisionRequest, VisionResponse, VisionImage } from './types';
