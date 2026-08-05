'use client';

import { useState } from 'react';
import SideBySideView from './SideBySideView';
import SliderView from './SliderView';
import DiffHighlightView from './DiffHighlightView';
import type { BadgeItem } from './IssueBadgeOverlay';
import type { ComparisonMode, ImageFile } from '@/types';
import type { DiffResult } from '@/lib/diffEngine';
import type { ImageSource } from '@/components/workbench/types';

interface Tab {
  id: ComparisonMode;
  label: string;
  requiresSameSize: boolean;
}

const TABS: Tab[] = [
  { id: 'side-by-side', label: '并排对比', requiresSameSize: false },
  { id: 'slider', label: '滑动对比', requiresSameSize: true },
  { id: 'diff', label: '差异高亮', requiresSameSize: true },
];

interface ComparisonViewerProps {
  designImage: ImageFile;
  liveImage: ImageFile;
  sizeMatch: boolean;
  diffResult: DiffResult | null;
  isDiffProcessing: boolean;
  diffError: string | null;
  // ── 新增：徽章 & 来源 ──────────────────────────────────
  designBadges?: BadgeItem[];
  liveBadges?: BadgeItem[];
  highlightedId?: string | null;
  onBadgeSelect?: (id: string) => void;
  designSource?: ImageSource;
  liveSource?: ImageSource;
}

export default function ComparisonViewer({
  designImage,
  liveImage,
  sizeMatch,
  diffResult,
  isDiffProcessing,
  diffError,
  designBadges,
  liveBadges,
  highlightedId,
  onBadgeSelect,
  designSource,
  liveSource,
}: ComparisonViewerProps) {
  const [mode, setMode] = useState<ComparisonMode>('side-by-side');

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((tab) => {
          const disabled = tab.requiresSameSize && !sizeMatch;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && setMode(tab.id)}
              disabled={disabled}
              title={disabled ? '需要两张图片尺寸相同' : undefined}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors
                ${active
                  ? 'text-blue-600'
                  : disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {tab.label}
              {tab.id === 'diff' && isDiffProcessing && !disabled && (
                <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
              )}
              {disabled && <span className="ml-1 text-slate-300 text-xs">🔒</span>}
            </button>
          );
        })}

        {diffResult && !isDiffProcessing && (
          <div className="ml-auto pr-1">
            <span
              className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full
                ${diffResult.mismatchPercent === 0
                  ? 'bg-green-100 text-green-600'
                  : diffResult.mismatchPercent < 5
                    ? 'bg-orange-100 text-orange-600'
                    : 'bg-red-100 text-red-600'
                }`}
            >
              {diffResult.mismatchPercent.toFixed(2)}% 差异
            </span>
          </div>
        )}
      </div>

      {/* View area */}
      <div>
        {mode === 'side-by-side' && (
          <SideBySideView
            designImage={designImage}
            liveImage={liveImage}
            designBadges={designBadges}
            liveBadges={liveBadges}
            highlightedId={highlightedId}
            onBadgeSelect={onBadgeSelect}
            designSource={designSource}
            liveSource={liveSource}
          />
        )}
        {mode === 'slider' && (
          <SliderView designImage={designImage} liveImage={liveImage} />
        )}
        {mode === 'diff' && (
          <DiffHighlightView
            diffResult={diffResult}
            isProcessing={isDiffProcessing}
            error={diffError}
          />
        )}
      </div>
    </div>
  );
}
