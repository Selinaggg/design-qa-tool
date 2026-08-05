import type {
  CrossPlatformAnalyzer,
  CrossPlatformAuditRequest,
  CrossPlatformAuditResult,
  IgnoreRegion,
  PlatformConsistencyIssue,
  TargetRegion,
  IssueType,
  IssueSeverityCP,
  PlatformType,
} from './types';

// ── Ignore region builder ─────────────────────────────────────────────────

function buildIgnoredRegions(req: CrossPlatformAuditRequest): IgnoreRegion[] {
  const regions: IgnoreRegion[] = [];

  if (req.options.ignoreStatusBar) {
    if (req.iosDevice) {
      regions.push({
        id: 'ios-status-bar',
        name: 'iOS 状态栏 / 顶部安全区',
        platform: 'ios',
        rect: { x: 0, y: 0, width: 1, height: req.iosDevice.safeArea.top / req.iosDevice.viewport.height },
        reason: '系统状态栏区域，跨端对比时忽略',
      });
    }
    if (req.androidDevice) {
      regions.push({
        id: 'android-status-bar',
        name: 'Android 状态栏',
        platform: 'android',
        rect: { x: 0, y: 0, width: 1, height: req.androidDevice.safeArea.top / req.androidDevice.viewport.height },
        reason: '系统状态栏区域，跨端对比时忽略',
      });
    }
  }

  if (req.options.ignoreBottomSafeArea) {
    if (req.iosDevice) {
      const iosR = req.iosDevice.safeArea.bottom / req.iosDevice.viewport.height;
      regions.push({
        id: 'ios-bottom-safe',
        name: 'iOS 底部手势条 / 安全区',
        platform: 'ios',
        rect: { x: 0, y: 1 - iosR, width: 1, height: iosR },
        reason: '底部 Home Indicator 安全区，跨端对比时忽略',
      });
    }
    if (req.androidDevice) {
      const androidR = req.androidDevice.safeArea.bottom / req.androidDevice.viewport.height;
      regions.push({
        id: 'android-bottom-nav',
        name: 'Android 底部导航栏',
        platform: 'android',
        rect: { x: 0, y: 1 - androidR, width: 1, height: androidR },
        reason: '底部系统导航栏区域，跨端对比时忽略',
      });
    }
  }

  return regions;
}

// ── Region-type → issue-type mapping（保留备用） ─────────────────────────
const REGION_TO_ISSUE_TYPE: Record<string, IssueType> = {
  layout: 'layout',
  content: 'content',
  visual: 'style',
  interaction: 'interaction',
  component: 'style',
};

const SEVERITY_CYCLE: IssueSeverityCP[] = ['high', 'medium', 'medium', 'low'];

// 每种 region type 对应的多维度问题模板（各生成 1~2 条）
type IssueTemplate = {
  type: IssueType;
  severity: IssueSeverityCP;
  titleFn: (name: string) => string;
  descFn: (name: string) => string;
  impactFn: (name: string) => string;
  suggestionFn: (name: string) => string;
  tags: string[];
};

