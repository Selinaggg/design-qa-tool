'use client';

import { useRef, useState, useCallback } from 'react';
import { loadImageFile } from '@/lib/imageUtils';
import type { ImageFile } from '@/types';

interface DropZoneProps {
  label: string;
  image: ImageFile | null;
  onImageLoad: (image: ImageFile) => void;
  onImageRemove: () => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export default function DropZone({ label, image, onImageLoad, onImageRemove }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('仅支持 PNG、JPG、WebP 格式');
        return;
      }
      setError(null);
      try {
        const result = await loadImageFile(file);
        onImageLoad({ file, ...result });
      } catch {
        setError('图片加载失败，请重试');
      }
    },
    [onImageLoad],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  if (image) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <button
            onClick={onImageRemove}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            移除
          </button>
        </div>
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={label}
            className="w-full object-contain max-h-64"
          />
        </div>
        <p className="text-xs text-slate-400 text-right">
          {image.width} × {image.height} px
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors cursor-pointer h-48 text-center px-4
          ${isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
          }`}
      >
        <svg
          className={`w-8 h-8 ${isDragging ? 'text-blue-400' : 'text-slate-300'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-slate-600">
            拖拽图片到此处，或 <span className="text-blue-600">点击上传</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">PNG、JPG、WebP</p>
        </div>
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
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
