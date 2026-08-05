'use client';

/**
 * LegacyAnnotationStep —— 仅供 /cross-platform 和 /legacy/cross-platform 归档页使用
 *
 * 保留原来的画布 + 交互体验（AnnotationStep 已经改造成纯列表，
 * 归档页要保留旧的独立画布标注流程，直接用 RegionAnnotator）。
 */

import RegionAnnotator from './RegionAnnotator';
import type { ImageFile } from '@/types';
import type { DrawingRegion } from '@/lib/crossPlatform/types';

interface LegacyAnnotationStepProps {
  iosImage: ImageFile;
  androidImage: ImageFile;
  iosRegions: DrawingRegion[];
  androidRegions: DrawingRegion[];
  onIosRegionsChange: (r: DrawingRegion[]) => void;
  onAndroidRegionsChange: (r: DrawingRegion[]) => void;
  highlightedRegionName?: string | null;
}

export default function LegacyAnnotationStep({
  iosImage,
  androidImage,
  iosRegions,
  androidRegions,
  onIosRegionsChange,
  onAndroidRegionsChange,
  highlightedRegionName,
}: LegacyAnnotationStepProps) {
  const totalRegions = iosRegions.length + androidRegions.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          如果 iOS 和 Android 中的对应模块使用相同名称，例如都命名为「底部按钮」，报告会将它们配对比较。
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
            此步骤可选 — 跳过后系统会进行默认走查；框选关注区域后，报告问题将与对应模块关联。
          </p>
        </div>
      )}
    </div>
  );
}
