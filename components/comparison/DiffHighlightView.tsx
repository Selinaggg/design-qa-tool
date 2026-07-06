'use client';

import type { DiffResult } from '@/lib/diffEngine';

interface DiffHighlightViewProps {
  diffResult: DiffResult | null;
  isProcessing: boolean;
  error: string | null;
}

export default function DiffHighlightView({
  diffResult,
  isProcessing,
  error,
}: DiffHighlightViewProps) {
  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">正在计算像素差异...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">
        计算失败：{error}
      </div>
    );
  }

  if (!diffResult) return null;

  const { diffUrl, mismatchCount, mismatchPercent, totalPixels } = diffResult;
  const severity =
    mismatchPercent === 0 ? 'none'
    : mismatchPercent < 1 ? 'low'
    : mismatchPercent < 5 ? 'medium'
    : 'high';

  const severityConfig = {
    none: { label: '完全一致', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    low: { label: '轻微差异', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    medium: { label: '明显差异', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    high: { label: '差异较大', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  };

  const cfg = severityConfig[severity];

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-2.5">
          <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
          <span className="text-slate-400 text-xs">|</span>
          <span className="text-sm text-slate-600">
            差异像素 <strong>{mismatchCount.toLocaleString()}</strong> /
            总像素 {totalPixels.toLocaleString()}
          </span>
        </div>
        <span className={`text-lg font-bold tabular-nums ${cfg.color}`}>
          {mismatchPercent.toFixed(2)}%
        </span>
      </div>

      {/* Diff image */}
      <div className="overflow-auto rounded-xl border border-slate-200 bg-[image:repeating-conic-gradient(#e0e0e0_0%_25%,#f5f5f5_0%_50%)] bg-[size:16px_16px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={diffUrl}
          alt="差异高亮图"
          className="max-w-full block"
          draggable={false}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#FF4136] inline-block" />
          差异像素
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#FFC800] inline-block" />
          抗锯齿
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-slate-800 border border-slate-300 inline-block" />
          相同像素
        </div>
      </div>
    </div>
  );
}
