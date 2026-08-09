'use client';

/**
 * exportPdf —— 使用 @react-pdf/renderer 生成走查报告 PDF
 *
 * 必须在客户端调用（动态 import，不可 SSR）。
 * 模板：
 *   - 封面：场景名 + 评分 + 摘要
 *   - 问题列表：每条问题卡片（严重度色标 + 描述 + 建议）
 *   - 标注区域（如有）
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';
import type { AuditSession } from '@/components/workbench/types';
import { getCurrentVersion, getActiveContext } from '@/lib/sessionHelpers';
import type { PlatformConsistencyIssue } from '@/lib/crossPlatform';

// ── 注册本地思源黑体（OTF），避免 CDN 404 / CORS 问题 ────────────────────
// 字体文件位于 public/fonts/，Next.js 静态资源通过 /fonts/xxx 访问
Font.register({
  family: 'NotoSansSC',
  fonts: [
    {
      src: '/fonts/NotoSansSC-Regular.otf',
      fontWeight: 'normal',
    },
    {
      src: '/fonts/NotoSansSC-Bold.otf',
      fontWeight: 'bold',
    },
  ],
});

// ── 颜色常量 ─────────────────────────────────────────────────────────────

const C = {
  primary:  '#1e40af',
  text:     '#0f172a',
  subtext:  '#64748b',
  border:   '#e2e8f0',
  bg:       '#f8fafc',
  white:    '#ffffff',
  critical: '#dc2626',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
  gray:     '#94a3b8',
} as const;

const SEV_COLOR: Record<string, string> = {
  critical: C.critical,
  high:     C.high,
  medium:   C.medium,
  low:      C.low,
};

const SEV_LABEL: Record<string, string> = {
  critical: '严重',
  high:     '高',
  medium:   '中',
  low:      '低',
};

const STATUS_LABEL: Record<string, string> = {
  pending:                '待修复',
  'in-progress':          '处理中',
  fixed:                  '已修复',
  ignored:                '已忽略',
  deferred:               '延后',
  'wont-fix':             '不修复',
  'acceptable-difference':'平台规范差异',
};

const TYPE_LABEL: Record<string, string> = {
  layout:          '布局',
  content:         '内容',
  style:           '样式',
  interaction:     '交互',
  'platform-specific': '平台规范',
};

function gradeLabel(score: number): string {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '一般';
  return '较差';
}

function gradeColor(score: number): string {
  if (score >= 90) return '#059669';
  if (score >= 75) return '#2563eb';
  if (score >= 60) return '#d97706';
  return C.critical;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// ── 样式表 ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansSC',
    fontSize: 9,
    color: C.text,
    backgroundColor: C.white,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
  },

  // 封面
  coverTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: C.primary,
    marginBottom: 6,
  },
  coverSub: {
    fontSize: 10,
    color: C.subtext,
    marginBottom: 24,
  },

  // 评分卡
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  scoreCard: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: C.bg,
    border: `1px solid ${C.border}`,
    padding: 12,
  },
  scoreNum: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  scoreLabel: {
    fontSize: 8,
    color: C.subtext,
  },
  scoreGrade: {
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },

  // 分割线
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },

  // 章节标题
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: C.primary,
    marginBottom: 10,
  },

  // 摘要分布
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  summaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  summaryText: {
    fontSize: 8,
    fontWeight: 'bold',
  },

  // 问题卡片
  issueCard: {
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    marginBottom: 10,
    overflow: 'hidden',
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    paddingBottom: 8,
    backgroundColor: C.bg,
  },
  issueIndex: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  issueIndexText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: C.white,
  },
  issueSevBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  issueSevText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: C.white,
  },
  issueTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    flex: 1,
  },
  issueStatusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: '#f1f5f9',
  },
  issueStatusText: {
    fontSize: 7,
    color: C.subtext,
  },

  issueBody: {
    padding: 10,
    paddingTop: 6,
  },
  issueMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  issueMetaItem: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  issueMetaLabel: {
    fontSize: 7,
    color: C.subtext,
  },
  issueMetaValue: {
    fontSize: 7,
    fontWeight: 'bold',
    color: C.text,
  },

  blockLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: C.subtext,
    marginBottom: 2,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  blockText: {
    fontSize: 8.5,
    color: C.text,
    lineHeight: 1.5,
  },

  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  tag: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: '#f1f5f9',
    border: `1px solid ${C.border}`,
  },
  tagText: {
    fontSize: 7,
    color: C.subtext,
  },

  // 标注区域表格
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderBottom: `1px solid ${C.border}`,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: `1px solid ${C.border}`,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tableCell: {
    fontSize: 8,
  },
  tableCellBold: {
    fontSize: 8,
    fontWeight: 'bold',
    color: C.subtext,
  },

  // 页脚
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: `1px solid ${C.border}`,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: C.gray,
  },
  pageNum: {
    fontSize: 7,
    color: C.gray,
  },
});

// ── PDF Document 组件 ─────────────────────────────────────────────────────

// ReportDocument 接收完整 session，内部展开所有数据
// 注意：pdf() 需要 ReactElement<DocumentProps>，所以这里返回 Document 元素本身
function buildDocumentElement(session: AuditSession): React.ReactElement {
  const cur = getCurrentVersion(session);
  const ctx = getActiveContext(session);
  const result = ctx?.crossPlatformResult ?? cur.crossPlatformResult!;
  const { summary } = result;
  const total = summary.critical + summary.high + summary.medium + summary.low;
  const date = new Date(cur.createdAt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <Document
      title={`走查报告 - ${session.name} v${cur.v}`}
      author="Design QA Tool"
      subject="跨端走查报告"
    >
      {/* ── Page 1: 封面 + 摘要 ── */}
      <Page size="A4" style={s.page}>
        {/* 标题 */}
        <Text style={s.coverTitle}>{session.name}</Text>
        <Text style={s.coverSub}>
          跨端走查报告 · 版本 v{cur.v}{cur.label ? ` · ${cur.label}` : ''} · {date}
          {result.isMock ? '  ·  Mock 数据' : ''}
        </Text>

        {/* 设备信息 */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6' }} />
            <Text style={{ fontSize: 8, color: C.subtext }}>iOS：{result.iosDeviceName}</Text>
          </View>
          <Text style={{ fontSize: 8, color: C.border }}>|</Text>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} />
            <Text style={{ fontSize: 8, color: C.subtext }}>Android：{result.androidDeviceName}</Text>
          </View>
        </View>

        {/* 评分卡 */}
        <View style={s.scoreRow}>
          <View style={s.scoreCard}>
            <Text style={[s.scoreNum, { color: gradeColor(result.overallScore) }]}>
              {result.overallScore}
            </Text>
            <Text style={s.scoreLabel}>综合评分</Text>
            <Text style={[s.scoreGrade, { color: gradeColor(result.overallScore) }]}>
              {gradeLabel(result.overallScore)}
            </Text>
          </View>
          <View style={s.scoreCard}>
            <Text style={[s.scoreNum, { color: gradeColor(result.platformConsistencyScore) }]}>
              {result.platformConsistencyScore}
            </Text>
            <Text style={s.scoreLabel}>跨端一致性</Text>
            <Text style={[s.scoreGrade, { color: gradeColor(result.platformConsistencyScore) }]}>
              {gradeLabel(result.platformConsistencyScore)}
            </Text>
          </View>
          {result.designFidelity && (
            <>
              <View style={s.scoreCard}>
                <Text style={[s.scoreNum, { color: gradeColor(result.designFidelity.ios) }]}>
                  {result.designFidelity.ios}
                </Text>
                <Text style={s.scoreLabel}>iOS 设计还原度</Text>
                <Text style={[s.scoreGrade, { color: gradeColor(result.designFidelity.ios) }]}>
                  {gradeLabel(result.designFidelity.ios)}
                </Text>
              </View>
              <View style={s.scoreCard}>
                <Text style={[s.scoreNum, { color: gradeColor(result.designFidelity.android) }]}>
                  {result.designFidelity.android}
                </Text>
                <Text style={s.scoreLabel}>Android 设计还原度</Text>
                <Text style={[s.scoreGrade, { color: gradeColor(result.designFidelity.android) }]}>
                  {gradeLabel(result.designFidelity.android)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* 问题分布 */}
        <Text style={s.sectionTitle}>问题分布</Text>
        <View style={s.summaryRow}>
          {((['critical', 'high', 'medium', 'low'] as const)).map((sev) => {
            const count = summary[sev];
            if (count === 0) return null;
            const color = SEV_COLOR[sev];
            return (
              <View key={sev} style={[s.summaryChip, { backgroundColor: `${color}18` }]}>
                <View style={[s.summaryDot, { backgroundColor: color }]} />
                <Text style={[s.summaryText, { color }]}>
                  {SEV_LABEL[sev]} × {count}
                </Text>
              </View>
            );
          })}
          <View style={[s.summaryChip, { backgroundColor: C.bg }]}>
            <Text style={[s.summaryText, { color: C.subtext }]}>合计 {total} 项</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* 问题列表（首页尽量塞，超出自动换页） */}
        <Text style={s.sectionTitle}>问题详情</Text>
        {result.issues.map((issue, i) => (
          <IssueCard key={issue.id} issue={issue} index={i + 1} />
        ))}

        {/* 标注区域（如有） */}
        {((cur.iosRegions ?? []).length > 0 || (cur.androidRegions ?? []).length > 0) && (
          <>
            <View style={s.divider} />
            <Text style={s.sectionTitle}>标注区域</Text>
            {(ctx?.iosRegions ?? cur.iosRegions ?? []).length > 0 && (
              <RegionTable
                title="iOS 标注"
                regions={ctx?.iosRegions ?? cur.iosRegions ?? []}
                color="#3b82f6"
                imgW={ctx?.iosImage?.width ?? cur.iosImage?.width ?? 0}
                imgH={ctx?.iosImage?.height ?? cur.iosImage?.height ?? 0}
              />
            )}
            {(ctx?.androidRegions ?? cur.androidRegions ?? []).length > 0 && (
              <RegionTable
                title="Android 标注"
                regions={ctx?.androidRegions ?? cur.androidRegions ?? []}
                color="#22c55e"
                imgW={ctx?.androidImage?.width ?? cur.androidImage?.width ?? 0}
                imgH={ctx?.androidImage?.height ?? cur.androidImage?.height ?? 0}
              />
            )}
          </>
        )}

        {/* 页脚 */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Design QA Tool · {session.name} · v{cur.v}</Text>
          <Text style={s.pageNum} render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          } />
        </View>
      </Page>
    </Document>
  );
}

