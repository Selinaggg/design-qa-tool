'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import type { Issue } from '@/types';

interface IssueCardProps {
  issue: Issue;
  index: number;
}

export default function IssueCard({ issue, index }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs text-slate-400 font-mono w-5 flex-shrink-0 text-right">
          {index}
        </span>
        <Badge severity={issue.severity} />
        <span className="flex-1 text-sm font-medium text-slate-800 leading-snug">
          {issue.title}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 flex flex-col gap-2.5 ml-8">
          <DetailRow label="问题描述" text={issue.description} />
          <DetailRow label="影响分析" text={issue.impact} />
          <DetailRow label="修复建议" text={issue.suggestion} highlight />
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  text,
  highlight,
}: {
  label: string;
  text: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? 'bg-blue-50' : 'bg-slate-50'}`}>
      <p className={`text-xs font-semibold mb-1 ${highlight ? 'text-blue-600' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className="text-sm text-slate-700 leading-relaxed">{text}</p>
    </div>
  );
}
