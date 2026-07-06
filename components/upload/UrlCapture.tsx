'use client';

import { useState } from 'react';
import { loadImageFromUrl } from '@/lib/imageUtils';
import type { ImageFile } from '@/types';

interface UrlCaptureProps {
  onImageLoad: (img: ImageFile) => void;
}

export default function UrlCapture({ onImageLoad }: UrlCaptureProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  const handleCapture = async () => {
    if (!url.trim()) { setError('请输入页面 URL'); return; }
    setLoading(true);
    setError(null);
    setIsMock(false);

    try {
      const res = await fetch('/api/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      let { width, height } = data as { width: number; height: number };
      if (!width || !height) {
        const probed = await loadImageFromUrl(data.imageUrl as string);
        width = probed.width;
        height = probed.height;
      }

      onImageLoad({
        file: new File([''], 'screenshot.png', { type: 'image/png' }),
        url: data.imageUrl as string,
        width,
        height,
      });
      setIsMock(Boolean(data.isMock));
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '截图失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-xs font-medium text-slate-600">自动截图线上页面</span>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
          placeholder="https://example.com"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
        />
        <button
          onClick={handleCapture}
          disabled={loading}
          className="flex-shrink-0 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '截图中…' : '截图'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {isMock && (
        <p className="text-xs text-amber-600">当前为模拟截图数据（mock），配置 SCREENSHOT_PROVIDER=playwright 可接入真实截图。</p>
      )}
    </div>
  );
}
