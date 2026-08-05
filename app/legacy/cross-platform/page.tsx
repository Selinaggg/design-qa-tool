'use client';

import { useState, useEffect, useRef } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import DropZone from '@/components/upload/DropZone';
import AnnotationStep from '@/components/cross-platform/LegacyAnnotationStep';
import ScoreGrid from '@/components/cross-platform/ScoreGrid';
import PlatformComparison from '@/components/cross-platform/PlatformComparison';
import ConsistencyIssueCard from '@/components/cross-platform/ConsistencyIssueCard';
import {
  IOS_DEVICES,
  ANDROID_DEVICES,
  DEFAULT_IOS_DEVICE,
  DEFAULT_ANDROID_DEVICE,
} from '@/lib/crossPlatform/deviceProfiles';
import type {
  DeviceProfile,
  CrossPlatformAuditResult,
  IssueSeverityCP,
  AuditOptions,
  DrawingRegion,
  TargetRegion,
} from '@/lib/crossPlatform';
import type { ImageFile } from '@/types';

const SEVERITY_ORDER: IssueSeverityCP[] = ['critical', 'high', 'medium', 'low'];
const SCENARIO_PRESETS = ['登录页', '首页', '商品详情页', '购物车', '个人中心'];

/** Merge per-platform DrawingRegions into TargetRegions by matching name */
function mergeRegions(
  iosRegions: DrawingRegion[],
  androidRegions: DrawingRegion[],
): TargetRegion[] {
  const names = new Set([
    ...iosRegions.map((r) => r.name),
    ...androidRegions.map((r) => r.name),
  ]);
  return Array.from(names).map((name) => {
    const ios = iosRegions.find((r) => r.name === name);
    const android = androidRegions.find((r) => r.name === name);
    return {
      id: `target-${name}`,
      name,
      type: ios?.type ?? android?.type ?? 'layout',
      iosRect: ios?.rect,
      androidRect: android?.rect,
    };
  });
}

