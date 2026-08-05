'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ConsistencyIssueCard from '@/components/cross-platform/ConsistencyIssueCard';
import { toneFromSeverity, type BadgeTone } from '@/components/comparison/IssueBadgeOverlay';
import type { AuditSession } from './types';
import {
  getCurrentVersion,
  getPrevVersion,
  getFixedPrevIssues,
  getLinkedPrevIssueId,
  getIssueVersionStatus,
} from '@/lib/sessionHelpers';
import type { IssueSeverityCP, IssueStatusCP, IssueType, PlatformConsistencyIssue } from '@/lib/crossPlatform';
import LinkIssueDialog from './LinkIssueDialog';
import type { ManualIssueDraft } from './WorkbenchMain';

interface IssuesSidebarProps {
  session: AuditSession | null;
  onHighlightRegion?: (regionName: string | null) => void;
  highlightedRegionName?: string | null;
  /** 当前高亮的问题 id（与中栏徽章联动） */
  highlightedIssueId?: string | null;
  onHighlightIssue?: (id: string | null) => void;
  /** 更新某条问题的状态（同步回中栏徽章配色） */
  onUpdateIssueStatus?: (id: string, status: string) => void;
  /** 删除某条问题（AI 总结有误时由设计师手动删除） */
  onDeleteIssue?: (id: string) => void;
  /** 设置/清除某条问题关联到上一版某条问题 */
  onSetIssueLink?: (currentIssueId: string, prevIssueId: string | null) => void;
  /** 一键自动匹配未关联问题（基于相似度） */
  onAutoLinkAll?: () => void;

  // ── 手工标注（方案 B MVP） ─────────────────────────────
  /** 手工标注模式：idle / drawing / editing */
  manualMode?: 'idle' | 'drawing' | 'editing';
  /** 编辑态下的草稿 */
  manualDraft?: ManualIssueDraft | null;
  /** 顶部 ➕ 按钮：开始手工标注（进入 drawing 态） */
  onStartManual?: () => void;
  /** 更新草稿字段（部分更新） */
  onDraftChange?: (patch: Partial<ManualIssueDraft>) => void;
  /** 保存草稿为正式问题 */
  onSaveDraft?: () => void;
  /** 取消草稿并退出手工标注模式 */
  onCancelDraft?: () => void;
  /** 重新圈选（回到 drawing 态，保留已填的文本） */
  onRedrawDraft?: () => void;
}

const CP_ORDER: IssueSeverityCP[] = ['critical', 'high', 'medium', 'low'];
void CP_ORDER; // 严重度维度已下线，保留常量以便后续潜在恢复

// ── 问题类型 Tab 配置 ──────────────────────────────────────────────────────

type TypeTab = 'all' | IssueType;

const TYPE_TABS: Array<{ value: TypeTab; label: string; icon: string }> = [
  { value: 'all',               label: '全部',   icon: '⊞' },
  { value: 'layout',            label: '布局',   icon: '◫' },
  { value: 'style',             label: '样式',   icon: '◈' },
  { value: 'content',           label: '内容',   icon: '◧' },
  { value: 'interaction',       label: '交互',   icon: '◉' },
  { value: 'platform-specific', label: '平台规范', icon: '⊕' },
];

// tone → hex 颜色，与图上徽章配色保持一致
const TONE_HEX: Record<BadgeTone, string> = {
  blue: '#3b82f6',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  gray: '#94a3b8',
  purple: '#a855f7',
};

