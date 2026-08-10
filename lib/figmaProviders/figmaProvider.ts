import type {
  FigmaProvider,
  FigmaExportRequest,
  FigmaExportResult,
  ListFramesRequest,
  ListFramesResult,
  FigmaFrameSummary,
} from './types';

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

  /**
   * 列出文件下所有顶级 FRAME（画板）：
   *  1) GET /v1/files/{key} 拉整棵树
   *  2) 遍历 document.children (CANVAS/pages) → children (顶级 FRAME/COMPONENT/COMPONENT_SET)
   *  3) 批量拉缩略图 GET /v1/images/{key}?ids=id1,id2,...&format=png&scale={scale}
   *
   * 只收 FRAME/COMPONENT/COMPONENT_SET（跳过 GROUP/RECTANGLE 之类，避免噪音）
   */
  async listFrames(req: ListFramesRequest): Promise<ListFramesResult> {
    const { fileKey } = parseFigmaUrl(req.figmaUrl);
    const scale = req.scale ?? 1;

    // 1) 拉文件结构
    const fileRes = await fetch(
      `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`,
      { headers: { 'X-Figma-Token': this.token } },
    );
    if (!fileRes.ok) {
      const text = await fileRes.text().catch(() => '');
      throw new Error(`Figma files API 失败 (${fileRes.status}): ${text || fileRes.statusText}`);
    }
    interface FigmaNode {
      id: string;
      name: string;
      type: string;
      children?: FigmaNode[];
      absoluteBoundingBox?: { width: number; height: number };
    }
    const fileData = (await fileRes.json()) as {
      name: string;
      document: FigmaNode;
    };

    // 2) 遍历顶级 frames，按 page 分组
    const frames: FigmaFrameSummary[] = [];
    const canvases = fileData.document?.children ?? [];
    const collectTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET']);
    for (const canvas of canvases) {
      if (canvas.type !== 'CANVAS') continue;
      const pageName = canvas.name;
      for (const child of canvas.children ?? []) {
        if (!collectTypes.has(child.type)) continue;
        frames.push({
          nodeId: child.id,
          name: child.name,
          pageName,
          thumbnailUrl: '', // 下一步批量填
          width: Math.round(child.absoluteBoundingBox?.width ?? 0),
          height: Math.round(child.absoluteBoundingBox?.height ?? 0),
        });
      }
    }

    if (frames.length === 0) {
      return {
        fileKey,
        fileName: fileData.name ?? 'Untitled',
        frames: [],
        isMock: false,
      };
    }

    // 3) 批量拉缩略图（Figma 单次 /v1/images 支持逗号分隔多个 id，实测 100+ 也 OK）
    // 大文件保险起见，分批（每批 100 个）
    const BATCH = 100;
    const thumbMap: Record<string, string> = {};
    for (let i = 0; i < frames.length; i += BATCH) {
      const batch = frames.slice(i, i + BATCH);
      const ids = batch.map((f) => f.nodeId).join(',');
      const imgRes = await fetch(
        `https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(
          ids,
        )}&format=png&scale=${scale}`,
        { headers: { 'X-Figma-Token': this.token } },
      );
      if (!imgRes.ok) {
        // 缩略图失败不阻断，让 UI 显示占位
        console.warn(`[figma] 缩略图批次 ${i}-${i + batch.length} 拉取失败: ${imgRes.status}`);
        continue;
      }
      const imgData = (await imgRes.json()) as {
        err?: string | null;
        images: Record<string, string | null>;
      };
      if (imgData.err) {
        console.warn(`[figma] 缩略图批次 ${i} 返回 err: ${imgData.err}`);
        continue;
      }
      for (const [id, url] of Object.entries(imgData.images)) {
        if (url) thumbMap[id] = url;
      }
    }

    for (const f of frames) {
      f.thumbnailUrl = thumbMap[f.nodeId] ?? '';
    }

    return {
      fileKey,
      fileName: fileData.name ?? 'Untitled',
      frames,
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
