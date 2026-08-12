'use client';

/**
 * VersionDiffDialog —— 两个版本之间的差异对比弹窗
 *
 * 展示：
 *   - 头部：v(from) → v(to) 选择器 + 一键交换
 *   - 评分卡片：综合评分 / 跨端一致性 + ↑↓ delta
 *   - 三分组：🆕 新增 / 🔵 存续（title 对比）/ 🟢 已修复
 *   - 页脚：一键导出 Markdown diff 报告
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { AuditSession } from './types';
import type { PlatformConsistencyIssue, IssueSeverityCP } from '@/lib/crossPlatform';
import { computeVersionDiff } from '@/lib/sessionHelpers';
import { exportVersionDiffMarkdown } from '@/lib/exportReport';

interface VersionDiffDialogProps {
  open: boolean;
  onClose: () => void;
  session: AuditSession;
  /** 默认对比 from → to；不传则用 currentIndex-1 → currentIndex */
  defaultFromIndex?: number;
  defaultToIndex?: number;
}

const SEV_STYLE: Record<IssueSeverityCP, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
};

export default function VersionDiffDialog(props: VersionDiffDialogProps) {
  // 用 AnimatePresence 包裹让 exit 动画能播完，key 用 open 状态区分
  return (
    <AnimatePresence>
      {props.open && (
        <DialogInner key={`${props.defaultFromIndex}:${props.defaultToIndex}`} {...props} />
      )}
    </AnimatePresence>
  );
}

