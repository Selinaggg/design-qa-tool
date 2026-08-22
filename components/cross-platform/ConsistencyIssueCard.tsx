'use client';

import { useState, useEffect, forwardRef } from 'react';
import { Collapse } from '@/components/ui/Collapse';
import type {
  PlatformConsistencyIssue,
  IssueType,
  IssueSeverityCP,
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

const severityStyle: Record<IssueSeverityCP, string> = {
  critical: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  high:     'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200',
  low:      'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

const typeStyle: Record<IssueType, string> = {
  content:           'bg-purple-50 text-purple-700',
  layout:            'bg-blue-50 text-blue-700',
  style:             'bg-green-50 text-green-700',
  interaction:       'bg-indigo-50 text-indigo-700',
  'platform-specific': 'bg-slate-100 text-slate-600',
};

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
  ios:     'bg-blue-500 text-white',
  android: 'bg-green-500 text-white',
  web:     'bg-slate-500 text-white',
};

const STATUS_LABEL: Record<IssueStatusCP, string> = {
  pending: '待修复',
  deferred: '可暂不处理',
  ignored: '已忽略',
  fixed: '已修复',
};

const STATUS_STYLE: Record<IssueStatusCP, string> = {
  pending: 'bg-slate-100 text-slate-600',
  deferred: 'bg-amber-50 text-amber-700 border border-amber-200',
  ignored: 'bg-slate-50 text-slate-400 border border-slate-200',
  fixed: 'bg-green-50 text-green-700 border border-green-200',
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
          ? 'border-blue-400 ring-2 ring-blue-100 shadow-float'
          : issue.isAcceptablePlatformDifference
            ? 'border-slate-200 opacity-80'
            : 'border-slate-200'
      }`}
    >
      <button
        onClick={() => toggle()}
        className="w-full flex flex-col gap-2 px-3 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {/* Row 1: numbered circle + badges + status + chevron */}
        <div className="flex items-center gap-1.5 w-full flex-wrap">
          <NumberedCircle index={index} color={toneColor} />
          {versionStatus === 'new' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 ring-1 ring-rose-200 flex-shrink-0" title="本版新增">
              🆕 新增
            </span>
          )}
          {versionStatus === 'persist' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ring-1 ring-blue-200 flex-shrink-0" title="上版仍存在">
              🔵 存续
            </span>
          )}
          {issue.manual && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 ring-1 ring-purple-200 flex-shrink-0"
              title="手工标注（非 AI 检测）"
            >
              📝 手工
            </span>
          )}
          {issue.discoveredBy && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 flex-shrink-0 ${discoveredByStyle(issue.discoveredBy)}`}
              title={discoveredByTitle(issue.discoveredBy)}
            >
              {discoveredByLabel(issue.discoveredBy)}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
          <div className="flex gap-0.5 flex-shrink-0">
            {issue.platforms.map((p) => (
              <span key={p} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${platformBadge[p]}`}>
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
        <p className="text-sm font-medium text-slate-800 leading-snug break-words w-full">
          {issue.title}
          {issue.isAcceptablePlatformDifference && (
            <span className="ml-2 text-xs font-normal text-slate-400">（平台合理差异）</span>
          )}
        </p>

        {/* Row 3: tags */}
        {issue.tags && issue.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 w-full">
            {issue.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>

      <Collapse open={expanded}>
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 flex flex-col gap-1.5">
          {issue.regionName && (
            <p className="text-[11px] text-slate-400">
              区域：<span className="text-slate-600 font-medium">{issue.regionName}</span>
            </p>
          )}
          {issue.description && <CompactRow label="描述" text={issue.description} />}
          {issue.suggestion && !issue.isAcceptablePlatformDifference && (
            <CompactRow label="建议" text={issue.suggestion} highlight />
          )}
          {onStatusChange && (
            <div className="flex items-center gap-1 pt-1 flex-wrap">
              <span className="text-[11px] text-slate-400 mr-1">标记为：</span>
              {(['pending', 'deferred', 'ignored', 'fixed'] as IssueStatusCP[]).map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(s);
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
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
      className="inline-flex items-center justify-center rounded-full text-white text-[11px] font-bold flex-shrink-0"
      style={{
        width: 20,
        height: 20,
        background: color ?? '#94a3b8',
        border: '2px solid #ffffff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }}
    >
      {index}
    </span>
  );
}

function CompactRow({ label, text, highlight }: { label: string; text: string; highlight?: boolean }) {
  // 说明：这个组件出现在卡片「展开」后的区域（Collapse open={true} 里），
  // 用户主动点开就是为了看全文。旧实现用 -webkit-line-clamp:3 硬截 3 行，
  // 展开卡片依然看不全「描述/建议」（末尾出现 "…"），与展开交互语义冲突。
  // 因此这里直接完整显示；靠 break-words + leading-relaxed 保证长文本可读。
  return (
    <div className={`rounded-md px-2.5 py-1.5 ${highlight ? 'bg-blue-50' : 'bg-slate-50'}`}>
      <span
        className={`text-[11px] font-semibold mr-1.5 ${highlight ? 'text-blue-500' : 'text-slate-400'}`}
      >
        {label}
      </span>
      <span className="text-xs text-slate-700 leading-relaxed break-words whitespace-pre-wrap">
        {text}
      </span>
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
  if (who === 'both') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  // 单模型发现：中性灰底 + provider 家族色
  if (who.startsWith('maas') || who === 'openai') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-sky-50 text-sky-700 ring-sky-200';
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
