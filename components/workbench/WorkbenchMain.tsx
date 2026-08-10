'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PlatformComparison from '@/components/cross-platform/PlatformComparison';
import AnnotationStep from '@/components/cross-platform/AnnotationStep';
import SliderView from '@/components/comparison/SliderView';
import CanvasBoard, { type CanvasBoardHandle } from './CanvasBoard';
import BoardTabs from './BoardTabs';
import InsightsBar, { ExportDropdown } from './InsightsBar';
import VersionDiffDialog from './VersionDiffDialog';
import { toneFromSeverity, type BadgeItem } from '@/components/comparison/IssueBadgeOverlay';
import type { AuditSession, AuditVersion, Board } from './types';
import { MAX_VERSIONS } from './types';
import { getCurrentVersion, canAddVersion, getActiveContext } from '@/lib/sessionHelpers';
import type {
  CrossPlatformAuditResult,
  DrawingRegion,
  NormalizedRect,
} from '@/lib/crossPlatform';
import type { IssueLocation } from '@/types';

// ── 快速 Tooltip（替代原生 title，延迟缩短到 80ms）──────────────────────
function TBTooltip({ label, children, side = 'bottom' }: {
  label: string | undefined;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
}) {
  if (!label) return <>{children}</>;
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div
        className={`
          pointer-events-none absolute ${side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}
          left-1/2 -translate-x-1/2 z-[200]
          px-2 py-1 rounded bg-slate-800 text-white text-[11px] leading-tight whitespace-nowrap
          opacity-0 scale-95
          group-hover/tip:opacity-100 group-hover/tip:scale-100
          transition-all duration-100 delay-[80ms]
          group-hover/tip:delay-[80ms]
        `}
      >
        {label}
        <div className={`absolute left-1/2 -translate-x-1/2 w-0 h-0
          ${side === 'bottom'
            ? 'bottom-full border-x-4 border-x-transparent border-b-4 border-b-slate-800'
            : 'top-full border-x-4 border-x-transparent border-t-4 border-t-slate-800'}
        `} />
      </div>
    </div>
  );
}

type ViewMode = 'compare' | 'slider' | 'annotate';

interface WorkbenchMainProps {
  session: AuditSession | null;
  onNewAudit: () => void;
  onAddVersion: () => void;
  onSwitchVersion: (index: number) => void;
  /** 批量走查：切换 activeBoard（P2.7） */
  onSetActiveBoard?: (boardId: string) => void;
  onUpdateSession: (patch: Partial<AuditSession>) => void;
  onUpdateVersion: (patch: Partial<AuditVersion>) => void;
  /** P4.1：批量走查时更新指定 board 的字段（写回 crossPlatformResult） */
  onUpdateBoard?: (boardId: string, patch: Partial<Board>) => void;
  highlightedRegionName?: string | null;
  highlightedIssueId?: string | null;
  onHighlightIssue?: (id: string | null) => void;
  /** 手工标注：草稿状态 + 回调（由 page.tsx 集中管理，两栏共享） */
  manualDraft?: ManualIssueDraft | null;
  onDrawnDraft?: (platform: 'ios' | 'android', rect: NormalizedRect) => void;
  manualMode?: 'idle' | 'drawing' | 'editing';
  onStartManual?: () => void;
}

/** 手工标注草稿（尚未保存的临时问题） */
export interface ManualIssueDraft {
  platform: 'ios' | 'android';
  location: NormalizedRect;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestion: string;
}

