/**
 * Figma frame 精简设计 spec —— 用于喂给 AI 走查。
 *
 * 设计原则：
 *  - 只保留视觉/走查相关的关键字段（fills / strokes / cornerRadius / effects / text style / box）
 *  - 递归深度可控（默认最多 6 层，防止组件库炸开几百节点）
 *  - 输出尺寸目标：完整 JSON.stringify 后 < 30KB（保证 prompt 不臃肿）
 */

export interface FigmaColor {
  hex: string;              // "#RRGGBB"
  opacity?: number;         // 0-1，非 1 时输出
}

export interface FigmaBox {
  x: number;                // 相对文档
  y: number;
  width: number;
  height: number;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;      // 400 / 500 / 600 ...
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlign?: string;       // LEFT / CENTER / RIGHT
  color?: FigmaColor;
}

/** 阴影 / 模糊 效果 */
export interface FigmaEffect {
  type: string;             // DROP_SHADOW / INNER_SHADOW / LAYER_BLUR ...
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

/** 描边 */
export interface FigmaStroke {
  color: FigmaColor;
  weight?: number;
  align?: string;           // INSIDE / OUTSIDE / CENTER
}

/** 填充：纯色 / 渐变 / 图片 */
export interface FigmaFill {
  type: string;             // SOLID / GRADIENT_LINEAR / IMAGE
  color?: FigmaColor;       // SOLID 用
  gradientStops?: Array<{ position: number; color: FigmaColor }>;  // 渐变用
  imageRef?: string;        // IMAGE 用（不含实际图，只留标记）
}

export interface FigmaNodeSpec {
  id: string;
  name: string;
  type: string;             // FRAME / TEXT / RECTANGLE / GROUP ...
  box?: FigmaBox;
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  cornerRadius?: number | number[];  // 单值或 [tl, tr, br, bl]
  effects?: FigmaEffect[];
  opacity?: number;
  /** TEXT 节点专用 */
  text?: {
    characters: string;
    style: FigmaTextStyle;
  };
  /** 子节点（可选，递归深度限制） */
  children?: FigmaNodeSpec[];
}
