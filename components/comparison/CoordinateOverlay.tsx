'use client';

/**
 * CoordinateOverlay —— 完全被动的图内坐标读数层
 *
 * 关键设计：
 * - `pointerEvents: 'none'`：不吞事件，不阻挡下层 RegionOverlayEditor 画框
 * - 通过监听 `parentElement`（= pane div，一定是 relative + 有明确边界）的 mousemove
 *   来判定光标是否在图内、计算图内坐标
 * - 视觉元素全部走 `useInverseScale()` 反补偿，画板缩放到 25% 时依旧清晰
 */

import { useEffect, useRef, useState } from 'react';
import { useInverseScale } from '@/components/workbench/CanvasScaleContext';

interface CoordinateOverlayProps {
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** 十字线 + chip 底色 */
  accentColor?: string;
  /** chip 文字色 */
  accentTextColor?: string;
}

export default function CoordinateOverlay({
  imageNaturalWidth,
  imageNaturalHeight,
  accentColor = '#2563eb',
  accentTextColor = '#ffffff',
}: CoordinateOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const inv = useInverseScale(); // 画板整体缩放的倒数：画板 25% → inv = 4
  const [pos, setPos] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    // 监听 parentElement（pane div）而不是自己：这样即便本层 pointerEvents:none 也能拿到坐标
    const layer = layerRef.current;
    const parent = layer?.parentElement;
    if (!parent) return;

    const handleMove = (e: MouseEvent) => {
      const r = parent.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        setPos(null);
        return;
      }
      setPos({
        x: nx,
        y: ny,
        px: Math.round(nx * imageNaturalWidth),
        py: Math.round(ny * imageNaturalHeight),
      });
    };
    const handleLeave = () => setPos(null);

    parent.addEventListener('mousemove', handleMove);
    parent.addEventListener('mouseleave', handleLeave);
    return () => {
      parent.removeEventListener('mousemove', handleMove);
      parent.removeEventListener('mouseleave', handleLeave);
    };
  }, [imageNaturalWidth, imageNaturalHeight]);

  // 反补偿：视觉上恒定 = 屏幕像素恒定
  const lineThickness = Math.max(1, 1 * inv);      // 十字线：至少 1px 视觉
  const chipFontSize  = 11 * inv;
  const chipPadX      = 6  * inv;
  const chipPadY      = 3  * inv;
  const chipRadius    = 4  * inv;
  const chipOffset    = 10 * inv;
  const chipMaxW      = 160 * inv;

  return (
    <div
      ref={layerRef}
      className="absolute inset-0"
      style={{
        pointerEvents: 'none', // 关键：不吃事件，让 RegionOverlayEditor 正常画框
        zIndex: 6,
      }}
    >
      {pos && (
        <>
          {/* 竖线 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${pos.x * 100}%`,
              width: lineThickness,
              marginLeft: -lineThickness / 2,
              background: accentColor,
              opacity: 0.55,
            }}
          />
          {/* 横线 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${pos.y * 100}%`,
              height: lineThickness,
              marginTop: -lineThickness / 2,
              background: accentColor,
              opacity: 0.55,
            }}
          />
          {/* 坐标 chip：贴光标右下；反补偿字号，画板缩放下依然清晰 */}
          <div
            style={{
              position: 'absolute',
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              transform: `translate(${chipOffset}px, ${chipOffset}px)`,
              transformOrigin: '0 0',
              padding: `${chipPadY}px ${chipPadX}px`,
              borderRadius: chipRadius,
              background: accentColor,
              color: accentTextColor,
              fontSize: chipFontSize,
              lineHeight: 1.2,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              boxShadow: `0 ${2 * inv}px ${8 * inv}px rgba(15,23,42,0.25)`,
              maxWidth: chipMaxW,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pos.px}, {pos.py} px
          </div>
        </>
      )}
    </div>
  );
}
