'use client';

/**
 * ManualDrawOverlay —— 手工标注单框拖拽层
 * ─────────────────────────────────────────────────
 * 使用：在 ImagePane 上叠加一层（inset-0），当 mode === 'drawing' 时
 * 允许用户拖拽画一个矩形，松手后调用 onDrawn(rect) 上抛。
 *
 * 也承担 draftRect 的只读展示：当 mode === 'editing' 且传入 draftRect 时，
 * 显示紫色虚线框（不可交互，让用户"重新圈选"回到 drawing 态即可）。
 *
 * 与 RegionOverlayEditor 的关系：完全独立，避免相互干扰。
 *   - RegionOverlayEditor 只在 annotationMode='annotate' 时激活
 *   - ManualDrawOverlay 只在 manualMode='drawing' 时激活
 *   - 两者互斥：进入手工标注模式时，外部应把 annotationMode 切到 'view'
 */

import { useRef, useState } from 'react';
import type { NormalizedRect } from '@/lib/crossPlatform/types';
import { useInverseScale } from '@/components/workbench/CanvasScaleContext';

const MIN_SIZE = 0.02;
const DRAFT_COLOR = '#a855f7'; // 紫色，区分 AI/手工

interface ManualDrawOverlayProps {
  /** 'drawing' → 十字光标 + 拖拽画框；'editing' → 只显示 draftRect；其他 → 完全被动 */
  mode: 'idle' | 'drawing' | 'editing';
  /** 编辑态下要展示的草稿框（归一化坐标） */
  draftRect?: NormalizedRect | null;
  /** 图片原始像素尺寸（用于标签显示 px） */
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  /** 松手回调 */
  onDrawn?: (rect: NormalizedRect) => void;
}

export default function ManualDrawOverlay({
  mode,
  draftRect,
  imageNaturalWidth,
  imageNaturalHeight,
  onDrawn,
}: ManualDrawOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ghost, setGhost] = useState<NormalizedRect | null>(null);
  const inv = useInverseScale();

  const normPos = (e: React.PointerEvent): { x: number; y: number } => {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };

  const makeRect = (a: { x: number; y: number }, b: { x: number; y: number }): NormalizedRect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode !== 'drawing' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = normPos(e);
    drawStart.current = pos;
    setIsDrawing(true);
    setGhost({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !drawStart.current) return;
    setGhost(makeRect(drawStart.current, normPos(e)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || !drawStart.current) return;
    setIsDrawing(false);
    const rect = makeRect(drawStart.current, normPos(e));
    drawStart.current = null;
    setGhost(null);
    if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
      onDrawn?.(rect);
    }
  };

  // 决定当前显示的框：拖拽中用 ghost，编辑态用 draftRect
  const displayRect = ghost ?? (mode === 'editing' ? draftRect ?? null : null);

  const showLabel = displayRect && imageNaturalWidth && imageNaturalHeight;
  const labelText = displayRect
    ? `${Math.round(displayRect.x * (imageNaturalWidth ?? 0))},${Math.round(
        displayRect.y * (imageNaturalHeight ?? 0),
      )} · ${Math.round(displayRect.width * (imageNaturalWidth ?? 0))}×${Math.round(
        displayRect.height * (imageNaturalHeight ?? 0),
      )} px`
    : '';

  // idle 态：不渲染任何东西，也不占据 pointer 事件
  if (mode === 'idle') return null;

  return (
    <div
      ref={overlayRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: mode === 'drawing' ? 'crosshair' : 'default',
        // drawing 态显示蓝色描边提示
        outline: mode === 'drawing' ? `2px dashed ${DRAFT_COLOR}` : undefined,
        outlineOffset: '-2px',
        // 只在 drawing 或有 draftRect 时接收 pointer；editing 态不阻塞下层
        pointerEvents: mode === 'drawing' ? 'auto' : 'none',
        borderRadius: 'inherit',
      }}
    >
      {displayRect && (
        <div
          style={{
            position: 'absolute',
            left: `${displayRect.x * 100}%`,
            top: `${displayRect.y * 100}%`,
            width: `${displayRect.width * 100}%`,
            height: `${displayRect.height * 100}%`,
            border: `2px dashed ${DRAFT_COLOR}`,
            background: 'rgba(168, 85, 247, 0.08)',
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          {showLabel && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translate(0, -100%) scale(${inv})`,
                transformOrigin: 'left bottom',
                background: DRAFT_COLOR,
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px 4px 4px 0',
                whiteSpace: 'nowrap',
                fontFamily: 'ui-monospace, monospace',
                marginBottom: 2,
              }}
            >
              📝 {labelText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
