import type {
  CrossPlatformAnalyzer,
  CrossPlatformAuditRequest,
  CrossPlatformAuditResult,
  PlatformConsistencyIssue,
  IssueSeverityCP,
  IssueType,
  IgnoreRegion,
  PlatformType,
  NormalizedRect,
} from './types';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import {
  createVisionClient,
  type VisionImage,
  type VisionProviderName,
} from './vision';
import { mergeIssues } from './mergeIssues';

interface RealAnalyzerOptions {
  provider: VisionProviderName;
  apiKey: string;
  /** 模型名（仅 maas-direct 生效） */
  model?: string;
  /**
   * 副 provider 配置（多模型交叉验证）；提供则并行调用两个模型合并结果。
   */
  secondary?: {
    provider: VisionProviderName;
    apiKey: string;
    model?: string;
  };
}

/**
 * Real cross-platform analyzer.
 *
 * 编排流程：
 *  1. 收集输入图片 URL（可能是 data URL / http URL），统一转 base64 data URL
 *  2. 构造 prompt（含设备信息、忽略规则、targetRegions、输出 schema）
 *  3. 调 VisionClient（Claude / OpenAI）
 *  4. 解析 JSON 响应
 *  5. 补齐 id、忽略区域、severity summary，返回 CrossPlatformAuditResult
 */
export class RealCrossPlatformAnalyzer implements CrossPlatformAnalyzer {
  readonly name = 'real';
  private readonly opts: RealAnalyzerOptions;

  constructor(opts: RealAnalyzerOptions) {
    if (!opts.apiKey) {
      throw new Error('RealCrossPlatformAnalyzer requires an apiKey.');
    }
    this.opts = opts;
  }

  async analyze(req: CrossPlatformAuditRequest): Promise<CrossPlatformAuditResult> {
    // Step 1: 收集图片
    const images: VisionImage[] = [];
    if (req.iosImageUrl) {
      images.push({ dataUrl: await toDataUrl(req.iosImageUrl), label: 'iOS 端截图' });
    }
    if (req.androidImageUrl) {
      images.push({ dataUrl: await toDataUrl(req.androidImageUrl), label: 'Android 端截图' });
    }
    if (req.designImageUrl) {
      images.push({ dataUrl: await toDataUrl(req.designImageUrl), label: '设计稿' });
    }

    if (images.length === 0) {
      throw new Error('No image provided for cross-platform audit.');
    }

    // Step 2: prompt
    const userPrompt = buildUserPrompt(req);

    // Step 3: 调 vision —— 单模型 or 双模型并行
    const primaryClient = createVisionClient(this.opts.provider, this.opts.apiKey, this.opts.model);
    const invokeArgs = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      images,
      maxTokens: 4096,
    };

    let issues: PlatformConsistencyIssue[];
    let scores: {
      platformConsistencyScore: number;
      designFidelity?: { ios?: number; android?: number };
      overallScore: number;
    };
    const hasIos = !!req.iosImageUrl;
    const hasAndroid = !!req.androidImageUrl;
    const hasDesign = !!req.designImageUrl;

    if (this.opts.secondary) {
      // 双模型并行
      const secondaryClient = createVisionClient(
        this.opts.secondary.provider,
        this.opts.secondary.apiKey,
        this.opts.secondary.model,
      );

      // Promise.allSettled：某一方挂了不整体挂，用另一方结果
      const [primaryRes, secondaryRes] = await Promise.allSettled([
        primaryClient.invoke(invokeArgs),
        secondaryClient.invoke(invokeArgs),
      ]);

      const primaryParsed =
        primaryRes.status === 'fulfilled' ? tryParse(primaryRes.value.text) : null;
      const secondaryParsed =
        secondaryRes.status === 'fulfilled' ? tryParse(secondaryRes.value.text) : null;

      if (!primaryParsed && !secondaryParsed) {
        const errMsgs = [
          primaryRes.status === 'rejected' ? `主(${this.opts.provider}): ${primaryRes.reason}` : '',
          secondaryRes.status === 'rejected'
            ? `副(${this.opts.secondary.provider}): ${secondaryRes.reason}`
            : '',
        ]
          .filter(Boolean)
          .join(' | ');
        throw new Error(`两个模型都失败：${errMsgs}`);
      }

      const primaryIssues = primaryParsed
        ? normalizeIssues(primaryParsed.issues ?? [], { hasIos, hasAndroid })
        : [];
      const secondaryIssues = secondaryParsed
        ? normalizeIssues(secondaryParsed.issues ?? [], { hasIos, hasAndroid })
        : [];

      issues = mergeIssues(
        { issues: primaryIssues, providerName: this.opts.provider },
        { issues: secondaryIssues, providerName: this.opts.secondary.provider },
      );

      // 分数：取两方均值（若一方缺就用另一方）
      scores = averageScores(primaryParsed, secondaryParsed, { hasIos, hasAndroid, hasDesign });
    } else {
      // 单模型
      const response = await primaryClient.invoke(invokeArgs);
      const parsed = parseVisionJson(response.text);
      issues = normalizeIssues(parsed.issues ?? [], { hasIos, hasAndroid });
      scores = {
        platformConsistencyScore:
          hasIos && hasAndroid ? clampInt(parsed.platformConsistencyScore ?? 0, 0, 100) : 0,
        designFidelity:
          hasDesign && parsed.designFidelity
            ? {
                ios: hasIos ? clampInt(parsed.designFidelity.ios ?? 0, 0, 100) : 0,
                android: hasAndroid ? clampInt(parsed.designFidelity.android ?? 0, 0, 100) : 0,
              }
            : undefined,
        overallScore: clampInt(parsed.overallScore ?? 0, 0, 100),
      };
    }

