'use client';

/**
 * InsightsBar —— 常驻在 session header 下方的关键指标条
 *
 * 布局（左→右）：
 *   - 综合评分（大号数字 + 评级）
 *   - 跨端一致性（大号数字 + 评级）
 *   - 问题分布（总数 + 严重度色块）
 *   - 右侧：「导出报告」下拉 + 「走查」主按钮
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/ui/Button';
import { exportMarkdown, exportJSON } from '@/lib/exportReport';
import { getPrevVersion, getActiveContext } from '@/lib/sessionHelpers';
import type { AuditSession } from './types';
interface InsightsBarProps {
  session: AuditSession;
  loading?: boolean;
  onRunAudit: () => void;
  canRun: boolean;
}

const SEVERITY_META = {
  critical: { label: 'C', color: '#dc2626', bg: '#fef2f2' },
  high:     { label: 'H', color: '#f97316', bg: '#fff7ed' },
  medium:   { label: 'M', color: '#eab308', bg: '#fefce8' },
  low:      { label: 'L', color: '#22c55e', bg: '#f0fdf4' },
} as const;

function gradeOf(score: number): { label: string; color: string } {
  if (score >= 90) return { label: '优秀', color: '#059669' };
  if (score >= 75) return { label: '良好', color: '#2563eb' };
  if (score >= 60) return { label: '一般', color: '#d97706' };
  return { label: '较差', color: '#dc2626' };
}

export default function InsightsBar({
  session,
  loading = false,
  onRunAudit,
  canRun,
}: InsightsBarProps) {
  const ctx = getActiveContext(session);
  const result = ctx?.crossPlatformResult ?? null;
  // 版本对比：单画板走查用版本级 result；batch 场景的跨版本对比暂不实现
  const prevResult = getPrevVersion(session)?.crossPlatformResult ?? null;
  const hasResult = !!result;
  const totalIssues = result ? result.issues.length : 0;

  const overallDelta =
    result && prevResult ? result.overallScore - prevResult.overallScore : null;
  const consistencyDelta =
    result && prevResult
      ? result.platformConsistencyScore - prevResult.platformConsistencyScore
      : null;

  return (
    <div className="flex items-stretch gap-4 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
      {/* 综合评分 */}
      <ScoreBlock label="综合评分" score={result?.overallScore} emphasis delta={overallDelta} />
      <Divider />
      {/* 跨端一致性 */}
      <ScoreBlock label="跨端一致性" score={result?.platformConsistencyScore} delta={consistencyDelta} />
      <Divider />

      {/* 问题分布 */}
      <div className="flex flex-col justify-center min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-slate-800 display-headline">
            {hasResult ? totalIssues : '—'}
          </span>
          <span className="text-xs text-slate-500">项差异</span>
        </div>
        {hasResult ? (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
              const count = result!.summary[sev];
              if (count === 0) return null;
              const meta = SEVERITY_META[sev];
              return (
                <span
                  key={sev}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                  {meta.label} × {count}
                </span>
              );
            })}
            {result!.isMock && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
                mock
              </span>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            尚未走查，点击右侧按钮开始
          </p>
        )}
      </div>

      {/* 右侧：导出 + 走查 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* 导出下拉（有结果才激活） */}
        <ExportDropdown session={session} disabled={!hasResult} />

        {/* 走查主按钮 */}
        <Button
          onClick={onRunAudit}
          size="md"
          disabled={!canRun || loading}
          variant={hasResult ? 'secondary' : 'primary'}
        >
          {loading ? '走查中…' : hasResult ? '重新走查' : '开始跨端走查'}
        </Button>
      </div>
    </div>
  );
}

// ── 导出下拉按钮 ──────────────────────────────────────────────────────────

export function ExportDropdown({ session, disabled }: { session: AuditSession; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExport = async (fmt: 'md' | 'json' | 'pdf') => {
    setOpen(false);
    if (fmt === 'md') { exportMarkdown(session); return; }
    if (fmt === 'json') { exportJSON(session); return; }
    setPdfLoading(true);
    try {
      const { exportPDF } = await import('@/lib/exportPdf');
      await exportPDF(session);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || pdfLoading}
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          disabled || pdfLoading
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-600 hover:bg-slate-100 cursor-pointer'
        }`}
        title={disabled ? '请先执行走查' : '导出报告'}
      >
        {pdfLoading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            生成中…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 16v-8m0 8l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            导出报告
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[100] w-48 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
          >
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">选择格式</p>
          </div>
          <button
            type="button"
            onClick={() => handleExport('md')}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
          >
            <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div>
              <div className="font-medium">Markdown</div>
              <div className="text-[11px] text-slate-400">适合 Notion / 飞书 / GitHub</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
          >
            <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </span>
            <div>
              <div className="font-medium">JSON</div>
              <div className="text-[11px] text-slate-400">完整数据，便于程序处理</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
          >
            <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </span>
            <div>
              <div className="font-medium">PDF</div>
              <div className="text-[11px] text-slate-400">排版报告，适合分享存档</div>
            </div>
          </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────────────────────

function ScoreBlock({ label, score, emphasis, delta }: { label: string; score?: number; emphasis?: boolean; delta?: number | null }) {
  if (score == null) {
    return (
      <div className="flex flex-col justify-center min-w-[92px]">
        <span className={`${emphasis ? 'text-3xl' : 'text-2xl'} font-bold tabular-nums text-slate-300 display-headline`}>—</span>
        <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
      </div>
    );
  }
  const grade = gradeOf(score);
  const hasDelta = delta != null && delta !== 0;
  const deltaColor = hasDelta ? (delta! > 0 ? '#059669' : '#dc2626') : '#94a3b8';
  const arrow = hasDelta ? (delta! > 0 ? '↑' : '↓') : '';
  return (
    <div className="flex flex-col justify-center min-w-[92px]">
      <div className="flex items-baseline gap-1.5">
        <span className={`${emphasis ? 'text-3xl' : 'text-2xl'} font-bold tabular-nums display-headline`} style={{ color: grade.color }}>
          {score}
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: `${grade.color}18`, color: grade.color }}
        >
          {grade.label}
        </span>
        {hasDelta && (
          <span
            className="text-[10px] font-semibold px-1 py-0.5 rounded tabular-nums"
            style={{ background: `${deltaColor}18`, color: deltaColor }}
            title="相对上一版的变化"
          >
            {arrow}{Math.abs(delta!)}
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function Divider() {
  return <div className="w-px bg-slate-200 self-stretch flex-shrink-0" />;
}
