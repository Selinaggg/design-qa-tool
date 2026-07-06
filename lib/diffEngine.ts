import pixelmatch from 'pixelmatch';
import type { ImageFile } from '@/types';

export interface DiffResult {
  diffUrl: string;
  mismatchCount: number;
  mismatchPercent: number;
  totalPixels: number;
}

async function imageFileToImageData(
  imageFile: ImageFile,
): Promise<ImageData> {
  const canvas = document.createElement('canvas');
  canvas.width = imageFile.width;
  canvas.height = imageFile.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = imageFile.url;
  });

  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, imageFile.width, imageFile.height);
}

export interface DiffOptions {
  threshold?: number; // 0 (strict) to 1 (permissive), default 0.1
  includeAA?: boolean; // ignore antialiasing pixels, default true
}

export async function computeDiff(
  designImage: ImageFile,
  liveImage: ImageFile,
  options: DiffOptions = {},
): Promise<DiffResult> {
  const { threshold = 0.1, includeAA = true } = options;
  const { width, height } = designImage;

  const [designData, liveData] = await Promise.all([
    imageFileToImageData(designImage),
    imageFileToImageData(liveImage),
  ]);

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d');
  if (!diffCtx) throw new Error('Canvas 2D context unavailable');

  const diffImageData = diffCtx.createImageData(width, height);

  const mismatchCount = pixelmatch(
    designData.data,
    liveData.data,
    diffImageData.data,
    width,
    height,
    {
      threshold,
      includeAA,
      diffColor: [255, 65, 54],  // red for differences
      aaColor: [255, 200, 0],    // yellow for antialiasing
    },
  );

  diffCtx.putImageData(diffImageData, 0, 0);

  return {
    diffUrl: diffCanvas.toDataURL('image/png'),
    mismatchCount,
    mismatchPercent: (mismatchCount / (width * height)) * 100,
    totalPixels: width * height,
  };
}
