import type { ScreenshotProvider, ScreenshotRequest, ScreenshotResult } from './types';

export class MockScreenshotProvider implements ScreenshotProvider {
  readonly name = 'mock';

  async capture(_req: ScreenshotRequest): Promise<ScreenshotResult> {
    await new Promise((r) => setTimeout(r, 1000)); // simulate capture latency
    return {
      imageUrl: '/fixtures/mock-screenshot.svg',
      width: 1440,
      height: 900,
      capturedAt: new Date().toISOString(),
      isMock: true,
    };
  }
}
