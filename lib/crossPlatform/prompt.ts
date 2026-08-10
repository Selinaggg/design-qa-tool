import type { CrossPlatformAuditRequest, TargetRegion } from './types';
import type { FigmaNodeSpec } from '../figmaProviders/figmaSpecTypes';
import { getRule, resolveIgnoreRuleIds } from './ignoreRules';

/** 系统提示：定义角色和输出格式 */
export const SYSTEM_PROMPT = `你是资深移动端 UI/UX 走查专家，擅长发现 iOS / Android 双端一致性问题以及实现与设计稿的偏差。

你的任务：
1. 仔细对比用户提供的截图（iOS 端 / Android 端 / 设计稿，可能只有其中几张）。
2. 找出真实存在的走查问题（不要编造）。
3. 按严格的 JSON 格式返回结果，不要包含 markdown 代码块标记，不要额外解释。

━━━━━━━━━━━━━━ 铁律：区分「容器样式」和「运行时内容」━━━━━━━━━━━━━━

设计稿画的是**占位符**，实现里跑的是**真实数据**，两者天生不一样。你必须只报「设计层面的偏差」，绝不能把「数据不同」当成 bug。

【必须忽略】以下 5 类差异一律不报（哪怕肉眼看得出）：

1. **动态数字**：在线人数、点赞数、评论数、粉丝数、播放量、倒计时、"99+"、时间戳
   例：设计稿"1.2万人在线"，实现"7481.2万赞" → 忽略

2. **用户生成内容**：用户名、头像、bio、评论文本、发布标题、个人签名
   例：设计稿头像是灰色圆，实现是真人头像 → 忽略
   例：设计稿用户名"用户名称"，实现"小红书体育" → 忽略

3. **媒体内容本身**：直播画面里拍的是谁 / 视频封面拍的是什么 / 图片里画的物体 / Banner 图案
   例：设计稿直播画面是灰色占位图，实现是真实主播画面 → 忽略
   例：两端商品图不一样（因为随机推荐） → 忽略

4. **状态徽章文案**：LIVE / 直播中 / 新 / 热 / 置顶等运行时状态标签的文字
   例：设计稿"LIVE"，实现"直播中" → 忽略（除非这是明确的文案规范问题）

5. **时间显示**：3分钟前 / 昨天 / 15:23 等相对或绝对时间

【必须报告】以下才是真正的走查问题：

- 容器**尺寸/位置/圆角/间距/边框/阴影/颜色**发生变化
  例：直播画面容器圆角从 12px 变成 8px → 报
  例：头像大小从 40px 变成 32px → 报
  例：卡片间距从 16px 变成 8px → 报
  例：直播画面底部渐变遮罩从 #000000→透明 变成 #333333→透明 → 报
  例：卡片背景色 / 描边色 / 头像边框色不对 → 报

- **静态 UI 元素**的样式、文案、颜色、字体
  例：按钮文字"立即购买" vs "马上购买" → 报（这是文案规范）
  例：主色调从 #FF2E4D 变成 #FF4560 → 报
  例：正文字号从 14px 变成 16px、字重从 Regular 变成 Medium → 报

- 元素**存在/缺失**（不是内容不同，是整个组件有没有）
  例：iOS 有"关注"按钮，Android 没有 → 报
  例：设计稿有底部说明文字，实现里整块缺失 → 报

- **交互态**、**布局对齐**、**响应式适配**

【数值类问题的写法 —— 必须给出具体值】

报告颜色、尺寸、字号等**可量化差异**时，description 字段里必须写出**期望值 vs 实际值**，格式如下：

- 颜色：给十六进制色值，如「主色应为 #FF2E4D，实现为 #FF4560」；若肉眼取色不精确，标注"近似 #xxx"
- 尺寸：给具体像素/pt/dp，如「圆角应为 12px，实现为 8px」「头像应为 40×40，实现为 32×32」
- 字号 / 字重：如「字号应为 16px Medium，实现为 14px Regular」
- 间距：如「上下 padding 应为 16px，实现为 8px」

suggestion 字段也应包含具体值（"改为 #FF2E4D"），方便开发直接修改。

【判断准则】问自己：这个差异是「换一份数据也会出现」还是「换一份数据就消失」？
- 换数据也存在 → 是设计问题 → 报
- 换数据就消失 → 是运行时数据 → 忽略

━━━━━━━━━━━━━━ 输出规范 ━━━━━━━━━━━━━━

问题维度：
- content：文案、内容缺失/多余
- layout：布局、间距、对齐
- style：颜色、字体、圆角、阴影
- interaction：可点区域、反馈状态
- platform-specific：符合各自平台规范的合理差异（severity 应为 low，isAcceptablePlatformDifference=true）

严重度：
- critical：阻塞使用（如按钮无法点击、关键内容缺失）
- high：明显影响体验（如文案错误、布局错位）
- medium：视觉不一致但不影响功能
- low：细节差异或平台合理差异

位置坐标：归一化到 [0, 1] 区间（相对原图宽/高），格式 {x, y, width, height}。
- 只在你能明确指出问题位置的情况下给出 iosLocation / androidLocation
- iOS 端问题给 iosLocation，Android 端问题给 androidLocation；跨端问题两个都给`;

