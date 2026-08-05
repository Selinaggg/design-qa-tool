'use client';

/**
 * RegionOverlayEditor —— 可复用的区域标注叠加层（不含 img）
 *
 * 用法：把它放在一个 relative 的图片容器里（overlay = inset-0），
 * 它负责所有的画框 / 拖拽 / 缩放 / 命名弹窗交互。
 *
 * 交互：
 *   - mode='view'    → 只显示区域框，允许 hover 高亮，无交互
 *   - mode='annotate'→ 允许在空白处拖拽画新框；点框拖拽移动；八个手柄 resize；画完新框弹命名弹窗
 *
 * 与 CanvasBoard 的兼容：
 *   - 区域框位置用归一化 %，随画板缩放
 *   - 名称标签、resize 手柄、命名弹窗用 useInverseScale() 反补偿，视觉尺寸恒定
 */

import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DrawingRegion, RegionType, NormalizedRect } from '@/lib/crossPlatform/types';
import { useInverseScale } from '@/components/workbench/CanvasScaleContext';

export const REGION_CONFIG: Record<RegionType, { label: string; color: string }> = {
  layout:      { label: '布局',  color: '#3B82F6' },
  content:     { label: '内容',  color: '#8B5CF6' },
  visual:      { label: '视觉',  color: '#10B981' },
  interaction: { label: '交互',  color: '#F59E0B' },
  component:   { label: '组件',  color: '#14B8A6' },
};

const MIN_SIZE   = 0.02;
const MIN_WIDTH  = 0.03;
const MIN_HEIGHT = 0.03;

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_DEFS: Array<{
  id: ResizeHandle;
  cursor: string;
  style: React.CSSProperties;
}> = [
  { id: 'nw', cursor: 'nwse-resize', style: { top: 0,    left: 0,     transform: 'translate(-50%,-50%)' } },
  { id: 'n',  cursor: 'ns-resize',   style: { top: 0,    left: '50%', transform: 'translate(-50%,-50%)' } },
  { id: 'ne', cursor: 'nesw-resize', style: { top: 0,    right: 0,    transform: 'translate(50%,-50%)'  } },
  { id: 'e',  cursor: 'ew-resize',   style: { top: '50%',right: 0,    transform: 'translate(50%,-50%)'  } },
  { id: 'se', cursor: 'nwse-resize', style: { bottom: 0, right: 0,    transform: 'translate(50%,50%)'   } },
  { id: 's',  cursor: 'ns-resize',   style: { bottom: 0, left: '50%', transform: 'translate(-50%,50%)'  } },
  { id: 'sw', cursor: 'nesw-resize', style: { bottom: 0, left: 0,     transform: 'translate(-50%,50%)'  } },
  { id: 'w',  cursor: 'ew-resize',   style: { top: '50%',left: 0,     transform: 'translate(-50%,-50%)' } },
];

function computeResizedRect(
  handle: ResizeHandle,
  orig: NormalizedRect,
  dx: number,
  dy: number,
): NormalizedRect {
  const right  = orig.x + orig.width;
  const bottom = orig.y + orig.height;
  let x = orig.x, y = orig.y, w = orig.width, h = orig.height;

  if (handle === 'nw' || handle === 'w' || handle === 'sw') {
    x = Math.max(0, Math.min(right - MIN_WIDTH, orig.x + dx));
    w = right - x;
  }
  if (handle === 'ne' || handle === 'e' || handle === 'se') {
    w = Math.max(MIN_WIDTH, Math.min(1 - orig.x, orig.width + dx));
  }
  if (handle === 'nw' || handle === 'n' || handle === 'ne') {
    y = Math.max(0, Math.min(bottom - MIN_HEIGHT, orig.y + dy));
    h = bottom - y;
  }
  if (handle === 'sw' || handle === 's' || handle === 'se') {
    h = Math.max(MIN_HEIGHT, Math.min(1 - orig.y, orig.height + dy));
  }

  return { x, y, width: w, height: h };
}

export interface RegionOverlayEditorProps {
  regions: DrawingRegion[];
  onRegionsChange: (regions: DrawingRegion[]) => void;
  /** 用于给新区域生成 id 的前缀（一般是 platform） */
  idPrefix: string;
  mode: 'view' | 'annotate';
  highlightedRegionName?: string | null;
  /** 图片自然像素宽/高（可选）：传入后，选中/激活的框会显示 x,y,w,h px */
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
}

