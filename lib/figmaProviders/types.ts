export interface FigmaExportRequest {
  figmaUrl: string;
}

export interface FigmaExportResult {
  imageUrl: string; // data URL or absolute URL served by the app
  width: number;
  height: number;
  fileName: string;
  isMock: boolean;
}

/**
 * 单个 Figma frame 的摘要（画板级批量导入用）
 * 来自 GET /v1/files/{key}（结构层）+ GET /v1/images/{key}（缩略图）
 */
export interface FigmaFrameSummary {
  nodeId: string;      // "1:2" 冒号格式
  name: string;
  pageName: string;    // 所在 page（顶级 CANVAS 节点名）
  thumbnailUrl: string;
  width: number;
  height: number;
}

export interface ListFramesRequest {
  /** 文件级链接：https://www.figma.com/file/XXX/YYY 或 /design/XXX/YYY */
  figmaUrl: string;
  /** 缩略图 scale，默认 1（省流量） */
  scale?: number;
}

export interface ListFramesResult {
  fileKey: string;
  fileName: string;
  frames: FigmaFrameSummary[];
  isMock: boolean;
}

export interface FigmaProvider {
  readonly name: string;
  export(req: FigmaExportRequest): Promise<FigmaExportResult>;
  /** 列出文件下所有顶级 frames（按 page 分组） */
  listFrames(req: ListFramesRequest): Promise<ListFramesResult>;
}
