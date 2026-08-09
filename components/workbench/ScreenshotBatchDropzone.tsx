'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { loadImageFile } from '@/lib/imageUtils';
import type { BatchScreenshotItem } from './types';

interface ScreenshotBatchDropzoneProps {
  items: BatchScreenshotItem[];
  /** 追加已加载的截图（父组件负责去重合并） */
  onAdd: (items: BatchScreenshotItem[]) => void;
  /** 删除单张（按 id） */
  onRemove: (id: string) => void;
  /** 清空全部 */
  onClear: () => void;
  /** 上限（默认 50 张） */
  maxItems?: number;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * 批量截图上传组件（P2.3）
 * - 拖拽 / 点选一次接收多张
 * - 缩略图 grid + 单张删除 + 全部清空
 * - 加载中占位；不合规扩展名给错误提示
 * - 分组识别（platform / groupKey）由 P2.4 在上层处理
 */
export default function ScreenshotBatchDropzone({
  items,
  onAdd,
  onRemove,
  onClear,
  maxItems = 50,
}: ScreenshotBatchDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canAddMore = items.length < maxItems;

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      // 过滤合法类型
      const invalid = list.filter((f) => !ACCEPTED_TYPES.includes(f.type));
      const valid = list.filter((f) => ACCEPTED_TYPES.includes(f.type));

      if (invalid.length > 0) {
        setError(
          `已忽略 ${invalid.length} 个不支持格式的文件（仅 PNG / JPG / WebP）`,
        );
      } else {
        setError(null);
      }

      // 计算剩余额度
      const remaining = maxItems - items.length;
      if (remaining <= 0) {
        setError(`最多上传 ${maxItems} 张，请先删除部分再继续`);
        return;
      }
      const accepted = valid.slice(0, remaining);
      if (valid.length > remaining) {
        setError(
          `已达上限 ${maxItems} 张，仅添加前 ${remaining} 张；其余 ${valid.length - remaining} 张被忽略`,
        );
      }
      if (accepted.length === 0) return;

      setLoading(true);
      try {
        const loaded = await Promise.all(
          accepted.map(async (file) => {
            const result = await loadImageFile(file);
            const item: BatchScreenshotItem = {
              id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              file,
              image: { file, ...result },
              name: file.name,
            };
            return item;
          }),
        );
        onAdd(loaded);
      } catch {
        setError('部分图片加载失败，请重试');
      } finally {
        setLoading(false);
      }
    },
    [items.length, maxItems, onAdd],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!canAddMore) return;
      const files = e.dataTransfer.files;
      if (files && files.length > 0) handleFiles(files);
    },
    [handleFiles, canAddMore],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canAddMore) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFiles(files);
    e.target.value = '';
  };

  // 总容量与已用容量
  const capacityLabel = useMemo(
    () => `${items.length} / ${maxItems}`,
    [items.length, maxItems],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 上传区 */}
      <button
        type="button"
        onClick={() => canAddMore && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={!canAddMore || loading}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-4 py-8 text-center ${
          !canAddMore
            ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
            : isDragging
              ? 'border-blue-400 bg-blue-50 cursor-pointer'
              : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 cursor-pointer'
        }`}
      >
        <svg
          className={`w-8 h-8 ${isDragging ? 'text-blue-500' : 'text-slate-300'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.9A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-slate-700">
            {loading ? (
              '正在加载图片…'
            ) : canAddMore ? (
              <>
                拖拽多张截图到此处，或 <span className="text-blue-600">点击批量上传</span>
              </>
            ) : (
              `已达上限 ${maxItems} 张`
            )}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            PNG · JPG · WebP · 支持一次选多张 · 后续将按文件名自动配对 iOS / Android
          </p>
        </div>
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* 已上传缩略图列表 */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-600">
              已上传 <span className="text-slate-900">{capacityLabel}</span>
            </span>
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              全部清空
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.map((it) => (
              <ThumbCard key={it.id} item={it} onRemove={() => onRemove(it.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThumbCard({
  item,
  onRemove,
}: {
  item: BatchScreenshotItem;
  onRemove: () => void;
}) {
  return (
    <div className="group relative rounded-lg overflow-hidden border border-slate-200 bg-white">
      <div className="aspect-[3/4] bg-slate-50 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image.url}
          alt={item.name}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="px-2 py-1.5 border-t border-slate-100">
        <p className="text-[11px] text-slate-700 font-medium truncate" title={item.name}>
          {item.name}
        </p>
        <p className="text-[10px] text-slate-400">
          {item.image.width} × {item.image.height}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all flex items-center justify-center"
        aria-label="删除"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
