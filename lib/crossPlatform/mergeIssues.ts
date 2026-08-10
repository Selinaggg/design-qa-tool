/**
 * 多模型 issues 合并去重
 *
 * 策略（由严到宽）：
 *  1. 平台不重叠 → 一定不是同一个问题
 *  2. type 不同 → 不合并（layout vs style 差异太大）
 *  3. 位置层：IoU >= IOU_THRESHOLD → 合并
 *  4. 标题层：normalized 相似度 >= TITLE_SIM_THRESHOLD → 合并
 *  5. 都不匹配 → 保留为独立 issue
 *
 * 合并规则：
 *  - severity 取更严重的（critical > high > medium > low）
 *  - confidence 取更高的
 *  - description / suggestion 取更长的（信息量大）
 *  - discoveredBy = 'both'
 *  - id 使用主模型的
 *  - location：优先用两方 IoU 较小方（矩形更精确）；退化取主模型的
 */

import type { PlatformConsistencyIssue, NormalizedRect } from './types';

const IOU_THRESHOLD = 0.3; // 位置匹配阈值
const TITLE_SIM_THRESHOLD = 0.55; // 标题相似度阈值（Jaccard）

interface MergeInput {
  issues: PlatformConsistencyIssue[];
  providerName: string;
}

/**
 * 主入口：把主/副两方的 issues 合并成一个数组。
 * primary/secondary 顺序不能颠倒（主模型 issue 优先保留 id/location）。
 */
export function mergeIssues(
  primary: MergeInput,
  secondary: MergeInput,
): PlatformConsistencyIssue[] {
  const merged: PlatformConsistencyIssue[] = [];
  // 主模型 issues 全部先落地，标 discoveredBy=primary
  const primaryWithFlag = primary.issues.map((i) => ({
    ...i,
    discoveredBy: primary.providerName,
  }));
  merged.push(...primaryWithFlag);

  // 副模型 issues 尝试匹配主
  const secondaryUnmatched: PlatformConsistencyIssue[] = [];
  for (const secIssue of secondary.issues) {
    const matchIdx = findMatchIndex(merged, secIssue);
    if (matchIdx >= 0) {
      merged[matchIdx] = mergeTwo(merged[matchIdx], secIssue);
    } else {
      secondaryUnmatched.push({ ...secIssue, discoveredBy: secondary.providerName });
    }
  }
  merged.push(...secondaryUnmatched);

  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════
// 匹配算法
// ═══════════════════════════════════════════════════════════════════════════

function findMatchIndex(
  pool: PlatformConsistencyIssue[],
  target: PlatformConsistencyIssue,
): number {
  for (let i = 0; i < pool.length; i++) {
    if (isSameIssue(pool[i], target)) return i;
  }
  return -1;
}

function isSameIssue(a: PlatformConsistencyIssue, b: PlatformConsistencyIssue): boolean {
  // 平台不重叠 → 不同问题
  if (!platformsOverlap(a.platforms, b.platforms)) return false;
  // type 不同 → 不同问题
  if (a.type !== b.type) return false;

  // 位置匹配：任一平台的 IoU 达标即算同问题
  const iouIos = boxIoU(a.iosLocation, b.iosLocation);
  const iouAndroid = boxIoU(a.androidLocation, b.androidLocation);
  const maxIou = Math.max(iouIos, iouAndroid);
  if (maxIou >= IOU_THRESHOLD) return true;

  // 位置都没给 or 匹配失败 → 标题相似度兜底
  const sim = titleSimilarity(a.title, b.title);
  if (sim >= TITLE_SIM_THRESHOLD) return true;

  return false;
}

function platformsOverlap(a: string[], b: string[]): boolean {
  return a.some((p) => b.includes(p));
}

// ═══════════════════════════════════════════════════════════════════════════
// IoU
// ═══════════════════════════════════════════════════════════════════════════

export function boxIoU(a?: NormalizedRect, b?: NormalizedRect): number {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  if (inter <= 0) return 0;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - inter;
  if (union <= 0) return 0;
  return inter / union;
}

// ═══════════════════════════════════════════════════════════════════════════
// 标题相似度（Jaccard on char bigrams）
// 快、稳、对中文友好
// ═══════════════════════════════════════════════════════════════════════════

export function titleSimilarity(a: string, b: string): number {
  const bigramsA = charBigrams(normalize(a));
  const bigramsB = charBigrams(normalize(b));
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let inter = 0;
  for (const g of bigramsA) if (bigramsB.has(g)) inter++;
  const union = bigramsA.size + bigramsB.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '') // 去空格 + 标点 + 符号
    .trim();
}

function charBigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length < 2) {
    if (s.length === 1) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) {
    out.add(s.slice(i, i + 2));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 两个 issue 合并
// ═══════════════════════════════════════════════════════════════════════════

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function mergeTwo(
  main: PlatformConsistencyIssue,
  extra: PlatformConsistencyIssue,
): PlatformConsistencyIssue {
  const moreSevere =
    (SEVERITY_RANK[extra.severity] ?? 0) > (SEVERITY_RANK[main.severity] ?? 0) ? extra : main;
  const higherConf = extra.confidence > main.confidence ? extra : main;
  return {
    ...main,
    severity: moreSevere.severity,
    confidence: higherConf.confidence,
    // description / suggestion 取更长（信息量大）
    description: pickLonger(main.description, extra.description),
    suggestion: pickLonger(main.suggestion, extra.suggestion),
    impact: pickLonger(main.impact, extra.impact),
    // location：主模型的优先，若主模型没给则用副的
    iosLocation: main.iosLocation ?? extra.iosLocation,
    androidLocation: main.androidLocation ?? extra.androidLocation,
    // tags 合并去重
    tags: mergeTags(main.tags, extra.tags),
    // 平台并集
    platforms: Array.from(new Set([...main.platforms, ...extra.platforms])) as typeof main.platforms,
    discoveredBy: 'both',
  };
}

function pickLonger(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

function mergeTags(a?: string[], b?: string[]): string[] | undefined {
  const set = new Set<string>();
  a?.forEach((t) => set.add(t));
  b?.forEach((t) => set.add(t));
  return set.size > 0 ? Array.from(set) : undefined;
}
