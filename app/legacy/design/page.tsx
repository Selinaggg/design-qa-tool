'use client';

import { useState, useEffect } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import UploadPanel from '@/components/upload/UploadPanel';
import SpecInput from '@/components/analysis/SpecInput';
import ComparisonViewer from '@/components/comparison/ComparisonViewer';
import AnalysisPanel from '@/components/analysis/AnalysisPanel';
import { checkDimensionsMatch } from '@/lib/imageUtils';
import { useImageDiff } from '@/hooks/useImageDiff';
import { useAnalysis } from '@/hooks/useAnalysis';
import type { ImageFile } from '@/types';

export default function Home() {
  const [designImage, setDesignImage] = useState<ImageFile | null>(null);
  const [liveImage, setLiveImage] = useState<ImageFile | null>(null);
  const [spec, setSpec] = useState('');
  const [sizeError, setSizeError] = useState<string | null>(null);

  const bothUploaded = designImage !== null && liveImage !== null;
  const sizeMatch = bothUploaded && sizeError === null;

  // Diff computation — lifted here so AI panel can consume diffResult too
  const { diffResult, isProcessing: isDiffProcessing, error: diffError } =
    useImageDiff(designImage, liveImage, sizeMatch);

  // AI analysis
  const { result: analysisResult, isAnalyzing, error: analysisError, analyze } =
    useAnalysis();

  useEffect(() => {
    if (!bothUploaded) { setSizeError(null); return; }
    const match = checkDimensionsMatch(designImage!, liveImage!);
    if (!match) {
      setSizeError(
        `两张图片尺寸不一致（设计稿 ${designImage!.width}×${designImage!.height}，` +
        `线上页面 ${liveImage!.width}×${liveImage!.height}）。` +
        `当前版本需要上传相同尺寸的图片，滑动对比和差异高亮功能已禁用。`,
      );
    } else {
      setSizeError(null);
    }
  }, [designImage, liveImage, bothUploaded]);

  const handleDesignRemove = () => {
    if (designImage) URL.revokeObjectURL(designImage.url);
    setDesignImage(null);
  };
  const handleLiveRemove = () => {
    if (liveImage) URL.revokeObjectURL(liveImage.url);
    setLiveImage(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Step 1: Upload */}
        <Section step={1} title="上传图片" subtitle="分别上传设计稿截图和线上页面截图">
          <UploadPanel
            designImage={designImage}
            liveImage={liveImage}
            sizeError={sizeError}
            onDesignLoad={setDesignImage}
            onDesignRemove={handleDesignRemove}
            onLiveLoad={setLiveImage}
            onLiveRemove={handleLiveRemove}
          />
        </Section>

        {bothUploaded && (
          <>
            {/* Step 2: Design spec */}
            <Section step={2} title="输入设计规范" subtitle="用于 AI 走查分析，可留空跳过">
              <SpecInput value={spec} onChange={setSpec} />
            </Section>

            {/* Step 3: Comparison */}
            <Section step={3} title="对比视图" subtitle="查看设计稿与线上页面的差异">
              <ComparisonViewer
                designImage={designImage}
                liveImage={liveImage}
                sizeMatch={sizeMatch}
                diffResult={diffResult}
                isDiffProcessing={isDiffProcessing}
                diffError={diffError}
              />
            </Section>

            {/* Step 4: AI analysis */}
            <Section step={4} title="AI 走查分析" subtitle="识别差异问题，生成修复建议">
              <AnalysisPanel
                result={analysisResult}
                isAnalyzing={isAnalyzing}
                error={analysisError}
                onAnalyze={() => analyze(spec, diffResult)}
                canAnalyze={bothUploaded}
              />
            </Section>
          </>
        )}

        {/* Empty state */}
        {!bothUploaded && (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium">上传两张图片后，走查流程将自动展开</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface SectionProps {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function Section({ step, title, subtitle, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
          {step}
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