export default function WorkbenchMain({
  session,
  onNewAudit,
  onAddVersion,
  onSwitchVersion,
  onSetActiveBoard,
  onUpdateSession,
  onUpdateVersion,
  onUpdateBoard,
  highlightedRegionName,
  highlightedIssueId,
  onHighlightIssue,
  manualDraft,
  onDrawnDraft,
  manualMode = 'idle',
  onStartManual,
}: WorkbenchMainProps) {
  const [auditing, setAuditing] = useState(false);
  // P4.1：批量执行进度 { done, total, currentBoardName }；null = 空闲
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    currentBoardName: string;
  } | null>(null);

  // ── 视图控制状态（上移到此层，供 ToolBar 和 CrossPlatformWorkbench 共用） ──
  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const [sliderTarget, setSliderTarget] = useState<'ios' | 'android'>('ios');
  const [showRulers, setShowRulers] = useState(false);
  const [clearScreen, setClearScreen] = useState(false);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);

  // Z 键切换清屏
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        setClearScreen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAudit = useCallback(async () => {
    if (!session) return;
    const ctx = getActiveContext(session);
    if (!ctx) return;
    const hasIos = !!ctx.iosImage;
    const hasAndroid = !!ctx.androidImage;
    const hasDesign = !!ctx.designImage || !!ctx.designFigma;
    // 至少一端
    if (!hasIos && !hasAndroid) return;
    // 单端必须搭配设计稿；单端无设计稿 → 跨端走查无法进行
    if ((!hasIos || !hasAndroid) && !hasDesign) {
      alert('单端走查需要上传设计稿作为对比参考，或再上传另一端截图');
      return;
    }
    // 设备配置：双端必须两个都有；单端只要对应那端设备存在
    if (hasIos && !session.iosDevice) return;
    if (hasAndroid && !session.androidDevice) return;

    const iosRegions = ctx.iosRegions;
    const androidRegions = ctx.androidRegions;
    const targetRegions = mergeRegions(iosRegions, androidRegions);
    setAuditing(true);
    try {
      const res = await fetch('/api/cross-platform-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            id: session.id,
            name: session.name,
            targetRegions: targetRegions.length > 0 ? targetRegions : undefined,
          },
          iosImageUrl: ctx.iosImage?.url,
          androidImageUrl: ctx.androidImage?.url,
          designImageUrl: ctx.designImage?.url ?? ctx.designFigma?.imageUrl,
          iosDevice: session.iosDevice,
          androidDevice: session.androidDevice,
          options: session.options,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // P4.1 修复：batch 会话写到 active board，单画板才写到 version 顶层
      if (ctx.activeBoard && onUpdateBoard) {
        onUpdateBoard(ctx.activeBoard.id, {
          crossPlatformResult: data as CrossPlatformAuditResult,
        });
      } else {
        onUpdateVersion({ crossPlatformResult: data as CrossPlatformAuditResult });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '走查失败');
    } finally {
      setAuditing(false);
    }
  }, [session, onUpdateVersion, onUpdateBoard]);

  // P4.1：批量执行 —— 循环全部 boards 调 API，串行执行避免撞速率限制
  const handleBatchAudit = useCallback(async () => {
    if (!session || !onUpdateBoard) return;
    const ctx = getActiveContext(session);
    const boards = ctx?.boards;
    if (!boards || boards.length === 0) return;

    // 过滤出"可走查"的 board（至少一端；单端必须有设计稿）
    const runnable = boards.filter((b) => {
      const hasIos = !!b.iosImage;
      const hasAndroid = !!b.androidImage;
      const hasDesign = !!b.designImage || !!b.designFigma;
      if (!hasIos && !hasAndroid) return false;
      if ((!hasIos || !hasAndroid) && !hasDesign) return false;
      if (hasIos && !session.iosDevice) return false;
      if (hasAndroid && !session.androidDevice) return false;
      return true;
    });

    if (runnable.length === 0) {
      alert('没有可走查的画板：请检查每个画板是否至少有一端截图，单端画板需搭配设计稿');
      return;
    }

    // 已有结果的 board 跳过 / 提示确认覆盖
    const alreadyRun = runnable.filter((b) => !!b.crossPlatformResult);
    let overwrite = false;
    if (alreadyRun.length > 0) {
      overwrite = confirm(
        `已有 ${alreadyRun.length} 个画板走查过。\n\n[确定]：重跑全部（覆盖旧结果）\n[取消]：只跑未走查的 ${runnable.length - alreadyRun.length} 个`,
      );
    }
    const targets = overwrite ? runnable : runnable.filter((b) => !b.crossPlatformResult);
    if (targets.length === 0) return;

    setAuditing(true);
    setBatchProgress({ done: 0, total: targets.length, currentBoardName: targets[0].name });
    try {
      for (let i = 0; i < targets.length; i++) {
        const b = targets[i];
        setBatchProgress({ done: i, total: targets.length, currentBoardName: b.name });
        try {
          const res = await fetch('/api/cross-platform-audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenario: { id: `${session.id}-${b.id}`, name: `${session.name} · ${b.name}` },
              iosImageUrl: b.iosImage?.url,
              androidImageUrl: b.androidImage?.url,
              designImageUrl: b.designImage?.url ?? b.designFigma?.imageUrl,
              iosDevice: session.iosDevice,
              androidDevice: session.androidDevice,
              options: session.options,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          onUpdateBoard(b.id, { crossPlatformResult: data as CrossPlatformAuditResult });
        } catch (err) {
          // 单板失败不阻塞其他板；控制台记录
          console.error(`[batch audit] board "${b.name}" failed:`, err);
        }
      }
      setBatchProgress({
        done: targets.length,
        total: targets.length,
        currentBoardName: '',
      });
    } finally {
      setAuditing(false);
      // 短暂延迟后清进度条（让用户看到 100%）
      setTimeout(() => setBatchProgress(null), 1500);
    }
  }, [session, onUpdateBoard]);

  if (!session) {
    return <EmptyWorkbench onNewAudit={onNewAudit} />;
  }

  const ctx = getActiveContext(session);
  const hasIos = !!ctx?.iosImage;
  const hasAndroid = !!ctx?.androidImage;
  const hasDesign = !!ctx?.designImage || !!ctx?.designFigma;
  // canRun：至少一端 + 相应设备 + (双端 或 单端有设计稿)
  const canRun =
    (hasIos && hasAndroid && !!session.iosDevice && !!session.androidDevice) ||
    (hasIos && !hasAndroid && hasDesign && !!session.iosDevice) ||
    (!hasIos && hasAndroid && hasDesign && !!session.androidDevice);

  return (
    <main className="flex-1 min-w-0 flex flex-col bg-slate-50 overflow-hidden">
      {/* Session header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-700">
            跨端走查
          </span>
          <h1 className="text-sm font-semibold text-slate-800 truncate">{session.name}</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-400">
            {new Date(session.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* BoardTabs：批量走查画板切换（P2.7）—— 仅 batch 会话且 boards>0 时渲染 */}
      {session && session.type === 'batch' && onSetActiveBoard && (
        <BoardTabs session={session} onSetActiveBoard={onSetActiveBoard} />
      )}

      {/* P4.1：批量走查专属 —— 批量执行按钮 + 进度条 */}
      {session && session.type === 'batch' && onUpdateBoard && (
        <BatchAuditBar
          session={session}
          auditing={auditing}
          progress={batchProgress}
          onRunBatch={handleBatchAudit}
        />
      )}

      {/* ToolBar：工具条（替换 InsightsBar） */}
      {session && (
        <WorkbenchToolBar
          session={session}
          auditing={auditing}
          canRun={canRun}
          onRunAudit={handleAudit}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sliderTarget={sliderTarget}
          onSliderTargetChange={setSliderTarget}
          showRulers={showRulers}
          onShowRulersChange={setShowRulers}
          clearScreen={clearScreen}
          onClearScreenChange={setClearScreen}
          onSwitchVersion={onSwitchVersion}
          onAddVersion={onAddVersion}
          onOpenDiff={() => setDiffDialogOpen(true)}
          manualMode={manualMode}
          onStartManual={onStartManual ?? (() => {})}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <CrossPlatformWorkbench
          session={session}
          onAddVersion={onAddVersion}
          onSwitchVersion={onSwitchVersion}
          onUpdateVersion={onUpdateVersion}
          highlightedRegionName={highlightedRegionName}
          highlightedIssueId={highlightedIssueId}
          onHighlightIssue={onHighlightIssue}
          manualDraft={manualDraft}
          onDrawnDraft={onDrawnDraft}
          manualMode={manualMode}
          viewMode={viewMode}
          sliderTarget={sliderTarget}
          showRulers={showRulers}
          clearScreen={clearScreen}
          diffDialogOpen={diffDialogOpen}
          onDiffDialogClose={() => setDiffDialogOpen(false)}
        />
      </div>
      {/* onUpdateSession 目前未在此处使用，保留 prop 以便未来支持修改会话级字段（设备、名称） */}
      <input type="hidden" data-touch={String(!!onUpdateSession)} />
    </main>
  );
}

// ─── Cross-Platform Mode ──────────────────────────────────────────────────

function CrossPlatformWorkbench({
  session,
  onAddVersion,
  onSwitchVersion,
  onUpdateVersion,
  highlightedRegionName,
  highlightedIssueId,
  onHighlightIssue,
  manualDraft,
  onDrawnDraft,
  manualMode = 'idle',
  viewMode,
  sliderTarget,
  showRulers,
  clearScreen,
  diffDialogOpen,
  onDiffDialogClose,
}: {
  session: AuditSession;
  onAddVersion: () => void;
  onSwitchVersion: (index: number) => void;
  onUpdateVersion: (patch: Partial<AuditVersion>) => void;
  highlightedRegionName?: string | null;
  highlightedIssueId?: string | null;
  onHighlightIssue?: (id: string | null) => void;
  manualDraft?: ManualIssueDraft | null;
  onDrawnDraft?: (platform: 'ios' | 'android', rect: NormalizedRect) => void;
  manualMode?: 'idle' | 'drawing' | 'editing';
  viewMode: ViewMode;
  sliderTarget: 'ios' | 'android';
  showRulers: boolean;
  clearScreen: boolean;
  diffDialogOpen: boolean;
  onDiffDialogClose: () => void;
}) {
  const ctx = getActiveContext(session);
  const iosImage = ctx?.iosImage ?? null;
  const androidImage = ctx?.androidImage ?? null;
  const iosRegions = ctx?.iosRegions ?? [];
  const androidRegions = ctx?.androidRegions ?? [];
  const crossPlatformResult = ctx?.crossPlatformResult ?? null;

  // ── CanvasBoard 命令式 API ref ──
  const canvasBoardRef = useRef<CanvasBoardHandle>(null);

  // ── 高亮联动：highlightedIssueId 变化时聚焦到画板对应区域 ──
  useEffect(() => {
    if (!highlightedIssueId || !canvasBoardRef.current) return;
    const r = crossPlatformResult;
    if (!r) return;
    const issue = r.issues.find((i) => i.id === highlightedIssueId);
    if (!issue) return;

    // 优先 iOS，没有再找 Android
    const platform = issue.iosLocation ? 'ios' : issue.androidLocation ? 'android' : null;
    const rect = platform === 'ios' ? issue.iosLocation : issue.androidLocation;
    if (!platform || !rect) return;

    // 找对应 pane DOM
    const paneEl = document.querySelector<HTMLElement>(`[data-image-pane="${platform}"]`);
    if (!paneEl) return;

    canvasBoardRef.current.focusOnRect(paneEl, rect);
  }, [highlightedIssueId, crossPlatformResult]);

  // 派生：手工标注激活时强制 compare（其他模式无法承载手工画框）
  const effectiveViewMode: ViewMode = manualMode !== 'idle' ? 'compare' : viewMode;
  // 列表 hover 联动画板高亮
  const [listHoverName, setListHoverName] = useState<string | null>(null);

  // ── 方案 4：从 highlightedIssueId 派生发光描边 rect ──
  const { iosHighlightRect, androidHighlightRect } = useMemo(() => {
    if (!highlightedIssueId) return { iosHighlightRect: null, androidHighlightRect: null };
    const r = crossPlatformResult;
    if (!r) return { iosHighlightRect: null, androidHighlightRect: null };
    const issue = r.issues.find((i) => i.id === highlightedIssueId);
    if (!issue) return { iosHighlightRect: null, androidHighlightRect: null };
    return {
      iosHighlightRect: issue.iosLocation ?? null,
      androidHighlightRect: issue.androidLocation ?? null,
    };
  }, [highlightedIssueId, crossPlatformResult]);

  const hasDesignRef = !!ctx?.designImage || !!ctx?.designFigma;

  const { iosBadges, androidBadges } = useMemo(() => {
    const r = crossPlatformResult;
    if (!r) return { iosBadges: [], androidBadges: [] };
    const ios: BadgeItem[] = [];
    const android: BadgeItem[] = [];
    r.issues.forEach((issue, i) => {
      // 手工标注统一使用紫色 tone；AI 检测按严重度着色
      const tone = issue.manual ? 'purple' : toneFromSeverity(issue.severity, issue.status);
      const idx = i + 1;
      const prefix = issue.manual ? '📝 ' : '';
      const preview = {
        title: `${prefix}${issue.title}`,
        severityLabel: issue.severity,
        statusLabel: issue.status,
        description: issue.description,
        suggestion: issue.suggestion,
        tags: issue.tags,
      };
      if (issue.iosLocation) {
        ios.push({
          id: issue.id,
          index: idx,
          location: rectToLocation(issue.iosLocation),
          tone,
          label: `${idx}. ${prefix}${issue.title}`,
          ...preview,
        });
      }
      if (issue.androidLocation) {
        android.push({
          id: issue.id,
          index: idx,
          location: rectToLocation(issue.androidLocation),
          tone,
          label: `${idx}. ${prefix}${issue.title}`,
          ...preview,
        });
      }
    });
    return { iosBadges: ios, androidBadges: android };
  }, [crossPlatformResult]);

  if (!iosImage && !androidImage) {
    return <MissingAssets text="尚未上传任何截图，请重新创建走查" />;
  }

  // 是否只有单端
  const onlyIos = !!iosImage && !androidImage;
  const onlyAndroid = !iosImage && !!androidImage;
  const isSinglePlatform = onlyIos || onlyAndroid;

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      {/* Comparison —— Figma 风格画板；高度锁定为视口高度减去顶部工具条，确保两图完整可见 */}
      <div style={{ height: 'calc(100vh - 200px)', minHeight: 420 }} className="flex">
        <CanvasBoard
          ref={canvasBoardRef}
          height="fill"
          minHeight={420}
        >
          {/* ── 并排对比（默认）：三图 + 徽章 + 区域浏览 ── */}
          {effectiveViewMode === 'compare' && (
            <PlatformComparison
              iosImage={iosImage}
              androidImage={androidImage}
              designImage={ctx?.designImage ?? null}
              iosDeviceName={session.iosDevice?.name ?? 'iOS'}
              androidDeviceName={session.androidDevice?.name ?? 'Android'}
              iosRegions={iosRegions}
              androidRegions={androidRegions}
              highlightedRegionName={highlightedRegionName ?? listHoverName}
              iosBadges={iosBadges}
              androidBadges={androidBadges}
              highlightedIssueId={highlightedIssueId}
              onBadgeSelect={onHighlightIssue}
              annotationMode="view"
              showRulers={showRulers}
              clearScreen={clearScreen}
              manualMode={manualMode}
              manualDraft={
                manualDraft
                  ? { platform: manualDraft.platform, location: manualDraft.location }
                  : null
              }
              onDrawnDraft={onDrawnDraft}
              iosHighlightRect={iosHighlightRect}
              androidHighlightRect={androidHighlightRect}
            />
          )}

          {/* ── 叠加对比：设计稿 vs 目标平台（iOS 或 Android） ── */}
          {effectiveViewMode === 'slider' && (
            <div className="w-full max-w-2xl mx-auto">
              {(() => {
                // 单端时锁定到已上传的那一端；双端时按用户切换
                const actualTarget: 'ios' | 'android' = onlyIos
                  ? 'ios'
                  : onlyAndroid
                    ? 'android'
                    : sliderTarget;
                const liveImage = actualTarget === 'ios' ? iosImage : androidImage;
                if (!hasDesignRef || !ctx?.designImage) {
                  return <MissingAssets text="未上传设计稿，无法进入叠加对比" />;
                }
                if (!liveImage) {
                  return <MissingAssets text={`未上传 ${actualTarget === 'ios' ? 'iOS' : 'Android'} 截图`} />;
                }
                return (
                  <SliderView
                    designImage={ctx.designImage}
                    liveImage={liveImage}
                    leftLabel="← 设计稿"
                    rightLabel={
                      actualTarget === 'ios'
                        ? `iOS · ${session.iosDevice?.name ?? ''} →`
                        : `Android · ${session.androidDevice?.name ?? ''} →`
                    }
                  />
                );
              })()}
            </div>
          )}

          {/* ── 专注标注：两图 + RegionOverlayEditor 全力聚焦，徽章隐藏 ── */}
          {effectiveViewMode === 'annotate' && (
            <PlatformComparison
              iosImage={iosImage}
              androidImage={androidImage}
              designImage={ctx?.designImage ?? null}
              iosDeviceName={session.iosDevice?.name ?? 'iOS'}
              androidDeviceName={session.androidDevice?.name ?? 'Android'}
              iosRegions={iosRegions}
              androidRegions={androidRegions}
              highlightedRegionName={highlightedRegionName ?? listHoverName}
              iosBadges={[]}
              androidBadges={[]}
              highlightedIssueId={null}
              annotationMode="annotate"
              onIosRegionsChange={(r) => onUpdateVersion({ iosRegions: r })}
              onAndroidRegionsChange={(r) => onUpdateVersion({ androidRegions: r })}
              showRulers={showRulers}
              clearScreen={clearScreen}
            />
          )}
        </CanvasBoard>
      </div>

      {/* Annotation —— 已标注区域纯列表（标注模式下更突出） */}
      <Card
        title="标注关注区域"
        subtitle={
          effectiveViewMode === 'annotate'
            ? '在图上拖动框选区域，可输入名称；相同名称自动配对参与走查'
            : '切换到「标注」模式可在图上直接框选；相同名称的区域会自动配对比较'
        }
      >
        <AnnotationStep
          iosRegions={iosRegions}
          androidRegions={androidRegions}
          onIosRegionsChange={(r) => onUpdateVersion({ iosRegions: r })}
          onAndroidRegionsChange={(r) => onUpdateVersion({ androidRegions: r })}
          onHoverRegion={setListHoverName}
        />
      </Card>

      {/* 版本对比弹窗 */}
      <VersionDiffDialog
        open={diffDialogOpen}
        onClose={onDiffDialogClose}
        session={session}
      />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function mergeRegions(
  iosRegions: DrawingRegion[],
  androidRegions: DrawingRegion[],
) {
  const names = new Set([
    ...iosRegions.map((r) => r.name),
    ...androidRegions.map((r) => r.name),
  ]);
  return Array.from(names).map((name) => {
    const ios = iosRegions.find((r) => r.name === name);
    const android = androidRegions.find((r) => r.name === name);
    return {
      id: `target-${name}`,
      name,
      type: ios?.type ?? android?.type ?? 'layout',
      iosRect: ios?.rect,
      androidRect: android?.rect,
    };
  });
}

/** 跨端问题 location 用 NormalizedRect（必含 width/height），转到统一的 IssueLocation */
function rectToLocation(rect: NormalizedRect): IssueLocation {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function Card({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      {title && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
function MissingAssets({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

// ─── VersionSwitcher：版本切换 + 新建按钮 ─────────────────────────────────

// ─── WorkbenchToolBar：工具条（替换 InsightsBar） ─────────────────────────

function WorkbenchToolBar({
  session,
  auditing,
  canRun,
  onRunAudit,
  viewMode,
  onViewModeChange,
  sliderTarget,
  onSliderTargetChange,
  showRulers,
  onShowRulersChange,
  clearScreen,
  onClearScreenChange,
  onSwitchVersion,
  onAddVersion,
  onOpenDiff,
  manualMode,
  onStartManual,
}: {
  session: AuditSession;
  auditing: boolean;
  canRun: boolean;
  onRunAudit: () => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  sliderTarget: 'ios' | 'android';
  onSliderTargetChange: (v: 'ios' | 'android') => void;
  showRulers: boolean;
  onShowRulersChange: (v: boolean) => void;
  clearScreen: boolean;
  onClearScreenChange: (v: boolean) => void;
  onSwitchVersion: (index: number) => void;
  onAddVersion: () => void;
  onOpenDiff: () => void;
  manualMode: 'idle' | 'drawing' | 'editing';
  onStartManual: () => void;
}) {
  const ctx = getActiveContext(session);
  const hasDesignRef = !!ctx?.designImage || !!ctx?.designFigma;
  const hasResult = !!ctx?.crossPlatformResult;
  const onlyIos = !!ctx?.iosImage && !ctx?.androidImage;
  const onlyAndroid = !ctx?.iosImage && !!ctx?.androidImage;
  const isSinglePlatform = onlyIos || onlyAndroid;
  const isManualActive = manualMode !== 'idle';

  // 分隔线
  const TBDivider = () => <div className="w-px h-4 bg-slate-200 flex-shrink-0 mx-0.5" />;

  // 统一按钮样式 helper
  const tbBtn = (active: boolean, danger = false) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
      active
        ? danger
          ? 'bg-amber-500 text-white'
          : 'bg-blue-600 text-white'
        : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="relative z-50 flex items-center gap-1 px-3 py-1.5 border-b border-slate-200 bg-white flex-shrink-0 min-w-0">
      {/* ── 版本组 ── */}
      <VersionSwitcher
        session={session}
        onSwitch={onSwitchVersion}
        onAddVersion={onAddVersion}
        onOpenDiff={onOpenDiff}
      />

      <TBDivider />

      {/* ── 视图组 ── */}
      <div
        className={isManualActive ? 'contents opacity-40 pointer-events-none' : 'contents'}
      >
        {(
          [
            {
              id: 'compare' as ViewMode,
              label: '并排',
              tooltip: 'iOS 与 Android 截图左右对比',
              icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 6h7M4 12h7M4 18h7M13 6h7M13 12h7M13 18h7" />
                </svg>
              ),
            },
            {
              id: 'slider' as ViewMode,
              label: '叠加',
              tooltip: '设计稿与截图叠加滑动对比',
              disabled: !hasDesignRef,
              disabledTitle: '请先上传设计稿',
              icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 9l-4 3 4 3M16 9l4 3-4 3M12 3v18" />
                </svg>
              ),
            },
            {
              id: 'annotate' as ViewMode,
              label: '标注',
              tooltip: '在截图上标注关注区域',
              icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              ),
            },
          ] as Array<{ id: ViewMode; label: string; tooltip: string; icon: React.ReactNode; disabled?: boolean; disabledTitle?: string }>
        ).map(({ id, label, tooltip, icon, disabled, disabledTitle }) => (
          <TBTooltip key={id} label={isManualActive ? '手工标注模式下无法切换视图' : disabled ? disabledTitle : tooltip}>
          <button
            type="button"
            disabled={isManualActive || disabled}
            onClick={() => !isManualActive && !disabled && onViewModeChange(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isManualActive || disabled
                ? 'text-slate-300 cursor-not-allowed'
                : viewMode === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {icon}{label}
          </button>
          </TBTooltip>
        ))}
      </div>

      {/* 叠加对比时：设计 vs 目标平台切换 */}
      {viewMode === 'slider' && hasDesignRef && !isSinglePlatform && (
        <>
          <TBDivider />
          <span className="text-[10px] text-slate-400 px-1 select-none">设计 vs</span>
          {(['ios', 'android'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSliderTargetChange(p)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sliderTarget === p ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {p === 'ios' ? 'iOS' : 'Android'}
            </button>
          ))}
        </>
      )}

      <TBDivider />

      {/* ── 辅助组：尺子 + 清屏（slider 模式下隐藏） ── */}
      {viewMode !== 'slider' && (
        <>
          <TBTooltip label={showRulers ? '隐藏像素标尺' : '显示像素标尺'}>
          <button
            type="button"
            onClick={() => onShowRulersChange(!showRulers)}
            className={tbBtn(showRulers)}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="8" rx="1" />
              <path d="M8 8v3M12 8v4M16 8v3" />
            </svg>
            尺子
          </button>
          </TBTooltip>
          <TBTooltip label={clearScreen ? '恢复图层显示（Z）' : '清屏查看原图（Z）'}>
          <button
            type="button"
            onClick={() => onClearScreenChange(!clearScreen)}
            className={tbBtn(clearScreen, true)}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {clearScreen ? (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
            清屏
            <kbd className={`text-[9px] font-mono px-1 py-0.5 rounded ${
              clearScreen ? 'bg-amber-400/50' : 'bg-slate-100 text-slate-400'
            }`}>Z</kbd>
          </button>
          </TBTooltip>
        </>
      )}

      <TBDivider />

      {/* ── 手工标注 ── */}
      <TBTooltip label={isManualActive ? '正在标注中，请先保存或取消' : '手工标注 AI 未发现的问题'}>
      <button
        type="button"
        onClick={onStartManual}
        disabled={isManualActive}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          manualMode === 'drawing'
            ? 'bg-purple-600 text-white'
            : manualMode === 'editing'
              ? 'bg-purple-100 text-purple-700'
              : 'text-slate-600 hover:bg-slate-100'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        {manualMode === 'drawing' ? '画框中…' : manualMode === 'editing' ? '编辑中…' : '手工标注'}
      </button>
      </TBTooltip>

      {/* 右侧弹性间距 */}
      <div className="flex-1" />

      {/* ── 操作组：导出 + 走查 ── */}
      <ExportDropdown session={session} disabled={!hasResult} />
      <button
        type="button"
        onClick={onRunAudit}
        disabled={!canRun || auditing}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          !canRun || auditing
            ? 'text-slate-300 cursor-not-allowed'
            : hasResult
              ? 'text-slate-600 hover:bg-slate-100'
              : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {auditing ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            走查中…
          </>
        ) : hasResult ? '重新走查' : '开始走查'}
      </button>
    </div>
  );
}

function VersionSwitcher({
  session,
  onSwitch,
  onAddVersion,
  onOpenDiff,
}: {
  session: AuditSession;
  onSwitch: (index: number) => void;
  onAddVersion: () => void;
  onOpenDiff: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cur = getCurrentVersion(session);
  const canAdd = canAddVersion(session);
  const canDiff = session.versions.length >= 2;

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 backdrop-blur p-1 shadow-sm">
      {/* 当前版本按钮（点击下拉） */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">
          v{cur.v}
        </span>
        <span>{session.versions.length > 1 ? '当前版本' : '仅一版'}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 新版本按钮 */}
      <TBTooltip label={canAdd ? '新增一个版本（例如研发修改后的截图）' : `每个走查最多 ${MAX_VERSIONS} 个版本`}>
      <button
        type="button"
        onClick={onAddVersion}
        disabled={!canAdd}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        新版本
      </button>
      </TBTooltip>

      {/* 版本对比按钮（>=2 版才启用） */}
      <TBTooltip label={canDiff ? '对比不同版本之间的差异' : '至少 2 个版本才能对比'}>
      <button
        type="button"
        onClick={onOpenDiff}
        disabled={!canDiff}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        对比
      </button>
      </TBTooltip>

      {/* 下拉列表：Portal 到 body，彻底避免 overflow/transform/backdrop-filter 干扰 */}
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div
            className="fixed min-w-[200px] rounded-lg border border-slate-200 bg-white shadow-xl z-[100] py-1"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {session.versions.map((v, i) => {
              const isCurrent = i === session.currentVersionIndex;
              return (
                <button
                  key={v.v}
                  type="button"
                  onClick={() => { onSwitch(i); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    isCurrent ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold ${
                    isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    v{v.v}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {v.label ?? (i === 0 ? '初始版本' : `第 ${v.v} 版`)}
                      {isCurrent && <span className="ml-1 text-[10px] text-blue-500">· 当前</span>}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ─── ViewModeBar：三种视图切换 ────────────────────────────────────────────

function ViewModeBar({
  mode,
  onChange,
  sliderDisabled,
  disabled,
  disabledReason,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  sliderDisabled?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const handle = (m: ViewMode) => {
    if (disabled) return;
    onChange(m);
  };
  return (
    <TBTooltip label={disabled ? disabledReason : undefined} side="top">
    <div
      className={`flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 backdrop-blur p-1 shadow-sm ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`}
    >
      <ViewBtn
        active={mode === 'compare'}
        onClick={() => handle('compare')}
        disabled={disabled}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 6h7M4 12h7M4 18h7M13 6h7M13 12h7M13 18h7" />
          </svg>
        }
        label="并排对比"
      />
      <ViewBtn
        active={mode === 'slider'}
        onClick={() => handle('slider')}
        disabled={disabled || sliderDisabled}
        title={disabled ? disabledReason : sliderDisabled ? '请先上传设计稿' : undefined}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 9l-4 3 4 3M16 9l4 3-4 3M12 3v18" />
          </svg>
        }
        label="叠加对比"
      />
      <ViewBtn
        active={mode === 'annotate'}
        onClick={() => handle('annotate')}
        disabled={disabled}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        }
        label="标注"
      />
    </div>
    </TBTooltip>
  );
}

function ViewBtn({
  active,
  onClick,
  icon,
  label,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <TBTooltip label={title} side="top">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
        disabled
          ? 'text-slate-300 cursor-not-allowed'
          : active
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {icon}
      {label}
    </button>
    </TBTooltip>
  );
}

// ─── SliderTargetSwitch：叠加对比模式下的平台切换 ─────────────────────────

function SliderTargetSwitch({
  value,
  onChange,
}: {
  value: 'ios' | 'android';
  onChange: (v: 'ios' | 'android') => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 backdrop-blur p-1 shadow-sm">
      <span className="text-[10px] font-semibold text-slate-400 px-1.5">设计 vs</span>
      <button
        type="button"
        onClick={() => onChange('ios')}
        className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
          value === 'ios' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        iOS
      </button>
      <button
        type="button"
        onClick={() => onChange('android')}
        className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
          value === 'android' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        Android
      </button>
    </div>
  );
}

// ─── RulerToggle：像素标尺开关（compare / annotate 模式下显示） ─────────

function RulerToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <TBTooltip label={value ? '隐藏像素标尺' : '显示像素标尺'} side="top">
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-colors ${
        value
          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
          : 'bg-white/95 text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 简易尺子图标：一个矩形 + 内部三条刻度 */}
        <rect x="3" y="8" width="18" height="8" rx="1" />
        <path d="M8 8v3M12 8v4M16 8v3" />
      </svg>
      尺子
    </button>
    </TBTooltip>
  );
}

// ─── ClearScreenToggle：一键清屏 + Z 快捷键 ──────────────────────────────

function ClearScreenToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <TBTooltip label={value ? '恢复图层显示（Z）' : '清屏查看原图（Z）'} side="top">
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-colors ${
        value
          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
          : 'bg-white/95 text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 眼睛图标（激活时斜线）*/}
        {value ? (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
      清屏
      <kbd className={`text-[9px] font-mono px-1 py-0.5 rounded ${
        value ? 'bg-amber-400/60' : 'bg-slate-100 text-slate-400'
      }`}>Z</kbd>
    </button>
    </TBTooltip>
  );
}

function EmptyWorkbench({ onNewAudit }: { onNewAudit: () => void }) {
  return (
    <main className="flex-1 min-w-0 flex flex-col bg-slate-50 items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">开始你的第一次跨端走查</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          点击左侧「新建走查」，上传 iOS / Android 截图（可选贴 Figma 链接作参考），即可开始比对
        </p>
        <button
          onClick={onNewAudit}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建走查
        </button>
      </div>
    </main>
  );
}

// ─── P4.1：批量执行工具条（batch 会话专属，位于 BoardTabs 下方） ────────────
function BatchAuditBar({
  session,
  auditing,
  progress,
  onRunBatch,
}: {
  session: AuditSession;
  auditing: boolean;
  progress: { done: number; total: number; currentBoardName: string } | null;
  onRunBatch: () => void;
}) {
  const ctx = getActiveContext(session);
  const boards = ctx?.boards ?? [];
  if (boards.length === 0) return null;

  const runnable = boards.filter((b) => {
    const hasIos = !!b.iosImage;
    const hasAndroid = !!b.androidImage;
    const hasDesign = !!b.designImage || !!b.designFigma;
    if (!hasIos && !hasAndroid) return false;
    if ((!hasIos || !hasAndroid) && !hasDesign) return false;
    if (hasIos && !session.iosDevice) return false;
    if (hasAndroid && !session.androidDevice) return false;
    return true;
  });
  const alreadyRun = boards.filter((b) => !!b.crossPlatformResult).length;
  const pending = runnable.filter((b) => !b.crossPlatformResult).length;
  const canRun = runnable.length > 0 && !auditing;

  // P4.2：调用次数预估（增量执行下 = pending；全量重跑 = runnable.length）
  const estimatedCalls = pending; // 默认按增量算，用户确认覆盖时再全跑
  const buttonLabel =
    alreadyRun === 0
      ? `批量执行走查（${runnable.length}）`
      : pending > 0
        ? `增量执行（${pending} 个待走查）`
        : `重新执行（${runnable.length} 个）`;

  return (
    <div className="flex items-center gap-3 px-6 py-2 border-b border-slate-200 bg-blue-50/40 flex-shrink-0">
      <button
        type="button"
        onClick={onRunBatch}
        disabled={!canRun}
        title={
          canRun
            ? `本次预计消耗 ${estimatedCalls} 次 API 调用（每画板一次）`
            : '没有可走查的画板'
        }
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {auditing ? (
          <>
            <svg
              className="w-3 h-3 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={4}
                d="M4 12a8 8 0 018-8"
              />
            </svg>
            走查中…
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3l14 9-14 9V3z"
              />
            </svg>
            {buttonLabel}
          </>
        )}
      </button>

      {progress ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-xs">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">
            {progress.done} / {progress.total}
            {progress.currentBoardName && (
              <span className="ml-2 text-slate-400 truncate">
                当前：{progress.currentBoardName}
              </span>
            )}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>
            共 <span className="font-semibold text-slate-700">{boards.length}</span> 个画板
          </span>
          {runnable.length < boards.length && (
            <span className="text-amber-600">
              {boards.length - runnable.length} 个不可走查（缺截图/设计稿/设备）
            </span>
          )}
          <span className="text-slate-300">·</span>
          <span>
            已走查{' '}
            <span className="font-semibold text-emerald-600">{alreadyRun}</span> · 待走查{' '}
            <span className="font-semibold text-blue-600">{pending}</span>
          </span>
        </div>
      )}
    </div>
  );
}
