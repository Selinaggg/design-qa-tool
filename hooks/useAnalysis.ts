'use client';

import { useState, useCallback } from 'react';
import type { AnalysisResult } from '@/types';
import type { DiffResult } from '@/lib/diffEngine';

export type AnalysisResponse = AnalysisResult & { _provider: string };

interface UseAnalysisReturn {
  result: AnalysisResponse | null;
  isAnalyzing: boolean;
  error: string | null;
  analyze: (spec: string, diffResult: DiffResult | null) => Promise<void>;
  reset: () => void;
}

export function useAnalysis(): UseAnalysisReturn {
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (spec: string, diffResult: DiffResult | null) => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec,
          diffBase64: diffResult?.diffUrl ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setResult(data as AnalysisResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isAnalyzing, error, analyze, reset };
}