export default function IssuesSidebar({
  session,
  onHighlightRegion,
  highlightedRegionName,
  highlightedIssueId,
  onHighlightIssue,
  onUpdateIssueStatus,
  onDeleteIssue,
  onSetIssueLink,
  onAutoLinkAll,
  manualMode = 'idle',
  manualDraft,
  onStartManual,
  onDraftChange,
  onSaveDraft,
  onCancelDraft,
  onRedrawDraft,
}: IssuesSidebarProps) {
  // 关联弹窗
  const [linkTargetIssue, setLinkTargetIssue] = useState<PlatformConsistencyIssue | null>(null);

  return (
    <aside className="w-[360px] min-w-[360px] flex-shrink-0 flex flex-col bg-white border-l border-slate-200">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            差异列表
          </h2>
        </div>
        {session && <SessionMeta session={session} />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!session ? (
          <EmptyState
            text="选择一个走查会话查看问题"
            hint="从左侧列表选择，或新建一个走查"
          />
        ) : (
          <div className="flex flex-col">
            {/* 手工标注：drawing 态提示条 */}
            {manualMode === 'drawing' && (
              <div className="mx-3 mt-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 flex items-start gap-2">
                <span className="text-lg leading-none">🎯</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-purple-800">在图上拖拽画框</p>
                  <p className="text-[11px] text-purple-600 mt-0.5">
                    选择 iOS 或 Android 图，按住鼠标拖出问题所在区域
                  </p>
                </div>
                <button
                  onClick={onCancelDraft}
                  className="flex-shrink-0 text-[11px] text-purple-500 hover:text-purple-700 underline"
                >
                  取消
                </button>
              </div>
            )}

            {/* 手工标注：editing 态草稿卡片 */}
            {manualMode === 'editing' && manualDraft && (
              <div className="mx-3 mt-3">
                <ManualDraftCard
                  draft={manualDraft}
                  onChange={onDraftChange}
                  onSave={onSaveDraft}
                  onCancel={onCancelDraft}
                  onRedraw={onRedrawDraft}
                />
              </div>
            )}

            <CrossPlatformIssues
              session={session}
              onHighlightRegion={onHighlightRegion}
              highlightedRegionName={highlightedRegionName}
              highlightedIssueId={highlightedIssueId}
              onHighlightIssue={onHighlightIssue}
              onUpdateIssueStatus={onUpdateIssueStatus}
              onDeleteIssue={onDeleteIssue}
              onOpenLinkDialog={onSetIssueLink ? setLinkTargetIssue : undefined}
              onAutoLinkAll={onAutoLinkAll}
            />
          </div>
        )}
      </div>

      {/* 关联上版问题弹窗 */}
      {session && onSetIssueLink && (
        <LinkIssueDialog
          open={linkTargetIssue !== null}
          onClose={() => setLinkTargetIssue(null)}
          session={session}
          currentIssue={linkTargetIssue}
          onConfirm={onSetIssueLink}
        />
      )}
    </aside>
  );
}

function SessionMeta({ session }: { session: AuditSession }) {
  const cur = getCurrentVersion(session);
  const r = cur.crossPlatformResult;

  if (!r) return (
    <div className="flex items-center gap-2 pt-1">
      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">
        v{cur.v}
      </span>
      <p className="text-xs text-slate-400">尚未生成走查</p>
    </div>
  );

  // 按状态计数（严重度维度已下线）
  const counts = { pending: 0, fixed: 0, ignored: 0, deferred: 0 };
  for (const issue of r.issues) {
    const st = issue.status ?? 'pending';
    counts[st] = (counts[st] ?? 0) + 1;
  }
  const total = r.issues.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">
        v{cur.v}
      </span>
      <span className="text-xs text-slate-600">共 <span className="font-semibold tabular-nums">{total}</span> 项</span>
      {counts.pending > 0 && (
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
          待修复 {counts.pending}
        </span>
      )}
      {counts.fixed > 0 && (
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
          已修复 {counts.fixed}
        </span>
      )}
      {counts.deferred > 0 && (
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          暂不处理 {counts.deferred}
        </span>
      )}
      {counts.ignored > 0 && (
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          已忽略 {counts.ignored}
        </span>
      )}
      {r.isMock && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">mock</span>
      )}
    </div>
  );
}

