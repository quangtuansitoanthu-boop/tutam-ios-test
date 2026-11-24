import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './native-platform';

interface ImageExportPlugin {
  saveImage(options: { fileName: string; base64: string }): Promise<{ saved: boolean }>;
  shareImage(options: { fileName: string; base64: string; title?: string; text?: string }): Promise<{ shared: boolean }>;
}
const ImageExport = registerPlugin<ImageExportPlugin>('ImageExport');
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PNG_BYTES = 8 * 1024 * 1024;

function sanitizePngFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.png$/i, '');
  const cleaned = withoutExt
    .replace(/[^A-Za-z0-9_.-]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 96);
  const base = cleaned && /^[A-Za-z0-9_-]/.test(cleaned) ? cleaned : 'tu-tap';
  return `${base}.png`;
}

async function encodeValidatedPng(blob: Blob): Promise<string> {
  if (blob.type !== 'image/png' || blob.size < 8 || blob.size > MAX_PNG_BYTES) throw new Error('invalid_png');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error('invalid_png');
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 8192) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 8192)));
  return btoa(chunks.join(''));
}

/** Native resolves only after the destination is written; web starts a browser download. */
export async function savePngImage(blob: Blob, fileName: string): Promise<boolean> {
  const base64 = await encodeValidatedPng(blob);
  const safeName = sanitizePngFileName(fileName);
  if (isNativeApp()) {
    // Only small, generated PNG cards cross the bridge. Never use this for books/video.
    const result = await ImageExport.saveImage({ fileName: safeName, base64 });
    return result.saved === true;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.style.display = 'none';
  document.body.append(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return true;
}

/** Shares a generated PNG card via native OS share sheet on Android/iOS, or Web Share API on web. */
export async function sharePngImage(
  blob: Blob,
  fileName: string,
  options?: { title?: string; text?: string },
): Promise<boolean> {
  const safeName = sanitizePngFileName(fileName);
  if (isNativeApp()) {
    const base64 = await encodeValidatedPng(blob);
    const result = await ImageExport.shareImage({
      fileName: safeName,
      base64,
      ...(options?.title ? { title: options.title } : {}),
      ...(options?.text ? { text: options.text } : {}),
    });
    return result.shared === true;
  }
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], safeName, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: options?.title,
        text: options?.text,
      });
      return true;
    }
  }
  return false;
}
