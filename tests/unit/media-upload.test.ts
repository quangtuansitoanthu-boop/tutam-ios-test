import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.fetch }));
import { encodeMediaFileNameHeader, mediaFileContentType, uploadMediaFile } from '$lib/browser/media-upload';
afterEach(() => vi.clearAllMocks());

describe('media upload metadata', () => {
  it('encodes Vietnamese file names into an ASCII-safe request header', () => {
    const encoded = encodeMediaFileNameHeader('ảnh bìa kiểm thử.jpg');

    expect(encoded).toBe('%E1%BA%A3nh%20b%C3%ACa%20ki%E1%BB%83m%20th%E1%BB%AD.jpg');
    expect([...encoded].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
  });
  it.each([['cover.WEBP', 'image/webp'], ['talk.m4a', 'audio/mp4'], ['book.pdf', 'application/pdf'], ['unknown', 'application/octet-stream'], ['unknown.__proto__', 'application/octet-stream']])('infers a nonempty MIME for %s', (name, type) => {
    expect(mediaFileContentType({ name, type: '' })).toBe(type);
    expect(mediaFileContentType({ name, type: 'image/png' })).toBe('image/png');
  });
  it('preserves the raw bytes, hash, CSRF and single-write transport for a MIME-less file', async () => {
    const file = new File([new Uint8Array([0, 255, 128, 42])], 'ảnh.webp');
    mocks.fetch.mockResolvedValueOnce(Response.json({ url: '/api/media/cover.webp' }));
    await uploadMediaFile(file, 'covers', 'csrf-fixture');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [path, init] = mocks.fetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(path).toBe('/api/media');
    expect(init.method).toBe('POST');
    expect(headers.get('content-type')).toBe('image/webp');
    expect(headers.get('x-csrf-token')).toBe('csrf-fixture');
    expect(headers.get('x-media-prefix')).toBe('covers');
    expect(headers.get('x-file-name')).toBe(encodeMediaFileNameHeader(file.name));
    expect(headers.get('idempotency-key')).toBeTruthy();
    const expected = Buffer.from(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())).toString('base64url');
    expect(headers.get('x-content-sha256')).toBe(expected);
    expect(init.body.type).toBe('image/webp');
    expect(new Uint8Array(await init.body.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
  });
});
