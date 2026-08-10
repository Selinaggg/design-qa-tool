/**
 * fuzzyMatch —— 画板名与 Figma frame 名的模糊匹配
 *
 * 归一化规则：
 *  1) 转小写
 *  2) 去除所有非字母数字（下划线、连字符、空格、中文标点等）
 *  3) 转成 tokens 数组（原始归一化字符串按驼峰/数字分词）
 *
 * 相似度算法：
 *  - normalize 后完全相等 → 1.0（最高优先）
 *  - 否则用 Levenshtein 编辑距离，score = 1 - editDist / max(len)
 *  - 阈值 >= 0.7 视为匹配（可调）
 *
 * 返回：给定 boardName，从 candidates 中选出得分最高且 >= 阈值的 frame
 */

/** 归一化：小写 + 去所有非字母数字 */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

/** 经典 Levenshtein 距离（DP 两行滚动） */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // delete
        curr[j - 1] + 1,    // insert
        prev[j - 1] + cost, // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 相似度 [0, 1]，越大越像 */
export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  const dist = editDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

export interface FuzzyMatchCandidate {
  /** 用来匹配的字符串（frame name） */
  key: string;
  /** 携带的原始对象，供调用方回填 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

export interface FuzzyMatchResult<T = unknown> {
  /** 命中的候选 payload；null = 没有过阈值 */
  match: T | null;
  score: number;
}

/**
 * 从 candidates 中找出与 target 最相似的一个
 * @param threshold 阈值，默认 0.7；低于则视为无匹配
 */
export function findBestMatch<T = unknown>(
  target: string,
  candidates: FuzzyMatchCandidate[],
  threshold = 0.7,
): FuzzyMatchResult<T> {
  let bestScore = 0;
  let bestPayload: T | null = null;
  for (const c of candidates) {
    const s = similarity(target, c.key);
    if (s > bestScore) {
      bestScore = s;
      bestPayload = c.payload as T;
    }
  }
  if (bestScore < threshold) {
    return { match: null, score: bestScore };
  }
  return { match: bestPayload, score: bestScore };
}

/**
 * 批量匹配：给一组 boardNames，为每个找最佳 frame
 * 返回 Map<boardName, { match, score }>
 * 若多个 board 命中同一个 frame，保留 score 最高者；其余降级为 null（避免重复分派）
 */
export function batchFuzzyMatch<T extends { nodeId: string }>(
  boardNames: string[],
  candidates: FuzzyMatchCandidate[],
  threshold = 0.7,
): Map<string, FuzzyMatchResult<T>> {
  const result = new Map<string, FuzzyMatchResult<T>>();
  const claims = new Map<string, { boardName: string; score: number }>();

  for (const bn of boardNames) {
    const r = findBestMatch<T>(bn, candidates, threshold);
    result.set(bn, r);
    if (r.match) {
      const nodeId = (r.match as T).nodeId;
      const prev = claims.get(nodeId);
      if (!prev || r.score > prev.score) {
        // 抢占：让老的失败
        if (prev) result.set(prev.boardName, { match: null, score: 0 });
        claims.set(nodeId, { boardName: bn, score: r.score });
      } else {
        // 让给老的
        result.set(bn, { match: null, score: 0 });
      }
    }
  }

  return result;
}
