/**
 * 走查场景「忽略规则」的中央表：分组 + 预设 + prompt 文案
 *
 * 结构原则：
 *  - id 全局唯一（'dyn-numbers' / 'live-danmaku' 等），存进 AuditOptions.ignoreRules 数组
 *  - label 用户可见的短名（UI checkbox 显示）
 *  - hint 一句话说明用户会看到但不塞进 prompt
 *  - promptRule 是喂 AI 的忽略指令原文（不带序号 / 前缀）
 *  - examples 可选，2-3 条具体例子（并入 promptRule 一起给 AI）
 *
 * 修改指南：
 *  - 加维度：直接往下面加，UI 会自动出现在对应分组
 *  - 加分组：GROUPS 数组增一项 + 每条规则的 group id 对得上
 *  - 加预设：SCENARIO_PRESETS 增一项
 */

export type IgnoreRuleId =
  // 通用
  | 'dyn-numbers'
  | 'user-content'
  | 'status-badges'
  // 直播
  | 'live-danmaku'
  | 'live-gift-effects'
  | 'live-stream-view'
  | 'live-audience-avatars'
  // 电商
  | 'ecom-price'
  | 'ecom-stock-sales'
  | 'ecom-product-image'
  | 'ecom-rating'
  // 发布 / 编辑器
  | 'publish-preview-content'
  | 'publish-topic-tags'
  | 'publish-location'
  // 社区 / Feed
  | 'community-feed-content'
  | 'community-hot-numbers'
  | 'community-recommend-reason'
  // 短视频
  | 'video-frame'
  | 'video-subtitle'
  | 'video-play-numbers'
  | 'video-music-info'
  // IM / 聊天
  | 'im-message-content'
  | 'im-unread-count'
  | 'im-peer-avatar';

export type IgnoreRuleGroupId =
  | 'generic'
  | 'live'
  | 'ecommerce'
  | 'publish'
  | 'community'
  | 'video'
  | 'im';

export interface IgnoreRule {
  id: IgnoreRuleId;
  group: IgnoreRuleGroupId;
  label: string;
  hint?: string;
  /** 喂给 AI 的忽略指令原文 */
  promptRule: string;
  /** 可选：2-3 条具体例子，追加到 promptRule 后 */
  examples?: string[];
}

