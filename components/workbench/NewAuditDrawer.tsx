'use client';

import { useEffect, useState } from 'react';
import DropZone from '@/components/upload/DropZone';
import FigmaImport from '@/components/upload/FigmaImport';
import {
  IOS_DEVICES,
  ANDROID_DEVICES,
  DEFAULT_IOS_DEVICE,
  DEFAULT_ANDROID_DEVICE,
} from '@/lib/crossPlatform/deviceProfiles';
import type { DeviceProfile, AuditOptions } from '@/lib/crossPlatform';
import type { ImageFile } from '@/types';
import type { AuditSession } from './types';

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

  // 至少上传一端；哪端都可以（可后续补充另一端）
  const canSubmit = iosImage !== null || androidImage !== null;

  const resetAll = () => {
    setName('');
    setVersionLabel('');
    setIosImage(null);
    setAndroidImage(null);
    setDesignRefImage(null);
    setIosDevice(DEFAULT_IOS_DEVICE);
    setAndroidDevice(DEFAULT_ANDROID_DEVICE);
    setOptions(DEFAULT_OPTIONS);
  };

  const handleSubmit = () => {
    if (!iosImage && !androidImage) return;

    if (isVersionMode && parentSession) {
      // 新版本模式：追加到父会话
      onAddVersion(parentSession.id, {
        iosImage,
        androidImage,
        designRefImage,
        label: versionLabel.trim() || undefined,
      });
    } else {
      // 新会话模式：创建独立会话（v1）
      const sessionName =
        name.trim() || '跨端走查 ' + new Date().toLocaleTimeString();
      const now = Date.now();
      const session: AuditSession = {
        id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now,
        mode: 'cross-platform',
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
    resetAll();
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <p className="text-xs text-slate-400">
            {isVersionMode ? '上传新版本截图（至少一端）' : '至少上传 iOS 或 Android 一端截图'}
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
              {isVersionMode ? '创建新版本' : '创建走查'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

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
