'use client';

import { useState } from 'react';
import { loadImageFromUrl } from '@/lib/imageUtils';
import type { ImageFile } from '@/types';

interface FigmaImportProps {
  onImageLoad: (img: ImageFile) => void;
}

export default function FigmaImport({ onImageLoad }: FigmaImportProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  const handleImport = async () => {
    if (!url.trim()) { setError('请输入 Figma 链接'); return; }
    setLoading(true);
    setError(null);
    setIsMock(false);

    try {
      const res = await fetch('/api/figma-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Use dimensions from API response directly; probe naturalWidth as fallback
      let { width, height } = data as { width: number; height: number };
      if (!width || !height) {
        const probed = await loadImageFromUrl(data.imageUrl as string);
        width = probed.width;
        height = probed.height;
      }

      onImageLoad({
        file: new File([''], 'figma-export.svg', { type: 'image/svg+xml' }),
        url: data.imageUrl as string,
        width,
        height,
      });
      setIsMock(Boolean(data.isMock));
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 24c2.208 0 4-1.792 4-4v-4H8c-2.208 0-4 1.792-4 4s1.792 4 4 4z" fill="#0ACF83"/>
          <path d="M4 12c0-2.208 1.792-4 4-4h4v8H8c-2.208 0-4-1.792-4-4z" fill="#A259FF"/>
          <path d="M4 4c0-2.208 1.792-4 4-4h4v8H8C5.792 8 4 6.208 4 4z" fill="#F24E1E"/>
          <path d="M12 0h4c2.208 0 4 1.792 4 4s-1.792 4-4 4h-4V0z" fill="#FF7262"/>
          <path d="M20 12c0 2.208-1.792 4-4 4s-4-1.792-4-4 1.792-4 4-4 4 1.792 4 4z" fill="#1ABCFE"/>
        </svg>
        <span className="text-xs font-medium text-slate-600">从 Figma 导入设计稿</span>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
          placeholder="https://www.figma.com/file/..."
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
        />
        <button
          onClick={handleImport}
          disabled={loading}
          className="flex-shrink-0 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '导入中…' : '导入'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {isMock && (
        <p className="text-xs text-amber-600">当前为模拟 Figma 数据（mock），配置 FIGMA_ACCESS_TOKEN 可接入真实 Figma。</p>
      )}
    </div>
  );
}
