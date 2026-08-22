import type { VisionClient, VisionRequest, VisionResponse } from './types';
import { requestJsonWithRetry } from './http';

const OPENAI_MODEL = 'gpt-4o';
const API_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAIContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

export class OpenAIVisionClient implements VisionClient {
  readonly name = 'openai' as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async invoke(req: VisionRequest): Promise<VisionResponse> {
    const userContent: OpenAIContentBlock[] = [];

    for (const img of req.images) {
      userContent.push({
        type: 'image_url',
        image_url: { url: img.dataUrl, detail: 'high' },
      });
      userContent.push({ type: 'text', text: `[图片] ${img.label}` });
    }
    userContent.push({ type: 'text', text: req.userPrompt });

    const result = await requestJsonWithRetry<OpenAIResponse>(
      API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          max_tokens: req.maxTokens ?? 4096,
          // JSON 模式：模型必须返回合法 JSON
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      },
      { label: 'OpenAI' },
    );

    if (!result.ok || !result.json) {
      // 优先级：结构化 error.message > raw body > parseError 兜底
      const reason =
        result.json?.error?.message ??
        (result.raw ? result.raw.slice(0, 400) : undefined) ??
        result.parseError ??
        'unknown';
      throw new Error(`OpenAI API error (HTTP ${result.status}): ${reason}`);
    }

    const text = result.json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error(`OpenAI API returned empty content；原始响应：${result.raw.slice(0, 300)}`);
    }

    return { text, model: OPENAI_MODEL };
  }
}
