'use client';

/**
 * 通用差异徽章图层：叠加在图片上方，把每条问题的 location 渲染成编号徽章。
 * 支持两种形态：
 *   - 只有 x/y   → 圆形数字徽章
 *   - 有宽高     → 矩形边框 + 左上角圆形数字徽章
 *
 * 交互：
 *   - hover 徽章 → 旁边弹出预览卡（智能贴边），可 hover 到卡片上保持不消失
 *   - 点击徽章  → onSelect(id)，通常触发外部"高亮 + 右栏卡片滚动展开"
 *   - highlightedId → 让对应徽章持续脉冲高亮
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IssueLocation } from '@/types';
import { useInverseScale } from '@/components/workbench/CanvasScaleContext';

export interface BadgeItem {
  id: string;
  /** 显示在徽章上的编号，通常是 1-based */
  index: number;
  /** 归一化坐标；只有 x/y 视为点位，含 width/height 视为框 */
  location: IssueLocation;
  /** 徽章配色主题 */
  tone: BadgeTone;
  /** 无障碍标签，鼠标悬停也用它 */
  label?: string;
  /** —— 悬浮卡预览字段（可选） —— */
  title?: string;
  severityLabel?: string;
  statusLabel?: string;
  description?: string;
  suggestion?: string;
  tags?: string[];
}

export type BadgeTone =
  | 'blue'     // 默认：普通 AI 检测问题（不再按严重度分色）
  | 'red'      // 保留（兼容旧数据/未来重启严重度用）
  | 'orange'
  | 'yellow'
  | 'green'
  | 'gray'     // ignored / deferred / fixed
  | 'purple';  // manual（手工标注）

interface IssueBadgeOverlayProps {
  badges: BadgeItem[];
  /** 当前高亮的问题 id（会脉冲） */
  highlightedId?: string | null;
  /** 点击徽章的回调 */
  onSelect?: (id: string) => void;
}

// tone → 具体色值
const TONE_STYLES: Record<BadgeTone, { border: string; bg: string; badge: string; text: string }> = {
  blue:   { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.10)', badge: '#3b82f6', text: '#ffffff' },
  red:    { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.10)',  badge: '#ef4444', text: '#ffffff' },
  orange: { border: '#f97316', bg: 'rgba(249, 115, 22, 0.10)', badge: '#f97316', text: '#ffffff' },
  yellow: { border: '#eab308', bg: 'rgba(234, 179, 8, 0.12)',  badge: '#eab308', text: '#78350f' },
  green:  { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.10)',  badge: '#22c55e', text: '#ffffff' },
  gray:   { border: '#94a3b8', bg: 'rgba(148, 163, 184, 0.10)', badge: '#94a3b8', text: '#ffffff' },
  purple: { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.10)', badge: '#a855f7', text: '#ffffff' },
};

const HIDE_DELAY_MS = 120;

export default function IssueBadgeOverlay({
  badges,
  highlightedId,
  onSelect,
}: IssueBadgeOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setHoveredId(null), HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const handleEnter = useCallback(
    (id: string) => {
      clearHideTimer();
      setHoveredId(id);
    },
    [clearHideTimer],
  );

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* keyframes for pulse animation */}
      <style>{`
        @keyframes issue-badge-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          50%      { transform: scale(1.15); box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
        }
      `}</style>

      {badges.map((b) => {
        const tone = TONE_STYLES[b.tone];
        const isHighlighted = highlightedId === b.id;
        const isHovered = hoveredId === b.id;
        const isRect = b.location.width != null && b.location.height != null;
        const left = `${b.location.x * 100}%`;
        const top = `${b.location.y * 100}%`;
        // 有高亮项时，其他徽章淡出并禁用交互，聚焦查看高亮问题
        const isDimmed = highlightedId != null && !isHighlighted;

        // 矩形框：描边 + 左上角徽章
        if (isRect) {
          return (
            <div
              key={b.id}
              style={{
                position: 'absolute',
                left,
                top,
                width: `${(b.location.width ?? 0) * 100}%`,
                height: `${(b.location.height ?? 0) * 100}%`,
                border: `2px solid ${tone.border}`,
                backgroundColor: isHighlighted ? tone.bg.replace('0.10', '0.22') : tone.bg,
                boxShadow: isHighlighted ? `0 0 0 3px ${tone.border}55` : 'none',
                opacity: isDimmed ? 0 : 1,
                transition: 'all 0.2s, opacity 0.15s ease',
                pointerEvents: 'none',
              }}
            >
              <BadgeAnchor
                badge={b}
                tone={tone}
                highlighted={isHighlighted}
                isHovered={isHovered}
                onEnter={() => handleEnter(b.id)}
                onLeave={scheduleHide}
                onCardEnter={clearHideTimer}
                onCardLeave={scheduleHide}
                onClick={() => onSelect?.(b.id)}
                anchor="corner"
              />
            </div>
          );
        }

        // 点位：只放一个圆形徽章
        return (
          <div
            key={b.id}
            style={{
              position: 'absolute',
              left,
              top,
              transform: 'translate(-50%, -50%)',
              opacity: isDimmed ? 0 : 1,
              transition: 'opacity 0.15s ease',
              pointerEvents: 'none',
            }}
          >
            <BadgeAnchor
              badge={b}
              tone={tone}
              highlighted={isHighlighted}
              isHovered={isHovered}
              onEnter={() => handleEnter(b.id)}
              onLeave={scheduleHide}
              onCardEnter={clearHideTimer}
              onCardLeave={scheduleHide}
              onClick={() => onSelect?.(b.id)}
              anchor="center"
            />
          </div>
        );
      })}
    </div>
  );
}

