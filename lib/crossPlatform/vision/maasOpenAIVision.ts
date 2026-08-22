import type { VisionClient, VisionRequest, VisionResponse } from './types';
import { requestJsonWithRetry } from './http';

const API_URL =
  'https://maas.devops.rednote.life/openai/openai/chat/completions?api-version=2024-12-01-preview';
const DEFAULT_MODEL = 'GPT-5.6 Sol';

interface AzureContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

interface AzureResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

/**
 * 小红书 MaaS 的 Azure OpenAI 风格网关（第 3 个 MaaS 变体）
 *
 * 网关差异对比（三个 MaaS 变体）：
 *  - MaasClaude   (Bedrock)     : rednote.life/openai/openai/bedrock_runtime/model/... , header `token:`
 *  - MaasDirect   (DirectLLM)   : xiaohongshu.com/v1/chat/completions              , header `Authorization: Bearer` + x-maas-user-email + x-maas-app-id
 *  - MaasOpenAI   (Azure style) : rednote.life/openai/openai/chat/completions      , header `api-key:`  ← 本文件
 *
 * 请求体是 OpenAI 兼容的 chat/completions 结构（支持多模态 image_url）。
 * URL 带 `?api-version=2024-12-01-preview` 是 Azure OpenAI 规范。
 * 三个 MaaS 网关都可以共用同一个 QST token（同家族 key 复用）。
 *
 * 当前提供的模型：
 *  - GPT-5.6 Sol（带空格，官方名字就长这样）
 *
 * 说明：视觉分析走非流式（stream:false），保证一次拿完整 JSON；
 *      curl 示例里的 stream:true 是聊天场景。
 */
export class MaasOpenAIVisionClient implements VisionClient {
  readonly name = 'openai' as const; // 协议兼容 OpenAI 家族（供合并去重时归组）
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  async invoke(req: VisionRequest): Promise<VisionResponse> {
    const userContent: AzureContentBlock[] = [];

    for (const img of req.images) {
      userContent.push({
        type: 'image_url',
        image_url: { url: img.dataUrl, detail: 'high' },
      });
      userContent.push({ type: 'text', text: `[图片] ${img.label}` });
    }
    userContent.push({ type: 'text', text: req.userPrompt });

    const result = await requestJsonWithRetry<AzureResponse>(
      API_URL,
      {
        method: 'POST',
        headers: {
          // Azure OpenAI 规范：认证走 `api-key` header（不是 Bearer）
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          // GPT-5 系列（含 GPT-5.6 Sol）的几条约束：
          //   1. 不再支持 max_tokens，改用 max_completion_tokens
          //      报错：Unsupported parameter: 'max_tokens' is not supported with this model.
          //   2. 不接受自定义 temperature，只允许默认 1；因此不传 temperature
          //      报错：Unsupported value: 'temperature' does not support 0.3 with this model.
          //   3. reasoning 模型的 max_completion_tokens 同时含 reasoning + output token；
          //      走查要产出多条 issue，给足 16384 避免正文被吃光。
          //   4. reasoning_effort 只接受 'none'|'low'|'medium'|'high'|'xhigh'（不支持 'minimal'！
          //      传 'minimal' 会 400 报错，这曾是「MaaS OpenAI 一直失败」的根因）。
          //      走查用 'none'：最快、把预算全留给输出 JSON。
          max_completion_tokens: Math.max(req.maxTokens ?? 4096, 16384),
          reasoning_effort: 'none',
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: userContent },
          ],
          stream: false,
        }),
      },
      { label: 'MaaS OpenAI' },
    );

    if (!result.ok || !result.json) {
      // 优先级：结构化 error.message > raw body > parseError 兜底
      // 见 maasDirectVision.ts 里的详细说明
      const reason =
        result.json?.error?.message ??
        (result.raw ? result.raw.slice(0, 400) : undefined) ??
        result.parseError ??
        '未知错误';
      throw new Error(`MaaS OpenAI API error (HTTP ${result.status}): ${reason}`);
    }

    const text = result.json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error(
        `MaaS OpenAI 返回内容为空；原始响应：${result.raw.slice(0, 300)}`,
      );
    }

    return { text, model: this.model };
  }
}
