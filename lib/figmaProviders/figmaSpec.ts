/**
 * 从 Figma REST API 返回的原始节点树，递归提取「走查用精简 spec」
 *
 * 输入：GET /v1/files/{key}/nodes?ids=xxx 返回的 document 节点
 * 输出：FigmaNodeSpec（精简版，只保留视觉/文字关键字段）
 *
 * 关键策略：
 *  1) 深度限制（默认 6）：防组件库炸出几百节点
 *  2) 节点数限制（默认 200）：硬上限，防 prompt 爆炸
 *  3) 只保留有视觉意义的节点：跳过 SLICE / 隐藏节点
 *  4) 颜色统一 hex，rgba(0-1) → #RRGGBB
 */

import type {
  FigmaBox,
  FigmaColor,
  FigmaEffect,
  FigmaFill,
  FigmaNodeSpec,
  FigmaStroke,
  FigmaTextStyle,
} from './figmaSpecTypes';

/** Figma API 原始节点（只声明用到的字段） */
interface RawFigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: RawPaint[];
  strokes?: RawPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  effects?: RawEffect[];
  characters?: string;
  style?: RawTextStyle;
  children?: RawFigmaNode[];
}

interface RawPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: { r: number; g: number; b: number; a?: number };
  gradientStops?: Array<{
    position: number;
    color: { r: number; g: number; b: number; a?: number };
  }>;
  imageRef?: string;
}

interface RawEffect {
  type: string;
  visible?: boolean;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

interface RawTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
}

export interface ExtractSpecOptions {
  /** 最大递归深度，默认 6 */
  maxDepth?: number;
  /** 最大节点数，默认 200 */
  maxNodes?: number;
}

/**
 * 主入口：从原始节点提取精简 spec
 */
export function extractFigmaSpec(
  raw: RawFigmaNode,
  options: ExtractSpecOptions = {},
): FigmaNodeSpec {
  const maxDepth = options.maxDepth ?? 6;
  const maxNodes = options.maxNodes ?? 200;
  const counter = { count: 0 };
  return walk(raw, 0, maxDepth, maxNodes, counter)!;
}

function walk(
  raw: RawFigmaNode,
  depth: number,
  maxDepth: number,
  maxNodes: number,
  counter: { count: number },
): FigmaNodeSpec | null {
  // 跳过隐藏节点
  if (raw.visible === false) return null;
  // 跳过无视觉意义类型
  if (raw.type === 'SLICE') return null;

  if (counter.count >= maxNodes) return null;
  counter.count += 1;

  const spec: FigmaNodeSpec = {
    id: raw.id,
    name: raw.name,
    type: raw.type,
  };

  if (raw.absoluteBoundingBox) {
    spec.box = roundBox(raw.absoluteBoundingBox);
  }
  if (raw.opacity !== undefined && raw.opacity < 1) {
    spec.opacity = round(raw.opacity, 2);
  }

  // fills
  const fills = extractFills(raw.fills);
  if (fills.length > 0) spec.fills = fills;

  // strokes
  const strokes = extractStrokes(raw.strokes, raw.strokeWeight, raw.strokeAlign);
  if (strokes.length > 0) spec.strokes = strokes;

  // cornerRadius
  if (raw.rectangleCornerRadii && raw.rectangleCornerRadii.length === 4) {
    // 四个角不完全一致才输出数组
    const [a, b, c, d] = raw.rectangleCornerRadii;
    if (a === b && b === c && c === d) {
      if (a > 0) spec.cornerRadius = a;
    } else {
      spec.cornerRadius = raw.rectangleCornerRadii;
    }
  } else if (raw.cornerRadius !== undefined && raw.cornerRadius > 0) {
    spec.cornerRadius = raw.cornerRadius;
  }

  // effects
  const effects = extractEffects(raw.effects);
  if (effects.length > 0) spec.effects = effects;

  // TEXT 专用
  if (raw.type === 'TEXT' && raw.characters !== undefined) {
    const textColor = fills[0]?.color;
    spec.text = {
      characters: raw.characters,
      style: extractTextStyle(raw.style, textColor),
    };
    // TEXT 节点的 fills 已并入 text.style.color，从顶层删掉避免冗余
    delete spec.fills;
  }

  // children 递归
  if (raw.children && raw.children.length > 0 && depth < maxDepth) {
    const kids: FigmaNodeSpec[] = [];
    for (const child of raw.children) {
      if (counter.count >= maxNodes) break;
      const c = walk(child, depth + 1, maxDepth, maxNodes, counter);
      if (c) kids.push(c);
    }
    if (kids.length > 0) spec.children = kids;
  }

  return spec;
}

