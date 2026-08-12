'use client';

/**
 * 工作台首页（P4 集成版 + 方案 B MVP 手工标注）
 * ─────────────────────────────────────────────────────────────
 * 三栏布局：
 *   [HistorySidebar]  ← 走查历史（会话 + 版本树）
 *   [WorkbenchMain ]  ← 图上标注 + 多视图对比 + 版本对比 + 手工画框
 *   [IssuesSidebar ]  ← 问题列表（关联 / 状态 / 徽章联动 / 手工标注入口 + 草稿编辑）
 *
 * 手工标注 state（manualMode + manualDraft）集中在此，两栏共享。
 */

import { useCallback, useMemo, useState } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import HistorySidebar from '@/components/workbench/HistorySidebar';
import WorkbenchMain, { type ManualIssueDraft } from '@/components/workbench/WorkbenchMain';
import IssuesSidebar from '@/components/workbench/IssuesSidebar';
import NewAuditDrawer from '@/components/workbench/NewAuditDrawer';
import {
  addManualIssue,
  addNewVersion,
  autoLinkIssuesBySimilarity,
  setActiveBoardId,
  setIssueLink,
  switchVersion,
  updateBoardInCurrentVersion,
  updateCurrentVersion,
} from '@/lib/sessionHelpers';
import type { AuditSession, AuditVersion, Board } from '@/components/workbench/types';
import type { ImageFile } from '@/types';
import type { NormalizedRect, PlatformConsistencyIssue } from '@/lib/crossPlatform';

