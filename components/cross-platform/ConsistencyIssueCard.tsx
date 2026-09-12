'use client';

import { useState, useEffect, forwardRef } from 'react';
import { Collapse } from '@/components/ui/Collapse';
import type {
  PlatformConsistencyIssue,
  IssueType,
  IssueStatusCP,
  PlatformType,
} from '@/lib/crossPlatform';
import { useCroppedRegion } from '@/lib/useCroppedRegion';
import type { ImageFile } from '@/types';

interface ConsistencyIssueCardProps {
  issue: PlatformConsistencyIssue;
  index: number;
  /** 圆形编号徽章的颜色 */
  toneColor?: string;
  /** 是否高亮 */
  isHighlighted?: boolean;
  /** 强制展开 */
  forceExpanded?: boolean;
  onSelect?: () => void;
  /** Called when expanded/collapsed; receives regionName or null */
  onExpand?: (regionName: string | null) => void;
  onStatusChange?: (status: IssueStatusCP) => void;
  // ─── 版本对比（P2） ─────────────────────────
  versionStatus?: 'new' | 'persist' | 'first';
  linkedPrevLabel?: string | null;
  onLinkClick?: () => void;
  // ─── 区域截图（方案 A） ──────────────────────
  /** 当前版本 iOS 截图，用于裁剪问题区域缩略图 */
  iosImage?: ImageFile | null;
  /** 当前版本 Android 截图，用于裁剪问题区域缩略图 */
  androidImage?: ImageFile | null;
  /** 删除该问题（AI 总结有误时由设计师操作） */
  onDelete?: () => void;
}

const typeLabel: Record<IssueType, string> = {
  content:           '内容',
  layout:            '布局',
  style:             '样式',
  interaction:       '交互',
  'platform-specific': '平台规范',
};

const platformLabel: Record<PlatformType, string> = {
  ios:     'iOS',
  android: 'Android',
  web:     'Web',
};

const platformBadge: Record<PlatformType, string> = {
  ios:     'bg-blue-50 text-blue-700',
  android: 'bg-emerald-50 text-emerald-700',
  web:     'bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<IssueStatusCP, string> = {
  pending: '待修复',
  deferred: '可暂不处理',
  ignored: '已忽略',
  fixed: '已修复',
};

const STATUS_STYLE: Record<IssueStatusCP, string> = {
  pending: 'bg-slate-100 text-slate-600',
  deferred: 'bg-amber-50 text-amber-700',
  ignored: 'bg-slate-50 text-slate-400',
  fixed: 'bg-emerald-50 text-emerald-700',
};

