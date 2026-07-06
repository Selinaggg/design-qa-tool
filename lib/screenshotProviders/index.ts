import type { ScreenshotProvider } from './types';
import { MockScreenshotProvider } from './mockProvider';
import { PlaywrightProvider } from './playwrightProvider';

/**
 * Resolution order (server-side env vars):
 *   USE_MOCKS=true               → MockScreenshotProvider
 *   SCREENSHOT_PROVIDER=playwright→ PlaywrightProvider (requires playwright installed)
 *   (anything else / unset)      → MockScreenshotProvider
 */
export function getScreenshotProvider(): ScreenshotProvider {
  if (process.env.USE_MOCKS === 'true') return new MockScreenshotProvider();

  const provider = process.env.SCREENSHOT_PROVIDER ?? 'mock';

  if (provider === 'playwright') {
    return new PlaywrightProvider();
  }

  return new MockScreenshotProvider();
}

export type { ScreenshotProvider, ScreenshotRequest, ScreenshotResult } from './types';