const REGION_TEMPLATES: Record<string, IssueTemplate[]> = {
  layout: [
    {
      type: 'layout',
      severity: 'high',
      titleFn: (n) => `${n} 间距不一致`,
      descFn: (n) => `「${n}」区域的内外边距在 iOS 与 Android 端不对齐，iOS 使用 16pt，Android 仅 10dp。`,
      impactFn: (n) => `「${n}」两端布局松紧不同，用户感知到页面节奏不统一，影响专业度。`,
      suggestionFn: (n) => `统一「${n}」的外边距为 16px（等效 dp/pt），通过共享设计 Token 同步两端。`,
      tags: ['间距', '布局'],
    },
    {
      type: 'layout',
      severity: 'medium',
      titleFn: (n) => `${n} 对齐方式差异`,
      descFn: (n) => `「${n}」区域内元素在 iOS 端居中对齐，Android 端左对齐，视觉重心不统一。`,
      impactFn: (n) => `「${n}」对齐不一致会导致两端截图对比时差异明显，影响走查效率和设计评审。`,
      suggestionFn: (n) => `与设计稿对齐后确认「${n}」元素对齐策略，保持两端一致，推荐使用 Flexbox 居中。`,
      tags: ['对齐', '布局'],
    },
  ],
  content: [
    {
      type: 'content',
      severity: 'high',
      titleFn: (n) => `${n} 文案不一致`,
      descFn: (n) => `「${n}」区域在 iOS 端与 Android 端显示了不同的文案，核心信息不统一。`,
      impactFn: (n) => `「${n}」文案差异会让跨端用户产生认知混乱，影响品牌一致性。`,
      suggestionFn: (n) => `通过 i18n 统一「${n}」文案，确保两端使用相同的字符串资源。`,
      tags: ['文案', '内容'],
    },
    {
      type: 'content',
      severity: 'medium',
      titleFn: (n) => `${n} 内容缺失`,
      descFn: (n) => `「${n}」区域在 Android 端缺少 iOS 端展示的部分内容元素。`,
      impactFn: (n) => `Android 用户缺少「${n}」的关键信息，可能影响决策和转化。`,
      suggestionFn: (n) => `排查「${n}」内容缺失原因（接口/条件渲染/版本差异），补齐 Android 端展示逻辑。`,
      tags: ['缺失', '内容'],
    },
  ],
  visual: [
    {
      type: 'style',
      severity: 'medium',
      titleFn: (n) => `${n} 颜色/色调不一致`,
      descFn: (n) => `「${n}」区域的主色或背景色在 iOS 与 Android 端存在色差，可能由主题系统差异引起。`,
      impactFn: (n) => `「${n}」色彩不统一破坏整体视觉语言，跨端一致性评分会明显下降。`,
      suggestionFn: (n) => `引入统一的设计 Token 管理「${n}」颜色变量，两端同步引用，避免硬编码。`,
      tags: ['颜色', '样式'],
    },
    {
      type: 'style',
      severity: 'low',
      titleFn: (n) => `${n} 圆角 / 阴影差异`,
      descFn: (n) => `「${n}」在 iOS 端圆角 12px + 阴影 blur 8px，Android 端圆角 8px 且以描边替代阴影。`,
      impactFn: (n) => `「${n}」视觉调性不一致会让品牌感受产生割裂，尤其在同一用户双端使用时更明显。`,
      suggestionFn: (n) => `统一「${n}」圆角为 12px，Android 端使用 Elevation 实现阴影，与 iOS 视觉对齐。`,
      tags: ['圆角', '阴影', '样式'],
    },
  ],
  interaction: [
    {
      type: 'interaction',
      severity: 'high',
      titleFn: (n) => `${n} 点击区域大小不一致`,
      descFn: (n) => `「${n}」可点击区域在 iOS 端最小 44×44pt，Android 端仅 32×32dp，不符合无障碍规范。`,
      impactFn: (n) => `「${n}」Android 端点击目标过小，误触率上升，无障碍体验较差。`,
      suggestionFn: (n) => `将「${n}」点击区域统一扩展到 44dp/pt 以上，可通过 padding 不改变视觉大小。`,
      tags: ['触摸区域', '无障碍'],
    },
    {
      type: 'interaction',
      severity: 'medium',
      titleFn: (n) => `${n} 手势反馈不一致`,
      descFn: (n) => `「${n}」在 iOS 端有按压高亮反馈，Android 端缺少 Ripple 效果。`,
      impactFn: (n) => `「${n}」交互反馈不一致，Android 用户无法及时确认操作是否被响应。`,
      suggestionFn: (n) => `Android 端为「${n}」添加 Ripple 或状态高亮，与各平台规范保持一致。`,
      tags: ['手势', '反馈'],
    },
  ],
  component: [
    {
      type: 'style',
      severity: 'medium',
      titleFn: (n) => `${n} 组件规格不统一`,
      descFn: (n) => `「${n}」使用了两端不同版本的组件实现，导致字体大小、行高、内边距出现差异。`,
      impactFn: (n) => `「${n}」组件差异会引发视觉不一致，增加后续维护成本。`,
      suggestionFn: (n) => `将「${n}」抽取为跨端共享组件（或设计组件库中的同一组件），统一规格。`,
      tags: ['组件', '规格'],
    },
    {
      type: 'layout',
      severity: 'low',
      titleFn: (n) => `${n} 组件内边距差异`,
      descFn: (n) => `「${n}」组件内边距 iOS 端 12pt，Android 端 8dp，导致视觉密度不同。`,
      impactFn: (n) => `「${n}」跨端内边距不一致影响页面节奏感，在 A/B 测试时可能引入干扰变量。`,
      suggestionFn: (n) => `统一「${n}」组件内边距为 12dp/pt，通过 Token 或平台规范文档明确约定。`,
      tags: ['间距', '组件'],
    },
  ],
};

