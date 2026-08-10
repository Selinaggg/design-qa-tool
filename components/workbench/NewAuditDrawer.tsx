'use client';

import { useEffect, useMemo, useState } from 'react';
import DropZone from '@/components/upload/DropZone';
import FigmaImport from '@/components/upload/FigmaImport';
import ScreenshotBatchDropzone from './ScreenshotBatchDropzone';
import ScreenshotGroupTable from './ScreenshotGroupTable';
import BoardMappingTable from './BoardMappingTable';
import { groupByBaseName, buildBoardsFromGroups } from '@/lib/batchScreenshot';
import {
  IOS_DEVICES,
  ANDROID_DEVICES,
  DEFAULT_IOS_DEVICE,
  DEFAULT_ANDROID_DEVICE,
} from '@/lib/crossPlatform/deviceProfiles';
import type { DeviceProfile, AuditOptions } from '@/lib/crossPlatform';
import {
  IGNORE_RULES,
  IGNORE_GROUPS,
  SCENARIO_PRESETS,
  DEFAULT_IGNORE_RULES,
  resolveIgnoreRuleIds,
  type IgnoreRuleGroupId,
  type IgnoreRuleId,
} from '@/lib/crossPlatform/ignoreRules';
import type { ImageFile } from '@/types';
import type { AuditSession, BatchScreenshotItem } from './types';
import {
  loadAIConfig,
  saveAIConfig,
  maskApiKey,
  canReuseKeyBetween,
  MAAS_DIRECT_MODELS,
  DEFAULT_MAAS_DIRECT_MODEL,
  type AIConfig,
  type AIProviderKind,
  type RealAIProviderKind,
} from '@/lib/aiConfig';

/** 走查模式：单画板（原逻辑）/ 批量走查（多画板 tab） */
type AuditKind = 'single' | 'batch';

interface NewAuditDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 有值 = 新版本模式（为该会话追加 v(n+1)）；null = 新会话模式（v1） */
  parentSession?: AuditSession | null;
  onCreate: (session: AuditSession) => void;
  onAddVersion: (
    parentId: string,
    assets: {
      iosImage: ImageFile | null;
      androidImage: ImageFile | null;
      designRefImage?: ImageFile | null;
      label?: string;
    },
  ) => void;
}

const DEFAULT_OPTIONS: AuditOptions = {
  ignoreStatusBar: true,
  ignoreBottomSafeArea: true,
  useNormalizedCoordinates: true,
  // 动态内容默认走「通用忽略」3 条（IGNORE_RULES.generic 组）；
  // 用户可在 UI 里追加场景（直播/电商/发布/社区/短视频/IM）
  ignoreRules: [...DEFAULT_IGNORE_RULES],
};

