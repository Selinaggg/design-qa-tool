'use client';

import { useMemo } from 'react';
import IssueCard from './IssueCard';
import Button from '@/components/ui/Button';
import type { IssueSeverity } from '@/types';
import type { AnalysisResponse } from '@/hooks/useAnalysis';

const SEVERITY_ORDER: IssueSeverity[] = ['Critical', 'Major', 'Minor'];

const severityStyle: Record<IssueSeverity, string> = {
  Critical: 'bg-red-50 border-red-200 text-red-700',
  Major: 'bg-orange-50 border-orange-200 text-orange-700',
  Minor: 'bg-yellow-50 border-yellow-200 text-yellow-700',
};

interface AnalysisPanelProps {
  result: AnalysisResponse | null;
  isAnalyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
  canAnalyze: boolean;
}

export default function AnalysisPanel({
  result,
  isAnalyzing,
  error,
  onAnalyze,
  canAnalyze,
}: AnalysisPanelProps) {
  const grouped = useMemo(() => {
    if (!result) return null;
    return Object.fromEntries(
      SEVERITY_ORDER.map((sev) => [sev, result.issues.filter((i) => i.severity === sev)]),
    ) as Record<IssueSeverity, typeof result.issues>;
  }, [result]);

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate-500">
            基于设计规范和差异图，识别问题并给出修复建议
          </p>
          {result?._provider === 'mock' && (
            <p className="text-xs text-amber-600">
              当前为 Mock 数据。在 <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code> 中配置{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">AI_PROVIDER</code> 可接入真实 AI。
            </p>
          )}
        </div>
        <Button onClick={onAnalyze} disabled={!canAnalyze || isAnalyzing} size="md">
          {isAnalyzing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              分析中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              开始 AI 走查
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Results */}
      {result && grouped && (
        <>
          {/* Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-700">{result.summary}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {SEVERITY_ORDER.map((sev) => (
              <div
                key={sev}
                className={`rounded-xl border px-4 py-3 flex flex-col gap-0.5 ${severityStyle[sev]}`}
              >
                <span className="text-2xl font-bold tabular-nums">{grouped[sev].length}</span>
                <span className="text-xs font-semibold">{sev}</span>
              </div>
            ))}
          </div>

          {/* Issue groups */}
          {SEVERITY_ORDER.map((sev) =>
            grouped[sev].length > 0 ? (
              <div key={sev} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
                  {sev} · {grouped[sev].length} 个问题
                </h3>
                {grouped[sev].map((issue, i) => (
                  <IssueCard key={issue.id} issue={issue} index={i + 1} />
                ))}
              </div>
            ) : null,
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !isAnalyzing && !error && (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
          <svg className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <p className="text-sm">点击「开始 AI 走查」生成问题清单</p>
        </div>
      )}
    </div>
  );
}
