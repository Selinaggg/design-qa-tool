import type { VisionClient, VisionRequest, VisionResponse } from './types';
import { requestJsonWithRetry } from './http';

const CLAUDE_MODEL = 'claude-opus-4-7';
const API_URL = 'https://api.anthropic.com/v1/messages';

interface ClaudeContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message: string };
}

/**
 * 把 data URL 拆成 media_type + base64（Anthropic 要求两者分开传）
 * 输入：data:image/png;base64,iVBORw0KGgo...
 * 输出：{ mediaType: 'image/png', base64: 'iVBORw0KGgo...' }
 */
function splitDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL: expected data:<mime>;base64,<payload>');
  }
  return { mediaType: match[1], base64: match[2] };
}

export class ClaudeVisionClient implements VisionClient {
  readonly name = 'claude' as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async invoke(req: VisionRequest): Promise<VisionResponse> {
    const content: ClaudeContentBlock[] = [];

    // 图片先放，text 最后（Anthropic 建议）
    for (const img of req.images) {
      const { mediaType, base64 } = splitDataUrl(img.dataUrl);
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      });
      content.push({ type: 'text', text: `[图片] ${img.label}` });
    }
    content.push({ type: 'text', text: req.userPrompt });

    const result = await requestJsonWithRetry<ClaudeResponse>(
      API_URL,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: req.maxTokens ?? 4096,
          system: req.systemPrompt,
          messages: [{ role: 'user', content }],
        }),
      },
      { label: 'Claude' },
    );

    if (!result.ok || !result.json) {
      // 优先级：结构化 error.message > raw body > parseError 兜底
      const reason =
        result.json?.error?.message ??
        (result.raw ? result.raw.slice(0, 400) : undefined) ??
        result.parseError ??
        'unknown';
      throw new Error(`Claude API error (HTTP ${result.status}): ${reason}`);
    }

    const text = (result.json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error(`Claude API returned empty content；原始响应：${result.raw.slice(0, 300)}`);
    }

    return { text, model: CLAUDE_MODEL };
  }
}