    // Step 4/5: 组装结果
    const summary = issues.reduce(
      (acc, i) => { acc[i.severity]++; return acc; },
      { critical: 0, high: 0, medium: 0, low: 0 },
    );

    return {
      scenarioName: req.scenario.name,
      iosDeviceName: req.iosDevice?.name ?? '—',
      androidDeviceName: req.androidDevice?.name ?? '—',
      ...(scores.designFidelity ? { designFidelity: scores.designFidelity as { ios: number; android: number } } : {}),
      platformConsistencyScore: scores.platformConsistencyScore,
      overallScore: scores.overallScore,
      summary,
      issues,
      ignoredRegions: buildIgnoredRegions(req),
      isMock: false,
    };
  }
}

/**
 * 尝试解析 JSON；失败返回 null（不抛，让上层判断两方是否都挂）
 */
function tryParse(raw: string): ParsedResponse | null {
  try {
    return parseVisionJson(raw);
  } catch {
    return null;
  }
}

/**
 * 双模型分数合并：取两方均值；若一方缺则用另一方
 */
function averageScores(
  a: ParsedResponse | null,
  b: ParsedResponse | null,
  ctx: { hasIos: boolean; hasAndroid: boolean; hasDesign: boolean },
): {
  platformConsistencyScore: number;
  designFidelity?: { ios: number; android: number };
  overallScore: number;
} {
  const parts = [a, b].filter((p): p is ParsedResponse => p !== null);

  const pcs = ctx.hasIos && ctx.hasAndroid ? avgInt(parts.map((p) => p.platformConsistencyScore)) : 0;
  const overall = avgInt(parts.map((p) => p.overallScore));

  let designFidelity: { ios: number; android: number } | undefined;
  if (ctx.hasDesign) {
    const ios = ctx.hasIos ? avgInt(parts.map((p) => p.designFidelity?.ios)) : 0;
    const android = ctx.hasAndroid ? avgInt(parts.map((p) => p.designFidelity?.android)) : 0;
    designFidelity = { ios, android };
  }

  return { platformConsistencyScore: pcs, designFidelity, overallScore: overall };
}

function avgInt(vals: Array<number | undefined>): number {
  const valid = vals.filter((v): v is number => typeof v === 'number');
  if (valid.length === 0) return 0;
  const sum = valid.reduce((a, b) => a + b, 0);
  return clampInt(sum / valid.length, 0, 100);
}

// ─────────────────────────── 图片 URL → data URL ───────────────────────────

async function toDataUrl(url: string): Promise<string> {
  // 已经是 data URL
  if (url.startsWith('data:')) return url;

  // blob: URL —— 只在浏览器有效，后端拿不到
  if (url.startsWith('blob:')) {
    throw new Error(
      `Cannot fetch blob URL on server: ${url.slice(0, 40)}... 请前端在提交前将 blob 转成 data URL。`,
    );
  }

  // http(s) URL —— 后端 fetch，转 base64
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch image ${url}: HTTP ${res.status}`);
    }
    const mediaType = res.headers.get('content-type') ?? 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mediaType};base64,${buf.toString('base64')}`;
  }

  throw new Error(`Unsupported image URL scheme: ${url.slice(0, 40)}...`);
}

// ─────────────────────────── JSON 解析 ───────────────────────────

