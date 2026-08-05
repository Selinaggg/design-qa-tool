'use client';

import IssueBadgeOverlay, { type BadgeItem } from './IssueBadgeOverlay';
import type { ImageFile } from '@/types';
import type { ImageSource } from '@/components/workbench/types';

interface SideBySideViewProps {
  designImage: ImageFile;
  liveImage: ImageFile;
  /** 设计稿一侧的徽章 */
  designBadges?: BadgeItem[];
  /** 线上稿一侧的徽章 */
  liveBadges?: BadgeItem[];
  highlightedId?: string | null;
  onBadgeSelect?: (id: string) => void;
  designSource?: ImageSource;
  liveSource?: ImageSource;
}

export default function SideBySideView({
  designImage,
  liveImage,
  designBadges = [],
  liveBadges = [],
  highlightedId,
  onBadgeSelect,
  designSource,
  liveSource,
}: SideBySideViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <ImagePane
        label="设计稿"
        image={designImage}
        badges={designBadges}
        highlightedId={highlightedId}
        onBadgeSelect={onBadgeSelect}
        source={designSource}
        toneAccent="purple"
      />
      <ImagePane
        label="线上页面"
        image={liveImage}
        badges={liveBadges}
        highlightedId={highlightedId}
        onBadgeSelect={onBadgeSelect}
        source={liveSource}
        toneAccent="blue"
      />
    </div>
  );
}

function ImagePane({
  label,
  image,
  badges,
  highlightedId,
  onBadgeSelect,
  source,
  toneAccent,
}: {
  label: string;
  image: ImageFile;
  badges: BadgeItem[];
  highlightedId?: string | null;
  onBadgeSelect?: (id: string) => void;
  source?: ImageSource;
  toneAccent: 'purple' | 'blue';
}) {
  const sourceLabel = formatSourceLabel(source);
  const accent =
    toneAccent === 'purple'
      ? 'bg-purple-50 text-purple-700 border-purple-100'
      : 'bg-blue-50 text-blue-700 border-blue-100';

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex-shrink-0">
            {label}
          </span>
          {sourceLabel && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${accent} truncate`}>
              {sourceLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">
          {image.width} × {image.height}
        </span>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-[#f0f0f0] bg-[image:repeating-conic-gradient(#e0e0e0_0%_25%,transparent_0%_50%)] bg-[size:16px_16px]">
        <div className="relative inline-block max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={label}
            className="max-w-full block"
            draggable={false}
          />
          {badges.length > 0 && (
            <IssueBadgeOverlay
              badges={badges}
              highlightedId={highlightedId}
              onSelect={onBadgeSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function formatSourceLabel(s?: ImageSource): string | null {
  if (!s) return null;
  const parts = [s.origin, s.platform].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
