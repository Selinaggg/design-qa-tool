/**
 * exportReport —— 走查报告导出工具
 *
 * 纯函数，不依赖 DOM，可在客户端和服务端同时运行。
 * 调用方负责触发浏览器下载（downloadBlob）。
 */

import type { AuditSession } from '@/components/workbench/types';
import type { NormalizedRect } from '@/lib/crossPlatform/types';
import { getCurrentVersion, getActiveContext, type VersionDiff } from '@/lib/sessionHelpers';

// ── 下载辅助 ─────────────────────────────────────────────────────────────

/** 在浏览器里触发文件下载 */
export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── 评级 ──────────────────────────────────────────────────────────────────

function gradeLabel(score: number): string {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '一般';
  return '较差';
}

function severityLabel(s: string): string {
  const MAP: Record<string, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低',
  };
  return MAP[s] ?? s;
}

function statusLabel(s: string): string {
  const MAP: Record<string, string> = {
    pending: '待修复',
    'in-progress': '处理中',
    fixed: '已修复',
    ignored: '已忽略',
    deferred: '延后处理',
    'wont-fix': '不修复',
    'acceptable-difference': '平台规范差异',
  };
  return MAP[s] ?? s;
}

// ── Markdown 导出 ─────────────────────────────────────────────────────────

