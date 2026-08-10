import type { FigmaProvider, FigmaExportRequest, FigmaExportResult } from './types';

/**
 * Real Figma provider — uses the Figma REST API to export a frame as PNG.
 *
 * 支持的 URL 形态：
 *   - https://www.figma.com/file/{fileKey}/{name}?node-id={nodeId}
 *   - https://www.figma.com/design/{fileKey}/{name}?node-id={nodeId}
 *   - https://www.figma.com/proto/{fileKey}/{name}?node-id={nodeId}
 *   - 无 node-id 时，取文件的第一个 canvas root（回退：抛错要求用户复制含选中 frame 的链接）
 *
 * Node ID 格式：Figma URL 里用 "123-456"，API 需要 "123:456"
 */
export class RealFigmaProvider implements FigmaProvider {
  readonly name = 'figma';
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async export(req: FigmaExportRequest): Promise<FigmaExportResult> {
    const { fileKey, nodeId } = parseFigmaUrl(req.figmaUrl);
    if (!nodeId) {
      throw new Error(
        '未识别到 node-id，请在 Figma 里选中一个 frame → 右键 Copy link，粘贴带 ?node-id=... 的完整链接',
      );
    }

    // 1) 获取图片 CDN URL
    const imagesRes = await fetch(
      `https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(
        nodeId,
      )}&format=png&scale=2`,
      { headers: { 'X-Figma-Token': this.token } },
    );
    if (!imagesRes.ok) {
      const text = await imagesRes.text().catch(() => '');
      throw new Error(
        `Figma images API 失败 (${imagesRes.status}): ${text || imagesRes.statusText}`,
      );
    }
    const imagesData = (await imagesRes.json()) as {
      err?: string | null;
      images: Record<string, string | null>;
    };
    if (imagesData.err) throw new Error(`Figma API 返回错误：${imagesData.err}`);

    const cdnUrl = imagesData.images[nodeId];
    if (!cdnUrl) {
      throw new Error(
        `未找到 node ${nodeId} 对应的图，请检查 node-id 是否为 frame/组件（不能是 canvas 根节点）`,
      );
    }

    // 2) 获取 frame 尺寸（走 nodes API）
    let width = 0;
    let height = 0;
    let fileName = 'figma-frame';
    try {
      const nodesRes = await fetch(
        `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(
          nodeId,
        )}`,
        { headers: { 'X-Figma-Token': this.token } },
      );
      if (nodesRes.ok) {
        const nodesData = (await nodesRes.json()) as {
          name?: string;
          nodes: Record<
            string,
            { document?: { name?: string; absoluteBoundingBox?: { width: number; height: number } } } | null
          >;
        };
        const doc = nodesData.nodes[nodeId]?.document;
        if (doc?.absoluteBoundingBox) {
          width = Math.round(doc.absoluteBoundingBox.width);
          height = Math.round(doc.absoluteBoundingBox.height);
        }
        if (doc?.name) fileName = doc.name;
      }
    } catch {
      // 尺寸获取失败不阻断；调用方会用 probe fallback
    }

    return {
      imageUrl: cdnUrl,
      width,
      height,
      fileName: `${fileName}.png`,
      isMock: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// URL parser（导出以便测试）
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedFigmaUrl {
  fileKey: string;
  /** 已归一化为 "123:456" 格式（Figma API 需要冒号） */
  nodeId: string | null;
}

/**
 * 解析 Figma URL，提取 fileKey 和 nodeId
 *
 * 支持格式：
 *  - https://www.figma.com/file/{key}/{slug}?node-id=1-2   → { key, "1:2" }
 *  - https://www.figma.com/design/{key}/{slug}?node-id=1:2 → { key, "1:2" }
 *  - https://www.figma.com/proto/{key}/{slug}?node-id=1-2  → { key, "1:2" }
 *  - 无 node-id：{ key, null }
 *
 * 抛错场景：不是 figma.com 域名、缺 fileKey
 */
export function parseFigmaUrl(rawUrl: string): ParsedFigmaUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error('Figma URL 为空');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('无效的 URL 格式');
  }

  if (!/(^|\.)figma\.com$/i.test(url.hostname)) {
    throw new Error(`不是 figma.com 域名（收到：${url.hostname}）`);
  }

  // path 形态：/file/KEY/... 或 /design/KEY/... 或 /proto/KEY/...
  const match = url.pathname.match(/^\/(file|design|proto)\/([^/]+)/);
  if (!match) {
    throw new Error('URL 缺少 file key（预期路径 /file/... 或 /design/...）');
  }
  const fileKey = match[2];

  // node-id 可能是 "1-2"（新格式）或 "1:2"（旧格式）；API 需要 "1:2"
  let nodeId: string | null = null;
  const rawNodeId = url.searchParams.get('node-id');
  if (rawNodeId) {
    nodeId = rawNodeId.replace(/-/g, ':');
  }

  return { fileKey, nodeId };
}
