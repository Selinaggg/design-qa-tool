'use client';

/**
 * CanvasScaleContext —— 广播 CanvasBoard 当前 scale
 *
 * 子孙组件调用 useCanvasScale() 拿到 scale，用来做反向补偿：
 *   transform: scale(1 / canvasScale)
 * 从而在画板缩放时保持自身视觉尺寸恒定（Figma 风格：徽章、区域标签等 UI 元素始终清晰）。
 *
 * 默认值 1：不在 CanvasBoard 内时行为不变。
 */

import { createContext, useContext } from 'react';

export const CanvasScaleContext = createContext<number>(1);

export function useCanvasScale(): number {
  return useContext(CanvasScaleContext);
}

/** 反向补偿因子：canvasScale=0.3 时返回 3.33，用于 CSS transform: scale(x) */
export function useInverseScale(): number {
  const s = useCanvasScale();
  if (!s || s <= 0) return 1;
  return 1 / s;
}