export default function CrossPlatformPage() {
  // ── Images ──────────────────────────────────────────────────────────────
  const [iosImage, setIosImage] = useState<ImageFile | null>(null);
  const [androidImage, setAndroidImage] = useState<ImageFile | null>(null);
  const [designImage, setDesignImage] = useState<ImageFile | null>(null);

  // ── Region annotations ──────────────────────────────────────────────────
  const [iosRegions, setIosRegions] = useState<DrawingRegion[]>([]);
  const [androidRegions, setAndroidRegions] = useState<DrawingRegion[]>([]);

  // ── Device profiles ──────────────────────────────────────────────────────
  const [iosDevice, setIosDevice] = useState<DeviceProfile>(DEFAULT_IOS_DEVICE);
  const [androidDevice, setAndroidDevice] = useState<DeviceProfile>(DEFAULT_ANDROID_DEVICE);

  // ── Options ──────────────────────────────────────────────────────────────
  const [options, setOptions] = useState<AuditOptions>({
    ignoreStatusBar: true,
    ignoreBottomSafeArea: true,
    useNormalizedCoordinates: true,
  });

  // ── Scenario ─────────────────────────────────────────────────────────────
  const [scenarioName, setScenarioName] = useState('登录页');

  // ── Audit & highlight state ───────────────────────────────────────────────
  const [result, setResult] = useState<CrossPlatformAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [highlightedRegionName, setHighlightedRegionName] = useState<string | null>(null);

  const bothUploaded = iosImage !== null && androidImage !== null;
  const canAudit = bothUploaded && !isAuditing;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const resultRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to results when audit completes (only when result transitions to non-null)
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const removeImage = (setter: (v: null) => void, img: ImageFile | null) => {
    if (img?.url?.startsWith('blob:')) URL.revokeObjectURL(img.url);
    setter(null);
  };

  const toggleOption = (key: keyof AuditOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleAudit = async () => {
    if (!iosImage || !androidImage) return;
    setIsAuditing(true);
    setAuditError(null);
    setResult(null);
    setHighlightedRegionName(null);

    const targetRegions = mergeRegions(iosRegions, androidRegions);

    try {
      const res = await fetch('/api/cross-platform-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            id: `scenario-${Date.now()}`,
            name: scenarioName || '未命名场景',
            targetRegions: targetRegions.length > 0 ? targetRegions : undefined,
          },
          iosImageUrl: iosImage.url,
          androidImageUrl: androidImage.url,
          designImageUrl: designImage?.url ?? undefined,
          iosDevice,
          androidDevice,
          options,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as CrossPlatformAuditResult);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : '走查失败，请重试');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleReset = () => {
    removeImage(setIosImage, iosImage);
    removeImage(setAndroidImage, androidImage);
    removeImage(setDesignImage, designImage);
    setIosRegions([]);
    setAndroidRegions([]);
    setResult(null);
    setIsAuditing(false);
    setAuditError(null);
    setHighlightedRegionName(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-8">

        {/* Intro / Hero */}
        <div className="flex flex-col gap-3 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">跨端一致性走查</h1>
            <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
              上传设计稿、iOS 截图和 Android 截图，快速发现跨端布局、视觉和内容不一致问题。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['设计验收', 'QA 走查', '多端适配', '交付检查'].map((tag) => (
              <span
                key={tag}
                className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Step 1: Upload */}
        <Section step={1} title="上传截图" subtitle="iOS 和 Android 截图必填，设计稿可选（用于计算还原度）">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <DropZone label="iOS 截图" image={iosImage} onImageLoad={setIosImage}
              onImageRemove={() => removeImage(setIosImage, iosImage)} />
            <DropZone label="Android 截图" image={androidImage} onImageLoad={setAndroidImage}
              onImageRemove={() => removeImage(setAndroidImage, androidImage)} />
            <div className="flex flex-col gap-2">
              <DropZone label="设计稿截图（可选）" image={designImage} onImageLoad={setDesignImage}
                onImageRemove={() => removeImage(setDesignImage, designImage)} />
              {!designImage && (
                <p className="text-xs text-slate-400 text-center">上传设计稿后可计算各端还原度</p>
              )}
            </div>
          </div>
        </Section>

        {/* Step 2: Region annotation (only after both images are uploaded) */}
        {bothUploaded && (
          <Section
            step={2}
            title="标注关注区域"
            subtitle="可选：粗略框选你想重点检查的模块，例如导航栏、按钮、商品卡片。标注用于让报告更聚焦，不要求像素级精准。跳过后系统会进行默认走查。"
            optional
          >
            <AnnotationStep
              iosImage={iosImage}
              androidImage={androidImage}
              iosRegions={iosRegions}
              androidRegions={androidRegions}
              onIosRegionsChange={setIosRegions}
              onAndroidRegionsChange={setAndroidRegions}
              highlightedRegionName={highlightedRegionName}
            />
          </Section>
        )}

        {/* Step 3: Device & Options */}
        <Section step={bothUploaded ? 3 : 2} title="设备与选项" subtitle="选择测试设备，配置需要忽略的系统区域">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <DeviceSelect label="iOS 设备" devices={IOS_DEVICES} selected={iosDevice}
                onChange={setIosDevice} badge="bg-blue-500" />
              <DeviceSelect label="Android 设备" devices={ANDROID_DEVICES} selected={androidDevice}
                onChange={setAndroidDevice} badge="bg-green-500" />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-slate-700">忽略选项</p>
              <OptionCheck checked={options.ignoreStatusBar} onChange={() => toggleOption('ignoreStatusBar')}
                label="忽略顶部状态栏 / 安全区"
                desc="屏蔽系统状态栏高度差异（iOS Dynamic Island vs Android 状态栏）" />
              <OptionCheck checked={options.ignoreBottomSafeArea} onChange={() => toggleOption('ignoreBottomSafeArea')}
                label="忽略底部安全区 / 系统导航栏"
                desc="屏蔽 iOS Home Indicator 和 Android 底部导航栏差异" />
              <OptionCheck checked={options.useNormalizedCoordinates} onChange={() => toggleOption('useNormalizedCoordinates')}
                label="使用归一化坐标"
                desc="以 0–1 比例坐标标注区域，适配不同屏幕分辨率" />
            </div>
          </div>
        </Section>

        {/* Step 4: Scenario */}
        <Section step={bothUploaded ? 4 : 3} title="场景名称" subtitle="描述当前走查的页面或功能场景">
          <div className="flex flex-col gap-3">
            <input type="text" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)}
              placeholder="例如：商品详情页"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all" />
            <div className="flex flex-wrap gap-2">
              {SCENARIO_PRESETS.map((name) => (
                <button key={name} onClick={() => setScenarioName(name)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    scenarioName === name
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Run button */}
        <div className="flex items-center gap-4">
          <button onClick={handleAudit} disabled={!canAudit}
            className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors shadow-sm">
            {isAuditing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>走查中…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>开始跨端走查
              </>
            )}
          </button>
          {!bothUploaded && <p className="text-sm text-slate-400">请先上传 iOS 和 Android 截图</p>}
          {bothUploaded && (iosRegions.length + androidRegions.length) > 0 && (
            <p className="text-xs text-slate-500">
              已标注 {mergeRegions(iosRegions, androidRegions).length} 个关注区域，报告将基于这些区域生成问题
            </p>
          )}
        </div>

        {auditError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {auditError}
          </div>
        )}

        {/* Results */}
        {result && iosImage && androidImage && (
          <div ref={resultRef} className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">走查完成</span>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                清空重来
              </button>
            </div>

            {result.isMock && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-700">
                  当前为 <strong>Mock 数据</strong>。设置{' '}
                  <code className="font-mono bg-amber-100 px-1 rounded">CROSS_PLATFORM_ANALYZER=real</code>{' '}
                  可接入真实 AI 分析器。
                </p>
              </div>
            )}

            <Section
              step={bothUploaded ? 5 : 4}
              title="走查结果"
              subtitle={`${result.scenarioName} · ${result.iosDeviceName} vs ${result.androidDeviceName}`}
            >
              <div className="flex flex-col gap-6">
                <ScoreGrid result={result} />

                <div className="flex flex-wrap gap-2">
                  {SEVERITY_ORDER.map((sev) => {
                    const count = result.summary[sev];
                    if (count === 0) return null;
                    return (
                      <span key={sev} className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        sev === 'critical' ? 'bg-red-100 text-red-700' :
                        sev === 'high'     ? 'bg-orange-100 text-orange-700' :
                        sev === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                                             'bg-slate-100 text-slate-600'
                      }`}>
                        {sev} × {count}
                      </span>
                    );
                  })}
                  {result.ignoredRegions.length > 0 && (
                    <span className="text-xs text-slate-400 px-3 py-1 rounded-full bg-slate-100">
                      已忽略 {result.ignoredRegions.length} 个系统区域
                    </span>
                  )}
                  {highlightedRegionName && (
                    <button
                      onClick={() => setHighlightedRegionName(null)}
                      className="text-xs text-blue-600 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
                    >
                      高亮：{highlightedRegionName} ×
                    </button>
                  )}
                </div>

                {/* Comparison (shows region overlays + highlight) */}
                <PlatformComparison
                  iosImage={iosImage}
                  androidImage={androidImage}
                  designImage={designImage}
                  iosDeviceName={result.iosDeviceName}
                  androidDeviceName={result.androidDeviceName}
                  iosRegions={iosRegions}
                  androidRegions={androidRegions}
                  highlightedRegionName={highlightedRegionName}
                />

                {/* Issues */}
                <div className="flex flex-col gap-5">
                  {SEVERITY_ORDER.map((sev) => {
                    const issues = result.issues.filter((i) => i.severity === sev);
                    if (issues.length === 0) return null;
                    return (
                      <div key={sev} className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
                          {sev} · {issues.length} 个问题
                        </h3>
                        {issues.map((issue, i) => (
                          <ConsistencyIssueCard
                            key={issue.id}
                            issue={issue}
                            index={i + 1}
                            onExpand={setHighlightedRegionName}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Local sub-components ─────────────────────────────────────────────────────

function Section({
  step, title, subtitle, optional, children,
}: {
  step: number; title: string; subtitle?: string; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
          {step}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800">{title}</h2>
            {optional && (
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">可选</span>
            )}
          </div>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">{children}</div>
    </div>
  );
}

function DeviceSelect({ label, devices, selected, onChange, badge }: {
  label: string; devices: DeviceProfile[]; selected: DeviceProfile;
  onChange: (d: DeviceProfile) => void; badge: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${badge}`} />
        <label className="text-sm font-medium text-slate-700">{label}</label>
      </div>
      <select value={selected.id}
        onChange={(e) => { const d = devices.find((x) => x.id === e.target.value); if (d) onChange(d); }}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all">
        {devices.map((d) => (
          <option key={d.id} value={d.id}>{d.name} · {d.viewport.width}×{d.viewport.height}</option>
        ))}
      </select>
      <p className="text-xs text-slate-400 pl-1">
        安全区 top {selected.safeArea.top}px / bottom {selected.safeArea.bottom}px
      </p>
    </div>
  );
}

function OptionCheck({ checked, onChange, label, desc }: {
  checked: boolean; onChange: () => void; label: string; desc: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative flex-shrink-0 mt-0.5">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white group-hover:border-slate-400'
        }`}>
          {checked && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </label>
  );
}
