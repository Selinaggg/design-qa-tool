import type { ScreenshotProvider, ScreenshotRequest, ScreenshotResult } from './types';

/**
 * Playwright-based screenshot provider.
 *
 * TODO: implement when `playwright` is installed and browser binaries are available.
 *
 * Setup:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Suggested implementation:
 *   import { chromium } from 'playwright';
 *
 *   const browser = await chromium.launch();
 *   const page = await browser.newPage();
 *   await page.setViewportSize({ width: 1440, height: 900 });
 *   await page.goto(req.pageUrl, { waitUntil: 'networkidle' });
 *   const buffer = await page.screenshot({ type: 'png', fullPage: false });
 *   await browser.close();
 *   const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
 *   return { imageUrl: dataUrl, width: 1440, height: 900, capturedAt: new Date().toISOString(), isMock: false };
 */
export class PlaywrightProvider implements ScreenshotProvider {
  readonly name = 'playwright';

  async capture(req: ScreenshotRequest): Promise<ScreenshotResult> {
    void req;
    throw new Error(
      'Playwright provider is not yet implemented. Install playwright and uncomment the implementation above.',
    );
  }
}
