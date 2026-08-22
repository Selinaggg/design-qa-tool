import type { VisionClient, VisionRequest, VisionResponse } from './types';

const MAAS_MODEL = 'claude opus 4.7'; // 注意：这个名字带空格，来自 rednote MaaS
const API_URL =
  'https://maas.devops.rednote.life/openai/openai/bedrock_runtime/model/invoke-with-response-stream';
const ANTHROPIC_VERSION = 'bedrock-2023-05-31';

interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

function splitDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL: expected data:<mime>;base64,<payload>');
  return { mediaType: match[1], base64: match[2] };
}

/**
 * Rednote MaaS 网关（走 AWS Bedrock 的 Claude）
 *
 * 特点：
 * - endpoint 只有流式（invoke-with-response-stream），需服务端把流拼完再返回
 * - 认证：header `token: QST...`
 * - 请求体是 Bedrock Claude 格式，跟 Anthropic 官方 messages 结构一致，只是多个 anthropic_version
 * - 模型名带空格：'claude opus 4.7'
 *
 * 假设网关把 Bedrock 原生 EventStream 转成了标准 SSE（event: / data: 行）；
 * 如果不是，需要根据实际响应调整 parseStream()。
 */
export class MaasClaudeVisionClient implements VisionClient {
  readonly name = 'claude' as const; // 对上层仍标记为 claude 家族
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async invoke(req: VisionRequest): Promise<VisionResponse> {
    const content: ContentBlock[] = [];
    for (const img of req.images) {
      const { mediaType, base64 } = splitDataUrl(img.dataUrl);
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      });
      content.push({ type: 'text', text: `[图片] ${img.label}` });
    }
    content.push({ type: 'text', text: req.userPrompt });

    const requestBody = JSON.stringify({
      model: MAAS_MODEL,
      anthropic_version: ANTHROPIC_VERSION,
      max_tokens: req.maxTokens ?? 4096,
      system: req.systemPrompt,
      messages: [{ role: 'user', content }],
    });

    // 瞬时错误（5xx / brpc / 网络抖动）自动重试；流式响应必须整帧拿到才算成功
    const maxAttempts = 3;
    let lastErr = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          token: this.token,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '<no body>');
        const transient =
          res.status >= 500 ||
          res.status === 429 ||
          /brpc|timeout|timed out|eof|unavailable|try again/i.test(errText);
        if (transient && attempt < maxAttempts) {
          // eslint-disable-next-line no-console
          console.warn(
            `[MaaS Claude] 瞬时错误 (HTTP ${res.status})，第 ${attempt}/${maxAttempts} 次重试；body: ${errText.slice(0, 120)}`,
          );
          lastErr = errText;
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        throw new Error(`MaaS Claude API error (HTTP ${res.status}): ${errText.slice(0, 500)}`);
      }
      if (!res.body) {
        throw new Error('MaaS Claude API returned no response body.');
      }

      const fullText = await parseStreamToText(res.body);
      if (!fullText) {
        throw new Error('MaaS Claude API returned empty text after stream parse.');
      }
      return { text: fullText, model: MAAS_MODEL };
    }

    throw new Error(
      `MaaS Claude API error（已重试 ${maxAttempts} 次）：${lastErr.slice(0, 300)}`,
    );
  }
}

/**
 * 把流式响应拼成完整文本。
 * 兼容两种常见格式：
 *  1. 标准 SSE：每帧 `data: {"type":"content_block_delta","delta":{"text":"..."}}`
 *  2. Bedrock 原生 EventStream 转 JSON 后：`{"chunk":{"bytes":"<base64>"}}`
 *  3. 纯 JSON 行（NDJSON）：每行一个完整 Claude event
 */
async function parseStreamToText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 按行切
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;

      fullText += extractDeltaText(line);
    }
  }
  // 处理最后残留
  if (buffer.trim()) {
    fullText += extractDeltaText(buffer.trim());
  }

  return fullText;
}

/**
 * 从单行提取增量文本。
 * 支持几种可能的编码格式，找到能解出的就用。
 */
function extractDeltaText(line: string): string {
  // 去掉 SSE 前缀
  const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
  if (!payload || payload === '[DONE]') return '';

  try {
    const obj = JSON.parse(payload);

    // 格式 1: Anthropic streaming event
    //   {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
    if (obj?.type === 'content_block_delta' && obj?.delta?.text) {
      return obj.delta.text as string;
    }
    // 格式 2: Anthropic message_delta 完成事件里带 stop_reason，忽略
    // 格式 3: Bedrock 原生 chunk（网关如果没解开的话）
    //   {"chunk":{"bytes":"<base64of json>"}}
    if (obj?.chunk?.bytes) {
      try {
        const inner = JSON.parse(Buffer.from(obj.chunk.bytes, 'base64').toString('utf-8'));
        if (inner?.delta?.text) return inner.delta.text as string;
        if (inner?.type === 'content_block_delta' && inner?.delta?.text) return inner.delta.text as string;
      } catch {
        /* ignore */
      }
    }
    // 格式 4: 网关自定义包装 {"content":[{"text":"..."}]}——一次性完整响应
    if (Array.isArray(obj?.content)) {
      return obj.content
        .filter((b: { type?: string; text?: string }) => b.type === 'text' && typeof b.text === 'string')
        .map((b: { text?: string }) => b.text)
        .join('');
    }
    // 格式 5: 直接 {"text":"..."}
    if (typeof obj?.text === 'string') return obj.text;
  } catch {
    // 不是 JSON，忽略此行（可能是 event: 前缀或空行）
  }
  return '';
}
