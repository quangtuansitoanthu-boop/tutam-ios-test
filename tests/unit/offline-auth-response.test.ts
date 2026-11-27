import { afterEach, expect, it, vi } from 'vitest';
import { resolveOfflineBundledResponse } from '$lib/browser/offline-bundled-resolver';

afterEach(() => vi.unstubAllGlobals());
it.each(['/api/session', '/api/health', '/api/articles/book-a/comments'])('does not invent a successful bundled response for %s', async path => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ authenticated: true, user: { id: 'remembered' }, expiresAt: '2099-01-01' }) });
  expect(await resolveOfflineBundledResponse(path)).toBeNull();
  expect(await resolveOfflineBundledResponse(new URL(path, 'https://quangtu.vn'))).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
