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
 *  - maas-direct：小红书 MaaS DirectLLM 网关（OpenAI 兼容）—— xiaohongshu.com/v1，支持 Qwen 等多模型
 *  - maas-openai：小红书 MaaS Azure OpenAI 风格网关 —— rednote.life/openai/openai/chat/completions，header 用 api-key
 *  - maas-doubao：小红书 MaaS 豆包网关 —— xiaohongshu.com/openai/openai/doubao/chat/completions，header 用 api-key
 */
export type AIProviderKind =
  | 'mock'
  | 'claude'
  | 'openai'
  | 'maas'
  | 'maas-direct'
  | 'maas-openai'
  | 'maas-doubao';

/** 真实 provider（不含 mock）—— 副 provider 的合法枚举 */
export type RealAIProviderKind = Exclude<AIProviderKind, 'mock'>;

const VALID_PROVIDERS: AIProviderKind[] = [
  'mock',
  'claude',
  'openai',
  'maas',
  'maas-direct',
  'maas-openai',
  'maas-doubao',
];
const REAL_PROVIDERS: RealAIProviderKind[] = [
  'claude',
  'openai',
  'maas',
  'maas-direct',
  'maas-openai',
  'maas-doubao',
];

export interface AIConfig {
  provider: AIProviderKind;
  /** claude / openai 的 API key，或 maas 家族的 token；mock 时忽略 */
  apiKey: string;
  /**
   * 模型名（仅 maas-direct / maas-openai / maas-doubao 需要；其他 provider 用固定模型）
   * 例：qwen3-vl-30b-a3b-instruct / "GPT-5.6 Sol" / Doubao-Seed-2.1-Pro
   */
  model?: string;

  // ── 多模型交叉验证 ─────────────────────────────────────────────
  /** 是否启用多模型交叉验证；true 时并行调副 provider 合并 */
  enableMultiModel?: boolean;
  /** 副 provider（不能是 mock） */
  secondaryProvider?: RealAIProviderKind;
  /** 副 provider 的 key/token；可能与主相同（如同一 QST 支持 maas + maas-direct）也可能不同 */
  secondaryApiKey?: string;
  /** 副 provider 的模型（仅 maas-direct / maas-openai / maas-doubao 有效） */
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

/** maas-openai（Azure 风格）默认模型；模型名带空格是官方规范，不要改 */
export const DEFAULT_MAAS_OPENAI_MODEL = 'GPT-5.6 Sol';

/** maas-openai 可选模型列表（供 UI 下拉展示） */
export const MAAS_OPENAI_MODELS: Array<{ id: string; label: string; hint?: string }> = [
  { id: 'GPT-5.6 Sol', label: 'GPT-5.6 Sol', hint: '强推理' },
  // 未来若网关增加模型，直接往下加即可
];

/**
 * maas-doubao 默认模型 —— 注意：网关用「火山方舟 endpoint 命名」（全小写+连字符+日期后缀），
 * 不是官方营销名 "Doubao-Seed-2.1-Pro"（网关会 404 InvalidEndpointOrModel.NotFound）。
 * 走查看图必须用带 vision 的版本。
 * 已验证可用：doubao-seed-1-6-vision-250815（视觉）、doubao-seed-1-6-250615（纯文本）
 */
export const DEFAULT_MAAS_DOUBAO_MODEL = 'doubao-seed-1-6-vision-250815';

/** maas-doubao 可选模型列表（供 UI 下拉展示；均为网关实测可用的火山方舟 endpoint 名） */
export const MAAS_DOUBAO_MODELS: Array<{ id: string; label: string; hint?: string }> = [
  { id: 'doubao-seed-1-6-vision-250815', label: 'Doubao Seed 1.6 Vision', hint: '多模态，走查用' },
  { id: 'doubao-seed-1-6-250615', label: 'Doubao Seed 1.6', hint: '纯文本' },
  // 未来若网关增加模型，用火山方舟 endpoint 名往下加即可
];

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'mock',
  apiKey: '',
};

