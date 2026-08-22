import type { VisionClient, VisionRequest, VisionResponse } from './types';
import { requestJsonWithRetry } from './http';

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

    const result = await requestJsonWithRetry<DirectResponse>(
      API_URL,
      {
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
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: userContent },
          ],
          stream: false,
        }),
      },
      { label: 'MaaS DirectLLM' },
    );

    if (!result.ok || !result.json) {
      // 报错信息优先级：网关结构化 error.message > raw body（原始文本，
      // 含 brpc "unsupported model" 等关键信息）> parseError 兜底
      // 修 bug：以前先 parseError，会把「MaaS 400 但 body 是 brpc 纯文本」的场景
      // 显示成 "Unexpected token 'b', "brpc [10.7"... is not valid JSON"，用户看不懂
      const reason =
        result.json?.error?.message ??
        (result.raw ? result.raw.slice(0, 400) : undefined) ??
        result.parseError ??
        '未知错误';
      throw new Error(`MaaS DirectLLM API error (HTTP ${result.status}): ${reason}`);
    }

    const text = result.json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error(
        `MaaS DirectLLM 返回内容为空；原始响应：${result.raw.slice(0, 300)}`,
      );
    }

    return { text, model: this.model };
  }
}