export interface IgnoreRuleGroup {
  id: IgnoreRuleGroupId;
  label: string;
  hint?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 分组
// ═══════════════════════════════════════════════════════════════════════════

export const IGNORE_GROUPS: IgnoreRuleGroup[] = [
  { id: 'generic', label: '通用忽略', hint: '所有场景推荐勾选' },
  { id: 'live', label: '直播场景' },
  { id: 'ecommerce', label: '电商场景' },
  { id: 'publish', label: '发布 / 编辑器场景' },
  { id: 'community', label: '社区 / Feed 场景' },
  { id: 'video', label: '短视频场景' },
  { id: 'im', label: 'IM / 聊天场景' },
];

// ═══════════════════════════════════════════════════════════════════════════
// 规则表
// ═══════════════════════════════════════════════════════════════════════════

export const IGNORE_RULES: IgnoreRule[] = [
  // ── 通用 ──
  {
    id: 'dyn-numbers',
    group: 'generic',
    label: '动态数字',
    hint: '点赞/评论/在线人数/倒计时/时间戳',
    promptRule: '动态数字（点赞数、评论数、粉丝数、在线人数、播放量、"99+"、倒计时、时间戳）',
    examples: [
      '设计稿"1.2万人在线"，实现"7481.2万赞" → 忽略',
      '设计稿"3分钟前"，实现"刚刚" → 忽略',
    ],
  },
  {
    id: 'user-content',
    group: 'generic',
    label: '用户生成内容',
    hint: '昵称/头像/bio/评论/发布标题',
    promptRule: '用户生成内容（用户名、头像、bio、评论文本、发布标题、个人签名）',
    examples: [
      '设计稿头像是灰色圆，实现是真人头像 → 忽略',
      '设计稿用户名"用户名称"，实现"小红书体育" → 忽略',
    ],
  },
  {
    id: 'status-badges',
    group: 'generic',
    label: '状态徽章文案',
    hint: 'LIVE / 新 / 热 / 置顶 等运行时标签',
    promptRule: '状态徽章文案（LIVE / 直播中 / 新 / 热 / 置顶 等运行时状态标签的文字，容器样式仍要检查）',
    examples: ['设计稿"LIVE"，实现"直播中" → 忽略（除非明确文案规范问题）'],
  },

  // ── 直播 ──
  {
    id: 'live-danmaku',
    group: 'live',
    label: '弹幕文本',
    hint: '弹幕滚动的具体文字',
    promptRule: '直播间弹幕文本（弹幕说了什么内容），但弹幕容器的字号/颜色/滚动区高度仍要检查',
  },
  {
    id: 'live-gift-effects',
    group: 'live',
    label: '礼物动效 / 礼物榜数字',
    hint: '飘屏礼物、榜单人数/金额',
    promptRule: '直播间礼物动效（飘屏 SVGA / 特效动画）、礼物榜的具体金额和数字，但礼物入口图标/按钮样式仍要检查',
  },
  {
    id: 'live-stream-view',
    group: 'live',
    label: '主播画面 / 直播间背景',
    hint: '直播画面本身内容',
    promptRule: '主播视频画面拍的是谁 / 直播间背景图案，但画面容器的圆角/尺寸/间距/边框仍要检查',
  },
  {
    id: 'live-audience-avatars',
    group: 'live',
    label: '观众头像列表',
    hint: '观众列表里具体是哪些头像',
    promptRule: '观众头像列表里具体的头像内容（用户是谁），但头像容器大小/排列间距/是否重叠仍要检查',
  },

  // ── 电商 ──
  {
    id: 'ecom-price',
    group: 'ecommerce',
    label: '价格数字',
    hint: '商品价格的具体数值',
    promptRule: '商品价格的具体数字，但价格字号/颜色/删除线样式仍要检查',
    examples: ['设计稿 ¥99，实现 ¥128 → 忽略（数据不同）；但价格红色变绿色 → 报'],
  },
  {
    id: 'ecom-stock-sales',
    group: 'ecommerce',
    label: '库存 / 销量 / 优惠数字',
    hint: '"已售 xx"、"仅剩 xx"、"立减 xx"',
    promptRule: '库存 / 销量 / 优惠折扣的具体数字（"已售 3.2万"、"仅剩 5 件"、"立减 20"），但文字样式和位置仍要检查',
  },
  {
    id: 'ecom-product-image',
    group: 'ecommerce',
    label: '商品主图 / SKU 图',
    hint: '商品图片拍的是什么',
    promptRule: '商品主图 / SKU 图 / 详情图里画的是什么商品，但图片容器尺寸/圆角/圆形/方形/裁剪比仍要检查',
  },
  {
    id: 'ecom-rating',
    group: 'ecommerce',
    label: '评分 / 评价数',
    hint: '星级数字、评价条数',
    promptRule: '商品评分具体分数、评价条数、"好评率 98%"等数字，但星星图标样式/评分排版仍要检查',
  },

  // ── 发布 ──
  {
    id: 'publish-preview-content',
    group: 'publish',
    label: '用户预览内容',
    hint: '编辑器里正在写的正文/图片/视频',
    promptRule: '用户在编辑器里输入的正文文字 / 已上传的图片视频内容本身，但输入框样式/占位符/字数计数样式仍要检查',
  },
  {
    id: 'publish-topic-tags',
    group: 'publish',
    label: '话题标签 / #tag 文案',
    hint: '具体选了什么话题',
    promptRule: '用户选择的话题标签具体文字内容，但 tag 圆角/背景色/字号/间距仍要检查',
  },
  {
    id: 'publish-location',
    group: 'publish',
    label: '位置 / 地点文字',
    hint: '选中的地点具体是哪里',
    promptRule: '发布时选择的位置文字（"上海市朝阳区..."），但位置图标/文字样式/截断规则仍要检查',
  },

  // ── 社区 / Feed ──
  {
    id: 'community-feed-content',
    group: 'community',
    label: 'Feed 卡片正文 / 图片内容',
    hint: '瀑布流里每张卡片的具体内容',
    promptRule: 'Feed / 瀑布流卡片的正文标题、封面图片、正文摘要具体是什么内容，但卡片本身尺寸/圆角/间距/多列布局仍要检查',
  },
  {
    id: 'community-hot-numbers',
    group: 'community',
    label: '热度数字 / 话题排行',
    hint: '"热度 xx万"、"话题排名 xx"',
    promptRule: '热度数字（"热度 3.2万讨论"）、话题排行名次数字，但排行榜卡片样式/图标仍要检查',
  },
  {
    id: 'community-recommend-reason',
    group: 'community',
    label: '推荐理由文案',
    hint: '"你可能感兴趣"、"根据xx推荐"',
    promptRule: '"你可能感兴趣" / "根据xx推荐" 之类的推荐理由具体文字，但推荐理由的文字样式和位置仍要检查',
  },

  // ── 短视频 ──
  {
    id: 'video-frame',
    group: 'video',
    label: '视频画面本身',
    hint: '视频里拍的是什么',
    promptRule: '视频画面拍的是什么内容，但视频容器全屏/裁剪比/播放器 UI 覆盖层仍要检查',
  },
  {
    id: 'video-subtitle',
    group: 'video',
    label: '视频字幕',
    hint: '字幕具体文字',
    promptRule: '视频字幕的具体文字，但字幕字号/颜色/描边/位置样式仍要检查',
  },
  {
    id: 'video-play-numbers',
    group: 'video',
    label: '播放数 / 点赞数',
    hint: '视频播放量、点赞、评论数字',
    promptRule: '视频播放数 / 点赞数 / 评论数具体数字，但数字字号/图标/间距仍要检查',
  },
  {
    id: 'video-music-info',
    group: 'video',
    label: '音乐信息',
    hint: '正在播的歌名/作者',
    promptRule: '视频背景音乐的歌名 / 作者名，但音符图标/滚动样式/背景动画仍要检查',
  },

  // ── IM ──
  {
    id: 'im-message-content',
    group: 'im',
    label: '消息内容',
    hint: '聊天记录的具体文字',
    promptRule: '聊天消息的具体文字内容，但气泡样式/圆角/间距/字号/文字颜色仍要检查',
  },
  {
    id: 'im-unread-count',
    group: 'im',
    label: '未读数',
    hint: '未读消息的具体数字',
    promptRule: '未读消息的具体数字（"3"、"99+"），但红点/胶囊样式/位置仍要检查',
  },
  {
    id: 'im-peer-avatar',
    group: 'im',
    label: '对方头像 / 昵称',
    hint: '聊天对象是谁',
    promptRule: '聊天对方的头像内容和具体昵称，但头像圆形/方形/尺寸/在线状态样式仍要检查',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 场景预设 —— 「一键勾选一整组」
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 每个预设 = 通用 3 条 + 该场景全部规则
 * 便捷入口用途；用户可后续手动微调，不锁定
 */
export const SCENARIO_PRESETS: Array<{
  id: string;
  label: string;
  rules: IgnoreRuleId[];
}> = [
  {
    id: 'generic',
    label: '通用',
    rules: rulesInGroup('generic'),
  },
  {
    id: 'live',
    label: '直播',
    rules: [...rulesInGroup('generic'), ...rulesInGroup('live')],
  },
  {
    id: 'ecommerce',
    label: '电商',
    rules: [...rulesInGroup('generic'), ...rulesInGroup('ecommerce')],
  },
  {
    id: 'publish',
    label: '发布',
    rules: [...rulesInGroup('generic'), ...rulesInGroup('publish')],
  },
  {
    id: 'community',
    label: '社区',
    rules: [...rulesInGroup('generic'), ...rulesInGroup('community')],
  },
  {
    id: 'video',
    label: '短视频',
    rules: [...rulesInGroup('generic'), ...rulesInGroup('video')],
  },
  {
    id: 'im',
    label: 'IM',
    rules: [...rulesInGroup('generic'), ...rulesInGroup('im')],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════════════════════════════════════

/** 获取某分组下的全部规则 id */
export function rulesInGroup(group: IgnoreRuleGroupId): IgnoreRuleId[] {
  return IGNORE_RULES.filter((r) => r.group === group).map((r) => r.id);
}

/** 默认规则 = 通用 3 条 */
export const DEFAULT_IGNORE_RULES: IgnoreRuleId[] = rulesInGroup('generic');

const RULE_BY_ID = new Map<string, IgnoreRule>(IGNORE_RULES.map((r) => [r.id, r]));

/** 根据 id 查规则；未知 id 返回 undefined（用于兼容旧数据） */
export function getRule(id: string): IgnoreRule | undefined {
  return RULE_BY_ID.get(id);
}

/** 校验并归一化：过滤掉无效 id，去重 */
export function sanitizeRuleIds(ids: readonly string[] | undefined): IgnoreRuleId[] {
  if (!ids) return [];
  const seen = new Set<IgnoreRuleId>();
  for (const id of ids) {
    const rule = RULE_BY_ID.get(id);
    if (rule) seen.add(rule.id);
  }
  return Array.from(seen);
}

/**
 * 从旧 AuditOptions（4 个 boolean 字段）迁移到新的 ignoreRules id 数组
 * 用于兼容老 session
 */
export function migrateLegacyIgnoreFlags(legacy: {
  ignoreDynamicNumbers?: boolean;
  ignoreUserContent?: boolean;
  ignoreMediaContent?: boolean;
  ignoreStatusBadges?: boolean;
}): IgnoreRuleId[] {
  const out: IgnoreRuleId[] = [];
  // 旧默认全 true（DEFAULT_OPTIONS）；只有显式 false 才排除
  if (legacy.ignoreDynamicNumbers !== false) out.push('dyn-numbers');
  if (legacy.ignoreUserContent !== false) out.push('user-content');
  if (legacy.ignoreStatusBadges !== false) out.push('status-badges');
  // 旧的 ignoreMediaContent 对应多个新规则（直播画面/商品图/视频画面等）
  // 迁移策略：如果显式勾了 → 补上"直播画面"作为最典型代表；用户可再手动勾其他
  if (legacy.ignoreMediaContent !== false) out.push('live-stream-view');
  return out;
}

/**
 * 从 AuditOptions 读出「有效的 ignoreRules id 数组」：
 *  - 优先用 options.ignoreRules（新字段）
 *  - 若没有 → 迁移 4 个旧 boolean 字段
 *  - 若旧字段全 undefined → 返回默认（通用 3 条）
 *
 * 是所有使用点（UI 初始化 / prompt 拼接 / 报告导出）的唯一入口
 */
export function resolveIgnoreRuleIds(options: {
  ignoreRules?: string[];
  ignoreDynamicNumbers?: boolean;
  ignoreUserContent?: boolean;
  ignoreMediaContent?: boolean;
  ignoreStatusBadges?: boolean;
}): IgnoreRuleId[] {
  if (options.ignoreRules && options.ignoreRules.length > 0) {
    return sanitizeRuleIds(options.ignoreRules);
  }
  // 兼容旧字段
  const hasLegacy =
    options.ignoreDynamicNumbers !== undefined ||
    options.ignoreUserContent !== undefined ||
    options.ignoreMediaContent !== undefined ||
    options.ignoreStatusBadges !== undefined;
  if (hasLegacy) return migrateLegacyIgnoreFlags(options);
  // 全空 → 默认通用 3 条
  return [...DEFAULT_IGNORE_RULES];
}