/**
 * 读取用户在 UI 里配置的 AI 参数。
 *
 * 自愈策略（方案 3）：如果 localStorage 里存的 (provider, model) 组合不合法
 * （比如以前的 bug 让 provider=maas-direct + model='GPT-5.6 Sol' 落盘了），
 * 这里会自动把 model 重置为该 provider 的默认 model，并把纠正后的 config
 * **回写 localStorage**，用户无感知。避免用户被历史错配持续困扰。
 *
 * 校验两组：
 *   1. 主：(provider, model)
 *   2. 副：(secondaryProvider, secondaryModel)
 */
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

    const rawModel = typeof parsed.model === 'string' ? parsed.model : undefined;
    const rawSecondaryModel =
      typeof parsed.secondaryModel === 'string' ? parsed.secondaryModel : undefined;

    // 自愈：模型不属于其 provider 的支持列表 → 重置为该 provider 默认
    const model = isModelValidFor(provider, rawModel) ? rawModel : defaultModelFor(provider);
    const secondaryModel =
      secondaryProvider === undefined
        ? undefined
        : isModelValidFor(secondaryProvider, rawSecondaryModel)
          ? rawSecondaryModel
          : defaultModelFor(secondaryProvider);

    const cfg: AIConfig = {
      provider,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model,
      enableMultiModel: !!parsed.enableMultiModel,
      secondaryProvider,
      secondaryApiKey:
        typeof parsed.secondaryApiKey === 'string' ? parsed.secondaryApiKey : undefined,
      secondaryModel,
    };

    // 若发生纠正，静默回写 localStorage —— 避免下次 load 再触发同样的自愈路径
    const wasCorrected = rawModel !== model || rawSecondaryModel !== secondaryModel;
    if (wasCorrected) {
      // eslint-disable-next-line no-console
      console.info(
        '[aiConfig] 检测到旧的错配 model，已自动纠正为该 provider 的默认值',
        { from: { model: rawModel, secondaryModel: rawSecondaryModel }, to: { model, secondaryModel } },
      );
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      } catch {
        // localStorage 写入失败不影响当次读取
      }
    }

    return cfg;
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
 * MaaS 四兄弟（maas / maas-direct / maas-openai / maas-doubao）都用同一 QST token → 家族内可复用。
 * 其它情况必须同一 provider 才复用。
 */
export function canReuseKeyBetween(a: AIProviderKind, b: AIProviderKind): boolean {
  const maasFamily = (p: AIProviderKind) =>
    p === 'maas' || p === 'maas-direct' || p === 'maas-openai' || p === 'maas-doubao';
  if (maasFamily(a) && maasFamily(b)) return true;
  return a === b;
}

/**
 * 返回某个 provider 的**默认 model id**。
 * 用户切换 provider 时应立刻用这个值把 model 覆盖掉，避免拿旧 provider 的 model 送到新网关触发
 * "unsupported model" 错误（网关会返回 brpc 400 且不可重试）。
 *
 * - claude / openai / mock / maas 这四个 provider 后端有内置模型选择，返回 undefined
 * - maas-direct / maas-openai / maas-doubao 每个网关一套模型，必须携带正确的 model 头
 */
export function defaultModelFor(provider: AIProviderKind): string | undefined {
  switch (provider) {
    case 'maas-direct':
      return DEFAULT_MAAS_DIRECT_MODEL;
    case 'maas-openai':
      return DEFAULT_MAAS_OPENAI_MODEL;
    case 'maas-doubao':
      return DEFAULT_MAAS_DOUBAO_MODEL;
    case 'claude':
    case 'openai':
    case 'maas':
    case 'mock':
    default:
      return undefined;
  }
}

/**
 * 判断 (provider, model) 组合是否合法。返回 true 表示 model 属于该 provider 的支持列表
 * 或者该 provider 不需要显式 model（如 claude / openai / maas / mock）。
 * NewAuditDrawer 用这个函数决定是否需要重置 model。
 */
export function isModelValidFor(provider: AIProviderKind, model: string | undefined): boolean {
  const supportedList = (() => {
    switch (provider) {
      case 'maas-direct':
        return MAAS_DIRECT_MODELS.map((m) => m.id);
      case 'maas-openai':
        return MAAS_OPENAI_MODELS.map((m) => m.id);
      case 'maas-doubao':
        return MAAS_DOUBAO_MODELS.map((m) => m.id);
      default:
        return null; // 不需要显式 model 校验
    }
  })();
  if (!supportedList) return true;
  return !!model && supportedList.includes(model);
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
  // model 头：maas-direct / maas-openai / maas-doubao 都要携带具体模型
  if (
    (cfg.provider === 'maas-direct' ||
      cfg.provider === 'maas-openai' ||
      cfg.provider === 'maas-doubao') &&
    cfg.model
  ) {
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
      if (
        (cfg.secondaryProvider === 'maas-direct' ||
          cfg.secondaryProvider === 'maas-openai' ||
          cfg.secondaryProvider === 'maas-doubao') &&
        cfg.secondaryModel
      ) {
        headers['x-ai-secondary-model'] = cfg.secondaryModel;
      }
    }
  }

  return headers;
}
