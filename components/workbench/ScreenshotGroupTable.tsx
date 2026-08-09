'use client';

import { useMemo, useState } from 'react';
import type { ScreenshotGroup } from '@/lib/batchScreenshot';

interface ScreenshotGroupTableProps {
  groups: ScreenshotGroup[];
  /** 用户重命名某组（key 不变，仅改 baseName 显示；数据源为父级 items 的 groupKey） */
  onRenameGroup?: (key: string, newBaseName: string) => void;
  /** 删除整组（父级同时移除对应 items） */
  onRemoveGroup: (key: string) => void;
  /**
   * P2.7.5 · 未识别项手动指定平台/画板名
   * itemId：单张截图 id（未识别组 extras[0].id）
   * patch：可只传 platform 或 groupKey；父级更新对应 item 后 groupByBaseName 会自动重新分组
   */
  onClassifyItem?: (
    itemId: string,
    patch: { platform?: 'ios' | 'android'; groupKey?: string },
  ) => void;
}

/**
 * 分组结果表（P2.4）
 * - 每行：画板名（可编辑）+ iOS 缩略 + Android 缩略 + 状态徽标 + 删除
 * - 底部统计：识别 N 组画板 · M 张未匹配 · K 张重复
 */
export default function ScreenshotGroupTable({
  groups,
  onRenameGroup,
  onRemoveGroup,
  onClassifyItem,
}: ScreenshotGroupTableProps) {
  const stats = useMemo(() => {
    let paired = 0; // 双端都齐
    let iosOnly = 0;
    let androidOnly = 0;
    let unknown = 0;
    let extras = 0;
    for (const g of groups) {
      if (!g.recognized) {
        unknown += 1;
        continue;
      }
      if (g.ios && g.android) paired += 1;
      else if (g.ios) iosOnly += 1;
      else if (g.android) androidOnly += 1;
      extras += g.extras.length;
    }
    return { paired, iosOnly, androidOnly, unknown, extras };
  }, [groups]);

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* 统计条 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] px-1">
        <span className="font-semibold text-slate-700">识别 {groups.length} 组画板</span>
        {stats.paired > 0 && (
          <StatChip color="green" label={`双端 ${stats.paired}`} />
        )}
        {stats.iosOnly > 0 && (
          <StatChip color="blue" label={`仅 iOS ${stats.iosOnly}`} />
        )}
        {stats.androidOnly > 0 && (
          <StatChip color="green" label={`仅 Android ${stats.androidOnly}`} />
        )}
        {stats.unknown > 0 && (
          <StatChip color="amber" label={`未识别 ${stats.unknown}`} />
        )}
        {stats.extras > 0 && (
          <StatChip color="red" label={`重复忽略 ${stats.extras}`} />
        )}
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_60px] gap-2 items-center px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
          <span>画板名</span>
          <span className="text-center">iOS</span>
          <span className="text-center">Android</span>
          <span className="text-center">操作</span>
        </div>
        <div className="divide-y divide-slate-100">
          {groups.map((g) => (
            <GroupRow
              key={g.key}
              group={g}
              onRename={onRenameGroup ? (n) => onRenameGroup(g.key, n) : undefined}
              onRemove={() => onRemoveGroup(g.key)}
              onClassifyItem={onClassifyItem}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupRow({
  group,
  onRename,
  onRemove,
  onClassifyItem,
}: {
  group: ScreenshotGroup;
  onRename?: (newName: string) => void;
  onRemove: () => void;
  onClassifyItem?: (
    itemId: string,
    patch: { platform?: 'ios' | 'android'; groupKey?: string },
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.baseName);

  const status = getGroupStatus(group);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === group.baseName) {
      setDraft(group.baseName);
      return;
    }
    onRename?.(next);
  };

  // ── P2.7.5：未识别行走单独的"手动分派"布局 ──
  if (!group.recognized) {
    const item = group.extras[0]; // 未识别组必然只有一张图（key=`unknown-${id}`）
    return (
      <UnknownRow
        item={item}
        onClassify={onClassifyItem}
        onRemove={onRemove}
      />
    );
  }

  return (
    <div
      className="grid grid-cols-[1fr_120px_120px_60px] gap-2 items-center px-3 py-2 hover:bg-slate-50/60 transition-colors"
    >
      {/* 画板名 */}
      <div className="min-w-0 flex items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(group.baseName);
                setEditing(false);
              }
            }}
            className="w-full rounded-md border border-blue-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => onRename && setEditing(true)}
            disabled={!onRename}
            className={`text-sm font-medium text-slate-800 truncate ${
              onRename ? 'hover:text-blue-600 cursor-text' : 'cursor-default'
            }`}
            title={onRename ? '点击重命名' : undefined}
          >
            {group.baseName || '(未命名)'}
          </button>
        )}
        <StatusBadge status={status} />
      </div>

      {/* iOS 缩略 */}
      <ThumbCell item={group.ios} platform="ios" />

      {/* Android 缩略 */}
      <ThumbCell item={group.android} platform="android" />

      {/* 删除 */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          aria-label="删除该组"
          title="删除该组（含所有截图）"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ThumbCell({
  item,
  platform,
}: {
  item: import('@/components/workbench/types').BatchScreenshotItem | null;
  platform: 'ios' | 'android';
}) {
  if (!item) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-[10px] text-slate-300">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center">
      <div className="relative w-14 h-14 rounded-md overflow-hidden border border-slate-200 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image.url}
          alt={item.name}
          className="w-full h-full object-cover"
          title={item.name}
        />
        <span
          className={`absolute bottom-0 left-0 right-0 text-[9px] leading-3 py-[1px] text-center text-white font-semibold ${
            platform === 'ios' ? 'bg-blue-500/85' : 'bg-green-500/85'
          }`}
        >
          {platform === 'ios' ? 'iOS' : 'AND'}
        </span>
      </div>
    </div>
  );
}