// ── Issue 卡片 ────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  index,
}: {
  issue: PlatformConsistencyIssue;
  index: number;
}) {
  const sev = issue.severity ?? 'low';
  const sevColor = SEV_COLOR[sev] ?? C.gray;
  const statusStr = issue.status ?? 'pending';

  return (
    <View style={s.issueCard} wrap={false}>
      {/* Header */}
      <View style={s.issueHeader}>
        <View style={[s.issueIndex, { backgroundColor: sevColor }]}>
          <Text style={s.issueIndexText}>{index}</Text>
        </View>
        <View style={[s.issueSevBadge, { backgroundColor: sevColor }]}>
          <Text style={s.issueSevText}>{SEV_LABEL[sev] ?? sev}</Text>
        </View>
        <Text style={s.issueTitle}>{issue.title}</Text>
        <View style={s.issueStatusBadge}>
          <Text style={s.issueStatusText}>{STATUS_LABEL[statusStr] ?? statusStr}</Text>
        </View>
      </View>

      {/* Body */}
      <View style={s.issueBody}>
        {/* 元信息 */}
        <View style={s.issueMeta}>
          <View style={s.issueMetaItem}>
            <Text style={s.issueMetaLabel}>类型：</Text>
            <Text style={s.issueMetaValue}>{TYPE_LABEL[issue.type] ?? issue.type}</Text>
          </View>
          <View style={s.issueMetaItem}>
            <Text style={s.issueMetaLabel}>平台：</Text>
            <Text style={s.issueMetaValue}>{(issue.platforms ?? []).join(' / ').toUpperCase()}</Text>
          </View>
          {issue.regionName && (
            <View style={s.issueMetaItem}>
              <Text style={s.issueMetaLabel}>区域：</Text>
              <Text style={s.issueMetaValue}>{issue.regionName}</Text>
            </View>
          )}
          {issue.confidence != null && (
            <View style={s.issueMetaItem}>
              <Text style={s.issueMetaLabel}>置信度：</Text>
              <Text style={s.issueMetaValue}>{Math.round(issue.confidence * 100)}%</Text>
            </View>
          )}
        </View>

        {/* 描述 */}
        <Text style={s.blockLabel}>问题描述</Text>
        <Text style={s.blockText}>{issue.description}</Text>

        {/* 影响 */}
        {issue.impact && (
          <>
            <Text style={s.blockLabel}>影响分析</Text>
            <Text style={s.blockText}>{issue.impact}</Text>
          </>
        )}

        {/* 建议 */}
        {issue.suggestion && (
          <>
            <Text style={s.blockLabel}>修复建议</Text>
            <Text style={s.blockText}>{issue.suggestion}</Text>
          </>
        )}

        {/* 标签 */}
        {issue.tags && issue.tags.length > 0 && (
          <View style={s.tagRow}>
            {issue.tags.map((t: string) => (
              <View key={t} style={s.tag}>
                <Text style={s.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── 标注区域表格 ──────────────────────────────────────────────────────────

function RegionTable({
  title,
  regions,
  color,
  imgW,
  imgH,
}: {
  title: string;
  regions: Array<{ name: string; type: string; rect: { x: number; y: number; width: number; height: number } }>;
  color: string;
  /** 该平台截图自然像素宽/高；为 0 时退化为仅显示百分比 */
  imgW?: number;
  imgH?: number;
}) {
  const hasPx = !!(imgW && imgH);
  const px = (v: number, base: number) => Math.round(v * base);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ fontSize: 9, fontWeight: 'bold', color: C.text }}>
          {title}
          {hasPx ? `（基于 ${imgW}×${imgH}px）` : ''}
        </Text>
      </View>
      <View style={{ border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
        {/* 表头 */}
        <View style={s.tableHeader}>
          <Text style={[s.tableCellBold, { flex: 2 }]}>区域名称</Text>
          <Text style={[s.tableCellBold, { flex: 1 }]}>类型</Text>
          {hasPx ? (
            <>
              <Text style={[s.tableCellBold, { flex: 1.2 }]}>坐标 (x, y) px</Text>
              <Text style={[s.tableCellBold, { flex: 1.2 }]}>尺寸 (w × h) px</Text>
            </>
          ) : (
            <>
              <Text style={[s.tableCellBold, { flex: 1 }]}>坐标 (x, y)</Text>
              <Text style={[s.tableCellBold, { flex: 1 }]}>尺寸 (w × h)</Text>
            </>
          )}
        </View>
        {/* 数据行 */}
        {regions.map((r, i) => (
          <View key={r.name + i} style={[s.tableRow, { backgroundColor: i % 2 === 0 ? C.white : C.bg }]}>
            <Text style={[s.tableCell, { flex: 2, fontWeight: 'bold' }]}>{r.name}</Text>
            <Text style={[s.tableCell, { flex: 1, color: C.subtext }]}>{r.type}</Text>
            {hasPx ? (
              <>
                <Text style={[s.tableCell, { flex: 1.2 }]}>
                  {px(r.rect.x, imgW!)}, {px(r.rect.y, imgH!)}
                </Text>
                <Text style={[s.tableCell, { flex: 1.2 }]}>
                  {px(r.rect.width, imgW!)} × {px(r.rect.height, imgH!)}
                </Text>
              </>
            ) : (
              <>
                <Text style={[s.tableCell, { flex: 1 }]}>{pct(r.rect.x)}, {pct(r.rect.y)}</Text>
                <Text style={[s.tableCell, { flex: 1 }]}>{pct(r.rect.width)} × {pct(r.rect.height)}</Text>
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 导出函数（客户端调用） ─────────────────────────────────────────────────

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 40);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function exportPDF(session: AuditSession): Promise<void> {
  const cur = getCurrentVersion(session);
  const ctx = getActiveContext(session);
  const result = ctx?.crossPlatformResult ?? cur.crossPlatformResult;
  if (!result) return;

  const docElement = buildDocumentElement(session);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(docElement as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `走查报告_${safeFilename(session.name)}_v${cur.v}_${formatDate(cur.createdAt)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
