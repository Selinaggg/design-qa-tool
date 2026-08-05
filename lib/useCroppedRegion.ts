'use client';

/**
 * useCroppedRegion
 *
 * 从一张图片的 URL 按 NormalizedRect（0~1 归一化坐标）裁剪出一块区域，
 * 返回裁剪后的 data URL（用于卡片内缩略图展示）。
 *
 * - 懒加载：只有 enabled=true 且 rect 非空时才触发
 * - 内存复用：同 url 复用已加载的 HTMLImageElement，避免重复请求
 * - 裁剪边距：四周各扩展 PADDING（归一化），让区域不紧贴边缘，提供上下文
 * - 最小尺寸兜底：rect 宽/高 < MIN_SIZE 时扩展到 MIN_SIZE（避免裁出 1px 细条）
 */

import { useEffect, useState } from 'react';
import type { NormalizedRect } from '@/lib/crossPlatform/types';

/** 四周额外扩展的归一化比例（5% 上下文留白） */
const PADDING = 0.05;
/** 归一化最小尺寸（宽/高各至少 10%）*/
const MIN_SIZE = 0.10;
/** 裁剪输出的画布宽度（px）；高度按比例 */
const OUTPUT_WIDTH = 280;

// 全局 img 缓存，避免同 URL 重复 new Image()
const imgCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url)!);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imgCache.set(url, img); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

function expandRect(rect: NormalizedRect): NormalizedRect {
  let { x, y, width, height } = rect;
  // 最小尺寸保障
  if (width < MIN_SIZE) { x -= (MIN_SIZE - width) / 2; width = MIN_SIZE; }
  if (height < MIN_SIZE) { y -= (MIN_SIZE - height) / 2; height = MIN_SIZE; }
  // 四周加边距
  x -= PADDING; y -= PADDING;
  width += PADDING * 2; height += PADDING * 2;
  // 钳制到 [0, 1]
  x = Math.max(0, x); y = Math.max(0, y);
  if (x + width > 1) width = 1 - x;
  if (y + height > 1) height = 1 - y;
  return { x, y, width, height };
}

export function useCroppedRegion(
  imageUrl: string | null | undefined,
  rect: NormalizedRect | null | undefined,
  enabled = true,
): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !imageUrl || !rect) { setDataUrl(null); return; }

    let cancelled = false;
    const expanded = expandRect(rect);

    loadImage(imageUrl).then((img) => {
      if (cancelled) return;
      const srcX = expanded.x * img.naturalWidth;
      const srcY = expanded.y * img.naturalHeight;
      const srcW = expanded.width * img.naturalWidth;
      const srcH = expanded.height * img.naturalHeight;

      const outW = OUTPUT_WIDTH;
      const outH = Math.round((srcH / srcW) * outW);

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
      if (!cancelled) setDataUrl(canvas.toDataURL('image/jpeg', 0.85));
    }).catch(() => { if (!cancelled) setDataUrl(null); });

    return () => { cancelled = true; };
  }, [imageUrl, rect, enabled]);

  return dataUrl;
}
