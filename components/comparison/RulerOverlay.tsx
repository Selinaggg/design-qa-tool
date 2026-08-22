'use client';

/**
 * RulerOverlay —— 在图片 pane 上下左边贴刻度尺
 *
 * ⚠️ 方案 B 变更：尺子刻度不再是「源像素」，而是「逻辑单位」（pt / dp / px）。
 * 三张图分辨率各异（iOS @2x=750 宽 / Android @3x=1080 宽 / 设计稿 @1x=375 宽）
 * 但逻辑宽度都对齐到 375~412 附近，用逻辑单位后两把尺子刻度基准一致，
 * 用户可以横向对比 "y=826" 这类坐标。
 *
 * 特性：
 * - 传入 imageNaturalWidth/Height（源像素），组件内部按 unitScale 折算成逻辑单位
 * - 主刻度按 100/50 逻辑单位分档；小刻度自适应
 * - 数字始终水平；左尺数字旋转 -90 度节省空间
 * - 完全脱离图内空间（负边距 / 绝对定位到父 pane），不遮挡图片内容
 * - 尺子起点角标显示单位 + scale（如 "pt @2x"），方便用户读懂
 */

import { useEffect, useRef, useState } from 'react';
import type { RulerUnit } from '@/lib/rulerScale';

interface RulerOverlayProps {
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** 尺子颜色主题 */
  accentColor?: string;
  /** 逻辑单位（pt / dp / px）；默认 px（旧行为） */
  unit?: RulerUnit;
  /** 图内 1 源像素 = 1 / unitScale 逻辑单位；例如 @2x 截图 unitScale=2；默认 1（旧行为） */
  unitScale?: number;
  /** 显示在起点角标里的 scale label，如 "@2x"；默认根据 unitScale 推断 */
  scaleLabel?: string;
}

const RULER_SIZE = 18; // 尺子厚度 (px)

export default function RulerOverlay({
  imageNaturalWidth,
  imageNaturalHeight,
  accentColor = '#64748b',
  unit = 'px',
  unitScale = 1,
  scaleLabel,
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

  // 源图逻辑宽/高（例如 iOS @2x 750px → 375pt）
  const safeScale = unitScale > 0 ? unitScale : 1;
  const logicalWidth = imageNaturalWidth / safeScale;
  const logicalHeight = imageNaturalHeight / safeScale;

  // 每逻辑单位对应几个屏幕像素（= 显示宽 / 逻辑宽）
  const screenPerUnitX = rendered.w > 0 && logicalWidth > 0 ? rendered.w / logicalWidth : 0;
  const screenPerUnitY = rendered.h > 0 && logicalHeight > 0 ? rendered.h / logicalHeight : 0;

  // 根据当前缩放动态选择主刻度间隔（保证每档不小于 40 屏幕像素避免拥挤）
  const stepX = pickStep(screenPerUnitX);
  const stepY = pickStep(screenPerUnitY);

  // 起点角标 label：形如 "pt @2x" / "dp @3x" / "px"（scale=1 时不显示 @Nx，避免视觉噪音）
  const cornerLabel =
    safeScale === 1 && !scaleLabel
      ? unit
      : `${unit} ${scaleLabel ?? `@${Number.isInteger(safeScale) ? safeScale : safeScale.toFixed(2)}x`}`;

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
        {screenPerUnitX > 0 && renderTicks(logicalWidth, stepX, screenPerUnitX, 'x', accentColor)}
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
        {screenPerUnitY > 0 && renderTicks(logicalHeight, stepY, screenPerUnitY, 'y', accentColor)}
      </div>

      {/* 左上角小方块 —— 显示单位 + scale label（如 "pt @2x"） */}
      <div
        className="absolute flex items-center justify-center select-none"
        style={{
          top: -RULER_SIZE,
          left: -RULER_SIZE,
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: '#f8fafc',
          borderRight: `1px solid ${accentColor}33`,
          borderBottom: `1px solid ${accentColor}33`,
          fontSize: 8,
          color: accentColor,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          // scale label 可能较长（"pt @2.625x"）→ 竖排展示
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          padding: '2px 0',
          lineHeight: 1,
        }}
        title={`尺子单位：${cornerLabel}`}
      >
        {cornerLabel}
      </div>
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

/**
 * 生成刻度
 * @param totalUnits 尺子总长（逻辑单位数，例如 375pt）
 * @param step 主刻度间隔（逻辑单位）
 * @param screenPerUnit 每逻辑单位对应几个屏幕像素
 */
function renderTicks(
  totalUnits: number,
  step: number,
  screenPerUnit: number,
  axis: 'x' | 'y',
  color: string,
) {
  const ticks: React.ReactElement[] = [];
  const subStep = step / 5; // 5 个次刻度
  for (let v = 0; v <= totalUnits; v += subStep) {
    const isMajor = Math.abs(v % step) < 0.001;
    const screen = v * screenPerUnit;
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
