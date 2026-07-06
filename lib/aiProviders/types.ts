import type { AnalysisResult } from '@/types';

export interface AnalyzeRequest {
  spec: string;
  diffBase64: string | null;
}

export interface AIProvider {
  readonly name: string;
  analyze(req: AnalyzeRequest): Promise<AnalysisResult>;
}