export function buildMarkdown(session: AuditSession): string {
  const cur = getCurrentVersion(session);
  const ctx = getActiveContext(session);
  const result = ctx?.crossPlatformResult ?? cur.crossPlatformResult;
  if (!result) return '';

  const date = new Date(cur.createdAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // 图片自然尺寸（真实像素）—— 用于把归一化坐标换算成 px
  const iosW = ctx?.iosImage?.width ?? cur.iosImage?.width ?? 0;
  const iosH = ctx?.iosImage?.height ?? cur.iosImage?.height ?? 0;
  const andW = ctx?.androidImage?.width ?? cur.androidImage?.width ?? 0;
  const andH = ctx?.androidImage?.height ?? cur.androidImage?.height ?? 0;

  const lines: string[] = [];

  // ── 标题 ──
  lines.push(`# 跨端走查报告：${session.name}（v${cur.v}）`);
  lines.push('');
  lines.push(`> 版本：v${cur.v}${cur.label ? ` · ${cur.label}` : ''}  `);
  lines.push(`> 版本生成时间：${date}  `);
  lines.push(`> iOS 设备：${result.iosDeviceName}${iosW && iosH ? `（截图 ${iosW}×${iosH}px）` : ''}  `);
  lines.push(`> Android 设备：${result.androidDeviceName}${andW && andH ? `（截图 ${andW}×${andH}px）` : ''}  `);
  if (result.isMock) lines.push(`> ⚠️ 数据类型：Mock 演示数据`);
  lines.push('');

  // ── 评分概览 ──
  lines.push('## 评分概览');
  lines.push('');
  lines.push('| 维度 | 分数 | 评级 |');
  lines.push('|------|------|------|');
  if (result.designFidelity) {
    lines.push(`| iOS 设计还原度 | ${result.designFidelity.ios} | ${gradeLabel(result.designFidelity.ios)} |`);
    lines.push(`| Android 设计还原度 | ${result.designFidelity.android} | ${gradeLabel(result.designFidelity.android)} |`);
  }
  lines.push(`| 跨端一致性 | ${result.platformConsistencyScore} | ${gradeLabel(result.platformConsistencyScore)} |`);
  lines.push(`| **综合评分** | **${result.overallScore}** | **${gradeLabel(result.overallScore)}** |`);
  lines.push('');

  // ── 问题分布 ──
  const { summary } = result;
  const total = summary.critical + summary.high + summary.medium + summary.low;
  lines.push('## 问题分布');
  lines.push('');
  lines.push(`共 **${total}** 项差异：`);
  lines.push('');
  if (summary.critical > 0) lines.push(`- 🔴 严重（Critical）：${summary.critical} 项`);
  if (summary.high > 0) lines.push(`- 🟠 高（High）：${summary.high} 项`);
  if (summary.medium > 0) lines.push(`- 🟡 中（Medium）：${summary.medium} 项`);
  if (summary.low > 0) lines.push(`- 🟢 低（Low）：${summary.low} 项`);
  lines.push('');

  // ── 问题详情 ──
  lines.push('## 问题详情');
  lines.push('');

  result.issues.forEach((issue, i) => {
    const idx = i + 1;
    const sevLabel = severityLabel(issue.severity ?? '');
    const stLabel = statusLabel(issue.status ?? 'pending');
    const platforms = issue.platforms.join(' / ').toUpperCase();
    const sourceTag = issue.manual ? ' 📝 (手动标注)' : ' 🤖 (AI 检测)';

    lines.push(`### ${idx}. ${issue.title}${sourceTag}`);
    lines.push('');
    lines.push(`| 属性 | 值 |`);
    lines.push(`|------|----|`);
    lines.push(`| 严重度 | ${sevLabel} |`);
    lines.push(`| 状态 | ${stLabel} |`);
    lines.push(`| 涉及平台 | ${platforms} |`);
    lines.push(`| 问题类型 | ${issue.type} |`);
    if (issue.regionName) lines.push(`| 关联区域 | ${issue.regionName} |`);
    lines.push(`| 置信度 | ${Math.round((issue.confidence ?? 0) * 100)}% |`);
    lines.push('');

    lines.push(`**问题描述**`);
    lines.push('');
    lines.push(issue.description);
    lines.push('');

    if (issue.impact) {
      lines.push(`**影响分析**`);
      lines.push('');
      lines.push(issue.impact);
      lines.push('');
    }

    if (issue.suggestion) {
      lines.push(`**修复建议**`);
      lines.push('');
      lines.push(issue.suggestion);
      lines.push('');
    }

    if (issue.tags && issue.tags.length > 0) {
      lines.push(`**标签**：${issue.tags.map((t) => `\`${t}\``).join(' ')}`);
      lines.push('');
    }

    // 坐标：优先显示真实像素（易读、可直接量），归一化保留在括号里作为原始数据
    const locParts: string[] = [];
    if (issue.iosLocation) {
      const l = issue.iosLocation;
      const hasSize = l.width != null && l.height != null;
      if (iosW && iosH) {
        const pr = toPixelRect(l, iosW, iosH);
        locParts.push(
          `iOS: **${formatPixelLoc(pr, hasSize)}**（归一化 x=${pct(l.x)} y=${pct(l.y)}${hasSize ? ` w=${pct(l.width!)} h=${pct(l.height!)}` : ''}）`,
        );
      } else {
        locParts.push(
          `iOS: x=${pct(l.x)} y=${pct(l.y)}${hasSize ? ` w=${pct(l.width!)} h=${pct(l.height!)}` : ''}`,
        );
      }
    }
    if (issue.androidLocation) {
      const l = issue.androidLocation;
      const hasSize = l.width != null && l.height != null;
      if (andW && andH) {
        const pr = toPixelRect(l, andW, andH);
        locParts.push(
          `Android: **${formatPixelLoc(pr, hasSize)}**（归一化 x=${pct(l.x)} y=${pct(l.y)}${hasSize ? ` w=${pct(l.width!)} h=${pct(l.height!)}` : ''}）`,
        );
      } else {
        locParts.push(
          `Android: x=${pct(l.x)} y=${pct(l.y)}${hasSize ? ` w=${pct(l.width!)} h=${pct(l.height!)}` : ''}`,
        );
      }
    }
    if (locParts.length > 0) {
      lines.push(`**位置**：${locParts.join('；')}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  // ── 标注区域 ──
  const iosRegions = cur.iosRegions ?? [];
  const androidRegions = cur.androidRegions ?? [];
  if (iosRegions.length > 0 || androidRegions.length > 0) {
    lines.push('## 标注区域');
    lines.push('');

    if (iosRegions.length > 0) {
      lines.push(`### iOS 标注${iosW && iosH ? `（基于 ${iosW}×${iosH}px 截图）` : ''}`);
      lines.push('');
      lines.push('| 名称 | 类型 | 坐标 (x, y) px | 尺寸 (w × h) px | 归一化 (x, y / w × h) |');
      lines.push('|------|------|---------------|-----------------|----------------------|');
      iosRegions.forEach((r) => {
        const pr = iosW && iosH ? toPixelRect(r.rect, iosW, iosH) : null;
        lines.push(
          `| ${r.name} | ${r.type} | ${pr ? `${pr.x}, ${pr.y}` : '—'} | ${pr ? `${pr.width} × ${pr.height}` : '—'} | ${pct(r.rect.x)}, ${pct(r.rect.y)} / ${pct(r.rect.width)} × ${pct(r.rect.height)} |`,
        );
      });
      lines.push('');
    }

    if (androidRegions.length > 0) {
      lines.push(`### Android 标注${andW && andH ? `（基于 ${andW}×${andH}px 截图）` : ''}`);
      lines.push('');
      lines.push('| 名称 | 类型 | 坐标 (x, y) px | 尺寸 (w × h) px | 归一化 (x, y / w × h) |');
      lines.push('|------|------|---------------|-----------------|----------------------|');
      androidRegions.forEach((r) => {
        const pr = andW && andH ? toPixelRect(r.rect, andW, andH) : null;
        lines.push(
          `| ${r.name} | ${r.type} | ${pr ? `${pr.x}, ${pr.y}` : '—'} | ${pr ? `${pr.width} × ${pr.height}` : '—'} | ${pct(r.rect.x)}, ${pct(r.rect.y)} / ${pct(r.rect.width)} × ${pct(r.rect.height)} |`,
        );
      });
      lines.push('');
    }
  }

  // ── 页脚 ──
  lines.push('---');
  lines.push('');
  lines.push(`*报告由 Design QA Tool 自动生成，生成于 ${date}*`);
  lines.push('');

  return lines.join('\n');
}

// ── JSON 导出 ─────────────────────────────────────────────────────────────

export interface ReportJSON {
  meta: {
    tool: string;
    version: string;
    exportedAt: string;
    sessionId: string;
    sessionName: string;
    createdAt: string;
    isMock: boolean;
  };
  devices: {
    ios: string;
    android: string;
  };
  /** 截图自然像素尺寸（用于把归一化坐标还原成 px） */
  imageSize: {
    ios?: { width: number; height: number };
    android?: { width: number; height: number };
    design?: { width: number; height: number };
  };
  scores: {
    overall: number;
    overallGrade: string;
    platformConsistency: number;
    platformConsistencyGrade: string;
    designFidelity?: { ios: number; android: number };
  };
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: Array<{
    id: string;
    index: number;
    title: string;
    severity: string;
    severityLabel: string;
    status: string;
    statusLabel: string;
    type: string;
    platforms: string[];
    regionName?: string;
    description: string;
    impact?: string;
    suggestion?: string;
    confidence?: number;
    tags?: string[];
    /** 归一化坐标（0..1） */
    iosLocation?: object;
    androidLocation?: object;
    /** 派生像素坐标（相对该平台截图；仅在图片尺寸已知时提供） */
    iosLocationPx?: PixelRect;
    androidLocationPx?: PixelRect;
  }>;
  regions: {
    ios: Array<{ name: string; type: string; rect: object; rectPx?: PixelRect }>;
    android: Array<{ name: string; type: string; rect: object; rectPx?: PixelRect }>;
  };
}

export function buildJSON(session: AuditSession): ReportJSON {
  const cur = getCurrentVersion(session);
  const ctx = getActiveContext(session);
  const result = (ctx?.crossPlatformResult ?? cur.crossPlatformResult)!;
  const { summary } = result;
  const total = summary.critical + summary.high + summary.medium + summary.low;

  const iosW = ctx?.iosImage?.width ?? cur.iosImage?.width ?? 0;
  const iosH = ctx?.iosImage?.height ?? cur.iosImage?.height ?? 0;
  const andW = ctx?.androidImage?.width ?? cur.androidImage?.width ?? 0;
  const andH = ctx?.androidImage?.height ?? cur.androidImage?.height ?? 0;
  const dsW = ctx?.designImage?.width ?? cur.designRefImage?.width ?? 0;
  const dsH = ctx?.designImage?.height ?? cur.designRefImage?.height ?? 0;

  return {
    meta: {
      tool: 'Design QA Tool',
      version: '0.1',
      exportedAt: new Date().toISOString(),
      sessionId: session.id,
      sessionName: session.name,
      createdAt: new Date(cur.createdAt).toISOString(),
      isMock: result.isMock,
    },
    devices: {
      ios: result.iosDeviceName,
      android: result.androidDeviceName,
    },
    imageSize: {
      ...(iosW && iosH ? { ios: { width: iosW, height: iosH } } : {}),
      ...(andW && andH ? { android: { width: andW, height: andH } } : {}),
      ...(dsW && dsH ? { design: { width: dsW, height: dsH } } : {}),
    },
    scores: {
      overall: result.overallScore,
      overallGrade: gradeLabel(result.overallScore),
      platformConsistency: result.platformConsistencyScore,
      platformConsistencyGrade: gradeLabel(result.platformConsistencyScore),
      ...(result.designFidelity ? { designFidelity: result.designFidelity } : {}),
    },
    summary: { total, ...summary },
    issues: result.issues.map((issue, i) => ({
      id: issue.id,
      index: i + 1,
      title: issue.title,
      severity: issue.severity ?? '',
      severityLabel: severityLabel(issue.severity ?? ''),
      status: issue.status ?? 'pending',
      statusLabel: statusLabel(issue.status ?? 'pending'),
      type: issue.type,
      platforms: issue.platforms,
      ...(issue.regionName ? { regionName: issue.regionName } : {}),
      description: issue.description,
      ...(issue.impact ? { impact: issue.impact } : {}),
      ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
      ...(issue.confidence != null ? { confidence: issue.confidence } : {}),
      ...(issue.tags ? { tags: issue.tags } : {}),
      ...(issue.iosLocation ? { iosLocation: issue.iosLocation } : {}),
      ...(issue.androidLocation ? { androidLocation: issue.androidLocation } : {}),
      ...(issue.iosLocation && iosW && iosH
        ? { iosLocationPx: toPixelRect(issue.iosLocation, iosW, iosH) }
        : {}),
      ...(issue.androidLocation && andW && andH
        ? { androidLocationPx: toPixelRect(issue.androidLocation, andW, andH) }
        : {}),
    })),
    regions: {
      ios: (cur.iosRegions ?? []).map((r) => ({
        name: r.name,
        type: r.type,
        rect: r.rect,
        ...(iosW && iosH ? { rectPx: toPixelRect(r.rect, iosW, iosH) } : {}),
      })),
      android: (cur.androidRegions ?? []).map((r) => ({
        name: r.name,
        type: r.type,
        rect: r.rect,
        ...(andW && andH ? { rectPx: toPixelRect(r.rect, andW, andH) } : {}),
      })),
    },
  };
}

// ── 触发下载 ─────────────────────────────────────────────────────────────

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 40);
}

export function exportMarkdown(session: AuditSession) {
  const cur = getCurrentVersion(session);
  const content = buildMarkdown(session);
  const filename = `走查报告_${safeFilename(session.name)}_v${cur.v}_${formatDate(cur.createdAt)}.md`;
  downloadBlob(content, filename, 'text/markdown;charset=utf-8');
}

export function exportJSON(session: AuditSession) {
  const cur = getCurrentVersion(session);
  const data = buildJSON(session);
  const content = JSON.stringify(data, null, 2);
  const filename = `走查报告_${safeFilename(session.name)}_v${cur.v}_${formatDate(cur.createdAt)}.json`;
  downloadBlob(content, filename, 'application/json;charset=utf-8');
}

// ── 版本对比报告（P3） ───────────────────────────────────────────────────

export function buildVersionDiffMarkdown(session: AuditSession, diff: VersionDiff): string {
  const lines: string[] = [];
  const fv = diff.fromVersion.v;
  const tv = diff.toVersion.v;
  const now = new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  // 每个版本各自的图片尺寸（版本级独立截图；用于像素换算）
  const fromIosW = diff.fromVersion.iosImage?.width ?? 0;
  const fromIosH = diff.fromVersion.iosImage?.height ?? 0;
  const fromAndW = diff.fromVersion.androidImage?.width ?? 0;
  const fromAndH = diff.fromVersion.androidImage?.height ?? 0;
  const toIosW = diff.toVersion.iosImage?.width ?? 0;
  const toIosH = diff.toVersion.iosImage?.height ?? 0;
  const toAndW = diff.toVersion.androidImage?.width ?? 0;
  const toAndH = diff.toVersion.androidImage?.height ?? 0;

  /** 给 issue 生成「位置」行；base = 该 issue 属于哪个版本，用来选对应的图片尺寸 */
  const issueLocLine = (
    issue: { iosLocation?: NormalizedRect | null; androidLocation?: NormalizedRect | null },
    base: 'from' | 'to',
  ): string | null => {
    const iosW = base === 'from' ? fromIosW : toIosW;
    const iosH = base === 'from' ? fromIosH : toIosH;
    const andW = base === 'from' ? fromAndW : toAndW;
    const andH = base === 'from' ? fromAndH : toAndH;
    const parts: string[] = [];
    if (issue.iosLocation && iosW && iosH) {
      const pr = toPixelRect(issue.iosLocation, iosW, iosH);
      const hasSize = issue.iosLocation.width != null && issue.iosLocation.height != null;
      parts.push(`iOS ${formatPixelLoc(pr, hasSize)}`);
    }
    if (issue.androidLocation && andW && andH) {
      const pr = toPixelRect(issue.androidLocation, andW, andH);
      const hasSize = issue.androidLocation.width != null && issue.androidLocation.height != null;
      parts.push(`Android ${formatPixelLoc(pr, hasSize)}`);
    }
    return parts.length > 0 ? `- 位置：${parts.join('；')}` : null;
  };

  lines.push(`# 版本对比报告：${session.name}（v${fv} → v${tv}）`);
  lines.push('');
  lines.push(`> 生成时间：${now}`);
  if (diff.fromVersion.label || diff.toVersion.label) {
    lines.push(`> 基准：v${fv}${diff.fromVersion.label ? ` · ${diff.fromVersion.label}` : ''}`);
    lines.push(`> 目标：v${tv}${diff.toVersion.label ? ` · ${diff.toVersion.label}` : ''}`);
  }
  lines.push('');

  // 评分对比
  lines.push('## 评分对比');
  lines.push('');
  lines.push('| 维度 | v' + fv + ' | v' + tv + ' | Δ |');
  lines.push('|------|------|------|------|');
  const fr = diff.fromVersion.crossPlatformResult;
  const tr = diff.toVersion.crossPlatformResult;
  lines.push(`| 综合评分 | ${fr?.overallScore ?? '—'} | ${tr?.overallScore ?? '—'} | ${formatDelta(diff.scoreDelta.overall)} |`);
  lines.push(`| 跨端一致性 | ${fr?.platformConsistencyScore ?? '—'} | ${tr?.platformConsistencyScore ?? '—'} | ${formatDelta(diff.scoreDelta.consistency)} |`);
  lines.push('');

  // 汇总
  lines.push('## 变化汇总');
  lines.push('');
  lines.push(`- 🆕 新增：**${diff.added.length}** 项`);
  lines.push(`- 🔵 存续：**${diff.persist.length}** 项`);
  lines.push(`- 🟢 已修复：**${diff.fixed.length}** 项`);
  lines.push('');

  // 新增
  if (diff.added.length > 0) {
    lines.push(`## 🆕 新增（v${tv}）`);
    lines.push('');
    diff.added.forEach((i, idx) => {
      lines.push(`### ${idx + 1}. ${i.title}`);
      lines.push('');
      lines.push(`- 严重度：${severityLabel(i.severity)}`);
      if (i.regionName) lines.push(`- 区域：${i.regionName}`);
      const loc = issueLocLine(i, 'to');
      if (loc) lines.push(loc);
      lines.push('');
      lines.push(i.description);
      lines.push('');
    });
  }

  // 存续
  if (diff.persist.length > 0) {
    lines.push(`## 🔵 存续（从 v${fv} 到 v${tv} 仍存在）`);
    lines.push('');
    diff.persist.forEach((p, idx) => {
      lines.push(`### ${idx + 1}. ${p.to.title}`);
      lines.push('');
      lines.push(`- 严重度：${severityLabel(p.to.severity)}${p.from.severity !== p.to.severity ? `（原 ${severityLabel(p.from.severity)}）` : ''}`);
      if (p.to.regionName) lines.push(`- 区域：${p.to.regionName}`);
      if (p.from.title !== p.to.title) {
        lines.push(`- 原标题（v${fv}）：${p.from.title}`);
      }
      const locTo = issueLocLine(p.to, 'to');
      if (locTo) lines.push(`${locTo}（v${tv}）`);
      const locFrom = issueLocLine(p.from, 'from');
      if (locFrom) lines.push(`${locFrom}（v${fv}）`);
      lines.push('');
      lines.push(p.to.description);
      lines.push('');
    });
  }

  // 已修复
  if (diff.fixed.length > 0) {
    lines.push(`## 🟢 已修复（v${fv} 存在、v${tv} 未关联）`);
    lines.push('');
    diff.fixed.forEach((i, idx) => {
      lines.push(`### ${idx + 1}. ~~${i.title}~~`);
      lines.push('');
      lines.push(`- 严重度：${severityLabel(i.severity)}`);
      if (i.regionName) lines.push(`- 区域：${i.regionName}`);
      const loc = issueLocLine(i, 'from');
      if (loc) lines.push(`${loc}（v${fv} 原位）`);
      lines.push('');
      lines.push(`> ${i.description}`);
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('');
  lines.push(`*报告由 Design QA Tool 自动生成，生成于 ${now}*`);
  lines.push('');

  return lines.join('\n');
}

export function exportVersionDiffMarkdown(session: AuditSession, diff: VersionDiff) {
  const content = buildVersionDiffMarkdown(session, diff);
  const filename = `版本对比_${safeFilename(session.name)}_v${diff.fromVersion.v}_to_v${diff.toVersion.v}_${formatDate(Date.now())}.md`;
  downloadBlob(content, filename, 'text/markdown;charset=utf-8');
}

function formatDelta(v: number | null): string {
  if (v == null) return '—';
  if (v === 0) return '0';
  return v > 0 ? `↑ +${v}` : `↓ ${v}`;
}

// ── 内部工具 ─────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** 把归一化 rect 换成真实像素 */
interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
function toPixelRect(
  rect: Partial<NormalizedRect> & { x: number; y: number; width?: number | null; height?: number | null },
  imgW: number,
  imgH: number,
): PixelRect {
  return {
    x: Math.round(rect.x * imgW),
    y: Math.round(rect.y * imgH),
    width: Math.round((rect.width ?? 0) * imgW),
    height: Math.round((rect.height ?? 0) * imgH),
  };
}

/** 拼出「坐标 · 尺寸 px」的显示串 */
function formatPixelLoc(pr: PixelRect, hasSize: boolean): string {
  return hasSize
    ? `${pr.x}, ${pr.y} · ${pr.width}×${pr.height} px`
    : `${pr.x}, ${pr.y} px`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}
