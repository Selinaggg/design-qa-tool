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
    regions.push({
      id: 'ios-status-bar',
      name: 'iOS 状态栏 / 顶部安全区',
      platform: 'ios',
      rect: { x: 0, y: 0, width: 1, height: req.iosDevice.safeArea.top / req.iosDevice.viewport.height },
      reason: '系统状态栏区域，跨端对比时忽略',
    });
    regions.push({
      id: 'android-status-bar',
      name: 'Android 状态栏',
      platform: 'android',
      rect: { x: 0, y: 0, width: 1, height: req.androidDevice.safeArea.top / req.androidDevice.viewport.height },
      reason: '系统状态栏区域，跨端对比时忽略',
    });
  }

  if (req.options.ignoreBottomSafeArea) {
    const iosR = req.iosDevice.safeArea.bottom / req.iosDevice.viewport.height;
    regions.push({
      id: 'ios-bottom-safe',
      name: 'iOS 底部手势条 / 安全区',
      platform: 'ios',
      rect: { x: 0, y: 1 - iosR, width: 1, height: iosR },
      reason: '底部 Home Indicator 安全区，跨端对比时忽略',
    });
    const androidR = req.androidDevice.safeArea.bottom / req.androidDevice.viewport.height;
    regions.push({
      id: 'android-bottom-nav',
      name: 'Android 底部导航栏',
      platform: 'android',
      rect: { x: 0, y: 1 - androidR, width: 1, height: androidR },
      reason: '底部系统导航栏区域，跨端对比时忽略',
    });
  }

  return regions;
}

// ── Region-type → issue-type mapping ─────────────────────────────────────

const REGION_TO_ISSUE_TYPE: Record<string, IssueType> = {
  layout: 'layout',
  content: 'content',
  visual: 'style',
  interaction: 'interaction',
  component: 'style',
};

const SEVERITY_CYCLE: IssueSeverityCP[] = ['high', 'medium', 'medium', 'low'];

function issuesFromTargetRegions(regions: TargetRegion[]): PlatformConsistencyIssue[] {
  return regions.map((region, i) => {
    const platforms: PlatformType[] = [];
    if (region.iosRect) platforms.push('ios');
    if (region.androidRect) platforms.push('android');
    if (platforms.length === 0) platforms.push('ios', 'android');

    const issueType = REGION_TO_ISSUE_TYPE[region.type] ?? 'style';
    const severity = SEVERITY_CYCLE[i % SEVERITY_CYCLE.length];

    return {
      id: `region-issue-${region.id}`,
      title: `${region.name} 跨端表现不一致`,
      description: `「${region.name}」区域在 iOS 与 Android 端存在可见差异，需对齐处理。`,
      type: issueType,
      severity,
      platforms,
      regionName: region.name,
      iosLocation: region.iosRect,
      androidLocation: region.androidRect,
      isAcceptablePlatformDifference: false,
      impact: `${region.name} 区域的不一致影响跨端用户体验的统一性，可能导致用户困惑。`,
      suggestion: `参照设计规范，对齐「${region.name}」区域的视觉和交互规范；建议提取为跨端共享组件。`,
      confidence: 0.72 + (i % 4) * 0.06,
    };
  });
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
    isAcceptablePlatformDifference: false,
    impact: '跨端用户感知到品牌表达不一致，影响认知统一性；A/B 测试数据也会受干扰。',
    suggestion: '与产品对齐后统一文案，建议使用「立即购买」并通过 i18n 同步两端。',
    confidence: 0.95,
  },
  {
    id: 'cp-2',
    title: '底部主按钮与安全区间距不一致',
    description: 'iOS 端按钮距底部安全区 16 pt，Android 端距系统导航栏仅 8 dp。',
    type: 'layout',
    severity: 'medium',
    platforms: ['ios', 'android'],
    regionName: '底部操作按钮',
    isAcceptablePlatformDifference: false,
    impact: 'Android 端按钮视觉上更「贴底」，操作舒适度下降，点击易误触系统导航栏。',
    suggestion: '统一使用 safeAreaBottom + 16px 作为底部 padding，通过平台 API 动态获取安全区高度。',
    confidence: 0.88,
  },
  {
    id: 'cp-3',
    title: 'Android 端缺失辅助说明文案',
    description: 'iOS 端主按钮下方有「7天无理由退换」说明文字，Android 端未显示该文案。',
    type: 'content',
    severity: 'high',
    platforms: ['android'],
    regionName: '按钮辅助说明区',
    isAcceptablePlatformDifference: false,
    impact: 'Android 用户缺少关键决策信息，可能导致转化率低于 iOS 端。',
    suggestion: '在 Android 端同步添加辅助说明文案，与 iOS 保持内容一致。',
    confidence: 0.92,
  },
  {
    id: 'cp-4',
    title: '系统状态栏样式差异（平台规范）',
    description: 'iOS 使用 Dynamic Island，Android 使用矩形摄像头孔，状态栏高度和布局不同。',
    type: 'platform-specific',
    severity: 'low',
    platforms: ['ios', 'android'],
    regionName: '顶部状态栏',
    isAcceptablePlatformDifference: true,
    impact: '属于系统级平台规范差异，不影响核心功能体验，用户有预期。',
    suggestion: '无需修改，此差异符合各平台设计规范，可安全忽略。',
    confidence: 0.99,
  },
  {
    id: 'cp-5',
    title: '卡片圆角与阴影不一致',
    description: 'iOS 端商品卡片圆角 12px / 阴影 blur 8px；Android 端圆角 8px，使用描边代替阴影。',
    type: 'style',
    severity: 'medium',
    platforms: ['ios', 'android'],
    regionName: '商品信息卡片',
    isAcceptablePlatformDifference: false,
    impact: '跨端用户感知视觉调性不统一，品牌一致性受损。',
    suggestion: '统一卡片圆角（12px），Android 端使用 elevation 实现阴影效果，与 iOS 视觉对齐。',
    confidence: 0.85,
  },
];

// ── Analyzer ──────────────────────────────────────────────────────────────

export class MockCrossPlatformAnalyzer implements CrossPlatformAnalyzer {
  readonly name = 'mock';

  async analyze(req: CrossPlatformAuditRequest): Promise<CrossPlatformAuditResult> {
    await new Promise((r) => setTimeout(r, 1400));

    const ignoredRegions = buildIgnoredRegions(req);
    const hasDesign = Boolean(req.designImageUrl);
    const targetRegions = req.scenario.targetRegions ?? [];

    // When user has drawn regions, generate targeted issues; always append a
    // few platform-specific default issues for richness.
    let issues: PlatformConsistencyIssue[];
    if (targetRegions.length > 0) {
      const regionIssues = issuesFromTargetRegions(targetRegions);
      // Append the platform-specific default issue as a bonus
      issues = [...regionIssues, DEFAULT_ISSUES[3], DEFAULT_ISSUES[4]];
    } else {
      issues = DEFAULT_ISSUES;
    }

    const summary = issues.reduce(
      (acc, issue) => { acc[issue.severity]++; return acc; },
      { critical: 0, high: 0, medium: 0, low: 0 },
    );

    return {
      scenarioName: req.scenario.name,
      iosDeviceName: req.iosDevice.name,
      androidDeviceName: req.androidDevice.name,
      ...(hasDesign ? { designFidelity: { ios: 88, android: 76 } } : {}),
      platformConsistencyScore: targetRegions.length > 0 ? 68 : 72,
      overallScore: hasDesign ? 79 : (targetRegions.length > 0 ? 70 : 72),
      summary,
      issues,
      ignoredRegions,
      isMock: true,
    };
  }
}