export default function Home() {
  // ─── 会话列表 & 当前会话 ────────────────────────────────
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // ─── NewAuditDrawer：新建会话 / 新增版本 ────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerParent, setDrawerParent] = useState<AuditSession | null>(null);

  // ─── 三栏联动：区域 / 问题高亮 ───────────────────────────
  const [highlightedRegionName, setHighlightedRegionName] = useState<string | null>(null);
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(null);

  // ─── 手工标注 state（方案 B MVP） ───────────────────────
  const [manualMode, setManualMode] = useState<'idle' | 'drawing' | 'editing'>('idle');
  const [manualDraft, setManualDraft] = useState<ManualIssueDraft | null>(null);

  // ─── 派生：当前会话 ─────────────────────────────────────
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  // ─── 手工标注回调 ───────────────────────────────────────
  /** 用户点 IssuesSidebar 顶部 ➕ 手工标注 → 进入 drawing 态 */
  const handleStartManual = useCallback(() => {
    setManualDraft(null);
    setManualMode('drawing');
  }, []);

  /** 用户在图上画完框 → 进入 editing 态，初始化 draft */
  const handleDrawnDraft = useCallback(
    (platform: 'ios' | 'android', rect: NormalizedRect) => {
      setManualDraft({
        platform,
        location: rect,
        title: '',
        description: '',
        severity: 'medium',
        suggestion: '',
      });
      setManualMode('editing');
    },
    [],
  );

  /** 侧栏卡片修改字段（部分更新） */
  const handleDraftChange = useCallback(
    (patch: Partial<ManualIssueDraft>) => {
      setManualDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [],
  );

  /** 保存草稿：写入 currentVersion.crossPlatformResult.issues，退出手工标注模式 */
  const handleSaveDraft = useCallback(() => {
    if (!activeSessionId || !manualDraft) return;
    const issue: PlatformConsistencyIssue = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: manualDraft.title.trim() || '(未命名)',
      description: manualDraft.description.trim(),
      type: 'layout',
      severity: manualDraft.severity,
      status: 'pending',
      tags: [],
      platforms: [manualDraft.platform],
      iosLocation: manualDraft.platform === 'ios' ? manualDraft.location : undefined,
      androidLocation: manualDraft.platform === 'android' ? manualDraft.location : undefined,
      isAcceptablePlatformDifference: false,
      impact: '',
      suggestion: manualDraft.suggestion.trim(),
      confidence: 1,
      manual: true,
    };
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? addManualIssue(s, issue) : s)),
    );
    setManualDraft(null);
    setManualMode('idle');
  }, [activeSessionId, manualDraft]);

  /** 取消草稿并退出手工标注 */
  const handleCancelDraft = useCallback(() => {
    setManualDraft(null);
    setManualMode('idle');
  }, []);

  /** 重新圈选：回到 drawing 态，保留文本字段（清空 location） */
  const handleRedrawDraft = useCallback(() => {
    setManualDraft((prev) =>
      prev
        ? {
            ...prev,
            // 保留 title/desc/severity/suggestion；location 会在画完后被 drawn 覆盖
          }
        : prev,
    );
    setManualMode('drawing');
  }, []);

  // ─── 会话列表操作 ───────────────────────────────────────
  const handleOpenNewAudit = useCallback(() => {
    setDrawerParent(null);
    setDrawerOpen(true);
  }, []);

  const handleAddVersion = useCallback(() => {
    if (!activeSession) return;
    setDrawerParent(activeSession);
    setDrawerOpen(true);
  }, [activeSession]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerParent(null);
  }, []);

  const handleCreateSession = useCallback((session: AuditSession) => {
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setDrawerOpen(false);
    setDrawerParent(null);
  }, []);

  const handleAddVersionToSession = useCallback(
    (
      parentId: string,
      assets: {
        iosImage: ImageFile | null;
        androidImage: ImageFile | null;
        designRefImage?: ImageFile | null;
        label?: string;
      },
    ) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== parentId) return s;
          const next = addNewVersion(s, assets);
          return next ?? s;
        }),
      );
      setActiveSessionId(parentId);
      setDrawerOpen(false);
      setDrawerParent(null);
    },
    [],
  );

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setHighlightedRegionName(null);
    setHighlightedIssueId(null);
    // 切换会话时退出手工标注
    setManualMode('idle');
    setManualDraft(null);
  }, []);

  const handleSelectVersion = useCallback((sessionId: string, versionIndex: number) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? switchVersion(s, versionIndex) : s)),
    );
    setActiveSessionId(sessionId);
    setHighlightedRegionName(null);
    setHighlightedIssueId(null);
    setManualMode('idle');
    setManualDraft(null);
  }, []);

  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setHighlightedRegionName(null);
        setHighlightedIssueId(null);
        setManualMode('idle');
        setManualDraft(null);
      }
    },
    [activeSessionId],
  );

  // ─── WorkbenchMain 回调 ─────────────────────────────────
  const handleSwitchVersion = useCallback(
    (index: number) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? switchVersion(s, index) : s)),
      );
      setHighlightedRegionName(null);
      setHighlightedIssueId(null);
      setManualMode('idle');
      setManualDraft(null);
    },
    [activeSessionId],
  );

  // 批量走查：切换 activeBoard（P2.7）
  const handleSetActiveBoard = useCallback(
    (boardId: string) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? setActiveBoardId(s, boardId) : s)),
      );
      // 切换画板时清联动态，避免误高亮
      setHighlightedRegionName(null);
      setHighlightedIssueId(null);
      setManualMode('idle');
      setManualDraft(null);
    },
    [activeSessionId],
  );

  const handleUpdateSession = useCallback(
    (patch: Partial<AuditSession>) => {
      if (!activeSessionId) return;
      setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? { ...s, ...patch } : s)));
    },
    [activeSessionId],
  );

  const handleUpdateVersion = useCallback(
    (patch: Partial<AuditVersion>) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? updateCurrentVersion(s, patch) : s)),
      );
    },
    [activeSessionId],
  );

  // P4.1：批量走查时更新指定 board 的字段（写 crossPlatformResult 用）
  const handleUpdateBoard = useCallback(
    (boardId: string, patch: Partial<Board>) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId ? updateBoardInCurrentVersion(s, boardId, patch) : s,
        ),
      );
    },
    [activeSessionId],
  );

  // ─── IssuesSidebar 回调 ─────────────────────────────────
  const handleUpdateIssueStatus = useCallback(
    (id: string, status: string) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s;
          const idx = s.currentVersionIndex;
          const cur = s.versions[idx];
          const result = cur?.crossPlatformResult;
          if (!result) return s;
          const newVersions = s.versions.map((v, i) => {
            if (i !== idx) return v;
            const r = v.crossPlatformResult;
            if (!r) return v;
            return {
              ...v,
              crossPlatformResult: {
                ...r,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                issues: r.issues.map((it) => (it.id === id ? { ...it, status: status as any } : it)),
              },
            };
          });
          return { ...s, versions: newVersions };
        }),
      );
    },
    [activeSessionId],
  );

  const handleDeleteIssue = useCallback(
    (id: string) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s;
          const idx = s.currentVersionIndex;
          const newVersions = s.versions.map((v, i) => {
            if (i !== idx) return v;
            const r = v.crossPlatformResult;
            if (!r) return v;
            return {
              ...v,
              crossPlatformResult: {
                ...r,
                issues: r.issues.filter((it) => it.id !== id),
              },
            };
          });
          return { ...s, versions: newVersions };
        }),
      );
    },
    [activeSessionId],
  );

  const handleSetIssueLink = useCallback(
    (currentIssueId: string, prevIssueId: string | null) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? setIssueLink(s, currentIssueId, prevIssueId) : s)),
      );
    },
    [activeSessionId],
  );

  const handleAutoLinkAll = useCallback(() => {
    if (!activeSessionId) return;
    let matchedCount = 0;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const { session: next, matched } = autoLinkIssuesBySimilarity(s);
        matchedCount = matched;
        return next;
      }),
    );
    setTimeout(() => {
      if (matchedCount > 0) {
        alert(`自动匹配完成：新关联 ${matchedCount} 条问题`);
      } else {
        alert('未找到可自动匹配的问题（相似度过低或无候选）');
      }
    }, 0);
  }, [activeSessionId]);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <AppHeader />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左栏：走查历史 */}
        <HistorySidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onSelectVersion={handleSelectVersion}
          onNew={handleOpenNewAudit}
          onDelete={handleDeleteSession}
        />

        {/* 中栏：画板 / 视图切换 / 版本操作 / 手工画框 */}
        <WorkbenchMain
          session={activeSession}
          onNewAudit={handleOpenNewAudit}
          onAddVersion={handleAddVersion}
          onSwitchVersion={handleSwitchVersion}
          onSetActiveBoard={handleSetActiveBoard}
          onUpdateSession={handleUpdateSession}
          onUpdateVersion={handleUpdateVersion}
          onUpdateBoard={handleUpdateBoard}
          highlightedRegionName={highlightedRegionName}
          highlightedIssueId={highlightedIssueId}
          onHighlightIssue={setHighlightedIssueId}
          manualMode={manualMode}
          manualDraft={manualDraft}
          onDrawnDraft={handleDrawnDraft}
          onStartManual={handleStartManual}
        />

        {/* 右栏：问题列表 + 手工标注入口 + 草稿卡片 */}
        <IssuesSidebar
          session={activeSession}
          onHighlightRegion={setHighlightedRegionName}
          highlightedRegionName={highlightedRegionName}
          highlightedIssueId={highlightedIssueId}
          onHighlightIssue={setHighlightedIssueId}
          onUpdateIssueStatus={handleUpdateIssueStatus}
          onDeleteIssue={handleDeleteIssue}
          onSetIssueLink={handleSetIssueLink}
          onAutoLinkAll={handleAutoLinkAll}
          onSetActiveBoard={handleSetActiveBoard}
          manualMode={manualMode}
          manualDraft={manualDraft}
          onStartManual={handleStartManual}
          onDraftChange={handleDraftChange}
          onSaveDraft={handleSaveDraft}
          onCancelDraft={handleCancelDraft}
          onRedrawDraft={handleRedrawDraft}
        />
      </div>

      {/* 新建走查 / 新增版本 抽屉 */}
      <NewAuditDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        parentSession={drawerParent}
        onCreate={handleCreateSession}
        onAddVersion={handleAddVersionToSession}
      />
    </div>
  );
}