const ConsistencyIssueCard = forwardRef<HTMLDivElement, ConsistencyIssueCardProps>(function ConsistencyIssueCard(
  { issue, index, toneColor, isHighlighted, forceExpanded, onSelect, onExpand, onStatusChange, onDelete, versionStatus, linkedPrevLabel, onLinkClick, iosImage, androidImage },
  ref,
) {
  const [innerExpanded, setInnerExpanded] = useState(false);
  // 用户手动点击后不再让 forceExpanded 覆盖展开状态
  const [userToggled, setUserToggled] = useState(false);
  const expanded = userToggled ? innerExpanded : (forceExpanded ?? innerExpanded);
  // 删除二次确认态
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = issue.status ?? 'pending';

  const toggle = () => {
    const next = !expanded;
    setInnerExpanded(next);
    setUserToggled(true);
    onSelect?.();
    onExpand?.(next ? (issue.regionName ?? null) : null);
  };

  // forceExpanded 从外部重新触发（如切换高亮卡片）时，重置用户手动状态
  useEffect(() => {
    if (forceExpanded) {
      setUserToggled(false);
      setInnerExpanded(false);
    }
  }, [forceExpanded]);

  return (
    <div
      ref={ref}
      className={`border rounded-xl overflow-hidden bg-white transition-all ${
        isHighlighted
          ? 'border-blue-300 ring-2 ring-blue-100/80 shadow-chip'
          : issue.isAcceptablePlatformDifference
            ? 'border-slate-200/80 opacity-80'
            : 'border-slate-200/80 shadow-chip'
      }`}
    >
      <button
        onClick={() => toggle()}
        className="w-full flex flex-col gap-3 px-4 pt-4 pb-3 text-left hover:bg-slate-50/70 transition-colors"
      >
        {/* Row 1: numbered circle + status + platforms + chevron */}
        <div className="flex items-center gap-1.5 w-full flex-wrap">
          <NumberedCircle index={index} color={toneColor} />
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            {issue.platforms.map((p) => (
              <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${platformBadge[p]}`}>
                {platformLabel[p]}
              </span>
            ))}
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 flex-shrink-0 ml-auto transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Row 2: title */}
        <p className="text-[15px] font-semibold text-slate-800 leading-snug break-words w-full">
          {issue.title}
          {issue.isAcceptablePlatformDifference && (
            <span className="ml-2 text-xs font-normal text-slate-400">（平台合理差异）</span>
          )}
        </p>

        {/* Row 3: tags */}
        <div className="flex flex-wrap gap-1 w-full">
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100/80 text-slate-500">
            {typeLabel[issue.type]}
          </span>
          {issue.tags?.map((tag) => (
              <span key={tag} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100/80 text-slate-500">
                {tag}
              </span>
          ))}
        </div>

        {/* Row 4: metadata */}
        {issue.regionName && (
          <p className="text-[11px] text-slate-400">
            区域 <span className="ml-2 text-slate-500">{issue.regionName}</span>
          </p>
        )}

        {/* Row 5: provenance / version context */}
        {(versionStatus === 'new' || versionStatus === 'persist' || issue.manual || issue.discoveredBy) && (
          <div className="flex flex-wrap gap-1.5 w-full">
            {versionStatus === 'new' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700" title="本版新增">
                本版新增
              </span>
            )}
            {versionStatus === 'persist' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500" title="上版仍存在">
                上版存续
              </span>
            )}
            {issue.manual && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700" title="手工标注（非 AI 检测）">
                手工标注
              </span>
            )}
            {issue.discoveredBy && (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${discoveredByStyle(issue.discoveredBy)}`}
                title={discoveredByTitle(issue.discoveredBy)}
              >
                {discoveredByLabel(issue.discoveredBy)}
              </span>
            )}
          </div>
        )}
      </button>

      <Collapse open={expanded}>
        <div className="px-4 pb-4 pt-1 flex flex-col gap-4">
          {issue.description && <DetailBlock label="问题描述" text={issue.description} />}
          {issue.suggestion && !issue.isAcceptablePlatformDifference && (
            <DetailBlock label="修复建议" text={issue.suggestion} highlight />
          )}
          {onStatusChange && (
            <div className="flex items-center gap-1 pt-3 border-t border-slate-100 flex-wrap">
              <span className="text-[11px] text-slate-400 mr-1">标记为：</span>
              {(['pending', 'deferred', 'ignored', 'fixed'] as IssueStatusCP[]).map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(s);
                  }}
                  className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                    status === s
                      ? STATUS_STYLE[s] + ' font-semibold'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          {onLinkClick && versionStatus !== 'first' && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-[11px] text-slate-400 mr-0.5">关联上版：</span>
              {linkedPrevLabel ? (
                <>
                  <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    🔗 {linkedPrevLabel}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLinkClick();
                    }}
                    className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline"
                  >
                    修改
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLinkClick();
                  }}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                >
                  🔗 关联到上版问题
                </button>
              )}
            </div>
          )}

          {/* ── 删除操作（两步确认） ── */}
          {onDelete && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 mt-0.5">
              {confirmingDelete ? (
                <>
                  <span className="text-[11px] text-slate-500">确认删除该差异？</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingDelete(false);
                    }}
                    className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="text-[11px] px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
                  >
                    确认删除
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(true);
                  }}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  删除此差异
                </button>
              )}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
});

