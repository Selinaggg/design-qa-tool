'use client';

import { useState, useEffect, useRef } from 'react';
import { computeDiff, type DiffResult } from '@/lib/diffEngine';
import type { ImageFile } from '@/types';

interface UseImageDiffReturn {
  diffResult: DiffResult | null;
  isProcessing: boolean;
  error: string | null;
}

export function useImageDiff(
  designImage: ImageFile | null,
  liveImage: ImageFile | null,
  sizeMatch: boolean,
): UseImageDiffReturn {
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!designImage || !liveImage || !sizeMatch) {
      setDiffResult(null);
      setError(null);
      setIsProcessing(false);
      return;
    }

    cancelledRef.current = false;
    setIsProcessing(true);
    setError(null);
    setDiffResult(null);

    computeDiff(designImage, liveImage)
      .then((result) => {
        if (!cancelledRef.current) {
          setDiffResult(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : '差异计算失败');
        }
      })
      .finally(() => {
        if (!cancelledRef.current) {
          setIsProcessing(false);
        }
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [designImage, liveImage, sizeMatch]);

  return { diffResult, isProcessing, error };
}
