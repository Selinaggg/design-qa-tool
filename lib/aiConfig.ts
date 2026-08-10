/**
 * AI provider config — 存在 localStorage，只在浏览器有效。
 * 后端 API 通过请求头 `x-ai-provider` / `x-ai-key` / `x-ai-model` 接收。
 *
 * 多模型交叉验证（enableMultiModel=true）：
 *  - 同时调用主 + 副 provider，把两方的 issues 合并去重
 *  - 每个 issue 标 discoveredBy: 主/副/both，UI 可展示来源
 *  - 副 provider/key/model 独立配置（可跟主用不同家的模型 / 不同 token）
 *  - 头部：x-ai-secondary-provider / x-ai-secondary-key / x-ai-secondary-model
 *
 * 安全说明：
 *  - key 用 localStorage 明文存（前端能拿到就等于用户自己能拿到，无需加密）
 *  - 不写入 session 历史；导出报告不带 key
 *  - 走 HTTPS 上到自家 /api/*，不会转发给三方；三方 API 由后端直连
 */

/**
 * 支持的 AI provider：
 *  - mock：无 key，跑本地假数据
 *  - claude：Anthropic 官方 API（sk-ant-...）
 *  - openai：OpenAI 官方 API（sk-...）
 *  - maas：小红书 MaaS Bedrock 网关（走 Claude）—— rednote.life，仅办公网
 *  - maas-direct：小红书 MaaS DirectLLM 网关（OpenAI 兼容）—— xiaohongshu.com/v1，支持 Qwen 等多模型，可指定 model
 */
export type AIProviderKind = 'mock' | 'claude' | 'openai' | 'maas' | 'maas-direct';

/** 真实 provider（不含 mock）—— 副 provider 的合法枚举 */
export type RealAIProviderKind = Exclude<AIProviderKind, 'mock'>;

const VALID_PROVIDERS: AIProviderKind[] = ['mock', 'claude', 'openai', 'maas', 'maas-direct'];
const REAL_PROVIDERS: RealAIProviderKind[] = ['claude', 'openai', 'maas', 'maas-direct'];

export interface AIConfig {
  provider: AIProviderKind;
  /** claude / openai 的 API key，或 maas 的 token；mock 时忽略 */
  apiKey: string;
  /**
   * 模型名（仅 maas-direct 需要，其他 provider 目前用固定模型）
   * 例：qwen3-vl-30b-a3b-instruct
   */
  model?: string;

  // ── 多模型交叉验证 ─────────────────────────────────────────────
  /** 是否启用多模型交叉验证；true 时并行调副 provider 合并 */
  enableMultiModel?: boolean;
  /** 副 provider（不能是 mock） */
  secondaryProvider?: RealAIProviderKind;
  /** 副 provider 的 key/token；可能与主相同（如同一 QST 支持 maas + maas-direct）也可能不同 */
  secondaryApiKey?: string;
  /** 副 provider 的模型（仅 maas-direct 有效） */
  secondaryModel?: string;
}

const STORAGE_KEY = 'design-qa-tool:ai-config';

/** maas-direct 默认模型（视觉、便宜）；后续可加下拉扩展 */
export const DEFAULT_MAAS_DIRECT_MODEL = 'qwen3-vl-30b-a3b-instruct';

/** maas-direct 可选模型列表（供 UI 下拉展示） */
export const MAAS_DIRECT_MODELS: Array<{ id: string; label: string; hint?: string }> = [
  { id: 'qwen3-vl-30b-a3b-instruct', label: 'Qwen3-VL 30B', hint: '视觉，便宜' },
  // 未来可以加：{ id: 'other-model-id', label: '...' }
];

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'mock',
  apiKey: '',
};

/** 读取用户在 UI 里配置的 AI 参数 */
export function loadAIConfig(): AIConfig {
  if (typeof window === 'undefined') return DEFAULT_AI_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AIConfig>;
    const provider = VALID_PROVIDERS.includes(parsed.provider as AIProviderKind)
      ? (parsed.provider as AIProviderKind)
      : 'mock';
    const secondaryProvider = REAL_PROVIDERS.includes(
      parsed.secondaryProvider as RealAIProviderKind,
    )
      ? (parsed.secondaryProvider as RealAIProviderKind)
      : undefined;
    return {
      provider,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      enableMultiModel: !!parsed.enableMultiModel,
      secondaryProvider,
      secondaryApiKey:
        typeof parsed.secondaryApiKey === 'string' ? parsed.secondaryApiKey : undefined,
      secondaryModel: typeof parsed.secondaryModel === 'string' ? parsed.secondaryModel : undefined,
    };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAIConfig(cfg: AIConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearAIConfig(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** 把 key 脱敏成 sk-****abcd 展示 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  const head = key.slice(0, 4);
  const tail = key.slice(-4);
  return `${head}****${tail}`;
}

/**
 * 副配置是否 "有效可用"：
 *  - 开关开启
 *  - 副 provider 已选
 *  - 副 key 已填（若为空，可 fallback 主 key，但只在主副 provider 都属于 MaaS 家族时才合理复用；其他情况必须显式填）
 */
export function isSecondaryReady(cfg: AIConfig): boolean {
  if (!cfg.enableMultiModel || !cfg.secondaryProvider) return false;
  const key = cfg.secondaryApiKey || (canReuseKeyBetween(cfg.provider, cfg.secondaryProvider) ? cfg.apiKey : '');
  return !!key;
}

/**
 * 判断两个 provider 是否可复用同一个 key。
 * 例：maas ↔ maas-direct 都用 QST token → true
 *     claude ↔ openai 不同家 → false
 */
export function canReuseKeyBetween(a: AIProviderKind, b: AIProviderKind): boolean {
  const maasFamily = (p: AIProviderKind) => p === 'maas' || p === 'maas-direct';
  if (maasFamily(a) && maasFamily(b)) return true;
  return a === b;
}

/**
 * 供 fetch 调用时拼装请求头。
 * - provider=mock → 返回空对象（后端走 env 或 mock）
 * - provider=真实 → 带上 x-ai-provider + x-ai-key（+ x-ai-model 仅 maas-direct）
 * - enableMultiModel + secondary 有效 → 追加 x-ai-secondary-*
 */
export function buildAIHeaders(cfg: AIConfig = loadAIConfig()): Record<string, string> {
  if (cfg.provider === 'mock' || !cfg.apiKey) return {};
  const headers: Record<string, string> = {
    'x-ai-provider': cfg.provider,
    'x-ai-key': cfg.apiKey,
  };
  if (cfg.provider === 'maas-direct' && cfg.model) {
    headers['x-ai-model'] = cfg.model;
  }

  // 多模型交叉验证
  if (isSecondaryReady(cfg) && cfg.secondaryProvider) {
    const secKey =
      cfg.secondaryApiKey ||
      (canReuseKeyBetween(cfg.provider, cfg.secondaryProvider) ? cfg.apiKey : '');
    if (secKey) {
      headers['x-ai-secondary-provider'] = cfg.secondaryProvider;
      headers['x-ai-secondary-key'] = secKey;
      if (cfg.secondaryProvider === 'maas-direct' && cfg.secondaryModel) {
        headers['x-ai-secondary-model'] = cfg.secondaryModel;
      }
    }
  }

  return headers;
}
