import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), store: vi.fn(), available: vi.fn(async response => response) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, CapacitorHttp: { request: vi.fn() } }));
vi.mock('$lib/browser/native-api-cache', () => ({ readOfflineApiResponse: mocks.read, storeApiResponse: mocks.store }));
vi.mock('$lib/browser/ios-content-policy', () => ({ availableContentResponse: mocks.available, blockedContentRequest: () => false }));

let activeOrigin: string;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  activeOrigin = 'https://quangtu.vn';
  fetcher = vi.fn(async () => Response.json({ articles: [] }));
  vi.stubGlobal('window', { location: { origin: 'capacitor://localhost' }, fetch: fetcher });
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { getItem: () => activeOrigin });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps cache and iOS content policy active after changing backend during the same session', async () => {
  await import('../../src/hooks.client');
  await window.fetch('/api/articles');
  activeOrigin = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
  await window.fetch('/api/articles');
  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
    'https://quangtu.vn/api/articles', `${activeOrigin}/api/articles`,
  ]);
  expect(mocks.store).toHaveBeenCalledTimes(2);
  expect(mocks.store.mock.calls[1][0].origin).toBe(activeOrigin);
  expect(mocks.available).toHaveBeenCalledTimes(2);
  vi.stubGlobal('navigator', { onLine: false });
  mocks.read.mockResolvedValueOnce(Response.json({ articles: ['offline'] }));
  expect(await (await window.fetch('/api/articles')).json()).toEqual({ articles: ['offline'] });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(mocks.available).toHaveBeenCalledTimes(3);
});

it('does not cache arbitrary external origins', async () => {
  await import('../../src/hooks.client');
  await window.fetch('https://untrusted.example/api/articles');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(mocks.store).not.toHaveBeenCalled();
  expect(mocks.available).not.toHaveBeenCalled();
});

it.each(['/api/session', '/api/health'])('keeps %s failures live instead of treating bundled data as verification', async path => {
  await import('../../src/hooks.client');
  const failure = Response.json({ error: 'unavailable' }, { status: 503 });
  fetcher.mockResolvedValueOnce(failure);
  expect(await window.fetch(path)).toBe(failure);
  for (const error of [new TypeError('offline'), new DOMException('Timed out', 'TimeoutError')]) {
    fetcher.mockRejectedValueOnce(error);
    await expect(window.fetch(path)).rejects.toBe(error);
  }
  vi.stubGlobal('navigator', { onLine: false });
  fetcher.mockRejectedValueOnce(new TypeError('offline'));
  await expect(window.fetch(path)).rejects.toThrow('offline');
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.store).not.toHaveBeenCalled();
});
