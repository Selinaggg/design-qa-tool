'use client';

import { useEffect, useMemo } from 'react';
import type { Board, AuditSession } from './types';
import { getActiveContext } from '@/lib/sessionHelpers';

interface BoardTabsProps {
  session: AuditSession;
  onSetActiveBoard: (boardId: string) => void;
}

/**
 * 批量走查画板切换栏（P2.7）
 * - 仅在 session.type === 'batch' 且当前版本存在 boards 时显示
 * - 快捷键：⌘+[ / ⌘+] （Mac）或 Ctrl+[ / Ctrl+] （其他）前/后切换
 * - 快捷键不在 input/textarea/contenteditable 中触发
 */
export default function BoardTabs({ session, onSetActiveBoard }: BoardTabsProps) {
  const ctx = getActiveContext(session);
  const boards = ctx?.boards ?? null;
  const activeId = ctx?.activeBoard?.id ?? null;

  // 找到当前 index，用于快捷键前后切
  const activeIndex = useMemo(() => {
    if (!boards || !activeId) return -1;
    return boards.findIndex((b) => b.id === activeId);
  }, [boards, activeId]);

  useEffect(() => {
    if (!boards || boards.length <= 1) return;

    const handler = (e: KeyboardEvent) => {
      // 忽略输入元素
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key !== '[' && e.key !== ']') return;

      e.preventDefault();
      const idx = boards.findIndex((b) => b.id === activeId);
      if (idx < 0) return;
      const nextIdx = e.key === '['
        ? (idx - 1 + boards.length) % boards.length
        : (idx + 1) % boards.length;
      onSetActiveBoard(boards[nextIdx].id);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [boards, activeId, onSetActiveBoard]);

  if (!boards || boards.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-200 bg-slate-50/60 flex-shrink-0 min-w-0 overflow-x-auto">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-2 flex-shrink-0">
        画板
      </span>
      {boards.map((b, i) => (
        <BoardTab
          key={b.id}
          board={b}
          index={i}
          active={b.id === activeId}
          onClick={() => onSetActiveBoard(b.id)}
        />
      ))}
      <span className="text-[10px] text-slate-300 ml-auto flex-shrink-0 hidden md:inline">
        {activeIndex >= 0 ? `${activeIndex + 1} / ${boards.length}` : `${boards.length} 个画板`}
        {boards.length > 1 && <span className="ml-2 text-slate-300">⌘+[ / ⌘+] 切换</span>}
      </span>
    </div>
  );
}

function BoardTab({
  board,
  index,
  active,
  onClick,
}: {
  board: Board;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const platformLabel =
    board.platformMode === 'both'
      ? '双端'
      : board.platformMode === 'ios-only'
        ? 'iOS'
        : 'AND';
  const platformClass =
    board.platformMode === 'both'
      ? 'bg-green-100 text-green-700'
      : board.platformMode === 'ios-only'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-emerald-100 text-emerald-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
        active
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-600 hover:bg-white/70'
      }`}
      title={board.name}
    >
      <span className="text-[10px] text-slate-400 font-semibold">{index + 1}</span>
      <span className="truncate max-w-[140px]">{board.name}</span>
      <span
        className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] leading-none font-bold ${platformClass}`}
      >
        {platformLabel}
      </span>
    </button>
  );
}
