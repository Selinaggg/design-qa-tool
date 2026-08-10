'use client';

import { useRef, useState, useCallback } from 'react';
import { loadImageFile } from '@/lib/imageUtils';
import type { ImageFile } from '@/types';
import type { ScreenshotGroup } from '@/lib/batchScreenshot';

interface BoardMappingTableProps {
  /** 分组结果（只对 recognized: true 的组显示映射行） */
  groups: ScreenshotGroup[];
  /** 每组当前关联的设计稿（key = group.key） */
  designMap: Record<string, ImageFile>;
  /** 用户为某组上传/替换设计稿 */
  onSetDesign: (groupKey: string, image: ImageFile) => void;
  /** 用户移除某组的设计稿 */
  onRemoveDesign: (groupKey: string) => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * 画板 · 设计稿映射表（P2.5 · 手动上传占位）
 * P3 阶段：右侧槽位会换成 Figma frame 选择器
 */
export default function BoardMappingTable({
  groups,
  designMap,
  onSetDesign,
  onRemoveDesign,
}: BoardMappingTableProps) {
  const recognized = groups.filter((g) => g.recognized);
  if (recognized.length === 0) return null;

  const withDesign = recognized.filter((g) => designMap[g.key]).length;

  return (
    <div className="flex flex-col gap-2">
      {/* 顶部统计 */}
      <div className="flex items-center gap-2 text-[11px] px-1">
        <span className="font-semibold text-slate-700">
          设计稿映射 · {withDesign} / {recognized.length}
        </span>
        <span className="text-slate-400">
          {withDesign === recognized.length
            ? '全部画板已关联设计稿'
            : `还有 ${recognized.length - withDesign} 个画板未关联设计稿（可选）`}
        </span>
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_180px] gap-2 items-center px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
          <span>画板</span>
          <span className="text-center">平台</span>
          <span>设计稿</span>
        </div>
        <div className="divide-y divide-slate-100">
          {recognized.map((g) => (
            <MappingRow
              key={g.key}
              group={g}
              design={designMap[g.key] ?? null}
              onSet={(img) => onSetDesign(g.key, img)}
              onRemove={() => onRemoveDesign(g.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MappingRow({
  group,
  design,
  onSet,
  onRemove,
}: {
  group: ScreenshotGroup;
  design: ImageFile | null;
  onSet: (image: ImageFile) => void;
  onRemove: () => void;
}) {
  // 平台状态
  let platformLabel = '';
  let platformClass = '';
  if (group.ios && group.android) {
    platformLabel = '双端';
    platformClass = 'bg-green-100 text-green-700';
  } else if (group.ios) {
    platformLabel = '仅 iOS';
    platformClass = 'bg-blue-100 text-blue-700';
  } else {
    platformLabel = '仅 Android';
    platformClass = 'bg-emerald-100 text-emerald-700';
  }

  return (
    <div className="grid grid-cols-[1fr_100px_180px] gap-2 items-center px-3 py-2 hover:bg-slate-50/60 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate" title={group.baseName}>
          {group.baseName || '(未命名)'}
        </p>
      </div>
      <div className="flex justify-center">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${platformClass}`}
        >
          {platformLabel}
        </span>
      </div>
      <div>
        <CompactDesignSlot design={design} onSet={onSet} onRemove={onRemove} />
      </div>
    </div>
  );
}

/**
 * 紧凑版设计稿槽位：未上传时显示"上传"/"Figma"按钮；已上传显示缩略图 + 尺寸 + 替换/移除
 * P3.2：新增"从 Figma 选择"入口（内联输入 URL，走 /api/figma-export）
 */
function CompactDesignSlot({
  design,
  onSet,
  onRemove,
}: {
  design: ImageFile | null;
  onSet: (image: ImageFile) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // P3.2：Figma 输入面板开关
  const [figmaMode, setFigmaMode] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState('');

  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('仅 PNG/JPG/WebP');
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const result = await loadImageFile(file);
        onSet({ file, ...result, source: 'upload' });
      } catch {
        setError('加载失败');
      } finally {
        setLoading(false);
      }
    },
    [onSet],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  // P3.2：Figma 导入
  const handleFigmaImport = useCallback(async () => {
    const trimmed = figmaUrl.trim();
    if (!trimmed) {
      setError('请粘贴 Figma frame 链接');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/figma-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const { imageUrl, width, height, fileName } = data as {
        imageUrl: string;
        width: number;
        height: number;
        fileName: string;
      };
      onSet({
        file: new File([''], fileName || 'figma-frame.png', { type: 'image/png' }),
        url: imageUrl,
        width: width || 1440,
        height: height || 900,
        source: 'figma',
      });
      setFigmaUrl('');
      setFigmaMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Figma 导入失败');
    } finally {
      setLoading(false);
    }
  }, [figmaUrl, onSet]);

  // ── 已上传态 ──
  if (design) {
    const isFigma = design.source === 'figma';
    return (
      <div className="flex items-center gap-2">
        <div className="relative w-10 h-10 rounded overflow-hidden border border-slate-200 bg-slate-50 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={design.url}
            alt="设计稿"
            className="w-full h-full object-cover"
          />
          {isFigma && (
            <span
              className="absolute top-0 right-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-bl bg-purple-600 text-white text-[8px] font-bold leading-none"
              title="来自 Figma"
            >
              F
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-slate-500 truncate">
            {design.width} × {design.height}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
            >
              替换
            </button>
            <span className="text-slate-200">·</span>
            <button
              type="button"
              onClick={onRemove}
              className="text-[10px] text-slate-400 hover:text-red-500 font-medium"
            >
              移除
            </button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    );
  }

  // ── Figma 输入面板 ──
  if (figmaMode) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFigmaImport();
              if (e.key === 'Escape') {
                setFigmaMode(false);
                setFigmaUrl('');
                setError(null);
              }
            }}
            placeholder="粘贴 Figma frame 链接"
            autoFocus
            disabled={loading}
            className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={handleFigmaImport}
            disabled={loading}
            className="flex-shrink-0 px-2 py-1 rounded text-[11px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '…' : '导入'}
          </button>
          <button
            type="button"
            onClick={() => {
              setFigmaMode(false);
              setFigmaUrl('');
              setError(null);
            }}
            disabled={loading}
            className="flex-shrink-0 px-1.5 py-1 rounded text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="取消"
          >
            ✕
          </button>
        </div>
        {error && <p className="text-[10px] text-red-500 leading-tight">{error}</p>}
      </div>
    );
  }

  // ── 未上传态（默认）——上传按钮 + Figma 按钮 ──
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 text-[11px] text-slate-600 hover:text-blue-600 font-medium transition-colors disabled:opacity-50"
        >
          {loading ? (
            '加载中…'
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              上传
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setFigmaMode(true);
            setError(null);
          }}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-slate-300 bg-white hover:border-purple-400 hover:bg-purple-50 text-[11px] text-slate-600 hover:text-purple-600 font-medium transition-colors disabled:opacity-50"
          title="从 Figma 导入 frame"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 24c2.208 0 4-1.792 4-4v-4H8c-2.208 0-4 1.792-4 4s1.792 4 4 4z" />
          </svg>
          Figma
        </button>
      </div>
      {error && <p className="text-[10px] text-red-500 leading-tight">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
