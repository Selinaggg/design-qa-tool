import { compressImageToDataUrl } from './compressImage';

/**
 * 把 blob:URL 或其它 URL 转成 data URL（base64）。
 * - blob: → fetch 出来后转 base64
 * - data: → 原样返回
 * - http(s): → 原样返回（让后端自己去 fetch，避免浏览器跨域 fetch 失败）
 * - null/undefined → 返回 undefined
 */
export async function toDataUrl(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  if (url.startsWith('blob:')) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch blob URL: HTTP ${res.status}`);
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  }

  throw new Error(`Unsupported URL scheme: ${url.slice(0, 40)}...`);
}

/**
 * 转 data URL 且压缩到 maxBytes 以内（默认 4.5MB，适配 Bedrock 5MB 限制）。
 * 无论输入是 blob/http/data，都会在浏览器 canvas 走一次压缩。
 */
export async function toCompressedDataUrl(
  url: string | null | undefined,
  maxBytes?: number,
): Promise<string | undefined> {
  if (!url) return undefined;
  return await compressImageToDataUrl(url, maxBytes);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('FileReader did not return a string'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}