// ═══════════════════════════════════════════════════════════════════════════
// 字段提取子函数
// ═══════════════════════════════════════════════════════════════════════════

function extractFills(raws: RawPaint[] | undefined): FigmaFill[] {
  if (!raws) return [];
  const out: FigmaFill[] = [];
  for (const p of raws) {
    if (p.visible === false) continue;
    const fill: FigmaFill = { type: p.type };
    if (p.type === 'SOLID' && p.color) {
      fill.color = paintColor(p.color, p.opacity);
    } else if (p.type.startsWith('GRADIENT') && p.gradientStops) {
      fill.gradientStops = p.gradientStops.map((s) => ({
        position: round(s.position, 2),
        color: paintColor(s.color, p.opacity),
      }));
    } else if (p.type === 'IMAGE' && p.imageRef) {
      fill.imageRef = p.imageRef;
    }
    out.push(fill);
  }
  return out;
}

function extractStrokes(
  raws: RawPaint[] | undefined,
  weight: number | undefined,
  align: string | undefined,
): FigmaStroke[] {
  if (!raws) return [];
  const out: FigmaStroke[] = [];
  for (const p of raws) {
    if (p.visible === false) continue;
    if (p.type !== 'SOLID' || !p.color) continue; // 只支持 SOLID 描边
    const stroke: FigmaStroke = {
      color: paintColor(p.color, p.opacity),
    };
    if (weight !== undefined) stroke.weight = weight;
    if (align) stroke.align = align;
    out.push(stroke);
  }
  return out;
}

function extractEffects(raws: RawEffect[] | undefined): FigmaEffect[] {
  if (!raws) return [];
  const out: FigmaEffect[] = [];
  for (const e of raws) {
    if (e.visible === false) continue;
    const eff: FigmaEffect = { type: e.type };
    if (e.color) eff.color = paintColor(e.color);
    if (e.offset) eff.offset = { x: round(e.offset.x, 1), y: round(e.offset.y, 1) };
    if (e.radius !== undefined) eff.radius = round(e.radius, 1);
    if (e.spread !== undefined && e.spread !== 0) eff.spread = round(e.spread, 1);
    out.push(eff);
  }
  return out;
}

function extractTextStyle(
  raw: RawTextStyle | undefined,
  color: FigmaColor | undefined,
): FigmaTextStyle {
  const style: FigmaTextStyle = {};
  if (!raw) {
    if (color) style.color = color;
    return style;
  }
  if (raw.fontFamily) style.fontFamily = raw.fontFamily;
  if (raw.fontSize !== undefined) style.fontSize = round(raw.fontSize, 1);
  if (raw.fontWeight !== undefined) style.fontWeight = raw.fontWeight;
  if (raw.lineHeightPx !== undefined) style.lineHeightPx = round(raw.lineHeightPx, 1);
  if (raw.letterSpacing !== undefined && raw.letterSpacing !== 0) {
    style.letterSpacing = round(raw.letterSpacing, 2);
  }
  if (raw.textAlignHorizontal) style.textAlign = raw.textAlignHorizontal;
  if (color) style.color = color;
  return style;
}

// ═══════════════════════════════════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════════════════════════════════

function paintColor(
  c: { r: number; g: number; b: number; a?: number },
  paintOpacity?: number,
): FigmaColor {
  const hex = rgbToHex(c.r, c.g, c.b);
  const alpha = (c.a ?? 1) * (paintOpacity ?? 1);
  const out: FigmaColor = { hex };
  if (alpha < 1) out.opacity = round(alpha, 2);
  return out;
}

function rgbToHex(r: number, g: number, b: number): string {
  const to255 = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`.toUpperCase();
}

function roundBox(b: { x: number; y: number; width: number; height: number }): FigmaBox {
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  };
}

function round(n: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}
