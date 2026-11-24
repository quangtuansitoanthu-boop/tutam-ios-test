/** Fetch trả dữ liệu đã giải nén, còn Content-Length và Content-Range mô tả dữ liệu truyền. */
export function assertCompleteDownload(response: Response, received: number, error: string): void {
  if (!received) throw new Error(error);
  const encoded = response.headers.get('content-encoding')?.trim().toLowerCase();
  const identityEncoding = !encoded || encoded === 'identity';
  const range = response.headers.get('content-range');
  if (response.status === 206 || range !== null) {
    const match = /^bytes 0-(\d+)\/(\d+)$/iu.exec(range?.trim() ?? '');
    const total = Number(match?.[2]);
    if (!match || !Number.isSafeInteger(total) || Number(match[1]) + 1 !== total
      || (identityEncoding && received !== total)) throw new Error(error);
  }
  const length = response.headers.get('content-length');
  if (identityEncoding && length !== null && /^\d+$/u.test(length) && received !== Number(length)) throw new Error(error);
}

export function isMediaErrorDocument(type: string): boolean {
  return /^(?:text\/html|application\/(?:xhtml\+xml|json|[\w.-]+\+json))(?:;|$)/iu.test(type.trim());
}

async function readBlobPrefix(blob: Blob): Promise<string> {
  const prefix = blob.slice(0, 192);
  if (typeof prefix.text === 'function') return prefix.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(prefix);
  });
}

export async function assertMediaDownload(response: Response, body: Blob | ArrayBuffer): Promise<void> {
  // Fetch hoặc IndexedDB có thể trả về Blob của một WebView khác.
  const size = 'size' in body ? body.size : body.byteLength;
  assertCompleteDownload(response, size, 'offline_media_incomplete');
  if (isMediaErrorDocument(response.headers.get('content-type') ?? '')) throw new Error('offline_media_invalid');
  const prefix = 'size' in body ? await readBlobPrefix(body)
    : new TextDecoder().decode(new Uint8Array(body, 0, Math.min(size, 192)));
  if (/^\s*(?:<!doctype\s+html\b|<(?:html|head|body)\b)/iu.test(prefix)) throw new Error('offline_media_invalid');
}
