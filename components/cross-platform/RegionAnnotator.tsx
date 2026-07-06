'use client';

import { useState, useRef } from 'react';
import type { ImageFile } from '@/types';
import type { DrawingRegion, RegionType, NormalizedRect } from '@/lib/crossPlatform/types';

// ── Region type config ────────────────────────────────────────────────────────

export const REGION_CONFIG: Record<RegionType, { label: string; color: string }> = {
  layout:      { label: '布局',  color: '#3B82F6' },
  content:     { label: '内容',  color: '#8B5CF6' },
  visual:      { label: '视觉',  color: '#10B981' },
  interaction: { label: '交互',  color: '#F59E0B' },
  component:   { label: '组件',  color: '#14B8A6' },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_SIZE   = 0.02; // minimum for newly drawn regions
const MIN_WIDTH  = 0.03; // minimum width after resize
const MIN_HEIGHT = 0.03; // minimum height after resize

// ── Resize handle types & config ──────────────────────────────────────────────

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

// ── Resize math (pure, no side-effects) ───────────────────────────────────────
//
// Each handle moves one or two edges. The opposing edge stays fixed.
// Strategy per edge direction:
//   Left  edge moves → clamp new x in [0, right - MIN_WIDTH],  w = right - x
//   Right edge moves → clamp new w in [MIN_WIDTH, 1 - orig.x]
//   Top   edge moves → clamp new y in [0, bottom - MIN_HEIGHT], h = bottom - y
//   Bottom edge moves → clamp new h in [MIN_HEIGHT, 1 - orig.y]

function computeResizedRect(
  handle: ResizeHandle,
  orig: NormalizedRect,
  dx: number,
  dy: number,
): NormalizedRect {
  const right  = orig.x + orig.width;
  const bottom = orig.y + orig.height;

  let x = orig.x, y = orig.y, w = orig.width, h = orig.height;

  // Left edge moves: nw, w, sw
  if (handle === 'nw' || handle === 'w' || handle === 'sw') {
    x = Math.max(0, Math.min(right - MIN_WIDTH, orig.x + dx));
    w = right - x;
  }
  // Right edge moves: ne, e, se
  if (handle === 'ne' || handle === 'e' || handle === 'se') {
    w = Math.max(MIN_WIDTH, Math.min(1 - orig.x, orig.width + dx));
  }
  // Top edge moves: nw, n, ne
  if (handle === 'nw' || handle === 'n' || handle === 'ne') {
    y = Math.max(0, Math.min(bottom - MIN_HEIGHT, orig.y + dy));
    h = bottom - y;
  }
  // Bottom edge moves: sw, s, se
  if (handle === 'sw' || handle === 's' || handle === 'se') {
    h = Math.max(MIN_HEIGHT, Math.min(1 - orig.y, orig.height + dy));
  }

  return { x, y, width: w, height: h };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RegionAnnotatorProps {
  image: ImageFile;
  regions: DrawingRegion[];
  onRegionsChange: (regions: DrawingRegion[]) => void;
  platform: 'ios' | 'android';
  highlightedRegionName?: string | null;
}

export default function RegionAnnotator({
  image,
  regions,
  onRegionsChange,
  platform,
  highlightedRegionName,
}: RegionAnnotatorProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Draw state ───────────────────────────────────────────────────────────
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [ghostRect, setGhostRect] = useState<NormalizedRect | null>(null);

  // Pending region (drawn but not yet named)
  const [pendingRect, setPendingRect] = useState<NormalizedRect | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [pendingType, setPendingType] = useState<RegionType>('layout');

  // ── Move state ───────────────────────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingRect, setDraggingRect] = useState<NormalizedRect | null>(null);
  const dragStart = useRef<{ px: number; py: number; rx: number; ry: number } | null>(null);

  // ── Resize state ─────────────────────────────────────────────────────────
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingRect, setResizingRect] = useState<NormalizedRect | null>(null);
  const resizeStart = useRef<{
    handle: ResizeHandle;
    origRect: NormalizedRect;
    px: number;
    py: number;
  } | null>(null);

  // ── Coordinate helper ────────────────────────────────────────────────────
  // Works for both overlay and child region/handle events because the overlay
  // is absolute inset-0 — its bounding rect equals the image area.
  const normPos = (e: React.PointerEvent): { x: number; y: number } => {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
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

  // ── Overlay handlers: draw new region on empty space ─────────────────────
  const handlePointerDown = (e: React.PointerEvent) => {
    if (pendingRect) return;
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

  // ── Region body handlers: drag to move ───────────────────────────────────
  const handleRegionPointerDown = (e: React.PointerEvent, region: DrawingRegion) => {
    e.stopPropagation(); // prevent overlay draw
    if (pendingRect) return;
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

  // ── Resize handle handlers ────────────────────────────────────────────────
  const handleResizePointerDown = (
    e: React.PointerEvent,
    region: DrawingRegion,
    handle: ResizeHandle,
  ) => {
    e.stopPropagation(); // prevent region body move and overlay draw
    if (pendingRect) return;
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

  // ── Region management ────────────────────────────────────────────────────
  const confirmRegion = () => {
    if (!pendingRect || !pendingName.trim()) return;
    onRegionsChange([
      ...regions,
      { id: `${platform}-${Date.now()}`, name: pendingName.trim(), type: pendingType, rect: pendingRect },
    ]);
    setPendingRect(null);
  };

  const cancelRegion = () => setPendingRect(null);

  const deleteRegion = (id: string) =>
    onRegionsChange(regions.filter((r) => r.id !== id));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* Image + annotation overlay */}
      <div
        className="relative overflow-hidden rounded-xl border border-slate-200 select-none touch-none"
        style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 0 0 / 12px 12px' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt="screenshot"
          draggable={false}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />

        {/* Pointer-capture overlay — fires only for clicks on empty space */}
        <div
          ref={overlayRef}
          className={`absolute inset-0 ${
            pendingRect || draggingId || resizingId ? 'cursor-default' : 'cursor-crosshair'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Existing regions */}
          {regions.map((region) => {
            const cfg        = REGION_CONFIG[region.type];
            const isHighlighted = region.name === highlightedRegionName;
            const isDragging    = region.id === draggingId;
            const isResizing    = region.id === resizingId;
            const isActive      = isDragging || isResizing;

            // Show live local rect during drag/resize; fall back to persisted rect
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
                  pointerEvents: 'auto',
                  cursor: 'move',
                  userSelect: 'none',
                }}
                onPointerDown={(e) => handleRegionPointerDown(e, region)}
                onPointerMove={(e) => handleRegionPointerMove(e, region)}
                onPointerUp={() => handleRegionPointerUp(region)}
                onPointerCancel={() => handleRegionPointerUp(region)}
              >
                {/* Region label */}
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
                  }}
                >
                  {region.name}
                </span>

                {/* 8 resize handles */}
                {HANDLE_DEFS.map((hcfg) => (
                  <div
                    key={hcfg.id}
                    style={{
                      position: 'absolute',
                      width: 10,
                      height: 10,
                      background: 'white',
                      border: `1.5px solid ${cfg.color}`,
                      borderRadius: 2,
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

          {/* Pending rect (awaiting name input) */}
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

          {/* Ghost rect while drawing */}
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
        </div>
      </div>

      {/* Name form (appears after drawing a new region) */}
      {pendingRect && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-blue-700">为框选区域命名</p>
          <input
            autoFocus
            type="text"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmRegion()}
            placeholder="例如：主按钮、标题区、表单区…"
            className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex items-center gap-2">
            <select
              value={pendingType}
              onChange={(e) => setPendingType(e.target.value as RegionType)}
              className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            >
              {(Object.entries(REGION_CONFIG) as [RegionType, { label: string; color: string }][]).map(
                ([type, cfg]) => (
                  <option key={type} value={type}>
                    {cfg.label}（{type}）
                  </option>
                ),
              )}
            </select>
            <button
              onClick={confirmRegion}
              disabled={!pendingName.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              确认
            </button>
            <button
              onClick={cancelRegion}
              className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Region list */}
      {regions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {regions.map((region) => {
            const cfg = REGION_CONFIG[region.type];
            return (
              <div
                key={region.id}
                className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200"
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="flex-1 text-sm text-slate-700 truncate">{region.name}</span>
                <span className="text-xs text-slate-400">{cfg.label}</span>
                <span className="text-xs text-slate-300 tabular-nums hidden sm:block">
                  {Math.round(region.rect.x * 100)},{Math.round(region.rect.y * 100)}{' '}
                  {Math.round(region.rect.width * 100)}×{Math.round(region.rect.height * 100)}
                </span>
                <button
                  onClick={() => deleteRegion(region.id)}
                  className="text-slate-300 hover:text-red-400 transition-colors font-medium leading-none ml-1"
                  aria-label="删除区域"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!pendingRect && regions.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-1">
          在截图上拖拽框选区域，然后输入名称和类型
        </p>
      )}
    </div>
  );
}