function issuesFromTargetRegions(regions: TargetRegion[]): PlatformConsistencyIssue[] {
  const issues: PlatformConsistencyIssue[] = [];

  regions.forEach((region, regionIdx) => {
    const platforms: PlatformType[] = [];
    if (region.iosRect) platforms.push('ios');
    if (region.androidRect) platforms.push('android');
    if (platforms.length === 0) platforms.push('ios', 'android');

    const templates = REGION_TEMPLATES[region.type] ?? REGION_TEMPLATES['layout'];

    // 每个区域取 1~2 条模板，按 regionIdx 错开，让结果有变化感
    const count = Math.min(templates.length, regionIdx % 2 === 0 ? 2 : 1);
    for (let t = 0; t < count; t++) {
      const tmpl = templates[t];
      const issueIdx = issues.length;
      issues.push({
        id: `region-${region.id}-t${t}`,
        title: tmpl.titleFn(region.name),
        description: tmpl.descFn(region.name),
        type: tmpl.type,
        severity: tmpl.severity,
        platforms,
        regionName: region.name,
        // 问题 location = 框选的 rect（只报框内）
        iosLocation: region.iosRect,
        androidLocation: region.androidRect,
        isAcceptablePlatformDifference: false,
        impact: tmpl.impactFn(region.name),
        suggestion: tmpl.suggestionFn(region.name),
        confidence: 0.70 + (issueIdx % 5) * 0.05,
        status: 'pending',
        tags: tmpl.tags,
      });
    }
  });

  return issues;
}

// ── Default mock issues (no target regions) ───────────────────────────────

const DEFAULT_ISSUES: PlatformConsistencyIssue[] = [
  {
    id: 'cp-1',
    title: '主按钮文案不一致',
    description: 'iOS 端按钮显示「立即购买」，Android 端显示「马上购买」，同一功能文案不统一。',
    type: 'content',
    severity: 'high',
    platforms: ['ios', 'android'],
    regionName: '底部主操作区',
    iosLocation: { x: 0.08, y: 0.86, width: 0.84, height: 0.08 },
    androidLocation: { x: 0.08, y: 0.86, width: 0.84, height: 0.08 },
    isAcceptablePlatformDifference: false,
    impact: '跨端用户感知到品牌表达不一致，影响认知统一性；A/B 测试数据也会受干扰。',
    suggestion: '与产品对齐后统一文案，建议使用「立即购买」并通过 i18n 同步两端。',
    confidence: 0.95,
    status: 'pending',
    tags: ['文案', '静态'],
  },
  {
    id: 'cp-2',
    title: '底部主按钮与安全区间距不一致',
    description: 'iOS 端按钮距底部安全区 16 pt，Android 端距系统导航栏仅 8 dp。',
    type: 'layout',
    severity: 'medium',
    platforms: ['ios', 'android'],
    regionName: '底部操作按钮',
    iosLocation: { x: 0.1, y: 0.9, width: 0.8, height: 0.08 },
    androidLocation: { x: 0.1, y: 0.92, width: 0.8, height: 0.08 },
    isAcceptablePlatformDifference: false,
    impact: 'Android 端按钮视觉上更「贴底」，操作舒适度下降，点击易误触系统导航栏。',
    suggestion: '统一使用 safeAreaBottom + 16px 作为底部 padding，通过平台 API 动态获取安全区高度。',
    confidence: 0.88,
    status: 'pending',
    tags: ['间距', '静态'],
  },
  {
    id: 'cp-3',
    title: 'Android 端缺失辅助说明文案',
    description: 'iOS 端主按钮下方有「7天无理由退换」说明文字，Android 端未显示该文案。',
    type: 'content',
    severity: 'high',
    platforms: ['android'],
    regionName: '按钮辅助说明区',
    iosLocation: { x: 0.3, y: 0.78, width: 0.4, height: 0.04 },
    isAcceptablePlatformDifference: false,
    impact: 'Android 用户缺少关键决策信息，可能导致转化率低于 iOS 端。',
    suggestion: '在 Android 端同步添加辅助说明文案，与 iOS 保持内容一致。',
    confidence: 0.92,
    status: 'pending',
    tags: ['缺失', '内容'],
  },
  {
    id: 'cp-4',
    title: '系统状态栏样式差异（平台规范）',
    description: 'iOS 使用 Dynamic Island，Android 使用矩形摄像头孔，状态栏高度和布局不同。',
    type: 'platform-specific',
    severity: 'low',
    platforms: ['ios', 'android'],
    regionName: '顶部状态栏',
    iosLocation: { x: 0, y: 0, width: 1, height: 0.05 },
    androidLocation: { x: 0, y: 0, width: 1, height: 0.04 },
    isAcceptablePlatformDifference: true,
    impact: '属于系统级平台规范差异，不影响核心功能体验，用户有预期。',
    suggestion: '无需修改，此差异符合各平台设计规范，可安全忽略。',
    confidence: 0.99,
    status: 'ignored',
    tags: ['平台规范'],
  },
  {
    id: 'cp-5',
    title: '卡片圆角与阴影不一致',
    description: 'iOS 端商品卡片圆角 12px / 阴影 blur 8px；Android 端圆角 8px，使用描边代替阴影。',
    type: 'style',
    severity: 'medium',
    platforms: ['ios', 'android'],
    regionName: '商品信息卡片',
    iosLocation: { x: 0.06, y: 0.7, width: 0.42, height: 0.14 },
    androidLocation: { x: 0.06, y: 0.72, width: 0.42, height: 0.14 },
    isAcceptablePlatformDifference: false,
    impact: '跨端用户感知视觉调性不统一，品牌一致性受损。',
    suggestion: '统一卡片圆角（12px），Android 端使用 elevation 实现阴影效果，与 iOS 视觉对齐。',
    confidence: 0.85,
    status: 'pending',
    tags: ['圆角', '阴影', '样式'],
  },
];

