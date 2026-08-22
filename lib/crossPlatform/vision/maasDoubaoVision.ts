import type { VisionClient, VisionRequest, VisionResponse } from './types';
import { requestJsonWithRetry } from './http';

const API_URL = 'https://maas.devops.xiaohongshu.com/openai/openai/doubao/chat/completions';
// 火山方舟 endpoint 命名（全小写+连字符+日期后缀）；营销名 "Doubao-Seed-2.1-Pro" 网关会 404。
// 走查看图 → 用带 vision 的版本。
const DEFAULT_MODEL = 'doubao-seed-1-6-vision-250815';

interface DoubaoContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

interface DoubaoResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

/**
 * 小红书 MaaS 的豆包网关（第 4 个 MaaS 变体）
 *
 * 网关差异对比（四个 MaaS 变体）：
 *  - MaasClaude   (Bedrock)     : rednote.life/openai/openai/bedrock_runtime/model/...   , header `token:`
 *  - MaasDirect   (DirectLLM)   : xiaohongshu.com/v1/chat/completions                    , header `Authorization: Bearer` + x-maas-user-email + x-maas-app-id
 *  - MaasOpenAI   (Azure style) : rednote.life/openai/openai/chat/completions            , header `api-key:` + api-version query
 *  - MaasDoubao   (豆包)         : xiaohongshu.com/openai/openai/doubao/chat/completions  , header `api-key:`  ← 本文件
 *
 * 特点：
 *  - 域名与 DirectLLM 同族（`xiaohongshu.com` 主域），路径带 `/openai/openai/doubao/`
 *  - 认证 header 用 `api-key:`（与 MaasOpenAI 一致，与 DirectLLM 的 Bearer 不同）
 *  - 请求体是标准 OpenAI 兼容格式：`max_tokens` + `temperature` 都支持（区别于 GPT-5 系列）
 *  - 四个 MaaS 网关共用同一个 QST token（家族内 key 复用）
 *
 * 当前提供的模型（火山方舟 endpoint 名，实测可用）：
 *  - doubao-seed-1-6-vision-250815：豆包 Seed 1.6 视觉版（多模态，走查用）
 *  - doubao-seed-1-6-250615       ：豆包 Seed 1.6 纯文本
 *  ⚠️ 官方营销名 "Doubao-Seed-2.1-Pro" 在此网关不存在，会 404 InvalidEndpointOrModel.NotFound。
 *
 * ⚠️ 豆包 Seed 1.6 是 reasoning 模型（响应带 reasoning_content，会吃 completion token），
 *    和 GPT-5 系列同坑：max_tokens 要给够，否则正文被 reasoning 吃光、issues 变空。
 *
 * 说明：视觉分析走非流式（stream:false），保证一次拿完整 JSON；
 *      curl 示例里的 stream:true 是聊天场景。
 */
export class MaasDoubaoVisionClient implements VisionClient {
  readonly name = 'openai' as const; // 协议兼容 OpenAI 家族（供合并去重时归组）
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  async invoke(req: VisionRequest): Promise<VisionResponse> {
    const userContent: DoubaoContentBlock[] = [];

    for (const img of req.images) {
      userContent.push({
        type: 'image_url',
        image_url: { url: img.dataUrl, detail: 'high' },
      });
      userContent.push({ type: 'text', text: `[图片] ${img.label}` });
    }
    userContent.push({ type: 'text', text: req.userPrompt });

    const result = await requestJsonWithRetry<DoubaoResponse>(
      API_URL,
      {
        method: 'POST',
        headers: {
          // 与 Azure OpenAI 网关同款：认证走 `api-key` header
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          // 豆包走标准 OpenAI 参数（支持 max_tokens / temperature）。
          // 但 Seed 1.6 是 reasoning 模型：reasoning_content 会占用 completion token，
          // 4096 可能被 reasoning 吃光导致正文为空 → issues 变空。故 vision 走查给足 16384。
          max_tokens: Math.max(req.maxTokens ?? 4096, 16384),
          temperature: 0.3,
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: userContent },
          ],
          stream: false,
        }),
      },
      { label: 'MaaS Doubao' },
    );

    if (!result.ok || !result.json) {
      // 优先级：结构化 error.message > raw body > parseError 兜底
      // 见 maasDirectVision.ts 里的详细说明
      const reason =
        result.json?.error?.message ??
        (result.raw ? result.raw.slice(0, 400) : undefined) ??
        result.parseError ??
        '未知错误';
      throw new Error(`MaaS Doubao API error (HTTP ${result.status}): ${reason}`);
    }

    const text = result.json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error(
        `MaaS Doubao 返回内容为空；原始响应：${result.raw.slice(0, 300)}`,
      );
    }

    return { text, model: this.model };
  }
}
