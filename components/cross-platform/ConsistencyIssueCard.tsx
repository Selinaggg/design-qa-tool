'use client';

import { useState } from 'react';
import type { PlatformConsistencyIssue, IssueType, IssueSeverityCP, PlatformType } from '@/lib/crossPlatform';

interface ConsistencyIssueCardProps {
  issue: PlatformConsistencyIssue;
  index: number;
  /** Called when the card is expanded or collapsed; receives regionName or null */
  onExpand?: (regionName: string | null) => void;
}

const severityStyle: Record<IssueSeverityCP, string> = {
  critical: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  high:     'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200',
  low:      'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

const typeStyle: Record<IssueType, string> = {
  content:           'bg-purple-50 text-purple-700',
  layout:            'bg-blue-50 text-blue-700',
  style:             'bg-green-50 text-green-700',
  interaction:       'bg-indigo-50 text-indigo-700',
  'platform-specific': 'bg-slate-100 text-slate-600',
};

const typeLabel: Record<IssueType, string> = {
  content:           '内容',
  layout:            '布局',
  style:             '样式',
  interaction:       '交互',
  'platform-specific': '平台规范',
};

const platformLabel: Record<PlatformType, string> = {
  ios:     'iOS',
  android: 'Android',
  web:     'Web',
};

const platformBadge: Record<PlatformType, string> = {
  ios:     'bg-blue-500 text-white',
  android: 'bg-green-500 text-white',
  web:     'bg-slate-500 text-white',
};

export default function ConsistencyIssueCard({ issue, index, onExpand }: ConsistencyIssueCardProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    onExpand?.(next ? (issue.regionName ?? null) : null);
  };

  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${issue.isAcceptablePlatformDifference ? 'border-slate-200 opacity-80' : 'border-slate-200'}`}>
      <button
        onClick={() => toggle()}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs text-slate-400 font-mono w-5 flex-shrink-0 text-right pt-0.5">
          {index}
        </span>

        {/* Severity */}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${severityStyle[issue.severity]}`}>
          {issue.severity}
        </span>

        {/* Type */}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${typeStyle[issue.type]}`}>
          {typeLabel[issue.type]}
        </span>

        {/* Title */}
        <span className="flex-1 text-sm font-medium text-slate-800 leading-snug min-w-0">
          {issue.title}
          {issue.isAcceptablePlatformDifference && (
            <span className="ml-2 text-xs font-normal text-slate-400">（平台合理差异）</span>
          )}
        </span>

        {/* Platform tags */}
        <div className="flex gap-1 flex-shrink-0">
          {issue.platforms.map((p) => (
            <span key={p} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${platformBadge[p]}`}>
              {platformLabel[p]}
            </span>
          ))}
        </div>

        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-150 mt-0.5 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 flex flex-col gap-2.5 ml-8">
          {issue.regionName && (
            <p className="text-xs text-slate-400">区域：<span className="text-slate-600 font-medium">{issue.regionName}</span></p>
          )}
          <DetailRow label="问题描述" text={issue.description} />
          <DetailRow label="影响分析" text={issue.impact} />
          <DetailRow label="修复建议" text={issue.suggestion} highlight={!issue.isAcceptablePlatformDifference} />
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-400"
                style={{ width: `${issue.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
              置信度 {Math.round(issue.confidence * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, text, highlight }: { label: string; text: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? 'bg-blue-50' : 'bg-slate-50'}`}>
      <p className={`text-xs font-semibold mb-1 ${highlight ? 'text-blue-600' : 'text-slate-500'}`}>{label}</p>
      <p className="text-sm text-slate-700 leading-relaxed">{text}</p>
    </div>
  );
}
