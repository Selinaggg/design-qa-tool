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
import type { ImageFile } from '@/types';
import type { AuditSession, BatchScreenshotItem } from './types';

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
  const [options, setOptions] = useState<AuditOptions>(
    () => parentSession?.options ?? DEFAULT_OPTIONS,
  );

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