export default ConsistencyIssueCard;

// ─── RegionCropPreview：裁剪并排展示双端问题区域截图 ─────────────────────────

function RegionCropPreview({
  issue,
  iosImage,
  androidImage,
}: {
  issue: PlatformConsistencyIssue;
  iosImage?: ImageFile | null;
  androidImage?: ImageFile | null;
}) {
  const hasIosLoc = !!issue.iosLocation;
  const hasAndroidLoc = !!issue.androidLocation;
  // 只有至少一端有位置信息时才渲染
  if (!hasIosLoc && !hasAndroidLoc) return null;

  return (
    <div className="flex gap-2 rounded-lg overflow-hidden bg-slate-50 border border-slate-200 p-1.5">
      {hasIosLoc && (
        <CropPane
          label="iOS"
          labelColor="bg-blue-500"
          imageUrl={iosImage?.url}
          rect={issue.iosLocation!}
        />
      )}
      {hasAndroidLoc && (
        <CropPane
          label="Android"
          labelColor="bg-green-500"
          imageUrl={androidImage?.url}
          rect={issue.androidLocation!}
        />
      )}
    </div>
  );
}

function CropPane({
  label,
  labelColor,
  imageUrl,
  rect,
}: {
  label: string;
  labelColor: string;
  imageUrl: string | undefined;
  rect: import('@/lib/crossPlatform/types').NormalizedRect;
}) {
  // 只有 imageUrl 存在时才实际裁剪
  const dataUrl = useCroppedRegion(imageUrl, rect, !!imageUrl);

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1">
      <span className={`self-start text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${labelColor}`}>
        {label}
      </span>
      <div
        className="relative rounded overflow-hidden bg-slate-200"
        style={{ aspectRatio: '16/9' }}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={`${label} 问题区域`}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : imageUrl ? (
          /* 加载中骨架 */
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
          </div>
        ) : (
          /* 无图时占位 */
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[10px] text-slate-400">未上传截图</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NumberedCircle({ index, color }: { index: number; color?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-[11px] font-semibold tabular-nums flex-shrink-0"
      style={{
        color: color ?? '#64748b',
      }}
    >
      {index}
    </span>
  );
}

function DetailBlock({ label, text, highlight }: { label: string; text: string; highlight?: boolean }) {
  // 说明：这个组件出现在卡片「展开」后的区域（Collapse open={true} 里），
  // 用户主动点开就是为了看全文。旧实现用 -webkit-line-clamp:3 硬截 3 行，
  // 展开卡片依然看不全「描述/建议」（末尾出现 "…"），与展开交互语义冲突。
  // 因此这里直接完整显示；靠 break-words + leading-relaxed 保证长文本可读。
  return (
    <div className={highlight ? 'rounded-lg bg-blue-50/60 px-3 py-2.5' : ''}>
      <p className={`text-[11px] font-medium mb-1.5 ${highlight ? 'text-blue-700' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className="text-[13px] font-normal text-slate-600 leading-relaxed break-words whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 多模型交叉验证：discoveredBy badge 样式
// ═══════════════════════════════════════════════════════════════════════════

function discoveredByLabel(who: string): string {
  if (who === 'both') return '✓✓ 双模确认';
  return `${providerShortName(who)}`;
}

function discoveredByStyle(who: string): string {
  if (who === 'both') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-500';
}

function discoveredByTitle(who: string): string {
  if (who === 'both') return '两个模型都发现了这个问题，置信度更高';
  return `仅由 ${providerShortName(who)} 发现（对方模型未识别）`;
}

function providerShortName(who: string): string {
  const map: Record<string, string> = {
    claude: 'Claude',
    openai: 'GPT',
    maas: 'MaaS-Claude',
    'maas-direct': 'Qwen',
  };
  return map[who] || who;
}