function DialogInner({
  onClose,
  session,
  defaultFromIndex,
  defaultToIndex,
}: VersionDiffDialogProps) {
  const cur = session.currentVersionIndex;
  const initFrom = defaultFromIndex ?? Math.max(0, cur - 1);
  const initTo = defaultToIndex ?? cur;

  const [fromIndex, setFromIndex] = useState(initFrom);
  const [toIndex, setToIndex] = useState(initTo);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const diff = useMemo(
    () => computeVersionDiff(session, fromIndex, toIndex),
    [session, fromIndex, toIndex],
  );

  const swap = () => {
    setFromIndex(toIndex);
    setToIndex(fromIndex);
  };

  const versions = session.versions;
  const linksNonAdjacent = fromIndex + 1 !== toIndex;
  const bothHaveResult =
    !!versions[fromIndex]?.crossPlatformResult && !!versions[toIndex]?.crossPlatformResult;

  const handleExport = () => {
    if (!diff) return;
    exportVersionDiffMarkdown(session, diff);
  };

  const dialog = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md no-press"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        className="relative w-full max-w-[880px] max-h-[85vh] bg-white rounded-2xl shadow-drawer flex flex-col overflow-hidden border border-white/40"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900 flex-shrink-0">版本对比</h3>
            <div className="flex items-center gap-2">
              <VersionSelect
                label="基准"
                versions={versions}
                value={fromIndex}
                onChange={setFromIndex}
              />
              <button
                type="button"
                onClick={swap}
                title="交换基准与目标"
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>
              <VersionSelect
                label="目标"
                versions={versions}
                value={toIndex}
                onChange={setToIndex}
              />
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 提示条 */}
        {linksNonAdjacent && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">
            ⚠️ 只有相邻两版（v{fromIndex + 1} → v{fromIndex + 2}）之间存储了手动关联，跨版对比无法计算存续/新增/已修复。
          </div>
        )}
        {!bothHaveResult && (
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500">
            ⚠️ 两个版本之一尚未执行走查，评分和差异为空。
          </div>
        )}

        {/* 内容 */}
        {diff ? (
          <div className="flex-1 overflow-y-auto">
            {/* 评分对比 */}
            <div className="grid grid-cols-2 gap-3 p-5">
              <ScoreCard
                label="综合评分"
                fromValue={diff.fromVersion.crossPlatformResult?.overallScore}
                toValue={diff.toVersion.crossPlatformResult?.overallScore}
                delta={diff.scoreDelta.overall}
              />
              <ScoreCard
                label="跨端一致性"
                fromValue={diff.fromVersion.crossPlatformResult?.platformConsistencyScore}
                toValue={diff.toVersion.crossPlatformResult?.platformConsistencyScore}
                delta={diff.scoreDelta.consistency}
              />
            </div>

            {/* 汇总条 */}
            <div className="mx-5 mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm">
              <span className="text-slate-500">变化：</span>
              <Badge tone="rose" label={`🆕 新增 ${diff.added.length}`} />
              <Badge tone="blue" label={`🔵 存续 ${diff.persist.length}`} />
              <Badge tone="emerald" label={`🟢 已修复 ${diff.fixed.length}`} />
            </div>

            {/* 分组 */}
            <div className="px-5 pb-5 flex flex-col gap-5">
              {/* 新增 */}
              <Section
                title={`🆕 新增（${diff.added.length}）`}
                tone="rose"
                empty="没有新增问题"
              >
                {diff.added.map((issue, idx) => (
                  <IssueRow key={issue.id} index={idx + 1} issue={issue} />
                ))}
              </Section>

              {/* 存续（对比） */}
              <Section
                title={`🔵 存续（${diff.persist.length}）`}
                tone="blue"
                empty="没有存续问题"
              >
                {diff.persist.map((pair, idx) => (
                  <PersistRow
                    key={pair.to.id}
                    index={idx + 1}
                    from={pair.from}
                    to={pair.to}
                    fromV={diff.fromVersion.v}
                    toV={diff.toVersion.v}
                  />
                ))}
              </Section>

              {/* 已修复 */}
              <Section
                title={`🟢 已修复（${diff.fixed.length}）`}
                tone="emerald"
                empty="没有已修复问题"
              >
                {diff.fixed.map((issue, idx) => (
                  <IssueRow key={issue.id} index={idx + 1} issue={issue} strikethrough />
                ))}
              </Section>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12 text-sm text-slate-400">
            无法计算差异（版本不存在）
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <p className="text-xs text-slate-400">
            对比 v{versions[fromIndex]?.v ?? '?'} → v{versions[toIndex]?.v ?? '?'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
            >
              关闭
            </button>
            <button
              onClick={handleExport}
              disabled={!diff}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M12 16v-8m0 8l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              导出对比报告
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}

// ─── 子组件 ───────────────────────────────────────────────────────────────

function VersionSelect({
  label,
  versions,
  value,
  onChange,
}: {
  label: string;
  versions: AuditSession['versions'];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 font-semibold focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {versions.map((v, i) => (
          <option key={v.v} value={i}>
            v{v.v}
            {v.label ? ` · ${v.label}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScoreCard({
  label,
  fromValue,
  toValue,
  delta,
}: {
  label: string;
  fromValue?: number;
  toValue?: number;
  delta: number | null;
}) {
  const hasBoth = fromValue != null && toValue != null;
  const deltaColor = delta == null || delta === 0
    ? '#94a3b8'
    : delta > 0
      ? '#059669'
      : '#dc2626';
  const arrow = delta == null || delta === 0 ? '' : delta > 0 ? '↑' : '↓';

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white">
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-slate-800 display-headline">
          {toValue ?? '—'}
        </span>
        {hasBoth && (
          <>
            <span className="text-sm text-slate-400">
              (from {fromValue})
            </span>
            {delta !== 0 && (
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded"
                style={{ color: deltaColor, background: `${deltaColor}18` }}
              >
                {arrow} {Math.abs(delta ?? 0)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ tone, label }: { tone: 'rose' | 'blue' | 'emerald'; label: string }) {
  const style: Record<string, string> = {
    rose: 'bg-rose-100 text-rose-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style[tone]}`}>
      {label}
    </span>
  );
}

function Section({
  title,
  tone,
  empty,
  children,
}: {
  title: string;
  tone: 'rose' | 'blue' | 'emerald';
  empty: string;
  children: React.ReactNode;
}) {
  const titleColor: Record<string, string> = {
    rose: 'text-rose-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
  };
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.length === 0;
  return (
    <section className="flex flex-col gap-2">
      <h4 className={`text-sm font-semibold ${titleColor[tone]}`}>{title}</h4>
      {isEmpty ? (
        <p className="text-xs text-slate-400 pl-1">{empty}</p>
      ) : (
        <div className="flex flex-col gap-1.5">{children}</div>
      )}
    </section>
  );
}

function IssueRow({
  index,
  issue,
  strikethrough,
}: {
  index: number;
  issue: PlatformConsistencyIssue;
  strikethrough?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-start gap-2">
      <span className="mt-0.5 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold w-5 h-5 flex-shrink-0">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SEV_STYLE[issue.severity]}`}>
            {issue.severity}
          </span>
          {issue.regionName && (
            <span className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
              {issue.regionName}
            </span>
          )}
        </div>
        <p className={`text-sm ${strikethrough ? 'text-slate-500 line-through decoration-emerald-400/60' : 'text-slate-800 font-medium'} line-clamp-2`}>
          {issue.title}
        </p>
      </div>
    </div>
  );
}

function PersistRow({
  index,
  from,
  to,
  fromV,
  toV,
}: {
  index: number;
  from: PlatformConsistencyIssue;
  to: PlatformConsistencyIssue;
  fromV: number;
  toV: number;
}) {
  const titleChanged = from.title !== to.title;
  const severityChanged = from.severity !== to.severity;
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 flex items-start gap-2">
      <span className="mt-0.5 inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold w-5 h-5 flex-shrink-0">
        {index}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SEV_STYLE[to.severity]}`}>
            {to.severity}
          </span>
          {severityChanged && (
            <span className="text-[10px] text-slate-500">（from {from.severity}）</span>
          )}
          {to.regionName && (
            <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded">
              {to.regionName}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-slate-800 line-clamp-2">
          <span className="text-[10px] text-blue-600 mr-1">v{toV}</span>
          {to.title}
        </p>
        {titleChanged && (
          <p className="text-xs text-slate-500 line-through decoration-slate-300 line-clamp-1">
            <span className="text-[10px] text-slate-400 mr-1 no-underline">v{fromV}</span>
            {from.title}
          </p>
        )}
      </div>
    </div>
  );
}