interface ParsedLocation {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface ParsedIssue {
  title?: string;
  description?: string;
  type?: string;
  severity?: string;
  platforms?: string[];
  regionName?: string;
  iosLocation?: ParsedLocation | null;
  androidLocation?: ParsedLocation | null;
  isAcceptablePlatformDifference?: boolean;
  impact?: string;
  suggestion?: string;
  confidence?: number;
  tags?: string[];
}

interface ParsedResponse {
  issues?: ParsedIssue[];
  platformConsistencyScore?: number;
  designFidelity?: { ios?: number; android?: number } | null;
  overallScore?: number;
}

function parseVisionJson(raw: string): ParsedResponse {
  // 兼容 Claude 有时返回带 ```json ... ``` 的情况
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // 若模型附带前后文字，尝试抓第一个 { ... } 块
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  try {
    return JSON.parse(candidate) as ParsedResponse;
  } catch (err) {
    throw new Error(
      `Failed to parse vision JSON: ${err instanceof Error ? err.message : String(err)}\n原始输出前 200 字：${raw.slice(0, 200)}`,
    );
  }
}

// ─────────────────────────── 归一化 issue ───────────────────────────

const VALID_TYPES: IssueType[] = ['content', 'layout', 'style', 'interaction', 'platform-specific'];
const VALID_SEV: IssueSeverityCP[] = ['critical', 'high', 'medium', 'low'];

function normalizeIssues(
  raw: ParsedIssue[],
  ctx: { hasIos: boolean; hasAndroid: boolean },
): PlatformConsistencyIssue[] {
  return raw
    .map((r, idx): PlatformConsistencyIssue | null => {
      const type = (VALID_TYPES.includes(r.type as IssueType) ? r.type : 'layout') as IssueType;
      const severity = (VALID_SEV.includes(r.severity as IssueSeverityCP) ? r.severity : 'medium') as IssueSeverityCP;

      // 平台清单：只保留 ctx 里有的端
      const platformsRaw = (r.platforms ?? []).filter(
        (p): p is PlatformType => p === 'ios' || p === 'android',
      );
      const platforms = platformsRaw.filter((p) => (p === 'ios' ? ctx.hasIos : ctx.hasAndroid));
      if (platforms.length === 0) {
        // 兜底：至少放一个可用平台
        if (ctx.hasIos) platforms.push('ios');
        else if (ctx.hasAndroid) platforms.push('android');
        else return null;
      }

      const iosLocation = ctx.hasIos ? sanitizeRect(r.iosLocation) : undefined;
      const androidLocation = ctx.hasAndroid ? sanitizeRect(r.androidLocation) : undefined;

      return {
        id: `real-${Date.now()}-${idx}`,
        title: r.title?.trim() || '未命名问题',
        description: r.description?.trim() || '',
        type,
        severity,
        platforms,
        regionName: r.regionName?.trim() || undefined,
        iosLocation,
        androidLocation,
        isAcceptablePlatformDifference: !!r.isAcceptablePlatformDifference,
        impact: r.impact?.trim() || '',
        suggestion: r.suggestion?.trim() || '',
        confidence: typeof r.confidence === 'number' ? clamp(r.confidence, 0, 1) : 0.7,
        status: r.isAcceptablePlatformDifference ? 'ignored' : 'pending',
        tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : undefined,
      };
    })
    .filter((x): x is PlatformConsistencyIssue => x !== null);
}

function sanitizeRect(rect: ParsedLocation | null | undefined): NormalizedRect | undefined {
  if (!rect || typeof rect !== 'object') return undefined;
  const { x, y, width, height } = rect;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
    return undefined;
  }
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width: clamp(width, 0, 1),
    height: clamp(height, 0, 1),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clampInt(v: number, min: number, max: number): number {
  return Math.round(clamp(v, min, max));
}

// ─────────────────────────── 忽略区域（复用 mock 逻辑） ───────────────────────────

function buildIgnoredRegions(req: CrossPlatformAuditRequest): IgnoreRegion[] {
  const regions: IgnoreRegion[] = [];
  if (req.options.ignoreStatusBar) {
    if (req.iosDevice) {
      regions.push({
        id: 'ios-status-bar',
        name: 'iOS 状态栏 / 顶部安全区',
        platform: 'ios',
        rect: { x: 0, y: 0, width: 1, height: req.iosDevice.safeArea.top / req.iosDevice.viewport.height },
        reason: '系统状态栏区域，跨端对比时忽略',
      });
    }
    if (req.androidDevice) {
      regions.push({
        id: 'android-status-bar',
        name: 'Android 状态栏',
        platform: 'android',
        rect: { x: 0, y: 0, width: 1, height: req.androidDevice.safeArea.top / req.androidDevice.viewport.height },
        reason: '系统状态栏区域，跨端对比时忽略',
      });
    }
  }
  if (req.options.ignoreBottomSafeArea) {
    if (req.iosDevice) {
      const iosR = req.iosDevice.safeArea.bottom / req.iosDevice.viewport.height;
      regions.push({
        id: 'ios-bottom-safe',
        name: 'iOS 底部手势条 / 安全区',
        platform: 'ios',
        rect: { x: 0, y: 1 - iosR, width: 1, height: iosR },
        reason: '底部 Home Indicator 安全区，跨端对比时忽略',
      });
    }
    if (req.androidDevice) {
      const androidR = req.androidDevice.safeArea.bottom / req.androidDevice.viewport.height;
      regions.push({
        id: 'android-bottom-nav',
        name: 'Android 底部导航栏',
        platform: 'android',
        rect: { x: 0, y: 1 - androidR, width: 1, height: androidR },
        reason: '底部系统导航栏区域，跨端对比时忽略',
      });
    }
  }
  return regions;
}
