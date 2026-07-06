import type { FigmaProvider, FigmaExportRequest, FigmaExportResult } from './types';

/**
 * Real Figma provider — uses the Figma REST API to export a frame as PNG.
 *
 * TODO: implement when FIGMA_ACCESS_TOKEN is available.
 *
 * Suggested implementation:
 *   1. Parse figmaUrl to extract fileKey and nodeId
 *      e.g. https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
 *   2. GET https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png
 *      Headers: { 'X-Figma-Token': this.token }
 *   3. Receive { images: { [nodeId]: imageUrl } }
 *   4. Download the imageUrl, convert to base64 data URL
 *   5. Return { imageUrl, width, height, fileName, isMock: false }
 */
export class RealFigmaProvider implements FigmaProvider {
  readonly name = 'figma';
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async export(req: FigmaExportRequest): Promise<FigmaExportResult> {
    void this.token;
    void req;
    throw new Error(
      'Real Figma provider is not yet implemented. Set FIGMA_PROVIDER=mock to use mock data.',
    );
  }
}