// ── 辅助 ─────────────────────────────────────────────────────────────

type GroupStatus = 'paired' | 'ios-only' | 'android-only' | 'unknown';

function getGroupStatus(g: ScreenshotGroup): GroupStatus {
  if (!g.recognized) return 'unknown';
  if (g.ios && g.android) return 'paired';
  if (g.ios) return 'ios-only';
  return 'android-only';
}

function StatusBadge({ status }: { status: GroupStatus }) {
  const map: Record<GroupStatus, { text: string; className: string }> = {
    paired: { text: '双端', className: 'bg-green-100 text-green-700' },
    'ios-only': { text: '仅 iOS', className: 'bg-blue-100 text-blue-700' },
    'android-only': { text: '仅 Android', className: 'bg-emerald-100 text-emerald-700' },
    unknown: { text: '未识别', className: 'bg-amber-100 text-amber-700' },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${cfg.className}`}
    >
      {cfg.text}
    </span>
  );
}

function StatChip({
  color,
  label,
}: {
  color: 'green' | 'blue' | 'amber' | 'red';
  label: string;
}) {
  const map: Record<'green' | 'blue' | 'amber' | 'red', string> = {
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${map[color]}`}
    >
      {label}
    </span>
  );
}

// ── P2.7.5 未识别行：手动指定平台 + 画板名 ────────────────────────────

function UnknownRow({
  item,
  onClassify,
  onRemove,
}: {
  item: import('@/components/workbench/types').BatchScreenshotItem;
  onClassify?: (
    itemId: string,
    patch: { platform?: 'ios' | 'android'; groupKey?: string },
  ) => void;
  onRemove: () => void;
}) {
  // 画板名草稿：优先用已有 groupKey，否则用 item.name 去后缀
  const initialName = item.groupKey ?? stripExt(item.name);
  const [nameDraft, setNameDraft] = useState(initialName);

  const commitName = () => {
    const next = nameDraft.trim();
    if (!next || !onClassify) return;
    onClassify(item.id, { groupKey: next });
  };

  const setPlatform = (p: 'ios' | 'android') => {
    if (!onClassify) return;
    // 首次指定平台时，若用户还没编辑过画板名，一起把 groupKey 提交（避免只有平台没名字）
    const patch: { platform: 'ios' | 'android'; groupKey?: string } = { platform: p };
    if (item.groupKey === undefined) {
      const n = nameDraft.trim();
      if (n) patch.groupKey = n;
    }
    onClassify(item.id, patch);
  };

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3 py-2.5 bg-amber-50/50 hover:bg-amber-50 transition-colors">
      {/* 缩略图 */}
      <div className="relative w-12 h-12 rounded-md overflow-hidden border border-amber-200 bg-white flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image.url}
          alt={item.name}
          className="w-full h-full object-cover"
          title={item.name}
        />
      </div>

      {/* 文件名 + 画板名输入 */}
      <div className="min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0"
          >
            未识别
          </span>
          <span
            className="text-[11px] text-slate-500 truncate min-w-0"
            title={item.name}
          >
            {item.name}
          </span>
        </div>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder="画板名（例：首页）"
          className="w-full max-w-[240px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        />
      </div>

      {/* 平台选择：iOS / Android 按钮组 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => setPlatform('ios')}
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition-colors"
          title="指定为 iOS"
        >
          + iOS
        </button>
        <button
          type="button"
          onClick={() => setPlatform('android')}
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-green-300 text-green-700 bg-white hover:bg-green-50 transition-colors"
          title="指定为 Android"
        >
          + Android
        </button>
      </div>

      {/* 删除 */}
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
        aria-label="删除该截图"
        title="删除该截图"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
        </svg>
      </button>
    </div>
  );
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}