export default function NewAuditDrawer({
  open,
  onClose,
  parentSession,
  onCreate,
  onAddVersion,
}: NewAuditDrawerProps) {
  const isVersionMode = !!parentSession;

  // 走查模式 tab：仅在"新会话模式"下可切换；新版本模式强制 single
  const [auditKind, setAuditKind] = useState<AuditKind>('single');

  // 批量走查：截图列表（P2.3）—— P2.4 会引入分组识别
  const [batchItems, setBatchItems] = useState<BatchScreenshotItem[]>([]);

  // 分组结果（P2.4）：每次 batchItems 变化重新按文件名解析并分组
  const batchGroups = useMemo(() => groupByBaseName(batchItems), [batchItems]);

  // 画板 → 设计稿映射（P2.5）：key = group.key（baseName.toLowerCase() 或 unknown-*）
  // 注意：当用户重命名画板时 group.key 会变（因为 key 由 baseName 派生），旧关联会自动失效 —— 这是可接受的
  const [boardDesignMap, setBoardDesignMap] = useState<Record<string, ImageFile>>({});

  const [name, setName] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [iosImage, setIosImage] = useState<ImageFile | null>(null);
  const [androidImage, setAndroidImage] = useState<ImageFile | null>(null);
  const [designRefImage, setDesignRefImage] = useState<ImageFile | null>(null);
  // 初始值：新版本模式下从父会话继承；否则用默认
  const [iosDevice, setIosDevice] = useState<DeviceProfile>(
    () => parentSession?.iosDevice ?? DEFAULT_IOS_DEVICE,
  );
  const [androidDevice, setAndroidDevice] = useState<DeviceProfile>(
    () => parentSession?.androidDevice ?? DEFAULT_ANDROID_DEVICE,
  );
  const [options, setOptions] = useState<AuditOptions>(() => {
    if (!parentSession?.options) return DEFAULT_OPTIONS;
    // 老 session 兼容：把旧 4 boolean 字段迁移成新的 ignoreRules 数组
    return {
      ...parentSession.options,
      ignoreRules: resolveIgnoreRuleIds(parentSession.options),
    };
  });

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // 批量走查校验派生
  const batchRecognizedCount = useMemo(
    () => batchGroups.filter((g) => g.recognized).length,
    [batchGroups],
  );
  const batchUnknownCount = useMemo(
    () => batchGroups.filter((g) => !g.recognized).length,
    [batchGroups],
  );

  // 提交条件：
  // - 新版本模式：至少一端截图
  // - 单画板新会话：至少一端截图
  // - 批量新会话：至少 1 组识别成功的画板
  const canSubmit = isVersionMode
    ? iosImage !== null || androidImage !== null
    : auditKind === 'single'
      ? iosImage !== null || androidImage !== null
      : batchRecognizedCount > 0;

  /**
   * 重置抽屉状态
   * @param revokeUrls 是否释放 blob URL。submit 成功时传 false（所有权转让给 session）
   */
  const resetAll = (revokeUrls = true) => {
    setName('');
    setVersionLabel('');
    setIosImage(null);
    setAndroidImage(null);
    setDesignRefImage(null);
    setIosDevice(DEFAULT_IOS_DEVICE);
    setAndroidDevice(DEFAULT_ANDROID_DEVICE);
    setOptions(DEFAULT_OPTIONS);
    setAuditKind('single');
    if (revokeUrls) {
      batchItems.forEach((it) => URL.revokeObjectURL(it.image.url));
      Object.values(boardDesignMap).forEach((img) => URL.revokeObjectURL(img.url));
    }
    setBatchItems([]);
    setBoardDesignMap({});
  };

  const handleSubmit = () => {
    // ── 批量走查（新会话）─────────────────────────────────
    if (!isVersionMode && auditKind === 'batch') {
      if (batchRecognizedCount === 0) return;

      // 未识别项警告（不阻塞）
      if (batchUnknownCount > 0) {
        const proceed = confirm(
          `有 ${batchUnknownCount} 张截图未识别平台后缀，将被忽略。\n\n是否继续创建批量走查？`,
        );
        if (!proceed) return;
      }

      const boards = buildBoardsFromGroups(batchGroups, boardDesignMap, 1);
      if (boards.length === 0) return;

      const sessionName =
        name.trim() || '批量走查 ' + new Date().toLocaleTimeString();
      const now = Date.now();
      const session: AuditSession = {
        id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now,
        mode: 'cross-platform',
        type: 'batch',
        name: sessionName,
        iosDevice,
        androidDevice,
        options,
        versions: [
          {
            v: 1,
            createdAt: now,
            boards,
            activeBoardId: boards[0].id,
          },
        ],
        currentVersionIndex: 0,
      };
      onCreate(session);
      // 图片 URL 所有权转让给 session，不 revoke
      resetAll(false);
      return;
    }

    // ── 单画板 / 新版本（原逻辑）─────────────────────────
    if (!iosImage && !androidImage) return;

    if (isVersionMode && parentSession) {
      onAddVersion(parentSession.id, {
        iosImage,
        androidImage,
        designRefImage,
        label: versionLabel.trim() || undefined,
      });
    } else {
      const sessionName =
        name.trim() || '跨端走查 ' + new Date().toLocaleTimeString();
      const now = Date.now();
      const session: AuditSession = {
        id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now,
        mode: 'cross-platform',
        type: 'single',
        name: sessionName,
        iosDevice,
        androidDevice,
        options,
        versions: [
          {
            v: 1,
            createdAt: now,
            iosImage,
            androidImage,
            designRefImage,
            iosRegions: [],
            androidRegions: [],
          },
        ],
        currentVersionIndex: 0,
      };
      onCreate(session);
    }
    // 单画板 / 新版本：图片所有权转让给 session
    resetAll(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Mask */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="relative ml-auto h-full w-full max-w-[720px] bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="min-w-0">
            {isVersionMode && parentSession ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                    新版本 v{parentSession.versions.length + 1}
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900 truncate">{parentSession.name}</h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  上传研发修改后的新截图（至少一端）；标注区域与设备配置将从上一版继承
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900">新建走查</h2>
                <p className="text-xs text-slate-500 mt-0.5">上传 iOS 或 Android 截图（至少一端），可选 Figma 设计稿作参考</p>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* AI 配置折叠区 —— 用户填自己的 API key，直接跑真实走查 */}
          <AIConfigPanel />

          {/* 走查模式 tab —— 仅新会话模式显示；新版本模式沿用父会话模式 */}
          {!isVersionMode && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 self-start">
              <KindTab
                active={auditKind === 'single'}
                onClick={() => setAuditKind('single')}
                title="单画板"
                subtitle="一屏截图 · iOS + Android + 设计稿"
              />
              <KindTab
                active={auditKind === 'batch'}
                onClick={() => setAuditKind('batch')}
                title="批量走查"
                subtitle="多画板一次性走查 · 命名自动配对"
                badge="Beta"
              />
            </div>
          )}

          {/* ─────────────── 批量走查（P2.3 上传 · P2.4 分组 · P2.5 配对）─────────────── */}
          {!isVersionMode && auditKind === 'batch' && (
            <div className="flex flex-col gap-5">
              <Field label="走查名称" hint="留空会自动生成名称">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：直播间 v2.5 全场景批量走查"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </Field>

              <Field
                label="批量截图"
                required
                hint="将同一功能的 iOS / Android 截图按相同前缀 + 平台后缀命名（例：直播间_iOS.png · 直播间_Android.png）"
              >
                <ScreenshotBatchDropzone
                  items={batchItems}
                  onAdd={(newItems) => setBatchItems((prev) => [...prev, ...newItems])}
                  onRemove={(id) =>
                    setBatchItems((prev) => {
                      const target = prev.find((x) => x.id === id);
                      if (target) URL.revokeObjectURL(target.image.url);
                      return prev.filter((x) => x.id !== id);
                    })
                  }
                  onClear={() => {
                    batchItems.forEach((it) => URL.revokeObjectURL(it.image.url));
                    setBatchItems([]);
                  }}
                />
              </Field>

              {/* 分组结果（P2.4） */}
              {batchGroups.length > 0 && (
                <Field
                  label="画板分组"
                  hint="按文件名自动识别；可重命名或删除整组。未识别的截图可手动指定 iOS / Android 并填画板名"
                >
                  <ScreenshotGroupTable
                    groups={batchGroups}
                    onRenameGroup={(key, newBaseName) => {
                      // 找到该组的所有 item（含 extras），把它们的 groupKey 改成新名字
                      // 注意：key 是原 baseName.toLowerCase()（识别组）或 "unknown-${itemId}"（未识别）
                      setBatchItems((prev) =>
                        prev.map((it) => {
                          const inGroup = batchGroups.find((g) => g.key === key);
                          if (!inGroup) return it;
                          const inMembers =
                            inGroup.ios?.id === it.id ||
                            inGroup.android?.id === it.id ||
                            inGroup.extras.some((e) => e.id === it.id);
                          if (!inMembers) return it;
                          // 重命名后，若原本 platform=null，也统一改名（便于用户手动整理后重新识别）
                          return { ...it, groupKey: newBaseName };
                        }),
                      );
                      // 同步：把设计稿关联迁移到新 key
                      const oldDesign = boardDesignMap[key];
                      if (oldDesign) {
                        const newKey = newBaseName.toLowerCase();
                        setBoardDesignMap((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          next[newKey] = oldDesign;
                          return next;
                        });
                      }
                    }}
                    onRemoveGroup={(key) => {
                      const target = batchGroups.find((g) => g.key === key);
                      if (!target) return;
                      const removedIds = new Set<string>();
                      if (target.ios) removedIds.add(target.ios.id);
                      if (target.android) removedIds.add(target.android.id);
                      target.extras.forEach((e) => removedIds.add(e.id));
                      setBatchItems((prev) => {
                        prev.forEach((it) => {
                          if (removedIds.has(it.id)) URL.revokeObjectURL(it.image.url);
                        });
                        return prev.filter((it) => !removedIds.has(it.id));
                      });
                      // 同步删除该组的设计稿关联
                      const removedDesign = boardDesignMap[key];
                      if (removedDesign) {
                        URL.revokeObjectURL(removedDesign.url);
                        setBoardDesignMap((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                    onClassifyItem={(itemId, patch) => {
                      // P2.7.5：未识别项手动指定平台/画板名 → 更新 item 字段
                      // groupByBaseName 会自动重新计算分组（识别组 key = baseName.toLowerCase()）
                      setBatchItems((prev) =>
                        prev.map((it) => {
                          if (it.id !== itemId) return it;
                          return {
                            ...it,
                            ...(patch.platform !== undefined ? { platform: patch.platform } : {}),
                            ...(patch.groupKey !== undefined ? { groupKey: patch.groupKey } : {}),
                          };
                        }),
                      );
                    }}
                  />
                </Field>
              )}

              {/* 画板 → 设计稿映射（P2.5） */}
              {batchGroups.some((g) => g.recognized) && (
                <Field
                  label="设计稿映射"
                  hint="为每个画板关联设计稿（可选，未上传的画板只做端上双端一致性检查）。P3 将支持从 Figma 直接选择 frame"
                >
                  <BoardMappingTable
                    groups={batchGroups}
                    designMap={boardDesignMap}
                    onSetDesign={(groupKey, image) => {
                      setBoardDesignMap((prev) => {
                        // 若原有旧图，释放
                        const old = prev[groupKey];
                        if (old) URL.revokeObjectURL(old.url);
                        return { ...prev, [groupKey]: image };
                      });
                    }}
                    onRemoveDesign={(groupKey) => {
                      setBoardDesignMap((prev) => {
                        const old = prev[groupKey];
                        if (old) URL.revokeObjectURL(old.url);
                        const next = { ...prev };
                        delete next[groupKey];
                        return next;
                      });
                    }}
                  />
                </Field>
              )}
            </div>
          )}

          {/* ─────────────── 单画板（原逻辑）─────────────── */}
          {(isVersionMode || auditKind === 'single') && (
            <>
              {/* Name（仅新会话模式） */}
              {!isVersionMode && (
                <Field label="走查名称" hint="留空会自动生成名称">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：直播间 iOS/Android 对齐"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </Field>
              )}

              {/* 版本备注（仅新版本模式） */}
              {isVersionMode && (
                <Field label="版本备注" hint="可选，用于区分不同修复轮次">
                  <input
                    type="text"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    placeholder="例如：研发首次修复后 / 二次回归"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </Field>
              )}

              {/* iOS / Android 截图 */}
              <Field label={isVersionMode ? '新版本截图' : '端上截图'} required hint="iOS 和 Android 至少上传一端（可后续补充另一端）">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DropZone
                    label="iOS 截图"
                    image={iosImage}
                    onImageLoad={setIosImage}
                    onImageRemove={() => setIosImage(null)}
                  />
                  <DropZone
                    label="Android 截图"
                    image={androidImage}
                    onImageLoad={setAndroidImage}
                    onImageRemove={() => setAndroidImage(null)}
                  />
                </div>
              </Field>

              {/* 设计稿（新会话必选，新版本可覆盖） */}
              <Field
                label="设计稿参考"
                hint={
                  isVersionMode
                    ? '可选：覆盖上一版的设计稿；不填则继承'
                    : '可选：作为设计端基线，参与三端一致性对比'
                }
              >
                <DropZone
                  label="设计稿截图"
                  image={designRefImage}
                  onImageLoad={setDesignRefImage}
                  onImageRemove={() => setDesignRefImage(null)}
                />
                {!designRefImage && (
                  <div className="mt-3">
                    <FigmaImport onImageLoad={setDesignRefImage} />
                  </div>
                )}
              </Field>

              {/* 设备型号（新会话可选；新版本继承只读显示） */}
              {!isVersionMode ? (
                <Field label="设备型号">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DeviceSelect
                      label="iOS 设备"
                      devices={IOS_DEVICES}
                      selected={iosDevice}
                      onChange={setIosDevice}
                      badge="bg-blue-500"
                    />
                    <DeviceSelect
                      label="Android 设备"
                      devices={ANDROID_DEVICES}
                      selected={androidDevice}
                      onChange={setAndroidDevice}
                      badge="bg-green-500"
                    />
                  </div>
                </Field>
              ) : (
                <Field label="设备与配置（继承自初始版本）">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-1.5">
                    <InheritRow icon="bg-blue-500" label="iOS 设备" value={`${iosDevice.name} · ${iosDevice.viewport.width}×${iosDevice.viewport.height}`} />
                    <InheritRow icon="bg-green-500" label="Android 设备" value={`${androidDevice.name} · ${androidDevice.viewport.width}×${androidDevice.viewport.height}`} />
                    <InheritRow icon="bg-slate-400" label="标注区域" value={`${(parentSession?.versions[parentSession.versions.length - 1].iosRegions?.length ?? 0) + (parentSession?.versions[parentSession.versions.length - 1].androidRegions?.length ?? 0)} 个（自动继承）`} />
                  </div>
                </Field>
              )}

              {/* 忽略选项（仅新会话） */}
              {!isVersionMode && (
                <Field label="忽略选项">
                  <div className="flex flex-col gap-2">
                    <OptionCheck
                      checked={options.ignoreStatusBar}
                      onChange={() => setOptions((p) => ({ ...p, ignoreStatusBar: !p.ignoreStatusBar }))}
                      label="忽略顶部状态栏 / 安全区"
                    />
                    <OptionCheck
                      checked={options.ignoreBottomSafeArea}
                      onChange={() => setOptions((p) => ({ ...p, ignoreBottomSafeArea: !p.ignoreBottomSafeArea }))}
                      label="忽略底部安全区 / 系统导航栏"
                    />
                    <OptionCheck
                      checked={options.useNormalizedCoordinates}
                      onChange={() => setOptions((p) => ({ ...p, useNormalizedCoordinates: !p.useNormalizedCoordinates }))}
                      label="使用归一化坐标（适配不同分辨率）"
                    />
                  </div>
                </Field>
              )}

              {/* 动态内容过滤（仅新会话；只对真实 AI 生效） */}
              {!isVersionMode && (
                <Field
                  label="忽略选项（动态内容）"
                  hint="仅真实 AI 走查生效；忽略运行时数据差异，只报设计层面偏差"
                >
                  <IgnoreRulesPanel
                    selected={options.ignoreRules ?? []}
                    onChange={(next) => setOptions((p) => ({ ...p, ignoreRules: next }))}
                  />
                </Field>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <p className="text-xs text-slate-400">
            {isVersionMode
              ? '上传新版本截图（至少一端）'
              : auditKind === 'batch'
                ? batchItems.length === 0
                  ? '请先上传批量截图'
                  : batchRecognizedCount === 0
                    ? '暂无可识别的画板，请给未识别项手动指定 iOS / Android'
                    : `将创建 ${batchRecognizedCount} 个画板${batchUnknownCount > 0 ? ` · ${batchUnknownCount} 张未识别将被忽略` : ''}`
                : '至少上传 iOS 或 Android 一端截图'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isVersionMode
                ? '创建新版本'
                : auditKind === 'batch'
                  ? '创建批量走查'
                  : '创建走查'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function KindTab({
  active,
  onClick,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 px-3.5 py-2 rounded-md transition-all ${
        active
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-600 hover:bg-white/60'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-semibold">{title}</span>
        {badge && (
          <span className="text-[9px] leading-none font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[11px] text-slate-400 whitespace-nowrap">{subtitle}</span>
    </button>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-slate-800">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function InheritRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${icon}`} />
      <span className="text-xs text-slate-500 flex-shrink-0">{label}：</span>
      <span className="text-xs text-slate-700 font-medium truncate">{value}</span>
    </div>
  );
}

function DeviceSelect({
  label,
  devices,
  selected,
  onChange,
  badge,
}: {
  label: string;
  devices: DeviceProfile[];
  selected: DeviceProfile;
  onChange: (d: DeviceProfile) => void;
  badge: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${badge}`} />
        <label className="text-sm font-medium text-slate-700">{label}</label>
      </div>
      <select
        value={selected.id}
        onChange={(e) => {
          const d = devices.find((x) => x.id === e.target.value);
          if (d) onChange(d);
        }}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} · {d.viewport.width}×{d.viewport.height}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400 pl-1">
        安全区 top {selected.safeArea.top}px / bottom {selected.safeArea.bottom}px
      </p>
    </div>
  );
}

function OptionCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <div className="relative flex-shrink-0">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
        <div
          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
          }`}
        >
          {checked && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

/* ───────────────────────────── AI 配置折叠区 ───────────────────────────── */

function AIConfigPanel() {
  // 初始化时立即从 localStorage 读；SSR 期间 window 未定义会返回默认值
  const [cfg, setCfg] = useState<AIConfig>(() => loadAIConfig());
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [savedTip, setSavedTip] = useState(false);

  const isConfigured = cfg.provider !== 'mock' && !!cfg.apiKey;

  const handleSave = () => {
    saveAIConfig(cfg);
    setSavedTip(true);
    setTimeout(() => setSavedTip(false), 1500);
  };

  const handleClear = () => {
    const empty: AIConfig = { provider: 'mock', apiKey: '' };
    setCfg(empty);
    saveAIConfig(empty);
  };

  /** 切换 provider 时，若切到 maas-direct 且没有 model，则填默认 */
  const handleProviderChange = (p: AIProviderKind) => {
    setCfg((c) => {
      if (p === 'maas-direct') {
        return { ...c, provider: p, model: c.model || DEFAULT_MAAS_DIRECT_MODEL };
      }
      return { ...c, provider: p };
    });
  };

  const providerLabel: Record<AIProviderKind, string> = {
    mock: 'Mock（示例数据）',
    claude: 'Claude (Anthropic)',
    openai: 'OpenAI (GPT-4o)',
    maas: 'MaaS Claude (Bedrock)',
    'maas-direct': 'MaaS DirectLLM (Qwen 等)',
  };

  /** provider 是否需要 token 而不是 API key */
  const isTokenProvider = cfg.provider === 'maas' || cfg.provider === 'maas-direct';

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex-shrink-0 w-full">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isConfigured ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          />
          <span className="text-sm font-semibold text-slate-800">AI 配置</span>
          <span className="text-xs text-slate-500 truncate">
            {isConfigured
              ? `${providerLabel[cfg.provider]} · ${maskApiKey(cfg.apiKey)}`
              : '未配置（当前使用示例数据）'}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 flex flex-col gap-3 bg-slate-50/50">
          {/* Provider 选择 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Provider</label>
            <div className="flex items-center gap-2 flex-wrap">
              {(['mock', 'claude', 'openai', 'maas', 'maas-direct'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    cfg.provider === p
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {providerLabel[p]}
                </button>
              ))}
            </div>
          </div>

          {/* 模型选择（仅 maas-direct） */}
          {cfg.provider === 'maas-direct' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">模型</label>
              <select
                value={cfg.model || DEFAULT_MAAS_DIRECT_MODEL}
                onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                {MAAS_DIRECT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.hint ? ` — ${m.hint}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                走 <code className="font-mono">maas.devops.xiaohongshu.com/v1</code>（OpenAI 兼容）；同一 QST token 支持多模型。
              </p>
            </div>
          )}

          {/* API Key / Token 输入 —— mock 时隐藏 */}
          {cfg.provider !== 'mock' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                {isTokenProvider ? 'Token' : 'API Key'}
                <span className="text-slate-400 font-normal ml-1">
                  {cfg.provider === 'claude'
                    ? '（sk-ant-...）'
                    : cfg.provider === 'openai'
                      ? '（sk-...）'
                      : '（QST...）'}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={cfg.apiKey}
                    onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value.trim() }))}
                    placeholder={
                      cfg.provider === 'claude'
                        ? 'sk-ant-api03-...'
                        : cfg.provider === 'openai'
                          ? 'sk-...'
                          : 'QST...'
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm font-mono text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    aria-label={showKey ? '隐藏' : '显示'}
                  >
                    {showKey ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Key 仅保存在你本机浏览器（localStorage），走查时通过 HTTPS 请求头发给本项目后端，不会写入历史记录。
              </p>
            </div>
          )}

          {/* 多模型交叉验证（provider 非 mock 时才允许开启） */}
          {cfg.provider !== 'mock' && (
            <SecondaryModelConfig cfg={cfg} setCfg={setCfg} />
          )}

          {/* 按钮组 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={cfg.provider !== 'mock' && !cfg.apiKey}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              保存
            </button>
            {isConfigured && (
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-white transition-colors"
              >
                清除
              </button>
            )}
            {savedTip && (
              <span className="text-xs text-emerald-600 font-medium">已保存</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── 多模型交叉验证子面板 ───────────────────────────── */

interface SecondaryModelConfigProps {
  cfg: AIConfig;
  setCfg: React.Dispatch<React.SetStateAction<AIConfig>>;
}

function SecondaryModelConfig({ cfg, setCfg }: SecondaryModelConfigProps) {
  const [showSecKey, setShowSecKey] = useState(false);
  const enabled = !!cfg.enableMultiModel;

  const secondaryProviderLabel: Record<RealAIProviderKind, string> = {
    claude: 'Claude',
    openai: 'OpenAI',
    maas: 'MaaS Claude',
    'maas-direct': 'MaaS DirectLLM',
  };

  const handleToggle = () => {
    setCfg((c) => {
      // 开启时若还没设过副 provider，默认给个跟主不同家的建议
      if (!c.enableMultiModel) {
        const suggested: RealAIProviderKind =
          c.provider === 'maas' ? 'maas-direct' : c.provider === 'maas-direct' ? 'maas' : 'maas-direct';
        return {
          ...c,
          enableMultiModel: true,
          secondaryProvider: c.secondaryProvider || suggested,
          secondaryModel:
            c.secondaryModel ||
            ((c.secondaryProvider || suggested) === 'maas-direct'
              ? DEFAULT_MAAS_DIRECT_MODEL
              : undefined),
        };
      }
      return { ...c, enableMultiModel: false };
    });
  };

  const handleSecondaryProviderChange = (p: RealAIProviderKind) => {
    setCfg((c) => ({
      ...c,
      secondaryProvider: p,
      secondaryModel: p === 'maas-direct' ? c.secondaryModel || DEFAULT_MAAS_DIRECT_MODEL : undefined,
    }));
  };

  const canReuseMain =
    cfg.secondaryProvider && canReuseKeyBetween(cfg.provider, cfg.secondaryProvider);
  const secKeyPlaceholder = canReuseMain
    ? `留空则复用主 Key（${maskApiKey(cfg.apiKey)}）`
    : cfg.secondaryProvider === 'claude'
      ? 'sk-ant-api03-...'
      : cfg.secondaryProvider === 'openai'
        ? 'sk-...'
        : 'QST...';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="w-4 h-4 rounded border-slate-300"
        />
        <span className="text-xs font-medium text-slate-700">启用多模型交叉验证</span>
        <span className="text-[11px] text-slate-400">
          （同时调主/副两个模型，合并去重，覆盖率更高）
        </span>
      </label>

      {enabled && (
        <div className="flex flex-col gap-2 pl-6 border-l-2 border-slate-100 ml-1.5">
          {/* 副 provider 选 */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500">副 Provider</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['claude', 'openai', 'maas', 'maas-direct'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSecondaryProviderChange(p)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    cfg.secondaryProvider === p
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {secondaryProviderLabel[p]}
                </button>
              ))}
            </div>
          </div>

          {/* 副模型（仅 maas-direct） */}
          {cfg.secondaryProvider === 'maas-direct' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500">副模型</label>
              <select
                value={cfg.secondaryModel || DEFAULT_MAAS_DIRECT_MODEL}
                onChange={(e) => setCfg((c) => ({ ...c, secondaryModel: e.target.value }))}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
              >
                {MAAS_DIRECT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.hint ? ` — ${m.hint}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 副 Key */}
          {cfg.secondaryProvider && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500">
                副 {cfg.secondaryProvider === 'maas' || cfg.secondaryProvider === 'maas-direct' ? 'Token' : 'API Key'}
                {canReuseMain && (
                  <span className="text-slate-400 font-normal ml-1">（同家 provider 可留空复用主 key）</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showSecKey ? 'text' : 'password'}
                  value={cfg.secondaryApiKey || ''}
                  onChange={(e) => setCfg((c) => ({ ...c, secondaryApiKey: e.target.value.trim() }))}
                  placeholder={secKeyPlaceholder}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 pr-8 text-xs font-mono text-slate-800 placeholder:text-slate-300 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowSecKey((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showSecKey ? '隐藏' : '显示'}
                >
                  {showSecKey ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            成本翻倍但覆盖率更高。合并规则：位置 IoU ≥ 0.3 或标题相似度 ≥ 0.55 视为同一问题；两模型都发现的 issue 会标注「两模型确认」。
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 场景化忽略规则面板（方案 3）
 * - 7 个分组折叠面板：通用（默认展开）+ 6 个业务场景
 * - 每组显示 n/m 已勾选计数
 * - 顶部一排「快捷预设」按钮：一键勾选场景组
 */
function IgnoreRulesPanel({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  // 只有通用组默认展开
  const [expanded, setExpanded] = useState<Record<IgnoreRuleGroupId, boolean>>(() => ({
    generic: true,
    live: false,
    ecommerce: false,
    publish: false,
    community: false,
    video: false,
    im: false,
  }));

  const toggleRule = (id: IgnoreRuleId) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const toggleGroupAll = (groupId: IgnoreRuleGroupId, allOn: boolean) => {
    const groupRuleIds = IGNORE_RULES.filter((r) => r.group === groupId).map((r) => r.id);
    const next = new Set(selectedSet);
    if (allOn) {
      // 全选 → 取消整组
      groupRuleIds.forEach((id) => next.delete(id));
    } else {
      // 未全选 → 补齐整组
      groupRuleIds.forEach((id) => next.add(id));
    }
    onChange(Array.from(next));
  };

  const applyPreset = (presetId: string) => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange([...preset.rules]);
    // 展开被预设覆盖的分组，方便用户看到勾了啥
    const groupsInPreset = new Set(
      preset.rules
        .map((id) => IGNORE_RULES.find((r) => r.id === id)?.group)
        .filter(Boolean) as IgnoreRuleGroupId[],
    );
    setExpanded((prev) => {
      const next = { ...prev };
      groupsInPreset.forEach((g) => (next[g] = true));
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 顶部快捷预设 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400 mr-1">快捷预设：</span>
        {SCENARIO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition"
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition"
          title="清空所有已勾选规则"
        >
          清空
        </button>
      </div>

      {/* 分组折叠面板 */}
      <div className="flex flex-col gap-1.5">
        {IGNORE_GROUPS.map((group) => {
          const groupRules = IGNORE_RULES.filter((r) => r.group === group.id);
          const checkedInGroup = groupRules.filter((r) => selectedSet.has(r.id)).length;
          const total = groupRules.length;
          const allOn = checkedInGroup === total && total > 0;
          const someOn = checkedInGroup > 0 && checkedInGroup < total;
          const isExpanded = expanded[group.id];

          return (
            <div key={group.id} className="rounded-md border border-slate-200 bg-white overflow-hidden">
              {/* 组标题行 */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn;
                  }}
                  onChange={() => toggleGroupAll(group.id, allOn)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [group.id]: !p[group.id] }))}
                  className="flex-1 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">{group.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        checkedInGroup === 0
                          ? 'bg-slate-100 text-slate-400'
                          : checkedInGroup === total
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {checkedInGroup}/{total}
                    </span>
                    {group.hint && (
                      <span className="text-[10px] text-slate-400">{group.hint}</span>
                    )}
                  </div>
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* 展开区：规则列表 */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-2.5 py-2 flex flex-col gap-1.5">
                  {groupRules.map((rule) => (
                    <label
                      key={rule.id}
                      className="flex items-start gap-2 cursor-pointer hover:bg-white rounded px-1.5 py-1 -mx-1.5"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(rule.id)}
                        onChange={() => toggleRule(rule.id)}
                        className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11.5px] text-slate-700 leading-snug">{rule.label}</div>
                        {rule.hint && (
                          <div className="text-[10.5px] text-slate-400 leading-snug mt-0.5">
                            {rule.hint}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部计数 */}
      <div className="text-[10.5px] text-slate-400">
        已勾选 <span className="text-slate-600 font-medium">{selectedSet.size}</span> 条规则；未勾选的差异 AI 会照常报告
      </div>
    </div>
  );
}
