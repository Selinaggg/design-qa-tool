'use client';

import { useEffect, useRef, useState } from 'react';
import IssueBadgeOverlay, { type BadgeItem } from '@/components/comparison/IssueBadgeOverlay';
import CoordinateOverlay from '@/components/comparison/CoordinateOverlay';
import RulerOverlay from '@/components/comparison/RulerOverlay';
import ManualDrawOverlay from '@/components/comparison/ManualDrawOverlay';
import RegionOverlayEditor from './RegionOverlayEditor';
import type { ImageFile } from '@/types';
import type { DrawingRegion, NormalizedRect } from '@/lib/crossPlatform/types';

interface PlatformComparisonProps {
  iosImage?: ImageFile | null;
  androidImage?: ImageFile | null;
  designImage?: ImageFile | null;
  iosDeviceName: string;
  androidDeviceName: string;
  iosRegions?: DrawingRegion[];
  androidRegions?: DrawingRegion[];
  highlightedRegionName?: string | null;
  // ── 徽章 ─────────────────────────────────────
  iosBadges?: BadgeItem[];
  androidBadges?: BadgeItem[];
  designBadges?: BadgeItem[];
  highlightedIssueId?: string | null;
  onBadgeSelect?: (id: string) => void;
  // ── 标注（可选） ─────────────────────────────
  annotationMode?: 'view' | 'annotate';
  onIosRegionsChange?: (regions: DrawingRegion[]) => void;
  onAndroidRegionsChange?: (regions: DrawingRegion[]) => void;
  // ── 坐标辅助（P4） ────────────────────────────
  /** 显示光标坐标 chip（默认 true） */
  showCoordinates?: boolean;
  /** 显示上/左标尺（默认 false，工具条可切换） */
  showRulers?: boolean;
  /** 清屏：隐藏所有叠加层（徽章/线框/坐标），只看原图 */
  clearScreen?: boolean;
  // ── 手工标注（方案 B MVP） ────────────────────
  /** 手工标注模式：idle / drawing / editing */
  manualMode?: 'idle' | 'drawing' | 'editing';
  /** 编辑态下的草稿框（含平台）；drawing 态时可为 null */
  manualDraft?: { platform: 'ios' | 'android'; location: NormalizedRect } | null;
  /** 松手回调：拿到画的框和平台 */
  onDrawnDraft?: (platform: 'ios' | 'android', rect: NormalizedRect) => void;
  // ── 区域高亮描边（方案 4） ─────────────────────
  /** 点击卡片时在 iOS 图上闪亮的矩形区域（归一化坐标） */
  iosHighlightRect?: NormalizedRect | null;
  /** 点击卡片时在 Android 图上闪亮的矩形区域（归一化坐标） */
  androidHighlightRect?: NormalizedRect | null;
}

