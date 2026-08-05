'use client';

/**
 * AnnotationStep —— 已标注区域的纯列表管理（画布交互已经移到 CanvasBoard 里）
 *
 * 保留功能：
 *   - iOS / Android 两列展示已标注的区域
 *   - 每行：区域名 · 类型标签 · 坐标 · 删除
 *   - Hover 一行可以联动高亮画板上的框（通过 onHoverRegion 上抛）
 */

import { useState } from 'react';
import type { DrawingRegion, RegionType } from '@/lib/crossPlatform/types';

const TYPE_META: Record<RegionType, { label: string; color: string }> = {
  layout:      { label: '布局',  color: '#3B82F6' },
  content:     { label: '内容',  color: '#8B5CF6' },
  visual:      { label: '视觉',  color: '#10B981' },
  interaction: { label: '交互',  color: '#F59E0B' },
  component:   { label: '组件',  color: '#14B8A6' },
};

interface AnnotationStepProps {
  iosRegions: DrawingRegion[];
  androidRegions: DrawingRegion[];
  onIosRegionsChange: (r: DrawingRegion[]) => void;
  onAndroidRegionsChange: (r: DrawingRegion[]) => void;
  onHoverRegion?: (name: string | null) => void;
}

export default function AnnotationStep({
  iosRegions,
  androidRegions,
  onIosRegionsChange,
  onAndroidRegionsChange,
  onHoverRegion,
}: AnnotationStepProps) {
  const totalRegions = iosRegions.length + androidRegions.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          在上方画板顶部切换到「标注」模式后，直接在图上框选区域。iOS 和 Android 使用相同名称的区域会被自动配对比较。
        </p>
        {totalRegions > 0 && (
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full border border-blue-100 flex-shrink-0">
            已标注 {totalRegions} 个区域
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <RegionColumn
          title="iOS 截图"
          badgeColor="bg-blue-500"
          regions={iosRegions}
          onRegionsChange={onIosRegionsChange}
          onHoverRegion={onHoverRegion}
        />
        <RegionColumn
          title="Android 截图"
          badgeColor="bg-green-500"
          regions={androidRegions}
          onRegionsChange={onAndroidRegionsChange}
          onHoverRegion={onHoverRegion}
        />
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

function RegionColumn({
  title,
  badgeColor,
  regions,
  onRegionsChange,
  onHoverRegion,
}: {
  title: string;
  badgeColor: string;
  regions: DrawingRegion[];
  onRegionsChange: (r: DrawingRegion[]) => void;
  onHoverRegion?: (name: string | null) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    onRegionsChange(regions.filter((r) => r.id !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${badgeColor} text-white`}>
          {title.startsWith('iOS') ? 'iOS' : 'Android'}
        </span>
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span className="text-xs text-slate-400">{regions.length} 个区域</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {regions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            暂无标注区域
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {regions.map((region) => {
              const meta = TYPE_META[region.type];
              const isHover = region.id === hoverId;
              return (
                <li
                  key={region.id}
                  onMouseEnter={() => {
                    setHoverId(region.id);
                    onHoverRegion?.(region.name);
                  }}
                  onMouseLeave={() => {
                    setHoverId(null);
                    onHoverRegion?.(null);
                  }}
                  className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                    isHover ? 'bg-slate-50' : ''
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: meta.color }}
                    aria-hidden
                  />
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: `${meta.color}20`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-sm text-slate-700 truncate flex-1 min-w-0">
                    {region.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                    {(region.rect.x * 100).toFixed(0)},{(region.rect.y * 100).toFixed(0)}
                    <span className="mx-1">·</span>
                    {(region.rect.width * 100).toFixed(0)}×{(region.rect.height * 100).toFixed(0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(region.id)}
                    className="ml-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                    title="删除"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
