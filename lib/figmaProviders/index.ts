import type { FigmaProvider } from './types';
import { MockFigmaProvider } from './mockProvider';
import { RealFigmaProvider } from './figmaProvider';

/**
 * Resolution order (server-side env vars):
 *   USE_MOCKS=true         → MockFigmaProvider  (overrides everything)
 *   FIGMA_PROVIDER=figma   → RealFigmaProvider  (requires FIGMA_ACCESS_TOKEN)
 *   (anything else / unset)→ MockFigmaProvider
 */
export function getFigmaProvider(): FigmaProvider {
  if (process.env.USE_MOCKS === 'true') return new MockFigmaProvider();

  const provider = process.env.FIGMA_PROVIDER ?? 'mock';

  if (provider === 'figma') {
    const token = process.env.FIGMA_ACCESS_TOKEN;
    if (!token) throw new Error('FIGMA_PROVIDER is "figma" but FIGMA_ACCESS_TOKEN is not set.');
    return new RealFigmaProvider(token);
  }

  return new MockFigmaProvider();
}

export type {
  FigmaProvider,
  FigmaExportRequest,
  FigmaExportResult,
  ListFramesRequest,
  ListFramesResult,
  FigmaFrameSummary,
} from './types';
