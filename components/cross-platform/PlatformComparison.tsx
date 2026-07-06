'use client';

import { REGION_CONFIG } from './RegionAnnotator';
import type { ImageFile } from '@/types';
import type { DrawingRegion, NormalizedRect } from '@/lib/crossPlatform/types';

interface PlatformComparisonProps {
  iosImage: ImageFile;
  androidImage: ImageFile;
  designImage?: ImageFile | null;
  iosDeviceName: string;
  androidDeviceName: string;
  iosRegions?: DrawingRegion[];
  androidRegions?: DrawingRegion[];
  highlightedRegionName?: string | null;
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
}: PlatformComparisonProps) {
  const columns = designImage ? 3 : 2;

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <ImagePane
        image={iosImage}
        label="iOS"
        sublabel={iosDeviceName}
        badgeColor="bg-blue-500"
        regions={iosRegions}
        highlightedRegionName={highlightedRegionName}
      />
      <ImagePane
        image={androidImage}
        label="Android"
        sublabel={androidDeviceName}
        badgeColor="bg-green-500"
        regions={androidRegions}
        highlightedRegionName={highlightedRegionName}
      />
      {designImage && (
        <ImagePane
          image={designImage}
          label="设计稿"
          sublabel="参考"
          badgeColor="bg-purple-500"
          regions={[]}
          highlightedRegionName={null}
        />
      )}
    </div>
  );
}

function RegionOverlay({
  region,
  isHighlighted,
}: {
  region: DrawingRegion;
  isHighlighted: boolean;
}) {
  const cfg = REGION_CONFIG[region.type];
  const r: NormalizedRect = region.rect;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${r.x * 100}%`,
        top: `${r.y * 100}%`,
        width: `${r.width * 100}%`,
        height: `${r.height * 100}%`,
        border: `2px solid ${cfg.color}`,
        backgroundColor: isHighlighted ? `${cfg.color}38` : `${cfg.color}18`,
        boxShadow: isHighlighted ? `0 0 0 3px ${cfg.color}44` : 'none',
        transition: 'all 0.25s',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          fontSize: 10,
          lineHeight: '16px',
          background: cfg.color,
          color: 'white',
          padding: '0 4px',
          borderRadius: '0 0 4px 0',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {region.name}
      </span>
    </div>
  );
}

function ImagePane({
  image,
  label,
  sublabel,
  badgeColor,
  regions,
  highlightedRegionName,
}: {
  image: ImageFile;
  label: string;
  sublabel: string;
  badgeColor: string;
  regions: DrawingRegion[];
  highlightedRegionName?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>
            {label}
          </span>
          <span className="text-xs font-semibold text-slate-700">{sublabel}</span>
        </div>
        <span className="text-xs text-slate-300">{image.width}×{image.height}</span>
      </div>

      {/* Image with region overlays */}
      <div
        className="relative overflow-hidden rounded-xl border border-slate-200"
        style={{
          background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 0 0 / 12px 12px',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={label}
          className="w-full block object-contain"
          draggable={false}
        />
        {regions.map((region) => (
          <RegionOverlay
            key={region.id}
            region={region}
            isHighlighted={region.name === highlightedRegionName}
          />
        ))}
      </div>
    </div>
  );
}
