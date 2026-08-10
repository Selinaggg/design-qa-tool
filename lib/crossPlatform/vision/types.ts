/**
 * VisionClient：视觉多模态 LLM 抽象层。
 * Claude / OpenAI 都实现同一个接口，让 RealCrossPlatformAnalyzer 保持 provider-agnostic。
 */

export interface VisionImage {
  /** data URL（data:image/png;base64,...） */
  dataUrl: string;
  /** 语义标签，例如 'iOS 截图' / 'Android 截图' / '设计稿' */
  label: string;
}

export interface VisionRequest {
  /** 系统 / 角色指令 */
  systemPrompt: string;
  /** 用户消息（含任务描述、约束、JSON schema） */
  userPrompt: string;
  /** 图片列表（按顺序注入到 user message） */
  images: VisionImage[];
  /** 期望模型返回的最大 token 数 */
  maxTokens?: number;
}

export interface VisionResponse {
  /** 模型原始文本输出（应为 JSON 字符串或包含 JSON 的字符串） */
  text: string;
  /** 使用的模型 ID，便于日志追踪 */
  model: string;
}

export interface VisionClient {
  readonly name: 'claude' | 'openai';
  invoke(req: VisionRequest): Promise<VisionResponse>;
}
