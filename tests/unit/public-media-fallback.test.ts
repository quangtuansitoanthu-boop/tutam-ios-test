import { afterEach, expect, it, vi } from 'vitest';
import { fetchPublicMedia, publicMediaFallback } from '$lib/browser/public-media-fallback';
import { readPublicMedia } from '$lib/server/http/public-media';
import type { R2BucketLike } from '$lib/server/cloudflare-context';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('retains the video content revision when falling back to Workers', () => {
  const revision = 'a'.repeat(64);
  const fallback = publicMediaFallback(`https://media.quangtu.vn/videos/fb-video-test.mp4?v=${revision}`);
  expect(fallback).toContain(`/api/public-media/videos/fb-video-test.mp4?v=${revision}`);
});

it('tries Workers once after a public CDN failure', async () => {
  const source = 'https://media.quangtu.vn/posters/fb-poster-test.webp';
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('DNS unavailable'))
    .mockResolvedValueOnce(new Response('image'))
    .mockResolvedValueOnce(new Response('next image'));
  vi.stubGlobal('fetch', fetcher);
  expect(await (await fetchPublicMedia(source, { credentials: 'omit' })).text()).toBe('image');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toMatch(/\.workers\.dev\/api\/public-media\/posters\/fb-poster-test\.webp$/u);
  expect(await (await fetchPublicMedia(source, { credentials: 'omit' })).text()).toBe('next image');
  expect(fetcher.mock.calls[2][0]).toBe(fetcher.mock.calls[1][0]);
});

it('rejects a parked CDN HTML page and tries Workers', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_000);
  const source = 'https://media.quangtu.vn/posters/fb-poster-test.webp';
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('<html>Parked</html>', { headers: { 'content-type': 'text/html' } }))
    .mockResolvedValueOnce(new Response('image'));
  vi.stubGlobal('fetch', fetcher);
  expect(await (await fetchPublicMedia(source, { credentials: 'omit' })).text()).toBe('image');
  expect(fetcher.mock.calls[0][0]).toBe(source);
  expect(fetcher.mock.calls[1][0]).toContain('.workers.dev/api/public-media/');
});

it('streams an allowed R2 range and rejects private keys without reading the bucket', async () => {
  const get = vi.fn().mockResolvedValue({
    size: 200, range: { offset: 0, length: 4 }, body: new Response('abcd').body,
  });
  const bucket = { get } as unknown as R2BucketLike;
  const request = new Request('https://example.test', { headers: { Range: 'bytes=0-3' } });
  expect((await readPublicMedia(request, 'private/a.mp4', bucket)).status).toBe(404);
  const response = await readPublicMedia(request, 'videos/fb-video-test.mp4', bucket);
  expect(get).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(206);
  expect(response.headers.get('Content-Range')).toBe('bytes 0-3/200');
  expect(await response.text()).toBe('abcd');
});

it('computes accurate Content-Range and Content-Length for suffix, open-ended, unsatisfiable ranges and HEAD', async () => {
  const suffixBucket = {
    get: vi.fn().mockResolvedValue({ size: 200, range: { suffix: 5 }, body: new Response('12345').body }),
  } as unknown as R2BucketLike;
  const suffixRes = await readPublicMedia(new Request('https://example.test', { headers: { Range: 'bytes=-5' } }), 'videos/fb-video-test.mp4', suffixBucket);
  expect(suffixRes.status).toBe(206);
  expect(suffixRes.headers.get('Content-Range')).toBe('bytes 195-199/200');
  expect(suffixRes.headers.get('Content-Length')).toBe('5');

  const openBucket = {
    get: vi.fn().mockResolvedValue({ size: 200, range: { offset: 150 }, body: new Response('x'.repeat(50)).body }),
  } as unknown as R2BucketLike;
  const openRes = await readPublicMedia(new Request('https://example.test', { headers: { Range: 'bytes=150-' } }), 'videos/fb-video-test.mp4', openBucket);
  expect(openRes.status).toBe(206);
  expect(openRes.headers.get('Content-Range')).toBe('bytes 150-199/200');
  expect(openRes.headers.get('Content-Length')).toBe('50');

  const oobBucket = {
    get: vi.fn().mockResolvedValue({ size: 200, range: { offset: 300, length: 0 }, body: new Response('').body }),
  } as unknown as R2BucketLike;
  const oobRes = await readPublicMedia(new Request('https://example.test', { headers: { Range: 'bytes=300-400' } }), 'videos/fb-video-test.mp4', oobBucket);
  expect(oobRes.status).toBe(416);
  expect(oobRes.headers.get('Content-Range')).toBe('bytes */200');

  const headBucket = {
    head: vi.fn().mockResolvedValue({ size: 200, httpEtag: '"etag-1"' }),
    get: vi.fn(),
  } as unknown as R2BucketLike;
  const headRes = await readPublicMedia(new Request('https://example.test', { method: 'HEAD' }), 'videos/fb-video-test.mp4', headBucket);
  expect(headRes.status).toBe(200);
  expect(headRes.headers.get('Content-Length')).toBe('200');
  expect(headRes.body).toBeNull();
});
