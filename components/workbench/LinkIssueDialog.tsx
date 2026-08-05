'use client';

/**
 * LinkIssueDialog —— 关联上版问题的选择弹窗
 *
 * 场景：v2 及以上版本的某条问题，希望标记为"上一版的某条问题延续"
 * 一对一约束：若目标问题已被别的当前版问题关联，切换时会自动解除
 */

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AuditSession } from './types';
import type { PlatformConsistencyIssue, IssueSeverityCP } from '@/lib/crossPlatform';
import {
  getPrevVersion,
  getLinkedPrevIssueId,
  getLinkableCandidates,
} from '@/lib/sessionHelpers';

interface LinkIssueDialogProps {
  open: boolean;
  onClose: () => void;
  session: AuditSession;
  /** 当前版本被操作的 issue */
  currentIssue: PlatformConsistencyIssue | null;
  /** 选中确认后回调：prevIssueId=null 表示"取消关联" */
  onConfirm: (currentIssueId: string, prevIssueId: string | null) => void;
}

const SEV_STYLE: Record<IssueSeverityCP, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
};

export default function LinkIssueDialog({
  open,
  onClose,
  session,
  currentIssue,
  onConfirm,
}: LinkIssueDialogProps) {
  // 每次 open+currentIssue 变化时用 key 强制 remount 内部内容，避免用 useEffect 重置 state
  return (
    <>
      {open && currentIssue && (
        <DialogInner
          key={`${currentIssue.id}:${open}`}
          onClose={onClose}
          session={session}
          currentIssue={currentIssue}
          onConfirm={onConfirm}
        />
      )}
    </>
  );
}

function DialogInner({
  onClose,
  session,
  currentIssue,
  onConfirm,
}: {
  onClose: () => void;
  session: AuditSession;
  currentIssue: PlatformConsistencyIssue;
  onConfirm: (currentIssueId: string, prevIssueId: string | null) => void;
}) {
  // Lazy 初始化：不再需要 useEffect 同步
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    getLinkedPrevIssueId(session, currentIssue.id),
  );
  const [keyword, setKeyword] = useState('');

  // ESC 关闭（唯一保留的 effect，是订阅外部事件，符合规则）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const prev = useMemo(() => getPrevVersion(session), [session]);
  const candidates = useMemo(
    () => getLinkableCandidates(session, currentIssue.id),
    [session, currentIssue],
  );

  const filtered = useMemo(() => {
    if (!keyword.trim()) return candidates;
    const kw = keyword.toLowerCase();
    return candidates.filter(
      (i) =>
        i.title.toLowerCase().includes(kw) ||
        i.description.toLowerCase().includes(kw) ||
        (i.regionName ?? '').toLowerCase().includes(kw),
    );
  }, [candidates, keyword]);

  if (!prev) return null;

  const handleConfirm = () => {
    onConfirm(currentIssue.id, selectedId);
    onClose();
  };

  const dialog = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Mask */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-[560px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]">
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900">关联上版问题</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              选择 <span className="font-semibold text-slate-700">v{prev.v}</span> 中与本条问题对应的记录
            </p>
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

        {/* 当前问题预览 */}
        <div className="px-5 py-3 bg-blue-50/50 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">当前问题</p>
          <p className="text-sm font-medium text-slate-800 line-clamp-2">{currentIssue.title}</p>
        </div>

        {/* 搜索 */}
        <div className="px-5 py-3 border-b border-slate-100">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索标题、描述或区域名"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        {/* 候选列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* "不关联"选项 */}
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={`w-full text-left rounded-lg px-3 py-2 mb-2 border-2 transition-colors ${
              selectedId === null
                ? 'border-blue-500 bg-blue-50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selectedId === null ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
              }`}>
                {selectedId === null && (
                  <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">不关联（作为新增问题）</p>
                <p className="text-[11px] text-slate-400">本版新出现的问题，与上一版无对应</p>
              </div>
            </div>
          </button>

          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-400">
                {keyword.trim() ? '没有匹配的问题' : `v${prev.v} 尚无问题（是否已执行走查？）`}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((issue, idx) => {
                const isSelected = selectedId === issue.id;
                const globalIdx = prev.crossPlatformResult?.issues.findIndex((i) => i.id === issue.id) ?? idx;
                return (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(issue.id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 border-2 transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400">#{globalIdx + 1}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SEV_STYLE[issue.severity]}`}>
                              {issue.severity}
                            </span>
                            {issue.regionName && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {issue.regionName}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-800 line-clamp-2">{issue.title}</p>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{issue.description}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <p className="text-xs text-slate-400">
            {selectedId ? '选择目标后点击确认' : '不关联则视为本版新增问题'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