export default function PlatformComparison({
  iosImage,
  androidImage,
  designImage,
  iosDeviceName,
  androidDeviceName,
  iosRegions = [],
  androidRegions = [],
  highlightedRegionName,
  iosBadges = [],
  androidBadges = [],
  designBadges = [],
  highlightedIssueId,
  onBadgeSelect,
  annotationMode = 'view',
  onIosRegionsChange,
  onAndroidRegionsChange,
  showCoordinates = true,
  showRulers = false,
  clearScreen = false,
  manualMode = 'idle',
  manualDraft,
  onDrawnDraft,
  iosHighlightRect,
  androidHighlightRect,
}: PlatformComparisonProps) {
  // 手工标注模式激活时，强制关掉区域标注（互斥）
  const effectiveAnnotationMode = manualMode !== 'idle' ? 'view' : annotationMode;

  // 每个 pane 独立算 manualMode 和 draftRect
  const iosManualMode = manualMode;
  const androidManualMode = manualMode;
  const iosDraftRect = manualDraft?.platform === 'ios' ? manualDraft.location : null;
  const androidDraftRect = manualDraft?.platform === 'android' ? manualDraft.location : null;

  // 现有 pane 数量
  const paneCount = (iosImage ? 1 : 0) + (androidImage ? 1 : 0) + (designImage ? 1 : 0);
  const isSinglePane = paneCount === 1;

  // 统一使用 flex 布局（避免 grid + minmax(0, 1fr) 在 max-content 父容器里的宽度不确定，
  // 引起 hover 时的 25%↔26% scale 抖动）
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: isSinglePane ? 'center' : 'flex-start',
    alignItems: 'flex-start',
    gap: isSinglePane ? undefined : '48px',
    padding: showRulers ? '20px 4px 4px 20px' : undefined,
  };

  // 每个 pane wrapper 宽度：固定 400px（多端）或 100%/最大 480px（单端）
  // 固定宽度让 contentInnerRef 的 max-content 测量结果完全稳定，不受任何 hover 叠加层影响
  const paneWrapperStyle: React.CSSProperties = isSinglePane
    ? { width: '100%', maxWidth: 480, flex: '0 0 auto' }
    : { width: 400, flex: '0 0 auto' };
  const singlePaneWrapperStyle = paneWrapperStyle;

  return (
    <div style={containerStyle}>
      {iosImage && (
        <div style={singlePaneWrapperStyle}>
          <ImagePane
            image={iosImage}
            label="iOS"
            sublabel={iosDeviceName}
            badgeColor="bg-blue-500"
            regions={iosRegions}
            onRegionsChange={onIosRegionsChange}
            highlightedRegionName={highlightedRegionName}
            issueBadges={iosBadges}
            highlightedIssueId={highlightedIssueId}
            onBadgeSelect={onBadgeSelect}
            annotationMode={effectiveAnnotationMode}
            idPrefix="ios"
            showCoordinates={showCoordinates}
            showRulers={showRulers}
            coordinateAccent="#2563eb"
            clearScreen={clearScreen}
            manualMode={iosManualMode}
            manualDraftRect={iosDraftRect}
            onManualDrawn={(rect) => onDrawnDraft?.('ios', rect)}
            highlightRect={iosHighlightRect}
          />
        </div>
      )}
      {androidImage && (
        <div style={singlePaneWrapperStyle}>
          <ImagePane
            image={androidImage}
            label="Android"
            sublabel={androidDeviceName}
            badgeColor="bg-green-500"
            regions={androidRegions}
            onRegionsChange={onAndroidRegionsChange}
            highlightedRegionName={highlightedRegionName}
            issueBadges={androidBadges}
            highlightedIssueId={highlightedIssueId}
            onBadgeSelect={onBadgeSelect}
            annotationMode={effectiveAnnotationMode}
            idPrefix="android"
            showCoordinates={showCoordinates}
            showRulers={showRulers}
            coordinateAccent="#059669"
            clearScreen={clearScreen}
            manualMode={androidManualMode}
            manualDraftRect={androidDraftRect}
            onManualDrawn={(rect) => onDrawnDraft?.('android', rect)}
            highlightRect={androidHighlightRect}
          />
        </div>
      )}
      {designImage && (
        <div style={singlePaneWrapperStyle}>
          <ImagePane
            image={designImage}
            label="设计稿"
            sublabel="参考"
            badgeColor="bg-purple-500"
            regions={[]}
            highlightedRegionName={null}
            issueBadges={designBadges}
            highlightedIssueId={highlightedIssueId}
            onBadgeSelect={onBadgeSelect}
            annotationMode="view"
            idPrefix="design"
            showCoordinates={showCoordinates}
            showRulers={showRulers}
            coordinateAccent="#7c3aed"
            clearScreen={clearScreen}
            // 设计稿不参与手工标注
            manualMode="idle"
          />
        </div>
      )}
    </div>
  );
}

