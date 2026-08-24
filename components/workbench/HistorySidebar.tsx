'use client';

import { useEffect, useState } from 'react';
import type { AuditSession } from './types';

interface HistorySidebarProps {
  sessions: AuditSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onSelectVersion: (sessionId: string, versionIndex: number) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

const COLLAPSED_KEY = 'workbench.historySidebar.collapsed';

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 会话名首字符（用于折叠态图标） */
function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // 优先中文/英文字符，跳过前导标点
  const match = trimmed.match(/[\u4e00-\u9fa5A-Za-z0-9]/);
  return (match?.[0] ?? trimmed[0]).toUpperCase();
}

export default function HistorySidebar({
  sessions,
  activeSessionId,
  onSelect,
  onSelectVersion,
  onNew,
  onDelete,
}: HistorySidebarProps) {
  // 每个会话的用户手动展开态；未设置的多版本 active 会话默认展开
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // 侧栏折叠态：SSR 时统一为 false（展开态），mount 后再从 localStorage 恢复，避免 hydration mismatch
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);

  // 挂载后从 localStorage 读取真实态
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSED_KEY) === '1') {
        setCollapsed(true);
      }
    } catch {
      /* ignore disabled storage */
    }
    setHydrated(true);
  }, []);

  // 折叠态持久化（hydrate 完成后才写，避免覆盖初始值）
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [collapsed, hydrated]);

  /** 派生：某会话是否应该展开 —— 用户手动设置优先，否则 active 且多版本时默认展开 */
  const isExpanded = (s: AuditSession): boolean => {
    if (s.id in expanded) return expanded[s.id];
    return s.id === activeSessionId && s.versions.length > 1;
  };

  const toggleExpand = (id: string, currentDefault: boolean) => {
    setExpanded((prev) => ({ ...prev, [id]: !currentDefault }));
  };

  // ── 折叠态：56px 图标条 ──────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-[56px] flex-shrink-0 flex flex-col material-thick border-r border-slate-200/60">
        {/* 展开按钮 */}
        <div className="flex items-center justify-center p-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="展开走查历史"
            aria-label="展开走查历史"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 新建按钮（图标态） */}
        <div className="flex items-center justify-center p-2 border-b border-slate-100">
          <button
            type="button"
            onClick={onNew}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
            title="新建走查"
            aria-label="新建走查"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* 会话列表（首字符圆点） */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                title={s.name}
                aria-label={s.name}
                className={`w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {initialOf(s.name)}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  // ── 展开态：220px 完整列表 ────────────────────────────────
  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col material-thick border-r border-slate-200/60">
      {/* Header + New button */}
      <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            走查历史
          </h2>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="p-1 -mr-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="收起侧栏"
            aria-label="收起侧栏"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <button
          onClick={onNew}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建走查
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4 gap-2">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-xs text-slate-400">还没有走查记录</p>
            <p className="text-xs text-slate-300">点击「新建走查」开始</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((s) => {
              const active = s.id === activeSessionId;
              const multiVersion = s.versions.length > 1;
              const isOpen = isExpanded(s);
              return (
                <li key={s.id}>
                  {/* 会话行 */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(s.id);
                      }
                    }}
                    className={`group w-full text-left rounded-lg px-3 py-2.5 transition-colors flex flex-col gap-1 cursor-pointer ${
                      active
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {formatTime(s.createdAt)}
                      </span>
                      {multiVersion && (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                          {s.versions.length} 版
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${active ? 'text-blue-700' : 'text-slate-700'}`}>
                        {s.name}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {multiVersion && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(s.id, isOpen);
                            }}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                            title={isOpen ? '折叠版本' : '展开版本'}
                          >
                            <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`确定要删除「${s.name}」吗？将同时删除全部 ${s.versions.length} 个版本`)) onDelete(s.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                          title="删除会话"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 版本子项列表（多版本且展开时显示） */}
                  {multiVersion && isOpen && (
                    <ul className="ml-4 mt-1 mb-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2">
                      {s.versions.map((v, idx) => {
                        const isActiveVersion = active && idx === s.currentVersionIndex;
                        return (
                          <li key={v.v}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectVersion(s.id, idx);
                              }}
                              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                                isActiveVersion
                                  ? 'bg-blue-100 text-blue-700 font-semibold'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold flex-shrink-0 ${
                                isActiveVersion ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}>
                                v{v.v}
                              </span>
                              <span className="flex-1 min-w-0 truncate">
                                {v.label ?? (idx === 0 ? '初始版本' : `第 ${v.v} 版`)}
                              </span>
                              <span className="text-[10px] text-slate-400 flex-shrink-0">
                                {formatTime(v.createdAt)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer note */}
      <div className="p-3 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          本期历史仅在当前窗口保存，刷新页面会清空
        </p>
      </div>
    </aside>
  );
}