// ── Analyzer ──────────────────────────────────────────────────────────────

export class MockCrossPlatformAnalyzer implements CrossPlatformAnalyzer {
  readonly name = 'mock';

  async analyze(req: CrossPlatformAuditRequest): Promise<CrossPlatformAuditResult> {
    await new Promise((r) => setTimeout(r, 1400));

    const ignoredRegions = buildIgnoredRegions(req);
    const hasDesign = Boolean(req.designImageUrl);
    const hasIos = Boolean(req.iosImageUrl);
    const hasAndroid = Boolean(req.androidImageUrl);
    const isSinglePlatform = !(hasIos && hasAndroid);
    const targetRegions = req.scenario.targetRegions ?? [];

    let issues: PlatformConsistencyIssue[];
    if (targetRegions.length > 0) {
      // 有框选区域：严格只报框选范围内的问题，不附加全局默认 issue
      issues = issuesFromTargetRegions(targetRegions);
    } else {
      // 无框选：使用全图默认走查结果
      issues = DEFAULT_ISSUES;
    }

    // 单端走查：把 issue 中不存在那端的 location 抹掉，platforms 只留存在的端
    if (isSinglePlatform) {
      issues = issues
        .map((issue) => {
          const platforms: PlatformType[] = [];
          if (hasIos) platforms.push('ios');
          if (hasAndroid) platforms.push('android');
          return {
            ...issue,
            platforms,
            iosLocation: hasIos ? issue.iosLocation : undefined,
            androidLocation: hasAndroid ? issue.androidLocation : undefined,
          };
        })
        // 过滤：改造后如果两端 location 都没了（比如 issue 原本只有 iosLocation 但我们跑 android 单端），直接丢弃
        .filter((issue) => !!(issue.iosLocation ?? issue.androidLocation));
    }

    const summary = issues.reduce(
      (acc, issue) => { acc[issue.severity]++; return acc; },
      { critical: 0, high: 0, medium: 0, low: 0 },
    );

    return {
      scenarioName: req.scenario.name,
      iosDeviceName: req.iosDevice?.name ?? '—',
      androidDeviceName: req.androidDevice?.name ?? '—',
      ...(hasDesign ? { designFidelity: buildFidelity(hasIos, hasAndroid) } : {}),
      platformConsistencyScore: isSinglePlatform
        ? 0 // 单端无跨端一致性概念
        : targetRegions.length > 0 ? 68 : 72,
      overallScore: hasDesign ? 79 : (targetRegions.length > 0 ? 70 : 72),
      summary,
      issues,
      ignoredRegions,
      isMock: true,
    };
  }
}

function buildFidelity(hasIos: boolean, hasAndroid: boolean) {
  return {
    ios: hasIos ? 88 : 0,
    android: hasAndroid ? 76 : 0,
  };
}