function CrossPlatformIssues({
  session,
  onHighlightRegion,
  highlightedRegionName,
  highlightedIssueId,
  onHighlightIssue,
  onUpdateIssueStatus,
  onDeleteIssue,
  onOpenLinkDialog,
  onAutoLinkAll,
}: {
  session: AuditSession;
  onHighlightRegion?: (regionName: string | null) => void;
  highlightedRegionName?: string | null;
  highlightedIssueId?: string | null;
  onHighlightIssue?: (id: string | null) => void;
  onUpdateIssueStatus?: (id: string, status: string) => void;
  onDeleteIssue?: (id: string) => void;
  onOpenLinkDialog?: (issue: PlatformConsistencyIssue) => void;
  onAutoLinkAll?: () => void;
}) {
  const cur = getCurrentVersion(session);
  const r = cur.crossPlatformResult;
  const prev = getPrevVersion(session);
  // 当前版本截图（传给卡片做区域裁剪预览）
  const iosImage = cur.iosImage ?? null;
  const androidImage = cur.androidImage ?? null;

  // 类型 Tab
  const [typeTab, setTypeTab] = useState<TypeTab>('all');

  // 已修复列表（上一版有、本版没关联）
  const fixedPrev = useMemo(() => getFixedPrevIssues(session), [session]);
  const prevIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    prev?.crossPlatformResult?.issues.forEach((i, idx) => map.set(i.id, idx + 1));
    return map;
  }, [prev]);

  const orderedIndex = useMemo(() => {
    const map = new Map<string, number>();
    r?.issues.forEach((i, idx) => map.set(i.id, idx + 1));
    return map;
  }, [r]);

  // 各 type 计数（用于 Tab 徽章）；手工问题归入 'layout'（默认 type）
  const typeCounts = useMemo(() => {
    const counts: Record<TypeTab, number> = {
      all: 0, layout: 0, style: 0, content: 0, interaction: 0, 'platform-specific': 0,
    };
    r?.issues.forEach((i) => {
      counts.all++;
      counts[i.type]++;
    });
    return counts;
  }, [r]);

  // 当前 Tab 过滤后的 issues
  const filteredIssues = useMemo(() => {
    if (!r) return [];
    return typeTab === 'all' ? r.issues : r.issues.filter((i) => i.type === typeTab);
  }, [r, typeTab]);

  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    if (!highlightedIssueId) return;
    const el = cardRefs.current.get(highlightedIssueId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedIssueId]);

  if (!r || r.issues.length === 0) {
    return <EmptyState text="尚未生成走查结果" hint="在中间面板运行跨端走查" />;
  }

  // 当前 tab 下是否有未关联问题（用于自动匹配提示）
  const hasUnlinkedInTab = filteredIssues.some((i) => !cur.issueLinks?.[i.id]);

  return (
    <div className="flex flex-col">
      {/* ── 类型 Tab 栏 ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-3 pt-3 pb-0">
        <div className="flex gap-0.5 overflow-x-auto scrollbar-none pb-px">
          {TYPE_TABS.map(({ value, label }) => {
            const count = typeCounts[value];
            // 没有该类型问题时隐藏（'all' 始终显示）
            if (value !== 'all' && count === 0) return null;
            const active = typeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTypeTab(value)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
                <span
                  className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold ${
                    active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-4">
        {highlightedRegionName && (
          <button
            onClick={() => onHighlightRegion?.(null)}
            className="text-xs text-blue-600 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors self-start"
          >
            正在高亮：{highlightedRegionName} ×
          </button>
        )}

        {/* 一键自动匹配（v>=2 且当前 tab 下存在未关联问题时展示） */}
        {prev && onAutoLinkAll && hasUnlinkedInTab && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-blue-700">💡 一键匹配上版</p>
              <p className="text-[10px] text-slate-500 truncate">
                基于标题/描述/区域相似度自动关联未匹配的问题
              </p>
            </div>
            <button
              type="button"
              onClick={onAutoLinkAll}
              className="flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
            >
              自动匹配
            </button>
          </div>
        )}

        {/* 当前 tab 无问题时的空态 */}
        {filteredIssues.length === 0 && (
          <EmptyState text={`「${TYPE_TABS.find(t => t.value === typeTab)?.label}」类型暂无问题`} />
        )}

        {/* 本版问题列表（扁平，按类型 tab 过滤） */}
        {filteredIssues.map((issue) => {
          const idx = orderedIndex.get(issue.id) ?? 0;
          const tone: BadgeTone = issue.manual ? 'purple' : toneFromSeverity(issue.severity, issue.status);
          const linkedPrevId = getLinkedPrevIssueId(session, issue.id);
          const linkedPrevLabel = linkedPrevId && prev
            ? `v${prev.v} #${prevIndexMap.get(linkedPrevId) ?? '?'}`
            : null;
          const vStatus = getIssueVersionStatus(session, issue.id);
          return (
            <ConsistencyIssueCard
              key={issue.id}
              ref={(el) => {
                cardRefs.current.set(issue.id, el);
              }}
              issue={issue}
              index={idx}
              toneColor={TONE_HEX[tone]}
              isHighlighted={highlightedIssueId === issue.id}
              forceExpanded={highlightedIssueId === issue.id ? true : undefined}
              onSelect={() => onHighlightIssue?.(issue.id)}
              onExpand={onHighlightRegion}
              onStatusChange={
                onUpdateIssueStatus
                  ? (s: IssueStatusCP) => onUpdateIssueStatus(issue.id, s)
                  : undefined
              }
              onDelete={onDeleteIssue ? () => onDeleteIssue(issue.id) : undefined}
              versionStatus={vStatus}
              linkedPrevLabel={linkedPrevLabel}
              onLinkClick={onOpenLinkDialog ? () => onOpenLinkDialog(issue) : undefined}
              iosImage={iosImage}
              androidImage={androidImage}
            />
          );
        })}

        {/* 已修复分组（v>=2；不受 typeTab 过滤影响，始终显示全部已修复问题） */}
        {prev && fixedPrev.length > 0 && (
          <section className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                🟢 已修复 · {fixedPrev.length}
              </h3>
              <span className="text-[10px] text-slate-400">来自 v{prev.v}</span>
            </div>
            <p className="text-[11px] text-slate-400 px-1 -mt-1">
              上一版存在、本版未关联的问题（自动推导）
            </p>
            <ul className="flex flex-col gap-1.5">
              {fixedPrev.map((issue) => {
                const idx = prevIndexMap.get(issue.id) ?? 0;
                return (
                  <li
                    key={issue.id}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 flex items-start gap-2 opacity-90"
                  >
                    <span className="mt-0.5 inline-flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 flex-shrink-0">
                      {idx}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          {issue.severity}
                        </span>
                        {issue.regionName && (
                          <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded">
                            {issue.regionName}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-2 line-through decoration-emerald-400/60 decoration-1">
                        {issue.title}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-2">
      <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
      <p className="text-xs text-slate-400">{text}</p>
      {hint && <p className="text-xs text-slate-300">{hint}</p>}
    </div>
  );
}

// ─── ManualDraftCard：手工标注草稿编辑卡片 ─────────────────────────────────

const SEVERITY_OPTIONS: Array<{ value: IssueSeverityCP; label: string; color: string }> = [
  { value: 'critical', label: '严重', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'high',     label: '高',   color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'medium',   label: '中',   color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'low',      label: '低',   color: 'bg-slate-100 text-slate-600 border-slate-300' },
];

function ManualDraftCard({
  draft,
  onChange,
  onSave,
  onCancel,
  onRedraw,
}: {
  draft: ManualIssueDraft;
  onChange?: (patch: Partial<ManualIssueDraft>) => void;
  onSave?: () => void;
  onCancel?: () => void;
  onRedraw?: () => void;
}) {
  const canSave = draft.title.trim().length > 0;
  const platformLabel = draft.platform === 'ios' ? 'iOS' : 'Android';
  const platformStyle = draft.platform === 'ios' ? 'bg-blue-500' : 'bg-green-500';

  const locPx = `${Math.round(draft.location.x * 100)}%,${Math.round(
    draft.location.y * 100,
  )}% · ${Math.round(draft.location.width * 100)}%×${Math.round(draft.location.height * 100)}%`;

  return (
    <div className="rounded-xl border-2 border-purple-300 bg-purple-50/40 p-3 flex flex-col gap-2.5 shadow-sm">
      {/* Header：📝 手工标注 + 平台 + 位置 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white">
          📝 手工标注
        </span>
        <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded ${platformStyle}`}>
          {platformLabel}
        </span>
        <span className="text-[10px] text-slate-500 font-mono ml-auto truncate max-w-[140px]">
          {locPx}
        </span>
      </div>

      {/* 标题（必填） */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
          标题 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => onChange?.({ title: e.target.value })}
          placeholder="简要描述问题（如：按钮圆角不一致）"
          autoFocus
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-300 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-300"
        />
      </div>

      {/* 描述 */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
          描述
        </label>
        <textarea
          value={draft.description}
          onChange={(e) => onChange?.({ description: e.target.value })}
          rows={2}
          placeholder="详细说明（可选）"
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-300 resize-none"
        />
      </div>

      {/* 严重度：4 个 pill */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
          严重度
        </label>
        <div className="flex items-center gap-1">
          {SEVERITY_OPTIONS.map((opt) => {
            const active = draft.severity === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange?.({ severity: opt.value })}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition-all ${
                  active
                    ? opt.color + ' ring-1 ring-offset-1 ring-purple-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 建议 */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
          建议
        </label>
        <textarea
          value={draft.suggestion}
          onChange={(e) => onChange?.({ suggestion: e.target.value })}
          rows={2}
          placeholder="修改建议（可选）"
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-300 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-purple-100">
        <button
          type="button"
          onClick={onRedraw}
          className="text-[11px] text-slate-500 hover:text-purple-700 underline"
        >
          重新圈选
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          保存
        </button>
      </div>
    </div>
  );
}
