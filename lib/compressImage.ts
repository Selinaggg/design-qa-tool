/**
 * 前端图片压缩到目标字节数以内。
 * 用 canvas 逐步降 quality + 降分辨率，直到 data URL base64 字节数 <= maxBytes。
 *
 * 用途：Bedrock Claude 单张图片限制 5MB base64；截图动辄 7-15MB，必须先压。
 */

/** 估算 data URL 里 base64 部分的字节数（≈ 原始二进制字节数） */
function estimateBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return dataUrl.length;
  const b64 = dataUrl.slice(commaIdx + 1);
  // base64 每 4 字符 = 3 字节
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 40)}...`));
    img.src = src;
  });
}

function drawToCanvas(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * 把 URL（blob:/http:/data:）压缩到 <= maxBytes（base64 后字节数），返回 data URL。
 *
 * 策略（从大到小尝试，直到达标）：
 *   maxSide 从 2560 逐步降到 800
 *   quality 从 0.92 逐步降到 0.5
 *   输出格式统一 JPEG（不透明背景），比 PNG 小 3-10 倍
 */
export async function compressImageToDataUrl(
  url: string,
  maxBytes: number = 4_500_000, // 4.5MB，留 buffer
): Promise<string> {
  const img = await loadImage(url);

  const attempts: Array<{ maxSide: number; quality: number }> = [
    { maxSide: 2560, quality: 0.92 },
    { maxSide: 2048, quality: 0.9 },
    { maxSide: 1920, quality: 0.85 },
    { maxSide: 1600, quality: 0.8 },
    { maxSide: 1280, quality: 0.75 },
    { maxSide: 1024, quality: 0.7 },
    { maxSide: 800, quality: 0.6 },
  ];

  let last = '';
  for (const { maxSide, quality } of attempts) {
    const canvas = drawToCanvas(img, maxSide);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    last = dataUrl;
    if (estimateBase64Bytes(dataUrl) <= maxBytes) return dataUrl;
  }
  // 已经压到最狠了还超限 —— 返回最后一次结果（让后端报错，比无限循环强）
  return last;
}
