import type { BatchScreenshotItem, Board } from '@/components/workbench/types';
import type { ImageFile } from '@/types';

/**
 * 平台后缀识别规则（大小写不敏感）
 * key 越靠前优先级越高；避免"iphone"落入 android 分支等冲突
 *
 * 支持的分隔符前缀：_ - . 空格，或独立词（word boundary）
 * 允许在文件名任意位置出现（前 / 中 / 尾），但优先剥离尾部匹配
 */
const PLATFORM_TOKENS: Array<{ token: string; platform: 'ios' | 'android' }> = [
  // iOS 系列
  { token: 'iphone', platform: 'ios' },
  { token: 'ios', platform: 'ios' },
  { token: '苹果', platform: 'ios' },
  { token: 'apple', platform: 'ios' },
  // Android 系列
  { token: 'android', platform: 'android' },
  { token: 'droid', platform: 'android' },
  { token: '安卓', platform: 'android' },
  // 兼容一些常见拼写
  { token: 'and', platform: 'android' }, // 谨慎：只在分隔符之间匹配
];

/** 去掉扩展名（保留最后一个 . 前的部分） */
function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return name;
  return name.slice(0, idx);
}

/** 去掉基名前后的分隔符（_ - . 空格） */
function trimSeparators(s: string): string {
  return s.replace(/^[\s\-_.]+|[\s\-_.]+$/g, '');
}

/**
 * 从文件名解析平台 + 基名（去掉平台标记后的画板名）
 *
 * 例：
 *  - "直播间_iOS.png"    → { platform: 'ios',     baseName: '直播间' }
 *  - "cart-android.jpg"  → { platform: 'android', baseName: 'cart' }
 *  - "iPhone_首页.webp"  → { platform: 'ios',     baseName: '首页' }
 *  - "settings.png"      → { platform: null,      baseName: 'settings' }
 */
export function parsePlatformFromName(fileName: string): {
  platform: 'ios' | 'android' | null;
  baseName: string;
} {
  const stem = stripExtension(fileName);
  const lower = stem.toLowerCase();

  // 逐个 token 尝试匹配；用带分隔符边界的正则，避免 "android" 命中 "candroid"
  for (const { token, platform } of PLATFORM_TOKENS) {
    // 中文 token 不受 word boundary 限制，直接用简单包含 + 分隔符处理
    const isCJK = /[\u4e00-\u9fff]/.test(token);

    if (isCJK) {
      const idx = lower.indexOf(token);
      if (idx >= 0) {
        const before = stem.slice(0, idx);
        const after = stem.slice(idx + token.length);
        const baseName = trimSeparators(before + after) || stem;
        return { platform, baseName };
      }
      continue;
    }

    // 英文 token：word boundary（前后是分隔符 / 首尾 / 中文字符）
    const re = new RegExp(
      `(^|[\\s\\-_.\\u4e00-\\u9fff])${token}(?=$|[\\s\\-_.\\u4e00-\\u9fff])`,
      'i',
    );
    const m = lower.match(re);
    if (m && m.index !== undefined) {
      // 保留匹配前的分隔符字符（m[1]）到 before 里；剥离 token 本身
      const startOfToken = m.index + m[1].length;
      const before = stem.slice(0, startOfToken);
      const after = stem.slice(startOfToken + token.length);
      const baseName = trimSeparators(before + after) || stem;
      return { platform, baseName };
    }
  }

  return { platform: null, baseName: trimSeparators(stem) || stem };
}

/**
 * 分组结果：一个画板（baseName）对应的 iOS / Android 截图
 * - ios / android 分别记一张；如同 baseName 同平台有多张，后续挤到 extras
 * - platform 无法识别的截图会各自成组（key 唯一，ios/android 均为 null）
 */
