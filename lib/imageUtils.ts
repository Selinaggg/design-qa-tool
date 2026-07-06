import type { AlignmentStrategy } from '@/types';

export async function loadImageFile(file: File): Promise<{
  url: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Load an image from an existing URL (data URL, blob URL, or same-origin path).
 * Unlike loadImageFile, this does NOT create a new object URL — the original URL is returned as-is.
 * Used for images sourced from API routes (Figma export, screenshot capture).
 */
export async function loadImageFromUrl(url: string): Promise<{
  url: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image from URL: ${url}`));
    img.src = url;
  });
}

export function checkDimensionsMatch(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  return a.width === b.width && a.height === b.height;
}

export function formatDimensions(w: number, h: number): string {
  return `${w} × ${h} px`;
}

/**
 * Future alignment implementations.
 * Each strategy should return canvases with identical pixel dimensions,
 * ready to be passed into pixelmatch.
 */
export async function applyAlignment(
  _design: HTMLCanvasElement,
  _live: HTMLCanvasElement,
  strategy: AlignmentStrategy,
): Promise<{ design: HTMLCanvasElement; live: HTMLCanvasElement }> {
  switch (strategy) {
    case 'none':
      throw new Error('Dimensions must match when alignment is "none".');
    case 'scale-to-design':
      // TODO: draw live image scaled to design canvas dimensions
      throw new Error('scale-to-design not yet implemented');
    case 'crop-top':
      // TODO: crop both canvases to min(w, h) from top-left
      throw new Error('crop-top not yet implemented');
    case 'smart':
      // TODO: use feature-point detection to align images
      throw new Error('smart alignment not yet implemented');
  }
}
