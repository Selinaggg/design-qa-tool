import type {
  CrossPlatformAnalyzer,
  CrossPlatformAuditRequest,
  CrossPlatformAuditResult,
} from './types';

/**
 * Real cross-platform analyzer stub.
 *
 * TODO: implement when a real AI vision provider is available.
 *
 * Suggested implementation flow:
 *   1. Convert iosImageUrl / androidImageUrl to base64 for multimodal input
 *   2. Build a structured prompt describing the audit scenario,
 *      device profiles, safe areas, and ignored regions
 *   3. Call an AI Vision API (Claude / GPT-4o / custom OCR pipeline)
 *      with both screenshots and the structured prompt
 *   4. Parse the response into CrossPlatformAuditResult
 *   5. Optionally run a lightweight region-level pixelmatch
 *      after normalizing both images to a common resolution
 *
 * Environment variables needed (add to .env.local):
 *   CROSS_PLATFORM_ANALYZER=real
 *   ANTHROPIC_API_KEY=sk-ant-...  (or your chosen provider's key)
 */
export class RealCrossPlatformAnalyzer implements CrossPlatformAnalyzer {
  readonly name = 'real';

  async analyze(req: CrossPlatformAuditRequest): Promise<CrossPlatformAuditResult> {
    void req;
    throw new Error(
      'RealCrossPlatformAnalyzer is not yet implemented. ' +
      'Set CROSS_PLATFORM_ANALYZER=mock (or leave unset) to use mock data.',
    );
  }
}
