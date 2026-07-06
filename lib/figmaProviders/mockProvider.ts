import type { FigmaProvider, FigmaExportRequest, FigmaExportResult } from './types';

export class MockFigmaProvider implements FigmaProvider {
  readonly name = 'mock';

  async export(_req: FigmaExportRequest): Promise<FigmaExportResult> {
    await new Promise((r) => setTimeout(r, 800)); // simulate latency
    return {
      imageUrl: '/fixtures/mock-design.svg',
      width: 1440,
      height: 900,
      fileName: 'mock-design.svg',
      isMock: true,
    };
  }
}