// ── 徽章 + 悬浮卡（包装在同一个 pointer-events:auto 容器里）───────────────

function BadgeAnchor({
  badge,
  tone,
  highlighted,
  isHovered,
  onEnter,
  onLeave,
  onCardEnter,
  onCardLeave,
  onClick,
  anchor,
}: {
  badge: BadgeItem;
  tone: { badge: string; text: string; border: string };
  highlighted: boolean;
  isHovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onCardEnter: () => void;
  onCardLeave: () => void;
  onClick?: () => void;
  anchor: 'corner' | 'center';
}) {
  // 反向补偿画板缩放：让徽章视觉尺寸始终恒定
  const inv = useInverseScale();
  const btnRef = useRef<HTMLButtonElement>(null);

  // 两种 anchor 各自独立的 wrapper 样式
  const wrapperStyle: React.CSSProperties =
    anchor === 'corner'
      ? {
          // 定位到矩形框的左上角外侧
          position: 'absolute',
          top: 0,
          left: 0,
          // 反缩放 + 反补偿的 -10/-10 位移
          transform: `scale(${inv}) translate(-10px, -10px)`,
          transformOrigin: '0 0',
          pointerEvents: 'auto',
        }
      : {
          // 外层 dot 容器已经用 translate(-50%,-50%) 把定位挪到点中心
          // 这里只做视觉尺寸反补偿；display:inline-block 让 transform 正确作用
          display: 'inline-block',
          transform: `scale(${inv})`,
          transformOrigin: '50% 50%',
          pointerEvents: 'auto',
        };

  return (
    <div style={wrapperStyle}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        title={badge.label ?? `问题 #${badge.index}`}
        style={{
          minWidth: 22,
          height: 22,
          padding: '0 5px',
          borderRadius: 999,
          background: tone.badge,
          color: tone.text,
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: highlighted
            ? `0 0 0 3px ${tone.border}55, 0 2px 6px rgba(0,0,0,0.25)`
            : '0 2px 6px rgba(0,0,0,0.2)',
          border: '2px solid rgba(255,255,255,0.95)',
          animation: highlighted ? 'issue-badge-pulse 1.2s ease-in-out infinite' : undefined,
          transition: 'box-shadow 0.2s',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {badge.index}
      </button>

      {isHovered && (
        <HoverPreviewCard
          anchorRef={btnRef}
          badge={badge}
          tone={tone}
          onMouseEnter={onCardEnter}
          onMouseLeave={onCardLeave}
        />
      )}
    </div>
  );
}

// ── 悬浮预览卡：Portal 到 body，视口坐标定位；智能避开所有图片容器 ────

/** 找到 badge 所属的 image pane（往上找 data-image-pane 祖先） */
function findPaneRect(anchor: HTMLElement | null): DOMRect | null {
  let el: HTMLElement | null = anchor;
  while (el) {
    if (el.dataset && el.dataset.imagePane === 'true') return el.getBoundingClientRect();
    el = el.parentElement;
  }
  return null;
}

/** 收集页面上所有 image pane 的 rect（含自己） */
function collectAllPaneRects(): DOMRect[] {
  if (typeof document === 'undefined') return [];
  const nodes = document.querySelectorAll<HTMLElement>('[data-image-pane="true"]');
  return Array.from(nodes).map((n) => n.getBoundingClientRect());
}

/** 两个矩形是否有交集 */
function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function HoverPreviewCard({
  anchorRef,
  badge,
  tone,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  badge: BadgeItem;
  tone: { badge: string; text: string; border: string };
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const CARD_W = 280;
  const CARD_H_EST = 180;
  const GAP = 12;
  const VIEWPORT_PAD = 12;

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    const compute = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const a = anchor.getBoundingClientRect();
      const pane = findPaneRect(anchor);
      const allPanes = collectAllPaneRects();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cardH = cardRef.current?.getBoundingClientRect().height ?? CARD_H_EST;
      const cardW = CARD_W;

      // 垂直基线：优先卡片顶部与徽章顶部对齐
      const vAlignBadge = clamp(a.top, VIEWPORT_PAD, vh - cardH - VIEWPORT_PAD);

      const candidates: Array<{ left: number; top: number; label: string }> = [];

      if (pane) {
        // 优先级 1：图片右侧（gap 通道 或 屏幕右边）
        candidates.push({ left: pane.right + GAP, top: vAlignBadge, label: 'right' });
        // 优先级 2：图片左侧
        candidates.push({ left: pane.left - GAP - cardW, top: vAlignBadge, label: 'left' });
        // 优先级 3：图片下方
        candidates.push({
          left: clamp(pane.left, VIEWPORT_PAD, vw - cardW - VIEWPORT_PAD),
          top: pane.bottom + GAP,
          label: 'below',
        });
        // 优先级 4：图片上方
        candidates.push({
          left: clamp(pane.left, VIEWPORT_PAD, vw - cardW - VIEWPORT_PAD),
          top: pane.top - GAP - cardH,
          label: 'above',
        });
      }

      // 回退：badge 右下（贴近但可能覆盖）
      candidates.push({ left: a.right + GAP, top: a.bottom + GAP, label: 'badge-br' });

      // 选择第一个「在视口内 + 不与任何 pane 重叠」的候选
      let chosen: { left: number; top: number } | null = null;
      for (const c of candidates) {
        const inViewport =
          c.left >= VIEWPORT_PAD &&
          c.top >= VIEWPORT_PAD &&
          c.left + cardW <= vw - VIEWPORT_PAD &&
          c.top + cardH <= vh - VIEWPORT_PAD;
        if (!inViewport) continue;
        const cardRect = {
          left: c.left,
          top: c.top,
          right: c.left + cardW,
          bottom: c.top + cardH,
        };
        const overlapsAny = allPanes.some((p) => rectsOverlap(cardRect, p));
        if (overlapsAny) continue;
        chosen = { left: c.left, top: c.top };
        break;
      }

      // 最后兜底：所有候选都不满足 → 塞进视口最合适角落（可能覆盖其它 pane）
      if (!chosen) {
        const left = clamp(a.right + GAP, VIEWPORT_PAD, vw - cardW - VIEWPORT_PAD);
        const top = clamp(a.bottom + GAP, VIEWPORT_PAD, vh - cardH - VIEWPORT_PAD);
        chosen = { left, top };
      }

      setPos(chosen);
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [anchorRef, badge.id]);

  if (!mounted || !pos) return null;

  return createPortal(
    <div
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: CARD_W,
        maxWidth: 'calc(100vw - 32px)',
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
        padding: '10px 12px',
        zIndex: 9998,
        pointerEvents: 'auto',
        fontSize: 12,
        color: '#334155',
        lineHeight: 1.5,
      }}
    >
      {/* 头部：编号 + 严重度 + 状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            height: 20,
            padding: '0 5px',
            borderRadius: 999,
            background: tone.badge,
            color: tone.text,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {badge.index}
        </span>
        {badge.severityLabel && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 4,
              background: `${tone.border}22`,
              color: tone.border,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {badge.severityLabel}
          </span>
        )}
        {badge.statusLabel && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '1px 6px',
              borderRadius: 4,
              background: '#f1f5f9',
              color: '#64748b',
            }}
          >
            {badge.statusLabel}
          </span>
        )}
      </div>

      {/* 标题 */}
      {badge.title && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#0f172a',
            marginBottom: 4,
            wordBreak: 'break-word',
          }}
        >
          {badge.title}
        </div>
      )}

      {/* 描述 */}
      {badge.description && (
        <p style={{ margin: 0, marginBottom: badge.suggestion ? 6 : 0 }}>
          {clip(badge.description, 140)}
        </p>
      )}

      {/* 建议 */}
      {badge.suggestion && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px dashed #e2e8f0',
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>建议</span>
          <span style={{ color: '#475569' }}>{clip(badge.suggestion, 120)}</span>
        </div>
      )}

      {/* 标签 */}
      {badge.tags && badge.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {badge.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 4,
                background: '#f8fafc',
                color: '#64748b',
                border: '1px solid #e2e8f0',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 底部提示 */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid #f1f5f9',
          fontSize: 10,
          color: '#94a3b8',
        }}
      >
        点击定位到右侧问题详情
      </div>
    </div>,
    document.body,
  );
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + '…';
}

// ── 工具函数：状态 → tone（不再按严重度分色，统一蓝色）─────────────────

export function toneFromSeverity(
  _severity: string,
  status?: string,
): BadgeTone {
  // 状态优先：已修复/忽略/暂不处理 → 灰
  if (status === 'ignored' || status === 'deferred' || status === 'fixed') return 'gray';
  // 其余一律蓝色（严重度维度已下线）
  return 'blue';
}

