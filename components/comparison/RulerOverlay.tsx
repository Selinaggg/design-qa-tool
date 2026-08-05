'use client';

/**
 * RulerOverlay —— 在图片 pane 上下左边贴刻度尺（真实像素单位）
 *
 * - 尺子宽度基于图片自然像素数
 * - 主刻度按 100/50 px 分档；小刻度自适应
 * - 数字始终水平；左尺数字旋转 -90 度节省空间
 * - 完全脱离图内空间（负边距 / 绝对定位到父 pane），不遮挡图片内容
 */

import { useEffect, useRef, useState } from 'react';

interface RulerOverlayProps {
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** 尺子颜色主题 */
  accentColor?: string;
}

const RULER_SIZE = 18; // 尺子厚度 (px)

export default function RulerOverlay({
  imageNaturalWidth,
  imageNaturalHeight,
  accentColor = '#64748b',
}: RulerOverlayProps) {
  // 实测图片当前显示宽/高，才能算出"每像素对应几个屏幕像素"
  const parentRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = parentRef.current?.parentElement;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRendered({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 每图内像素对应的屏幕像素
  const scaleX = rendered.w > 0 ? rendered.w / imageNaturalWidth : 0;
  const scaleY = rendered.h > 0 ? rendered.h / imageNaturalHeight : 0;

  // 根据当前缩放动态选择主刻度间隔（保证每档不小于 40 屏幕像素避免拥挤）
  const stepX = pickStep(scaleX);
  const stepY = pickStep(scaleY);

  return (
    <div ref={parentRef} className="pointer-events-none">
      {/* 顶部尺（水平） */}
      <div
        className="absolute left-0 right-0 flex items-end overflow-hidden"
        style={{
          top: -RULER_SIZE,
          height: RULER_SIZE,
          background: '#f8fafc',
          borderBottom: `1px solid ${accentColor}33`,
          fontSize: 9,
          color: accentColor,
        }}
      >
        {scaleX > 0 && renderTicks(imageNaturalWidth, stepX, scaleX, 'x', accentColor)}
      </div>

      {/* 左侧尺（垂直） */}
      <div
        className="absolute top-0 bottom-0 flex justify-end overflow-hidden"
        style={{
          left: -RULER_SIZE,
          width: RULER_SIZE,
          background: '#f8fafc',
          borderRight: `1px solid ${accentColor}33`,
          fontSize: 9,
          color: accentColor,
        }}
      >
        {scaleY > 0 && renderTicks(imageNaturalHeight, stepY, scaleY, 'y', accentColor)}
      </div>

      {/* 左上角小方块，避免十字交界处露底 */}
      <div
        className="absolute"
        style={{
          top: -RULER_SIZE,
          left: -RULER_SIZE,
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: '#f8fafc',
          borderRight: `1px solid ${accentColor}33`,
          borderBottom: `1px solid ${accentColor}33`,
        }}
      />
    </div>
  );
}

/** 根据缩放挑选主刻度间隔（保证每档屏幕像素 >= 40） */
function pickStep(scale: number): number {
  const candidates = [10, 20, 50, 100, 200, 500, 1000];
  for (const s of candidates) {
    if (s * scale >= 40) return s;
  }
  return 1000;
}

function renderTicks(
  totalImagePx: number,
  step: number,
  scale: number,
  axis: 'x' | 'y',
  color: string,
) {
  const ticks: React.ReactElement[] = [];
  const subStep = step / 5; // 5 个次刻度
  for (let v = 0; v <= totalImagePx; v += subStep) {
    const isMajor = Math.abs(v % step) < 0.001;
    const screen = v * scale;
    const tickLen = isMajor ? 8 : 4;
    if (axis === 'x') {
      ticks.push(
        <div
          key={v}
          className="absolute bottom-0"
          style={{
            left: screen,
            width: 1,
            height: tickLen,
            background: color,
            opacity: isMajor ? 0.8 : 0.4,
          }}
        />,
      );
      if (isMajor && v > 0) {
        ticks.push(
          <div
            key={`l-${v}`}
            className="absolute select-none"
            style={{
              left: screen + 2,
              bottom: RULER_SIZE - 12,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {v}
          </div>,
        );
      }
    } else {
      ticks.push(
        <div
          key={v}
          className="absolute right-0"
          style={{
            top: screen,
            height: 1,
            width: tickLen,
            background: color,
            opacity: isMajor ? 0.8 : 0.4,
          }}
        />,
      );
      if (isMajor && v > 0) {
        ticks.push(
          <div
            key={`l-${v}`}
            className="absolute select-none"
            style={{
              top: screen + 2,
              right: RULER_SIZE - 2,
              transform: 'rotate(-90deg)',
              transformOrigin: 'right top',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            {v}
          </div>,
        );
      }
    }
  }
  return ticks;
}