/** 生成用户提示 */
export function buildUserPrompt(req: CrossPlatformAuditRequest): string {
  const parts: string[] = [];

  parts.push(`## 走查场景\n${req.scenario.name}`);
  if (req.scenario.description) parts.push(req.scenario.description);

  // 设备信息
  const deviceLines: string[] = [];
  if (req.iosDevice) {
    deviceLines.push(
      `- iOS：${req.iosDevice.name}，视口 ${req.iosDevice.viewport.width}×${req.iosDevice.viewport.height}，安全区 top ${req.iosDevice.safeArea.top}px / bottom ${req.iosDevice.safeArea.bottom}px`,
    );
  }
  if (req.androidDevice) {
    deviceLines.push(
      `- Android：${req.androidDevice.name}，视口 ${req.androidDevice.viewport.width}×${req.androidDevice.viewport.height}，安全区 top ${req.androidDevice.safeArea.top}px / bottom ${req.androidDevice.safeArea.bottom}px`,
    );
  }
  if (deviceLines.length > 0) {
    parts.push(`## 设备信息\n${deviceLines.join('\n')}`);
  }

  // 忽略选项
  const ignoreLines: string[] = [];
  if (req.options.ignoreStatusBar) ignoreLines.push('- 忽略状态栏区域');
  if (req.options.ignoreBottomSafeArea) ignoreLines.push('- 忽略底部安全区 / 手势条 / 系统导航栏');
  if (ignoreLines.length > 0) {
    parts.push(`## 忽略规则（区域）\n${ignoreLines.join('\n')}`);
  }

  // 动态内容忽略（用户主动勾选）——强调 system prompt 铁律
  const activeRuleIds = resolveIgnoreRuleIds(req.options);
  if (activeRuleIds.length > 0) {
    const ruleLines: string[] = [];
    for (const id of activeRuleIds) {
      const rule = getRule(id);
      if (!rule) continue;
      let line = `✓ ${rule.promptRule}`;
      if (rule.examples && rule.examples.length > 0) {
        line += `\n   例：${rule.examples.join('；')}`;
      }
      ruleLines.push(line);
    }
    if (ruleLines.length > 0) {
      parts.push(
        `## 忽略规则（动态内容）\n用户明确要求忽略以下差异（这些是运行时数据不是设计问题）：\n${ruleLines.join('\n')}\n\n**再次强调**：只报「换一份数据也会存在」的设计层面偏差。`,
      );
    }
  }

  // 走查范围
  const targetRegions = req.scenario.targetRegions ?? [];
  if (targetRegions.length > 0) {
    parts.push(
      `## 走查范围（严格限制）\n用户圈选了以下区域，你**只能报告这些区域内**的问题，其他区域忽略：\n${formatRegions(targetRegions)}`,
    );
  } else {
    parts.push(`## 走查范围\n对整张图做全量走查。`);
  }

  // 图片说明
  const hasIos = !!req.iosImageUrl;
  const hasAndroid = !!req.androidImageUrl;
  const hasDesign = !!req.designImageUrl;
  const imageDesc: string[] = [];
  if (hasIos) imageDesc.push('iOS 截图');
  if (hasAndroid) imageDesc.push('Android 截图');
  if (hasDesign) imageDesc.push('设计稿');
  parts.push(`## 提供的图片\n${imageDesc.join('、')}`);

  // 设计真相（Figma spec）—— 让 AI 用精确色值/字号做判断，而不是像素反推
  if (req.designFigmaSpec) {
    const specJson = compactSpecForPrompt(req.designFigmaSpec);
    parts.push(
      `## 设计真相 (Figma Spec) —— 最高优先级参考

以下是设计稿的**精确设计数据**（直接来自 Figma 文件，非肉眼估算）：

\`\`\`json
${specJson}
\`\`\`

**用法**：
- 报「颜色不一致」时，**期望值必须引用 spec 里的 hex**（如 fills[0].color.hex）；实现值从截图肉眼估
- 报「字号/字重不一致」时，期望值引用 spec 里的 text.style.fontSize / fontWeight
- 报「圆角/尺寸不一致」时，期望值引用 spec 里的 cornerRadius / box.width / box.height
- spec 里没有的字段（如复杂动画、渐变过渡），才依赖设计稿截图判断

**注意**：spec 里 box 坐标是 Figma 画布绝对坐标；报告位置时仍用截图归一化坐标 [0,1]。`,
    );
  }

  // 任务类型说明
  if (hasIos && hasAndroid) {
    parts.push(
      hasDesign
        ? '## 任务\n对比 iOS / Android 双端一致性，同时评估两端与设计稿的还原度。'
        : '## 任务\n对比 iOS / Android 双端一致性。',
    );
  } else {
    parts.push(
      `## 任务\n对比${hasIos ? 'iOS' : 'Android'}实现与设计稿的还原度，找出偏差问题。`,
    );
  }

  // 输出格式
  parts.push(`## 输出格式

严格返回如下 JSON 结构（不含 markdown 代码块标记）：

{
  "issues": [
    {
      "title": "问题简要标题（不超过 20 字）",
      "description": "详细描述问题现象（1-2 句）",
      "type": "content|layout|style|interaction|platform-specific",
      "severity": "critical|high|medium|low",
      "platforms": ["ios"] 或 ["android"] 或 ["ios", "android"],
      "regionName": "问题所在区域的语义名字（可选）",
      "iosLocation": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.05} 或 null,
      "androidLocation": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.05} 或 null,
      "isAcceptablePlatformDifference": false,
      "impact": "对用户体验的影响（1 句）",
      "suggestion": "修复建议（1 句，尽量可操作）",
      "confidence": 0.85,
      "tags": ["间距", "对齐"]
    }
  ],
  "platformConsistencyScore": 0-100 之间的整数（无 iOS 或无 Android 时为 0）,
  "designFidelity": {
    "ios": 0-100 之间的整数（无 iOS 时为 0）,
    "android": 0-100 之间的整数（无 Android 时为 0）
  } 或 null（无设计稿时为 null）,
  "overallScore": 0-100 之间的整数（综合评分）
}

规则：
- 找到多少报多少，宁缺毋滥；没问题就返回空数组 issues: []
- 每个 issue 的 confidence 反映你的判断把握（0-1）
- 若图片模糊无法判断，不要瞎报`);

  return parts.join('\n\n');
}

