import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), refresh: vi.fn(), refreshOrigin: vi.fn(), offline: vi.fn() }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: mocks.snapshot, refreshBrowserSession: mocks.refresh, isSessionExpired: () => false }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: mocks.offline }));
vi.mock('$lib/browser/url-fallback', () => ({ refreshRemoteOrigin: mocks.refreshOrigin }));
import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.offline.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());
describe('recovering CSRF for cached native sessions', () => {
  it.each([null, 'mobile-session-token'])('refreshes an unusable cached token %s before a mutation', async (csrfToken) => {
    mocks.snapshot.mockReturnValue({ authenticated: true, csrfToken });
    mocks.refresh.mockResolvedValue({ authenticated: true, csrfToken: 'server-token' });
    await expect(requireBrowserCsrf()).resolves.toBe('server-token');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('does not send a synthetic token when refresh cannot recover the server session', async () => {
    mocks.snapshot.mockReturnValue({ authenticated: true, csrfToken: 'mobile-session-token' });
    mocks.refresh.mockResolvedValue({ authenticated: true, csrfToken: null });
    await expect(requireBrowserCsrf()).rejects.toThrow('Vui lòng thử lại');
  });
  it('preserves cross-origin credentials on origin fallback retry for GET reads', async () => {
    let activeOrigin = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
    mocks.snapshot.mockReturnValue({ authenticated: false, csrfToken: null });
    mocks.refreshOrigin.mockImplementation(async () => { activeOrigin = 'https://quangtu.vn'; });
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    vi.stubGlobal('localStorage', { getItem: () => activeOrigin });

    const response = await fetchWithSessionRefresh('/api/articles');
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe('https://quangtu.vn/api/articles');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: 'include' });
  });
  it('refreshes session on 403 invalid_csrf without replaying the mutation', async () => {
    mocks.snapshot.mockReturnValue({ authenticated: true, csrfToken: 'stale-csrf' });
    mocks.refresh.mockResolvedValue({ authenticated: true, csrfToken: 'fresh-csrf' });
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: 'invalid_csrf' } }, { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('window', { location: { origin: 'https://quangtu.vn' } });
    vi.stubGlobal('navigator', { onLine: true });

    const response = await fetchWithSessionRefresh('/api/sync', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': 'stale-csrf' }, body: '{}',
    });
    expect(response.status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
