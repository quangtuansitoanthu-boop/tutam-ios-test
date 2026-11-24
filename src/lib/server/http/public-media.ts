import type { R2BucketLike } from '../cloudflare-context';

const types: Record<string, string> = {
  webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', mp4: 'video/mp4', json: 'application/json',
};
const publicKey = /^(?:posters\/fb-poster-[\w-]+\.webp|videos\/fb-video-[\w-]+\.mp4|audio\/practice\/(?:ambient\/)?[\w-]+\.(?:mp3|m4a)|vegan\/weeks\/v[1-5]\/\d{4}-\d{2}-\d{2}\.json|offline-data\/(?:english-pack-manifest\.json|chapters-en\/[\w-]+\.json)|content\/smdv-[a-f0-9]+\/[\w-]+\.(?:webp|png|jpe?g))$/u;
const facebookEnglishBook = 'offline-data/chapters-en/tuyen-tap-phap-facebook-quang-tu.json';
const facebookEnglishRevision = 'f3508460887c44f495eac7aefe68f1e41f892226a4d742b10a80560b9e44a3ea';

export async function readPublicMedia(request: Request, key: string, bucket?: R2BucketLike): Promise<Response> {
  if (!publicKey.test(key)) return new Response(null, { status: 404 });
  const range = request.headers.get('range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/u.test(range)) return new Response(null, { status: 416 });
  const isHead = request.method === 'HEAD';
  let object: {
    body?: ReadableStream<Uint8Array> | null;
    size: number;
    httpEtag?: string;
    range?: { offset?: number; length?: number; suffix?: number };
  } | null | undefined;
  try {
    const objectKey = key === facebookEnglishBook
      ? `offline-data/english-revisions/${facebookEnglishRevision}/tuyen-tap-phap-facebook-quang-tu.json`
      : key;
    const metadataOnly = isHead && !range && typeof bucket?.head === 'function';
    object = metadataOnly
      ? await bucket.head(objectKey)
      : await bucket?.get(objectKey, range ? { range: request.headers } : undefined);
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!object || (!isHead && !object.body)) return new Response(null, { status: 404 });
  const headers = new Headers({
    'Content-Type': types[key.split('.').at(-1)!],
    'Cache-Control': key.endsWith('.json') ? 'public, max-age=300' : 'public, max-age=86400',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  if (range && object.range) {
    const resolved = resolvePublicByteRange(object.range, object.size);
    if (!resolved) {
      await object.body?.cancel?.().catch(() => undefined);
      headers.set('Content-Range', `bytes */${object.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${resolved.offset}-${resolved.offset + resolved.length - 1}/${object.size}`);
    headers.set('Content-Length', String(resolved.length));
    if (isHead) await object.body?.cancel?.().catch(() => undefined);
    return new Response(isHead ? null : (object.body ?? null), { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  if (isHead) await object.body?.cancel?.().catch(() => undefined);
  return new Response(isHead ? null : (object.body ?? null), { headers });
}

function resolvePublicByteRange(
  range: { offset?: number; length?: number; suffix?: number },
  size: number,
): { offset: number; length: number } | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  if (typeof range.suffix === 'number' && Number.isFinite(range.suffix)) {
    const suffix = Math.trunc(range.suffix);
    if (suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset = typeof range.offset === 'number' && Number.isFinite(range.offset) ? Math.trunc(range.offset) : 0;
  if (offset < 0 || offset >= size) return null;
  const maxLength = size - offset;
  const length = typeof range.length === 'number' && Number.isFinite(range.length)
    ? Math.min(Math.trunc(range.length), maxLength)
    : maxLength;
  if (length <= 0) return null;
  return { offset, length };
}
