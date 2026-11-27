import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { CachedContentResponse } from '$lib/browser/offline-content-index';

const memory = vi.hoisted(() => ({ records: new Map<string, CachedContentResponse>(), failWrites: false }));
vi.mock('$lib/browser/offline-content-index', () => ({
  ensureResponseStorage: async () => {},
  readCachedContentResponses: async (name: string, url?: string) => [...memory.records.values()].filter(row => row.cacheName === name && (!url || row.url === url)),
  putCachedContentResponse: async (record: CachedContentResponse) => {
    if (memory.failWrites) throw new DOMException('Full', 'QuotaExceededError');
    memory.records.set(JSON.stringify([record.cacheName, record.url]), record);
  },
  deleteCachedContentResponse: async (name: string, url: string) => { memory.records.delete(JSON.stringify([name, url])); },
}));
const fixture = vi.hoisted(() => ({ version: 'test', entries: [] as { file: string; sha256: string; bytes: number }[] }));
vi.mock('$lib/data/english-pack-manifest.json', () => ({ default: fixture }));

beforeEach(() => {
  vi.resetModules(); memory.records.clear(); memory.failWrites = false;
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal('location', { href: 'https://app.test/' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['missing', 'blocked'])('persists full response bytes, metadata and revision keys when CacheStorage is %s', async mode => {
  if (mode === 'blocked') vi.stubGlobal('caches', { open: async () => { throw new DOMException('Denied', 'SecurityError'); } });
  const { openOfflineResponseCache } = await import('$lib/browser/offline-response-cache');
  const cache = await openOfflineResponseCache('english');
  await cache.put('/chapter?revision=old', new Response('old', { headers: { 'content-type': 'application/json' } }));
  await cache.put('/chapter?revision=new', new Response('new', { status: 201, headers: { 'x-saved': 'yes' } }));
  const reopened = await openOfflineResponseCache('english');
  const saved = await reopened.match('/chapter?revision=new');
  expect(await saved?.text()).toBe('new'); expect(saved?.status).toBe(201); expect(saved?.headers.get('x-saved')).toBe('yes');
  expect((await reopened.keys('/chapter', { ignoreSearch: true })).map(key => new URL(key.url).search)).toEqual(['?revision=old', '?revision=new']);
  expect(await (await openOfflineResponseCache('covers')).match('/chapter?revision=new')).toBeUndefined();
  await reopened.delete('/chapter?revision=old');
  expect(await (await reopened.match('/chapter?revision=new'))?.text()).toBe('new');
});

it('keeps an IDB offline copy readable when CacheStorage becomes available again', async () => {
  const { openOfflineResponseCache } = await import('$lib/browser/offline-response-cache');
  await (await openOfflineResponseCache('public')).put('/saved', Response.json({ saved: true }));
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined }) });
  expect(await (await (await openOfflineResponseCache('public')).match('/saved'))?.json()).toEqual({ saved: true });
});

it('keeps the previous completed IDB copy when a replacement exceeds quota', async () => {
  const { openOfflineResponseCache } = await import('$lib/browser/offline-response-cache');
  const cache = await openOfflineResponseCache('public');
  await cache.put('/saved', new Response('old'));
  memory.failWrites = true;
  await expect(cache.put('/saved', new Response('new'))).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(await (await cache.match('/saved'))?.text()).toBe('old');
});

it('downloads English revisions and reopens them cold and offline through IDB without another HTTP request', async () => {
  const rows = [{ noi_dung: 'English content' }];
  const body = JSON.stringify(rows);
  fixture.entries = [{ file: 'fallback-book.json', bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }];
  vi.stubGlobal('navigator', { onLine: undefined });
  const fetcher = vi.fn(async () => new Response(body)); vi.stubGlobal('fetch', fetcher);
  const { downloadEnglishPack } = await import('$lib/browser/english-pack');
  const progress = vi.fn(); await downloadEnglishPack(progress);
  expect(progress).toHaveBeenLastCalledWith(1, 1); expect(fetcher).toHaveBeenCalledOnce();
  vi.resetModules(); vi.stubGlobal('navigator', { onLine: false });
  const { fetchEnglishChapters } = await import('$lib/browser/english-pack');
  expect(await (await fetchEnglishChapters('/offline-data/chapters-en/fallback-book.json')).json()).toEqual(rows);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('saves a cover into IDB and reads it offline after clearing only session memory', async () => {
  const fetcher = vi.fn(async () => new Response('image-bytes', { headers: { 'content-type': 'image/webp' } }));
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('navigator', { onLine: true });
  const { saveCoverOffline } = await import('$lib/browser/session-cover');
  await saveCoverOffline('/covers/fallback.webp'); expect(fetcher).toHaveBeenCalledOnce();
  vi.resetModules(); vi.stubGlobal('navigator', { onLine: false });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { expect((blob as Blob).size).toBe(11); return 'blob:saved-cover'; });
  const { getSessionCover } = await import('$lib/browser/session-cover');
  expect(await getSessionCover('/covers/fallback.webp')).toBe('blob:saved-cover'); expect(fetcher).toHaveBeenCalledOnce();
});

it('downloads and cold-opens a complete book using IDB with the existing single API request', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  const chapters = [{ id: 'one', so_thu_tu: 1, noi_dung: 'Saved chapter' }];
  const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json(chapters)); vi.stubGlobal('fetch', fetcher);
  const { downloadBookOffline, readDownloadedBooks } = await import('$lib/browser/offline-books-sync');
  await downloadBookOffline({ id: 'fallback-book', title: 'Fallback book', summary: '', content: '', category: 'KHÁC', tags: [],
    author: '', imageUrl: '', featured: false, publishedAt: '', hasTableOfContents: true, volumeCount: 1, status: 'Hoàn thành', pdfUrl: '' });
  expect(readDownloadedBooks()['fallback-book'].chapterCount).toBe(1);
  vi.resetModules(); vi.stubGlobal('navigator', { onLine: false });
  const { readOfflineApiResponse } = await import('$lib/browser/native-api-cache');
  const detail = await readOfflineApiResponse(new URL('https://quangtu.vn/api/articles/fallback-book'));
  expect(await detail?.json()).toMatchObject({ tieu_de: 'Fallback book', trang_thai: 'Hoàn thành', has_muc_luc: 1 });
  const saved = await readOfflineApiResponse(new URL('https://quangtu.vn/api/articles/fallback-book/chapters?order=so_thu_tu.asc&limit=5000'));
  expect(await saved?.json()).toEqual(chapters);
  // Resolver có thể đọc catalog từ asset đóng gói; không phát sinh thêm HTTP API.
  expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/api/'))).toHaveLength(1);
});
