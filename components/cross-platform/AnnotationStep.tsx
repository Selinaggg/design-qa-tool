'use client';

import RegionAnnotator from './RegionAnnotator';
import type { ImageFile } from '@/types';
import type { DrawingRegion } from '@/lib/crossPlatform/types';

interface AnnotationStepProps {
  iosImage: ImageFile;
  androidImage: ImageFile;
  iosRegions: DrawingRegion[];
  androidRegions: DrawingRegion[];
  onIosRegionsChange: (r: DrawingRegion[]) => void;
  onAndroidRegionsChange: (r: DrawingRegion[]) => void;
  highlightedRegionName?: string | null;
}

export default function AnnotationStep({
  iosImage,
  androidImage,
  iosRegions,
  androidRegions,
  onIosRegionsChange,
  onAndroidRegionsChange,
  highlightedRegionName,
}: AnnotationStepProps) {
  const totalRegions = iosRegions.length + androidRegions.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          在截图上拖拽框选关键区域。相同名称的 iOS / Android 区域会被关联为同一目标区域。
        </p>
        {totalRegions > 0 && (
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full border border-blue-100 flex-shrink-0">
            已标注 {totalRegions} 个区域
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white">iOS</span>
            <span className="text-sm font-medium text-slate-700">iOS 截图标注</span>
            <span className="text-xs text-slate-400">{iosRegions.length} 个区域</span>
          </div>
          <RegionAnnotator
            image={iosImage}
            regions={iosRegions}
            onRegionsChange={onIosRegionsChange}
            platform="ios"
            highlightedRegionName={highlightedRegionName}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-500 text-white">Android</span>
            <span className="text-sm font-medium text-slate-700">Android 截图标注</span>
            <span className="text-xs text-slate-400">{androidRegions.length} 个区域</span>
          </div>
          <RegionAnnotator
            image={androidImage}
            regions={androidRegions}
            onRegionsChange={onAndroidRegionsChange}
            platform="android"
            highlightedRegionName={highlightedRegionName}
          />
        </div>
      </div>

      {totalRegions === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center">
          <p className="text-xs text-slate-400">
            此步骤可选 — 跳过后走查报告将使用默认 mock 问题；标注区域后报告问题将与区域关联。
          </p>
        </div>
      )}
    </div>
  );
}