export interface ScreenshotGroup {
  /** 稳定 key，用于 React key & 合并去重 */
  key: string;
  /** 画板显示名（可被用户编辑） */
  baseName: string;
  /** 是否能识别平台（false = 独立成组的未识别项） */
  recognized: boolean;
  ios: BatchScreenshotItem | null;
  android: BatchScreenshotItem | null;
  /** 冲突的重复项（同 baseName + 同平台多次上传时保留原信息用于提示） */
  extras: BatchScreenshotItem[];
}

/**
 * 按解析结果分组（纯函数：不修改传入 item）
 *  1. 若 item 已有 groupKey（用户重命名过或已解析），复用之
 *  2. 否则调 parsePlatformFromName（结果仅用于本次输出，不写回 item —— 副作用由调用方决定）
 *  3. 有 platform 的按 baseName.toLowerCase() 合并到同一组
 *  4. 无 platform 的各自单独一组
 *  5. 输出顺序：先识别成功的组（按首次出现顺序），再未识别的
 */
export function groupByBaseName(items: BatchScreenshotItem[]): ScreenshotGroup[] {
  const groups = new Map<string, ScreenshotGroup>();
  const unrecognized: ScreenshotGroup[] = [];

  for (const item of items) {
    // 惰性解析：仅在需要时调用 parsePlatformFromName
    let parsedCache: ReturnType<typeof parsePlatformFromName> | null = null;
    const parse = () => {
      if (!parsedCache) parsedCache = parsePlatformFromName(item.name);
      return parsedCache;
    };

    // platform 恒来自文件名解析（用户改名不影响平台识别）；若 item.platform 已被显式赋值则采纳
    const platform: 'ios' | 'android' | null =
      item.platform !== undefined ? item.platform : parse().platform;

    // baseName 优先用用户编辑过的 groupKey；否则从文件名解析
    const baseName: string =
      item.groupKey !== undefined ? item.groupKey : parse().baseName;

    if (!platform) {
      unrecognized.push({
        key: `unknown-${item.id}`,
        baseName,
        recognized: false,
        ios: null,
        android: null,
        extras: [item],
      });
      continue;
    }

    const key = baseName.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        baseName,
        recognized: true,
        ios: null,
        android: null,
        extras: [],
      };
      groups.set(key, group);
    }

    if (platform === 'ios') {
      if (group.ios) group.extras.push(item);
      else group.ios = item;
    } else {
      if (group.android) group.extras.push(item);
      else group.android = item;
    }
  }

  return [...groups.values(), ...unrecognized];
}

// ═══════════════════════════════════════════════════════════════════════════
// P2.6 · 从分组结果 + 设计稿映射 → Board[]（提交批量走查会话时用）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 把 UI 层的分组 + 设计稿映射转换为持久化的 Board[]
 *  - 只处理 recognized: true 的组（未识别的画板被丢弃）
 *  - 至少有一端截图（recognized 组必然满足）
 *  - platformMode：双端都有 → both；仅一端 → ios-only / android-only
 *  - designImage 从 designMap[group.key] 读取（可能为空）
 *  - firstAppearedVersion 固定 = 1（batch 会话首版）
 *  - 每个 board 分配稳定 uuid
 *
 * @param version 该批 boards 所属的版本号（P2.6 只用 v=1；P4 追加版本时会传其他值）
 */
export function buildBoardsFromGroups(
  groups: ScreenshotGroup[],
  designMap: Record<string, ImageFile>,
  version = 1,
): Board[] {
  const boards: Board[] = [];
  for (const g of groups) {
    if (!g.recognized) continue;

    const hasIos = !!g.ios;
    const hasAndroid = !!g.android;
    if (!hasIos && !hasAndroid) continue;

    const platformMode: Board['platformMode'] =
      hasIos && hasAndroid ? 'both' : hasIos ? 'ios-only' : 'android-only';

    const design = designMap[g.key] ?? null;

    boards.push({
      id: `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: g.baseName || '(未命名)',
      platformMode,
      iosImage: g.ios?.image ?? null,
      androidImage: g.android?.image ?? null,
      designImage: design,
      // designFigma 由 P3 阶段填充
      firstAppearedVersion: version,
    });
  }
  return boards;
}