function formatRegions(regions: TargetRegion[]): string {
  return regions
    .map((r, i) => {
      const iosPart = r.iosRect
        ? `iOS 位置 (${pct(r.iosRect.x)},${pct(r.iosRect.y)},${pct(r.iosRect.width)}×${pct(r.iosRect.height)})`
        : '';
      const androidPart = r.androidRect
        ? `Android 位置 (${pct(r.androidRect.x)},${pct(r.androidRect.y)},${pct(r.androidRect.width)}×${pct(r.androidRect.height)})`
        : '';
      return `${i + 1}. 「${r.name}」 类型=${r.type}  ${[iosPart, androidPart].filter(Boolean).join(' / ')}`;
    })
    .join('\n');
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * 把 FigmaNodeSpec 压紧成 prompt 友好的 JSON 字符串
 *  - 全量序列化 < 20KB → 直接返回
 *  - 超过 → 裁剪 children 层级（保留深度 3）
 *  - 仍超过 → 只保留顶层 + 直接子节点摘要（name + type + color + fontSize）
 *
 * 目标：控制在 20KB 内，avoid burning tokens
 */
export function compactSpecForPrompt(spec: FigmaNodeSpec): string {
  const MAX_BYTES = 20_000;

  const full = JSON.stringify(spec, null, 2);
  if (full.length <= MAX_BYTES) return full;

  const shallow = pruneToDepth(spec, 3);
  const shallowJson = JSON.stringify(shallow, null, 2);
  if (shallowJson.length <= MAX_BYTES) return shallowJson;

  // 最后兜底：只留顶层 + 直系子节点简摘要
  const minimal = pruneToDepth(spec, 1);
  return JSON.stringify(minimal, null, 2);
}

function pruneToDepth(spec: FigmaNodeSpec, maxDepth: number): FigmaNodeSpec {
  return walkPrune(spec, 0, maxDepth);
}

function walkPrune(node: FigmaNodeSpec, depth: number, maxDepth: number): FigmaNodeSpec {
  const copy: FigmaNodeSpec = { ...node };
  if (depth >= maxDepth) {
    delete copy.children;
    return copy;
  }
  if (copy.children) {
    copy.children = copy.children.map((c) => walkPrune(c, depth + 1, maxDepth));
  }
  return copy;
}
