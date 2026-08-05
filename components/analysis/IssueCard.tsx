'use client';

import { useState, forwardRef } from 'react';
import Badge from '@/components/ui/Badge';
import type { Issue, IssueStatus } from '@/types';

interface IssueCardProps {
  issue: Issue;
  index: number;
  /** 圆形编号徽章的颜色，与图上徽章 tone 保持一致 */
  toneColor?: string;
  /** 是否处于选中/高亮状态（外部触发） */
  isHighlighted?: boolean;
  /** 强制展开 */
  forceExpanded?: boolean;
  onSelect?: () => void;
  onStatusChange?: (status: IssueStatus) => void;
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  pending: '待修复',
  deferred: '可暂不处理',
  ignored: '已忽略',
  fixed: '已修复',
};

const STATUS_STYLE: Record<IssueStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  deferred: 'bg-amber-50 text-amber-700 border border-amber-200',
  ignored: 'bg-slate-50 text-slate-400 border border-slate-200',
  fixed: 'bg-green-50 text-green-700 border border-green-200',
};

const IssueCard = forwardRef<HTMLDivElement, IssueCardProps>(function IssueCard(
  { issue, index, toneColor, isHighlighted, forceExpanded, onSelect, onStatusChange },
  ref,
) {
  const [innerExpanded, setInnerExpanded] = useState(false);
  const expanded = forceExpanded ?? innerExpanded;
  const status = issue.status ?? 'pending';

  const handleClick = () => {
    setInnerExpanded((v) => !v);
    onSelect?.();
  };

  return (
    <div
      ref={ref}
      className={`border rounded-xl overflow-hidden bg-white transition-all ${
        isHighlighted ? 'border-blue-400 ring-2 ring-blue-100 shadow-md' : 'border-slate-200'
      }`}
    >
      <button
        onClick={handleClick}
        className="w-full flex flex-col gap-2 px-3 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {/* Row 1: numbered circle badge + severity + status + chevron */}
        <div className="flex items-center gap-2 w-full">
          <NumberedCircle index={index} color={toneColor} />
          <Badge severity={issue.severity} />
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 flex-shrink-0 ml-auto transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Row 2: full-width title */}
        <p className="text-sm font-medium text-slate-800 leading-snug break-words w-full">
          {issue.title}
        </p>

        {/* Row 3: tags (optional) */}
        {issue.tags && issue.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 w-full">
            {issue.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2.5 flex flex-col gap-2">
          <DetailRow label="问题描述" text={issue.description} />
          <DetailRow label="影响分析" text={issue.impact} />
          <DetailRow label="修复建议" text={issue.suggestion} highlight />
          {onStatusChange && (
            <div className="flex items-center gap-1 pt-1">
              <span className="text-[11px] text-slate-400 mr-1">标记为：</span>
              {(['pending', 'deferred', 'ignored', 'fixed'] as IssueStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(s);
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                    status === s
                      ? STATUS_STYLE[s] + ' font-semibold'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default IssueCard;

function NumberedCircle({ index, color }: { index: number; color?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white text-[11px] font-bold flex-shrink-0"
      style={{
        width: 20,
        height: 20,
        background: color ?? '#94a3b8',
        border: '2px solid #ffffff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }}
    >
      {index}
    </span>
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
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-blue-50' : 'bg-slate-50'}`}>
      <p className={`text-[11px] font-semibold mb-1 ${highlight ? 'text-blue-600' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className="text-sm text-slate-700 leading-relaxed break-words">{text}</p>
    </div>
  );
}
