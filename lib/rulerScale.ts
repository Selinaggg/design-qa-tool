/**
 * 尺子逻辑单位换算（方案 B）
 *
 * 背景：iOS / Android / 设计稿 三张图的**源像素维度**通常不同：
 *   - iOS 截图：iPhone 14 @2x = 750×1624 px（逻辑 390×844 pt）
 *   - Android 截图：Pixel 7 @2.625x ≈ 1080×2400 px（逻辑 412×915 dp）
 *   - 设计稿：一般 @1x 出稿，比如 375×812 pt
 *
 * 如果尺子只显示源像素，三把尺子的刻度基准不同（一个 750-wide 一个 375-wide），
 * 用户下意识把它们作为「公共标尺」用会误判——但源像素并不能横向比较。
 *
 * 方案 B：把三把尺子都换成**逻辑单位**（pt/dp/px），刻度基准立刻对齐。
 * scale 由「源图宽度 / 设备逻辑宽度」推断出来（四舍五入到 1/2/3 倍）。
 */

import type { DeviceProfile } from '@/lib/crossPlatform/types';

export type RulerUnit = 'pt' | 'dp' | 'px';

export interface RulerScale {
  /** 单位 label，用于尺子起点角标显示 */
  unit: RulerUnit;
  /** 图内 1 源像素 = 1 / scale 逻辑单位。scale=2 表示图是 @2x 截图 */
  scale: number;
  /** 用于角标显示，例如 "@2x" / "@3x" / "@1x" */
  scaleLabel: string;
}

/**
 * 根据「图片自然宽度」+「设备逻辑宽度」推断尺子的逻辑单位与倍率。
 *
 * @param imageWidth 图片自然宽度（源像素）
 * @param deviceProfile 该端设备 profile，含 viewport.width（逻辑单位宽度）；
 *                      如果是设计稿，传 undefined，默认按 @1x + px 处理
 * @param unit iOS→pt / Android→dp / 设计稿→px（可通过 platform 推断）
 */
export function deriveRulerScale(
  imageWidth: number,
  deviceProfile: DeviceProfile | null | undefined,
  unit: RulerUnit,
): RulerScale {
  if (!deviceProfile || imageWidth <= 0) {
    // 无 profile（例如设计稿）：直接用源像素，scale=1
    return { unit: 'px', scale: 1, scaleLabel: '@1x' };
  }

  const logicalWidth = deviceProfile.viewport.width;
  if (logicalWidth <= 0) {
    return { unit, scale: 1, scaleLabel: '@1x' };
  }

  // 原始倍率（浮点）
  const rawScale = imageWidth / logicalWidth;

  // 吸附到最近的常见倍率：1 / 1.5 / 2 / 2.5 / 3 / 3.5 / 4
  // Android 有 xxhdpi(3)/xxxhdpi(4)、iOS 主要是 2/3，覆盖足够
  const candidates = [1, 1.5, 2, 2.5, 2.625, 2.75, 3, 3.5, 4];
  const snapped = candidates.reduce((best, c) =>
    Math.abs(c - rawScale) < Math.abs(best - rawScale) ? c : best,
  );

  return {
    unit,
    scale: snapped,
    scaleLabel: formatScaleLabel(snapped),
  };
}

/**
 * 根据 platform 决定尺子应该用什么逻辑单位。
 * iOS → pt；Android → dp；其他（设计稿/web）→ px
 *
 * 特殊：design pane 如果传入了参照 profile，我们根据 profile.platform 决定单位
 *      （因为设计稿一般对齐 iOS/Android 某端）。这里返回默认 px，
 *      调用侧可用 unitFromDeviceProfile 覆盖。
 */
export function unitFromPlatform(platform: 'ios' | 'android' | 'design' | 'web'): RulerUnit {
  if (platform === 'ios') return 'pt';
  if (platform === 'android') return 'dp';
  return 'px';
}

/**
 * 从 DeviceProfile.platform 反查逻辑单位。设计稿 pane 用它比 unitFromPlatform 更准。
 */
export function unitFromDeviceProfile(profile: DeviceProfile | null | undefined): RulerUnit {
  if (!profile) return 'px';
  if (profile.platform === 'ios') return 'pt';
  if (profile.platform === 'android') return 'dp';
  return 'px';
}

function formatScaleLabel(scale: number): string {
  // 整数 → @2x；小数 → @2.625x（Android 常见）
  if (Number.isInteger(scale)) return `@${scale}x`;
  return `@${scale}x`;
}
