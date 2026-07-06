import type { AIProvider, AnalyzeRequest } from './types';
import type { AnalysisResult } from '@/types';
import { MOCK_ANALYSIS_RESULT } from '@/lib/mockData';

export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async analyze(_req: AnalyzeRequest): Promise<AnalysisResult> {
    // Simulate realistic API latency so the loading state is visible
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return MOCK_ANALYSIS_RESULT;
  }
}