function ImagePane({
  image,
  label,
  sublabel,
  badgeColor,
  regions,
  onRegionsChange,
  highlightedRegionName,
  issueBadges,
  highlightedIssueId,
  onBadgeSelect,
  annotationMode,
  idPrefix,
  showCoordinates,
  showRulers,
  coordinateAccent,
  clearScreen = false,
  manualMode,
  manualDraftRect,
  onManualDrawn,
  highlightRect,
}: {
  image: ImageFile;
  label: string;
  sublabel: string;
  badgeColor: string;
  regions: DrawingRegion[];
  onRegionsChange?: (regions: DrawingRegion[]) => void;
  highlightedRegionName?: string | null;
  issueBadges?: BadgeItem[];
  highlightedIssueId?: string | null;
  onBadgeSelect?: (id: string) => void;
  annotationMode: 'view' | 'annotate';
  idPrefix: string;
  showCoordinates?: boolean;
  showRulers?: boolean;
  /** 坐标 chip + 十字线颜色（裸色值，比如 #2563eb） */
  coordinateAccent?: string;
  /** 清屏：隐藏所有叠加层只看原图 */
  clearScreen?: boolean;
  /** 手工标注模式 */
  manualMode?: 'idle' | 'drawing' | 'editing';
  /** 当前 pane 是否是 draft 目标平台；如果是，传 draftRect，否则传 null */
  manualDraftRect?: NormalizedRect | null;
  /** 松手回调 */
  onManualDrawn?: (rect: NormalizedRect) => void;
  /** 点击卡片时高亮的问题区域（方案 4 发光描边） */
  highlightRect?: NormalizedRect | null;
}) {
  const isManualActive = manualMode === 'drawing' || (manualMode === 'editing' && manualDraftRect);

  return (
    <div className="flex flex-col gap-2">
      {/* Header labels：跟随图片一起缩放（简单直观；缩太小时会不明显，可以适应窗口按钮） */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>
            {label}
          </span>
          <span className="text-xs font-semibold text-slate-700">{sublabel}</span>
        </div>
        <span className="text-xs text-slate-300 font-mono">{image.width}×{image.height}</span>
      </div>

      {/* Image + region + issue overlays（不加 overflow-hidden，避免裁剪 hover 卡/命名弹窗；圆角靠 img 自身承担） */}
      <div
        data-image-pane={idPrefix}
        className="relative rounded-xl border border-slate-200"
        style={{
          background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 0 0 / 12px 12px',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={label}
          className="w-full block object-contain rounded-xl"
          draggable={false}
        />

        {/* 清屏时所有叠加层统一隐藏；用一个 wrapper 统一控制，transition 让切换更丝滑 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: clearScreen ? 0 : 1,
            pointerEvents: clearScreen ? 'none' : undefined,
            transition: 'opacity 0.15s ease',
          }}
        >
          {/* 标尺：在 image 上方绝对定位（负边距贴到 pane 外沿） */}
          {showRulers && (
            <RulerOverlay
              imageNaturalWidth={image.width}
              imageNaturalHeight={image.height}
            />
          )}

          {/* 区域标注层：view / annotate 两种模式，onRegionsChange 存在时才可交互 */}
          {onRegionsChange && (
            <RegionOverlayEditor
              regions={regions}
              onRegionsChange={onRegionsChange}
              idPrefix={idPrefix}
              mode={annotationMode}
              highlightedRegionName={highlightedRegionName}
              imageNaturalWidth={image.width}
              imageNaturalHeight={image.height}
            />
          )}
          {/* 没有 onRegionsChange 时（比如 design 参考图），只用只读版本渲染区域 */}
          {!onRegionsChange && regions.length > 0 && (
            <RegionOverlayEditor
              regions={regions}
              onRegionsChange={() => {}}
              idPrefix={idPrefix}
              mode="view"
              highlightedRegionName={highlightedRegionName}
              imageNaturalWidth={image.width}
              imageNaturalHeight={image.height}
            />
          )}

          {/* 问题徽章层：标注模式 / 手工标注 drawing 态 下降低不透明度、不接收 pointer */}
          {issueBadges && issueBadges.length > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: annotationMode === 'annotate' || manualMode === 'drawing' ? 0.35 : 1,
                pointerEvents:
                  annotationMode === 'annotate' || manualMode === 'drawing' ? 'none' : 'auto',
                transition: 'opacity 0.2s',
              }}
            >
              <IssueBadgeOverlay
                badges={issueBadges}
                highlightedId={highlightedIssueId}
                onSelect={onBadgeSelect}
              />
            </div>
          )}

          {/* 手工标注层：drawing 态时接收 pointer 拖框；editing 态时只显示 draft */}
          {manualMode && manualMode !== 'idle' && (
            <ManualDrawOverlay
              mode={manualMode}
              draftRect={manualDraftRect ?? null}
              imageNaturalWidth={image.width}
              imageNaturalHeight={image.height}
              onDrawn={onManualDrawn}
            />
          )}

          {/* 方案 4：点击卡片时的发光矩形描边，2s 渐隐 */}
          {highlightRect && (
            <RectHighlight key={`${highlightRect.x}-${highlightRect.y}-${highlightRect.width}-${highlightRect.height}`} rect={highlightRect} />
          )}

          {/* 光标坐标层：pointerEvents:none 完全被动，view / annotate 两种模式都显示；drawing 态时避免与十字光标冲突，隐藏 chip */}
          {showCoordinates && !isManualActive && (
            <CoordinateOverlay
              imageNaturalWidth={image.width}
              imageNaturalHeight={image.height}
              accentColor={coordinateAccent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RectHighlight：发光矩形描边，出现后 2s 渐隐 ──────────────────────────────

function RectHighlight({ rect }: { rect: NormalizedRect }) {
  const [opacity, setOpacity] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 挂载即开始渐隐：先停 400ms 再用 1.4s 过渡到 0
  useEffect(() => {
    setOpacity(1);
    timerRef.current = setTimeout(() => {
      setOpacity(0);
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left:   `${rect.x * 100}%`,
        top:    `${rect.y * 100}%`,
        width:  `${rect.width  * 100}%`,
        height: `${rect.height * 100}%`,
        pointerEvents: 'none',
        opacity,
        transition: opacity === 0 ? 'opacity 1.4s ease-out' : 'none',
        borderRadius: 4,
        // 发光描边：双层 box-shadow 模拟光晕
        boxShadow: '0 0 0 2px #f59e0b, 0 0 12px 4px rgba(245,158,11,0.55)',
        border: '2px solid #f59e0b',
      }}
    />
  );
}
