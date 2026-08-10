'use client';

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { loadImageFile } from '@/lib/imageUtils';
import type { ImageFile } from '@/types';
import type { ScreenshotGroup } from '@/lib/batchScreenshot';
import type { FigmaFrameSummary } from '@/lib/figmaProviders';
import { batchFuzzyMatch, similarity } from '@/lib/fuzzyMatch';

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
 * 画板 · 设计稿映射表
 * P3.2：每行独立"从 Figma 单帧导入"
 * P3+（当前）：顶部新增"批量 Figma 文件导入"——贴一次文件链接，拉全部 frames，
 *   fuzzy 匹配自动填充，未命中的从缩略图池手动挑选
 */
export default function BoardMappingTable({
  groups,
  designMap,
  onSetDesign,
  onRemoveDesign,
}: BoardMappingTableProps) {
  const recognized = groups.filter((g) => g.recognized);

  // ── Figma 批量池状态 ──
  const [figmaUrl, setFigmaUrl] = useState('');
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [framesError, setFramesError] = useState<string | null>(null);
  const [framePool, setFramePool] = useState<FigmaFrameSummary[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [showPool, setShowPool] = useState(false); // 面板折叠
  const [poolSearch, setPoolSearch] = useState('');
  const [autoMatchStats, setAutoMatchStats] = useState<{ hit: number; total: number } | null>(null);

  // 加载 Figma 文件
  const handleLoadFrames = useCallback(async () => {
    const trimmed = figmaUrl.trim();
    if (!trimmed) {
      setFramesError('请粘贴 Figma 文件链接');
      return;
    }
    setFramesError(null);
    setLoadingFrames(true);
    try {
      const res = await fetch('/api/figma-file-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const frames = (data.frames ?? []) as FigmaFrameSummary[];
      if (frames.length === 0) {
        setFramesError('该文件下未发现任何 frame');
        setFramePool(null);
        return;
      }
      setFramePool(frames);
      setFileName(data.fileName ?? '');
      setShowPool(true);

      // 自动匹配 —— 遍历 boards，fuzzy match
      const cands = frames.map((f) => ({ key: f.name, payload: f }));
      const boardNames = recognized.map((g) => g.baseName);
      const matches = batchFuzzyMatch<FigmaFrameSummary>(boardNames, cands, 0.7);

      let hit = 0;
      for (const g of recognized) {
        // 若已有设计稿则跳过（不覆盖用户既有配置）
        if (designMap[g.key]) continue;
        const m = matches.get(g.baseName);
        if (m?.match) {
          hit++;
          const frame = m.match;
          onSetDesign(g.key, {
            file: new File([''], `${frame.name}.png`, { type: 'image/png' }),
            url: frame.thumbnailUrl,
            width: frame.width,
            height: frame.height,
            source: 'figma',
          });
        }
      }
      setAutoMatchStats({ hit, total: boardNames.length });
    } catch (err) {
      setFramesError(err instanceof Error ? err.message : 'Figma 文件加载失败');
      setFramePool(null);
    } finally {
      setLoadingFrames(false);
    }
  }, [figmaUrl, recognized, designMap, onSetDesign]);

  // 从池里选一个 frame 分派到某 board
  const handleAssignFromPool = useCallback(
    (groupKey: string, frame: FigmaFrameSummary) => {
      onSetDesign(groupKey, {
        file: new File([''], `${frame.name}.png`, { type: 'image/png' }),
        url: frame.thumbnailUrl,
        width: frame.width,
        height: frame.height,
        source: 'figma',
      });
    },
    [onSetDesign],
  );

  // 已被分派的 frame nodeId 集合（供池面板高亮"已使用"）
  const usedNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const img of Object.values(designMap)) {
      // 用 url 反查 nodeId：走 framePool 里的 thumbnailUrl
      if (img.source === 'figma' && framePool) {
        const hit = framePool.find((f) => f.thumbnailUrl === img.url);
        if (hit) set.add(hit.nodeId);
      }
    }
    return set;
  }, [designMap, framePool]);

  // 池搜索
  const filteredFrames = useMemo(() => {
    if (!framePool) return [];
    const q = poolSearch.trim().toLowerCase();
    if (!q) return framePool;
    return framePool.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.pageName.toLowerCase().includes(q),
    );
  }, [framePool, poolSearch]);

  if (recognized.length === 0) return null;

  const withDesign = recognized.filter((g) => designMap[g.key]).length;

  return (
    <div className="flex flex-col gap-3">
      {/* ─── 顶部批量 Figma 导入区 ─── */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-purple-50/40 to-blue-50/30">
        <div className="flex items-center gap-2 p-3">
          <svg className="w-4 h-4 text-purple-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 24c2.208 0 4-1.792 4-4v-4H8c-2.208 0-4 1.792-4 4s1.792 4 4 4z" />
          </svg>
          <input
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loadingFrames) handleLoadFrames();
            }}
            placeholder="贴 Figma 文件链接（一次拉全部画板并自动匹配）"
            disabled={loadingFrames}
            className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-300 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-100"
          />
          <button
            type="button"
            onClick={handleLoadFrames}
            disabled={loadingFrames || !figmaUrl.trim()}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {loadingFrames ? '加载中…' : framePool ? '重新加载' : '加载画板'}
          </button>
          {framePool && (
            <button
              type="button"
              onClick={() => setShowPool((v) => !v)}
              className="flex-shrink-0 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
              title={showPool ? '收起画板池' : '展开画板池'}
            >
              {showPool ? '收起 ▲' : '展开 ▼'}
            </button>
          )}
        </div>

        {framesError && (
          <p className="px-3 pb-2 text-[11px] text-red-500">{framesError}</p>
        )}

        {framePool && autoMatchStats && (
          <div className="px-3 pb-2 flex items-center gap-2 text-[11px]">
            <span className="text-slate-600">
              <span className="font-semibold text-slate-800">{fileName}</span> · {framePool.length} 个画板已加载
            </span>
            <span className="text-slate-300">·</span>
            <span className={autoMatchStats.hit > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
              自动匹配命中 {autoMatchStats.hit} / {autoMatchStats.total}
            </span>
            {autoMatchStats.hit < autoMatchStats.total && (
              <span className="text-slate-400">
                · 未命中的可从下方画板池手动分派
              </span>
            )}
          </div>
        )}

        {/* 缩略图池（原地展开） */}
        {framePool && showPool && (
          <FramePool
            frames={filteredFrames}
            totalCount={framePool.length}
            search={poolSearch}
            onSearchChange={setPoolSearch}
            usedNodeIds={usedNodeIds}
            recognized={recognized}
            onAssign={handleAssignFromPool}
          />
        )}
      </div>

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

/**
 * 缩略图池面板 —— 原地展开（方案 b）
 * 显示所有 frames，可搜索；每个卡片点"分派 →"选择 board
 */
function FramePool({
  frames,
  totalCount,
  search,
  onSearchChange,
  usedNodeIds,
  recognized,
  onAssign,
}: {
  frames: FigmaFrameSummary[];
  totalCount: number;
  search: string;
  onSearchChange: (v: string) => void;
  usedNodeIds: Set<string>;
  recognized: ScreenshotGroup[];
  onAssign: (groupKey: string, frame: FigmaFrameSummary) => void;
}) {
  // 按 pageName 分组
  const grouped = useMemo(() => {
    const map = new Map<string, FigmaFrameSummary[]>();
    for (const f of frames) {
      if (!map.has(f.pageName)) map.set(f.pageName, []);
      map.get(f.pageName)!.push(f);
    }
    return Array.from(map.entries());
  }, [frames]);

  return (
    <div className="border-t border-slate-200 bg-white/60">
      {/* 搜索栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索画板名 或 page 名"
          className="flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none"
        />
        <span className="text-[10px] text-slate-400">
          {frames.length} / {totalCount}
        </span>
      </div>

      {/* 缩略图网格（按 page 分组） */}
      <div className="max-h-96 overflow-y-auto p-3 space-y-4">
        {grouped.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-6">
            没有匹配的画板
          </p>
        )}
        {grouped.map(([page, list]) => (
          <div key={page}>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {page}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {list.map((f) => (
                <FrameCard
                  key={f.nodeId}
                  frame={f}
                  used={usedNodeIds.has(f.nodeId)}
                  recognized={recognized}
                  onAssign={(gKey) => onAssign(gKey, f)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 单个 frame 缩略图卡片
 * 点击卡片打开分派选择器（覆盖在缩略图上，避免 hover 消失问题）
 */
function FrameCard({
  frame,
  used,
  recognized,
  onAssign,
}: {
  frame: FigmaFrameSummary;
  used: boolean;
  recognized: ScreenshotGroup[];
  onAssign: (groupKey: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    // 延迟绑定，避免打开时立即被自身 click 触发关闭
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [pickerOpen]);

  return (
    <div ref={cardRef} className="relative">
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className={`w-full relative rounded-lg border overflow-hidden bg-slate-50 aspect-[3/4] hover:ring-2 hover:ring-purple-300 transition-all ${
          used ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-slate-200'
        } ${pickerOpen ? 'ring-2 ring-purple-400' : ''}`}
        title="点击分派到画板"
      >
        {frame.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame.thumbnailUrl}
            alt={frame.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300">
            无预览
          </div>
        )}

        {used && (
          <div className="absolute top-1 right-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-500 text-white text-[9px] font-bold pointer-events-none">
            ✓ 已用
          </div>
        )}

        {/* 悬浮提示：点击分派 */}
        {!pickerOpen && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/70 to-transparent p-1 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
            <span className="text-[10px] text-white font-medium">点击分派 →</span>
          </div>
        )}
      </button>

      {/* 分派选择器：点击外部关闭 */}
      {pickerOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-xl z-20 max-h-52 overflow-y-auto">
          <div className="sticky top-0 flex items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-100 bg-white">
            <span className="text-[10px] text-slate-500 font-semibold">
              分派 &quot;{frame.name}&quot; 到：
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen(false);
              }}
              className="text-slate-400 hover:text-slate-600 text-xs leading-none px-1"
              title="关闭"
            >
              ✕
            </button>
          </div>
          {recognized.map((g) => {
            const score = similarity(g.baseName, frame.name);
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => {
                  onAssign(g.key);
                  setPickerOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-purple-50 hover:text-purple-700 transition-colors border-b border-slate-50 last:border-b-0"
              >
                <span className="truncate">{g.baseName}</span>
                {score >= 0.5 && (
                  <span className="flex-shrink-0 text-[9px] text-slate-400">
                    {Math.round(score * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-[10px] text-slate-600 truncate" title={frame.name}>
        {frame.name}
      </p>
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
