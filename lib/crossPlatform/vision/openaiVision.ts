import type { VisionClient, VisionRequest, VisionResponse } from './types';

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

    const res = await fetch(API_URL, {
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
    });

    const data = (await res.json()) as OpenAIResponse;

    if (!res.ok) {
      throw new Error(`OpenAI API error (${res.status}): ${data.error?.message ?? 'unknown'}`);
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('OpenAI API returned empty content');
    }

    return { text, model: OPENAI_MODEL };
  }
}
