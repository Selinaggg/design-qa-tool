import type { VisionClient, VisionRequest, VisionResponse } from './types';

const API_URL = 'https://maas.devops.xiaohongshu.com/v1/chat/completions';
const DEFAULT_MODEL = 'qwen3-vl-30b-a3b-instruct';

interface DirectContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

interface DirectResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

/**
 * 小红书 MaaS DirectLLM 网关（OpenAI 兼容协议）
 *
 * 与 openaiVision 的差异：
 *  - baseURL = maas.devops.xiaohongshu.com/v1
 *  - 需要额外 header：x-maas-user-email / x-maas-app-id
 *  - 支持多个模型：qwen3-vl-30b-a3b-instruct（视觉，便宜）/ 其他 Qwen 系
 *  - 认证 header 依然是 Authorization: Bearer <token>
 *
 * 说明：与 MaasClaudeVisionClient（Bedrock 网关）是**两套完全不同的 endpoint**，
 * 但可以共用同一个 QST token。上层通过 provider 区分要走哪条路。
 */
export class MaasDirectVisionClient implements VisionClient {
  readonly name = 'openai' as const; // 协议兼容 OpenAI 家族
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  async invoke(req: VisionRequest): Promise<VisionResponse> {
    const userContent: DirectContentBlock[] = [];

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
        // MaaS 网关要求的额外 header
        'x-maas-user-email': '',
        'x-maas-app-id': 'qs-api',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: 0.3, // 走查任务需要稳定输出，不需要发散
        // 注意：不是所有 MaaS 模型都支持 response_format=json_object
        // Qwen 视觉模型未验证；如报错可改为在 prompt 里强调 JSON only
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: userContent },
        ],
        stream: false,
      }),
    });

    let data: DirectResponse;
    try {
      data = (await res.json()) as DirectResponse;
    } catch (err) {
      const raw = await res.text().catch(() => '<no body>');
      throw new Error(
        `MaaS DirectLLM 响应不是合法 JSON (${res.status}): ${raw.slice(0, 300)}\n原因：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!res.ok) {
      throw new Error(
        `MaaS DirectLLM API error (${res.status}): ${data.error?.message ?? JSON.stringify(data).slice(0, 300)}`,
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('MaaS DirectLLM 返回内容为空');
    }

    return { text, model: this.model };
  }
}
