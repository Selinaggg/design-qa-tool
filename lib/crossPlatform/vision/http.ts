/**
 * Vision client 共享 HTTP 工具
 *
 * 解决两个历史问题：
 *  1. 错误信息里永远显示 `<no body>`：旧代码先 `res.json()` 消费了流，
 *     出错后再 `res.text()` 读不到 → 真相被藏起来。这里改成「只读一次文本」。
 *  2. MaaS 网关偶发瞬时错误（如 brpc [10.7...] RPC 后端不可用 / 5xx / 网络抖动）：
 *     对这类错误自动重试，显著降低「转半天失败」的概率。
 */

export interface FetchJsonResult<T> {
  ok: boolean;
  status: number;
  /** 原始响应文本（无论成功失败都保留，便于日志/报错） */
  raw: string;
  /** 解析成功的 JSON；解析失败为 null */
  json: T | null;
  /** JSON 解析错误信息（若有） */
  parseError?: string;
}

/**
 * 发请求 + 只读一次 body + 尝试 JSON 解析，返回结构化结果（不抛错，交给调用方判断）。
 */
async function fetchAndReadJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<FetchJsonResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const raw = await res.text(); // 只读一次，成功失败都拿得到
    let json: T | null = null;
    let parseError: string | undefined;
    try {
      json = raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
    return { ok: res.ok, status: res.status, raw, json, parseError };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 判断某次响应是否属于「值得重试的瞬时错误」。
 *
 * 语义：**重试只对"下次可能成功"的错误**做——客户端错误（4xx）重试没意义，
 * 只会让用户多等 3 倍时间才收到本可以立即返回的错误。
 *
 *  ✅ 重试：
 *   - HTTP 5xx（网关 / 后端故障）
 *   - HTTP 429（限流）
 *   - 无 HTTP 状态但 body 含 timeout/EOF/RPC 短暂失联关键字（少见情况）
 *
 *  ❌ 不重试：
 *   - HTTP 4xx —— **无论 body 是否含 brpc**
 *     以前的 bug：body 含 "brpc" 就判瞬时错，但 MaaS 网关的 4xx 常常长这样：
 *       `brpc [10.7...][E400] unsupported model: xxx`
 *     这是**配置错**（provider 和 model 不匹配），重试 3 次都会同样失败，
 *     只会让用户等 3 倍时间才看到错误。修 bug 后 4xx 立即返回给调用方。
 */
function isTransient(status: number, raw: string): boolean {
  // 明确 4xx：客户端错误，一律不重试
  if (status >= 400 && status < 500) {
    return status === 429; // 429 限流是唯一例外，值得等一下再试
  }
  // 5xx / 未知状态：可重试
  if (status >= 500) return true;
  // status = 0 或非 HTTP 语义（网络层错误没走到 fetch 完整响应），走 body 关键字判断
  const lower = raw.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('eof') ||
    lower.includes('connection reset') ||
    lower.includes('service unavailable') ||
    lower.includes('try again')
  );
}

export interface RequestJsonOptions {
  /** 请求超时（毫秒），默认 120s */
  timeoutMs?: number;
  /** 最大尝试次数（含首次），默认 3 */
  maxAttempts?: number;
  /** 重试基础退避（毫秒），默认 800ms，指数增长 */
  backoffMs?: number;
  /** 日志前缀，例如 'MaaS DirectLLM' */
  label?: string;
}

/**
 * 发起一次 JSON 请求，带瞬时错误自动重试。
 * 返回最终一次的 FetchJsonResult（无论成功失败）；网络异常在耗尽重试后抛出。
 */
export async function requestJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  opts: RequestJsonOptions = {},
): Promise<FetchJsonResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoffMs = opts.backoffMs ?? 800;
  const label = opts.label ?? 'vision';

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fetchAndReadJson<T>(url, init, timeoutMs);
      // 成功 → 直接返回
      if (result.ok && result.json) return result;

      // 失败但不可重试（如 400 参数错、404 模型不存在、401 鉴权）→ 直接返回给调用方报错
      if (!isTransient(result.status, result.raw) || attempt === maxAttempts) {
        return result;
      }

      // 瞬时错误 → 退避后重试
      // eslint-disable-next-line no-console
      console.warn(
        `[${label}] 瞬时错误 (HTTP ${result.status})，第 ${attempt}/${maxAttempts} 次重试；body: ${result.raw.slice(0, 120)}`,
      );
    } catch (err) {
      // 网络异常 / abort / DNS 等
      lastErr = err;
      if (attempt === maxAttempts) break;
      // eslint-disable-next-line no-console
      console.warn(
        `[${label}] 网络异常，第 ${attempt}/${maxAttempts} 次重试：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    await new Promise((r) => setTimeout(r, backoffMs * attempt));
  }

  throw new Error(
    `[${label}] 请求失败（已重试 ${maxAttempts} 次）：${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}