export default function RegionOverlayEditor({
  regions,
  onRegionsChange,
  idPrefix,
  mode,
  highlightedRegionName,
  imageNaturalWidth,
  imageNaturalHeight,
}: RegionOverlayEditorProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const inv = useInverseScale();

  // ── Draw state ──
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [ghostRect, setGhostRect] = useState<NormalizedRect | null>(null);

  const [pendingRect, setPendingRect] = useState<NormalizedRect | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [pendingType, setPendingType] = useState<RegionType>('layout');

  // ── Move state ──
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingRect, setDraggingRect] = useState<NormalizedRect | null>(null);
  const dragStart = useRef<{ px: number; py: number; rx: number; ry: number } | null>(null);

  // ── Resize state ──
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingRect, setResizingRect] = useState<NormalizedRect | null>(null);
  const resizeStart = useRef<{
    handle: ResizeHandle;
    origRect: NormalizedRect;
    px: number;
    py: number;
  } | null>(null);

  // 当外部把 mode 从 annotate 切到 view，清掉进行中的状态
  useEffect(() => {
    if (mode === 'view') {
      setIsDrawing(false);
      drawStart.current = null;
      setGhostRect(null);
      setPendingRect(null);
      setDraggingId(null);
      setDraggingRect(null);
      setResizingId(null);
      setResizingRect(null);
    }
  }, [mode]);

  // ── Coordinate helper ──
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
    width:  Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  });

  // ── Overlay handlers: draw new region ──
  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode !== 'annotate' || pendingRect) return;
    // 只响应鼠标左键
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = normPos(e);
    drawStart.current = pos;
    setIsDrawing(true);
    setGhostRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !drawStart.current) return;
    setGhostRect(makeRect(drawStart.current, normPos(e)));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || !drawStart.current) return;
    setIsDrawing(false);
    const rect = makeRect(drawStart.current, normPos(e));
    drawStart.current = null;
    setGhostRect(null);
    if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
      setPendingRect(rect);
      setPendingName('');
      setPendingType('layout');
    }
  };

  // ── Region body: drag to move ──
  const handleRegionPointerDown = (e: React.PointerEvent, region: DrawingRegion) => {
    if (mode !== 'annotate' || pendingRect) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = normPos(e);
    setDraggingId(region.id);
    setDraggingRect(region.rect);
    dragStart.current = { px: pos.x, py: pos.y, rx: region.rect.x, ry: region.rect.y };
  };
  const handleRegionPointerMove = (e: React.PointerEvent, region: DrawingRegion) => {
    if (draggingId !== region.id || !dragStart.current) return;
    const pos = normPos(e);
    const dx = pos.x - dragStart.current.px;
    const dy = pos.y - dragStart.current.py;
    const newX = Math.max(0, Math.min(1 - region.rect.width,  dragStart.current.rx + dx));
    const newY = Math.max(0, Math.min(1 - region.rect.height, dragStart.current.ry + dy));
    setDraggingRect({ ...region.rect, x: newX, y: newY });
  };
  const handleRegionPointerUp = (region: DrawingRegion) => {
    if (draggingId === region.id && draggingRect) {
      onRegionsChange(regions.map((r) => (r.id === region.id ? { ...r, rect: draggingRect } : r)));
    }
    setDraggingId(null);
    setDraggingRect(null);
    dragStart.current = null;
  };

  // ── Resize handles ──
  const handleResizePointerDown = (
    e: React.PointerEvent,
    region: DrawingRegion,
    handle: ResizeHandle,
  ) => {
    if (mode !== 'annotate' || pendingRect) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = normPos(e);
    setResizingId(region.id);
    setResizingRect(region.rect);
    resizeStart.current = { handle, origRect: region.rect, px: pos.x, py: pos.y };
  };
  const handleResizePointerMove = (e: React.PointerEvent, region: DrawingRegion) => {
    e.stopPropagation();
    if (resizingId !== region.id || !resizeStart.current) return;
    const pos = normPos(e);
    const dx = pos.x - resizeStart.current.px;
    const dy = pos.y - resizeStart.current.py;
    setResizingRect(computeResizedRect(resizeStart.current.handle, resizeStart.current.origRect, dx, dy));
  };
  const handleResizePointerUp = (e: React.PointerEvent, region: DrawingRegion) => {
    e.stopPropagation();
    if (resizingId === region.id && resizingRect) {
      onRegionsChange(regions.map((r) => (r.id === region.id ? { ...r, rect: resizingRect } : r)));
    }
    setResizingId(null);
    setResizingRect(null);
    resizeStart.current = null;
  };

  // ── Region management ──
  const confirmRegion = () => {
    if (!pendingRect || !pendingName.trim()) return;
    onRegionsChange([
      ...regions,
      { id: `${idPrefix}-${Date.now()}`, name: pendingName.trim(), type: pendingType, rect: pendingRect },
    ]);
    setPendingRect(null);
  };
  const cancelRegion = () => setPendingRect(null);

  // ── Handle size 反补偿：让 resize 手柄始终 10×10 视觉 ──
  const handleSizePx = 10 * inv; // 反补偿后设置 width/height 的 px 值

  const isAnnotate = mode === 'annotate';

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{
        cursor: isAnnotate && !pendingRect && !draggingId && !resizingId ? 'crosshair' : 'default',
        // 标注模式下 overlay 需要接收 pointer 事件；浏览模式下不接收，让底层 badge overlay 起作用
        pointerEvents: isAnnotate ? 'auto' : 'none',
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 现有区域 */}
      {regions.map((region) => {
        const cfg = REGION_CONFIG[region.type];
        const isHighlighted = region.name === highlightedRegionName;
        const isDragging = region.id === draggingId;
        const isResizing = region.id === resizingId;
        const isActive = isDragging || isResizing;
        const rect =
          isDragging && draggingRect ? draggingRect :
          isResizing && resizingRect ? resizingRect :
          region.rect;

        return (
          <div
            key={region.id}
            style={{
              position: 'absolute',
              left:   `${rect.x * 100}%`,
              top:    `${rect.y * 100}%`,
              width:  `${rect.width  * 100}%`,
              height: `${rect.height * 100}%`,
              border: `2px solid ${cfg.color}`,
              backgroundColor: isActive
                ? `${cfg.color}30`
                : isHighlighted
                ? `${cfg.color}38`
                : `${cfg.color}18`,
              boxShadow: isActive
                ? `0 0 0 2px ${cfg.color}88`
                : isHighlighted
                ? `0 0 0 3px ${cfg.color}44`
                : 'none',
              transition: isActive ? 'none' : 'all 0.2s',
              // 标注模式下框可交互；浏览模式下框只装饰
              pointerEvents: isAnnotate ? 'auto' : 'none',
              cursor: isAnnotate ? 'move' : 'default',
              userSelect: 'none',
            }}
            onPointerDown={(e) => handleRegionPointerDown(e, region)}
            onPointerMove={(e) => handleRegionPointerMove(e, region)}
            onPointerUp={() => handleRegionPointerUp(region)}
            onPointerCancel={() => handleRegionPointerUp(region)}
          >
            {/* 名称标签（反补偿）；激活或高亮时追加 x,y,w,h px */}
            <span
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                fontSize: 10,
                lineHeight: '16px',
                background: cfg.color,
                color: 'white',
                padding: '0 4px',
                borderRadius: '0 0 4px 0',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
                zIndex: 1,
                transform: `scale(${inv})`,
                transformOrigin: '0 0',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {region.name}
              {(isActive || isHighlighted) && imageNaturalWidth && imageNaturalHeight && (
                <span style={{ opacity: 0.85, marginLeft: 6 }}>
                  {Math.round(rect.x * imageNaturalWidth)},
                  {Math.round(rect.y * imageNaturalHeight)} ·
                  {Math.round(rect.width * imageNaturalWidth)}×
                  {Math.round(rect.height * imageNaturalHeight)}px
                </span>
              )}
            </span>

            {/* Resize 手柄（仅标注模式；反补偿视觉大小） */}
            {isAnnotate &&
              HANDLE_DEFS.map((hcfg) => (
                <div
                  key={hcfg.id}
                  style={{
                    position: 'absolute',
                    width: handleSizePx,
                    height: handleSizePx,
                    background: 'white',
                    border: `${1.5 * inv}px solid ${cfg.color}`,
                    borderRadius: 2 * inv,
                    cursor: hcfg.cursor,
                    zIndex: 2,
                    ...hcfg.style,
                  }}
                  onPointerDown={(e) => handleResizePointerDown(e, region, hcfg.id)}
                  onPointerMove={(e) => handleResizePointerMove(e, region)}
                  onPointerUp={(e) => handleResizePointerUp(e, region)}
                  onPointerCancel={(e) => handleResizePointerUp(e, region)}
                />
              ))}
          </div>
        );
      })}

      {/* 待命名的框（虚线） */}
      {pendingRect && (
        <div
          style={{
            position: 'absolute',
            left:   `${pendingRect.x * 100}%`,
            top:    `${pendingRect.y * 100}%`,
            width:  `${pendingRect.width  * 100}%`,
            height: `${pendingRect.height * 100}%`,
            border: '2px dashed #64748B',
            backgroundColor: '#64748B18',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 画框时的 ghost */}
      {ghostRect && ghostRect.width > 0 && ghostRect.height > 0 && (
        <div
          style={{
            position: 'absolute',
            left:   `${ghostRect.x * 100}%`,
            top:    `${ghostRect.y * 100}%`,
            width:  `${ghostRect.width  * 100}%`,
            height: `${ghostRect.height * 100}%`,
            border: '1.5px dashed #94A3B8',
            backgroundColor: '#94A3B810',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 命名弹窗：Portal 挂到 body，脱离 overflow-hidden 祖先；位置贴合待命名框 */}
      {pendingRect && (
        <NamePopover
          overlayRef={overlayRef}
          rect={pendingRect}
          name={pendingName}
          type={pendingType}
          onNameChange={setPendingName}
          onTypeChange={setPendingType}
          onConfirm={confirmRegion}
          onCancel={cancelRegion}
        />
      )}
    </div>
  );
}

// ── 命名弹窗（Portal 到 body，视口坐标定位） ─────────────────────────────

function NamePopover({
  overlayRef,
  rect,
  name,
  type,
  onNameChange,
  onTypeChange,
  onConfirm,
  onCancel,
}: {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  rect: NormalizedRect;
  name: string;
  type: RegionType;
  onNameChange: (v: string) => void;
  onTypeChange: (v: RegionType) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // 弹窗视口坐标 + 尺寸
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const POP_W = 280;
  const POP_H = 130; // 估算高度，用于翻边判定
  const GAP = 8;

  useEffect(() => setMounted(true), []);

  // 计算位置：拿 overlay 的视口 rect + 归一化 rect → 框在视口的坐标；
  // 然后基于视口尺寸判定弹窗放在框的哪一边
  useLayoutEffect(() => {
    const compute = () => {
      const el = overlayRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;

      const boxLeft   = r.left + rect.x * r.width;
      const boxTop    = r.top  + rect.y * r.height;
      const boxRight  = boxLeft + rect.width  * r.width;
      const boxBottom = boxTop  + rect.height * r.height;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 优先放在右侧，装不下就放左侧；否则塞进视口
      let left = boxRight + GAP;
      if (left + POP_W > vw - 12) {
        left = boxLeft - POP_W - GAP;
      }
      if (left < 12) left = Math.max(12, Math.min(vw - POP_W - 12, boxLeft));

      // 优先放在下方，装不下就放上方
      let top = boxBottom + GAP;
      if (top + POP_H > vh - 12) {
        top = boxTop - POP_H - GAP;
      }
      if (top < 12) top = Math.max(12, Math.min(vh - POP_H - 12, boxTop));

      setPos({ left, top });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true); // capture: 任意祖先滚动都重算
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [overlayRef, rect.x, rect.y, rect.width, rect.height]);

  if (!mounted || !pos) return null;

  return createPortal(
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: POP_W,
        zIndex: 9999,
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #cbd5e1',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
        padding: 12,
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold text-blue-700 mb-2">为框选区域命名</p>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="例如：主按钮、标题区…"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 mb-2"
      />
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value as RegionType)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
        >
          {(Object.entries(REGION_CONFIG) as [RegionType, { label: string; color: string }][]).map(
            ([t, cfg]) => (
              <option key={t} value={t}>
                {cfg.label}
              </option>
            ),
          )}
        </select>
        <button
          onClick={onConfirm}
          disabled={!name.trim()}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
        >
          确认
        </button>
        <button
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 transition-colors"
        >
          取消
        </button>
      </div>
    </div>,
    document.body,
  );
}
