import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readOfflineApiResponse, storeApiResponse } from '../../src/lib/browser/native-api-cache';
import * as bundledResolver from '../../src/lib/browser/offline-bundled-resolver';

const put = vi.fn();
beforeEach(() => {
  put.mockReset();
  vi.stubGlobal('caches', { open: vi.fn(async () => ({ put })) });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('native shared content cache privacy', () => {
  it.each(['leaderboard', 'campaigns'])('never reads or writes viewer-specific practice %s in the public cache', async endpoint => {
    const match = vi.fn(async () => Response.json([{ joined: true, isOwnProfile: true }]));
    vi.stubGlobal('caches', { open: async () => ({ put, match }) });
    const url = new URL(`https://quangtu.vn/api/practice/${endpoint}?includeDrafts=1`);
    await storeApiResponse(url, Response.json([{ joined: true, isOwnProfile: true }]));
    const offline = await readOfflineApiResponse(url);
    expect(offline?.status).toBe(503);
    expect(await offline?.text()).not.toContain('joined');
    expect(put).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
  });
  it('restores article rows from legacy downloaded camelCase metadata without deleting the copy', async () => {
    const legacy = { id: 'legacy-book', title: 'Saved book', content: 'Saved body', status: 'Hoàn thành', tags: ['saved'], hasTableOfContents: true, volumeCount: 2 };
    vi.stubGlobal('caches', { open: async () => ({ match: async () => Response.json(legacy), put }) });
    const response = await readOfflineApiResponse(new URL('https://quangtu.vn/api/articles/legacy-book'));
    expect(await response?.json()).toMatchObject({ id: legacy.id, tieu_de: legacy.title, noi_dung: legacy.content, trang_thai: legacy.status, has_muc_luc: 1, so_tap: 2 });
    expect(put).not.toHaveBeenCalled();
  });
  it('never persists a response explicitly marked no-store', async () => {
    await storeApiResponse(new URL('https://quangtu.vn/api/talks'), new Response('[{"id":"private"}]', { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }));
    expect(put).not.toHaveBeenCalled();
  });
  it('filters private albums and unpublished articles out of a shared catalog', async () => {
    await storeApiResponse(new URL('https://quangtu.vn/api/talks'), new Response(JSON.stringify([
      { id: 'public', visibility: 'public' }, { id: 'secret', visibility: 'private' },
      { id: 'draft', trang_thai: 'Bản nháp' },
    ]), { headers: { 'content-type': 'application/json' } }));
    expect(put).toHaveBeenCalledTimes(1);
    expect(await put.mock.calls[0][1].json()).toEqual([{ id: 'public', visibility: 'public' }]);
  });
  it('never caches web-only book or album metadata', async () => {
    const rows = [
      { id: 'tt_1781529439696', tieu_de: 'Muôn Kiếp Nhân Sinh - Tập 1', trang_thai: 'Hoàn thành' },
      { id: 'pt_1782208869321', tieu_de: 'Muôn Kiếp Nhân Sinh - Tập 1', visibility: 'public' },
    ];
    await storeApiResponse(new URL('https://quangtu.vn/api/articles/tt_1781529439696'), Response.json(rows[0]));
    expect(put).not.toHaveBeenCalled();
    await storeApiResponse(new URL('https://quangtu.vn/api/talks/pt_1782208869321'), Response.json(rows[1]));
    expect(put).not.toHaveBeenCalled();
  });
});

describe('native cache freshness after a bundled content upgrade', () => {
  const oldDate = '2026-11-27T00:00:00Z';
  const bundledDate = '2026-11-28T01:43:17Z';
  const article = { id: 'fixture-book', tieu_de: 'Bundled book', updated_at: bundledDate, trang_thai: 'Hoàn thành' };
  const chapters = [
    { id: 'chapter-0', bai_viet_id: article.id, so_thu_tu: 0, noi_dung: 'Bundled first chapter' },
    { id: 'chapter-1', bai_viet_id: article.id, so_thu_tu: 1, noi_dung: 'Bundled second chapter' },
  ];
  let saved: Response | null;
  let entries: Map<string, Response>;
  let match: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let keys: ReturnType<typeof vi.fn>;
  let writeStorage: ReturnType<typeof vi.fn>;
  let fetcher: ReturnType<typeof vi.fn>;
  let resolveBundle: ReturnType<typeof vi.spyOn>;
  const url = (value: string) => new URL(value, 'https://quangtu.vn');
  const cacheKey = (value: string) => { const parsed = url(value); return `https://tutam-cache.local${parsed.pathname}${parsed.search}`; };
  const remember = (path: string, value: unknown) => entries.set(cacheKey(path), Response.json(value, {
    headers: { 'x-tutam-cached-at': '2025-01-01T00:00:00Z' },
  }));

  beforeEach(() => {
    saved = null;
    entries = new Map();
    match = vi.fn(async (input: RequestInfo | URL) => {
      const key = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return entries.get(key)?.clone();
    });
    remove = vi.fn(); keys = vi.fn(); writeStorage = vi.fn(); fetcher = vi.fn();
    vi.stubGlobal('caches', { open: async () => ({ put, match, delete: remove, keys }) });
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'bookmarks' ? '[{"id":"fixture-book","chapIdx":1}]' : null, setItem: writeStorage });
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(bundledResolver, 'readUpdatedBundledContentResponse').mockImplementation(async () => saved?.clone() ?? null);
    resolveBundle = vi.spyOn(bundledResolver, 'resolveOfflineBundledResponse').mockImplementation(async input => {
      const target = url(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const detail = /^\/api\/articles\/([^/]+)(\/chapters)?$/u.exec(target.pathname);
      const legacyArticle = target.pathname === '/api/data/baiviet';
      const legacyChapters = target.pathname === '/api/data/tap_noi_dung';
      const id = detail ? decodeURIComponent(detail[1])
        : (target.searchParams.get(legacyChapters ? 'bai_viet_id' : 'id') ?? '').replace(/^eq\./u, '');
      if (id.replace(/^book_/u, '') !== article.id || (!detail && !legacyArticle && !legacyChapters)) return null;
      if (detail?.[2] || legacyChapters) {
        const order = target.searchParams.get('so_thu_tu');
        const rows = order ? chapters.filter(row => row.so_thu_tu === Number(order.replace(/^eq\./u, ''))) : chapters;
        return rows.length ? Response.json(rows) : null;
      }
      return Response.json(legacyArticle ? [article] : article);
    });
  });
  afterEach(() => {
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(keys).not.toHaveBeenCalled();
    expect(writeStorage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('uses newer bundled detail over a cached row with an older source date without deleting the row', async () => {
    const path = '/api/articles/fixture-book';
    const original = { ...article, tieu_de: 'Old cached book', updated_at: oldDate };
    remember(path, original);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(article);
    expect(await entries.get(cacheKey(path))!.clone().json()).toEqual(original);
  });

  it('compares the source date of older legacy camelCase article metadata', async () => {
    const path = '/api/articles/fixture-book';
    remember(path, { id: article.id, title: 'Old DTO', updatedAt: oldDate, status: 'Hoàn thành', content: 'Old content' });
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(article);
  });

  it('retains undated chapter queries and their existing book aliases despite older canonical sibling metadata', async () => {
    remember('/api/articles/fixture-book', { ...article, updated_at: oldDate });
    for (const id of ['fixture-book', 'book_fixture-book']) {
      const path = `/api/articles/${id}/chapters?so_thu_tu=eq.1&select=noi_dung,tieu_de,so_thu_tu`;
      const rows = [{ so_thu_tu: 1, noi_dung: 'Undated cached chapter' }];
      remember(path, rows);
      expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(rows);
    }
  });

  it('keeps the PostgREST article array contract when its cached source date is older', async () => {
    const path = '/api/data/baiviet?id=eq.fixture-book&select=*';
    remember(path, [{ ...article, tieu_de: 'Old PostgREST row', updated_at: oldDate }]);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual([article]);
  });

  it('retains an undated PostgREST chapter response despite older sibling article metadata', async () => {
    remember('/api/data/baiviet?id=eq.fixture-book&select=*', [{ ...article, updated_at: oldDate }]);
    const path = '/api/data/tap_noi_dung?bai_viet_id=eq.fixture-book&so_thu_tu=eq.1&select=noi_dung,tieu_de,so_thu_tu';
    const rows = [{ so_thu_tu: 1, noi_dung: 'Undated second chapter' }];
    remember(path, rows);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(rows);
  });

  it('uses the newer bundled chapter only when the aliased cached chapter has its own older source date', async () => {
    const path = '/api/articles/book_fixture-book/chapters?so_thu_tu=eq.1&select=noi_dung,tieu_de,so_thu_tu,updated_at';
    const rows = [{ ...chapters[1], updated_at: oldDate, noi_dung: 'Dated old second chapter' }];
    remember(path, rows);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual([chapters[1]]);
    expect(await entries.get(cacheKey(path))!.clone().json()).toEqual(rows);
  });

  it('preserves the exact PostgREST filter when the chapter response itself proves an older source date', async () => {
    const path = '/api/data/tap_noi_dung?bai_viet_id=eq.fixture-book&so_thu_tu=eq.1&select=noi_dung,tieu_de,so_thu_tu,updated_at';
    const rows = [{ ...chapters[1], updated_at: oldDate, noi_dung: 'Dated old PostgREST chapter' }];
    remember(path, rows);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual([chapters[1]]);
    expect(await entries.get(cacheKey(path))!.clone().json()).toEqual(rows);
  });

  it('retains equal or newer cached source dates even with an older cache-write timestamp and sibling metadata', async () => {
    for (const updated_at of [bundledDate, '2026-11-29T00:00:00Z']) {
      const detail = { ...article, updated_at, noi_dung: 'Equal or newer cached detail' };
      remember('/api/articles/fixture-book', detail);
      expect(await (await readOfflineApiResponse(url('/api/articles/fixture-book')))?.json()).toEqual(detail);
      const path = '/api/articles/fixture-book/chapters?so_thu_tu=eq.0';
      const rows = [{ ...chapters[0], updated_at, noi_dung: 'Equal or newer cached chapter' }];
      remember('/api/articles/fixture-book', { ...article, updated_at: oldDate });
      remember(path, rows);
      expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(rows);
    }
  });

  it('retains an undated or invalid-date cache instead of treating its write timestamp as a content version', async () => {
    for (const updated_at of [undefined, 'not-a-date']) {
      const detail = { ...article, updated_at, noi_dung: 'Undated cached content' };
      remember('/api/articles/fixture-book', detail);
      expect(await (await readOfflineApiResponse(url('/api/articles/fixture-book')))?.json()).toEqual(detail);
      const path = '/api/articles/fixture-book/chapters?so_thu_tu=eq.0';
      const rows = [{ so_thu_tu: 0, updated_at, noi_dung: 'Undated cached chapter' }];
      remember(path, rows);
      expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(rows);
    }
  });

  it('retains unbundled content and a cached new chapter that is absent from the shipped book', async () => {
    const unbundled = '/api/articles/not-bundled';
    const remote = { id: 'not-bundled', tieu_de: 'Saved remote book', updated_at: oldDate };
    remember(unbundled, remote);
    expect(await (await readOfflineApiResponse(url(unbundled)))?.json()).toEqual(remote);
    const path = '/api/articles/fixture-book/chapters?so_thu_tu=eq.99';
    const rows = [{ id: 'new-chapter', so_thu_tu: 99, updated_at: oldDate, noi_dung: 'Chapter not in the app bundle' }];
    remember(path, rows);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(rows);
  });

  it('preserves equal and newer manually saved packages before reading any generic cache or bundle', async () => {
    const path = '/api/articles/fixture-book/chapters?so_thu_tu=eq.0';
    remember(path, [{ ...chapters[0], updated_at: oldDate, noi_dung: 'Old generic cache' }]);
    for (const updated_at of [bundledDate, '2026-11-29T00:00:00Z']) {
      const rows = [{ ...chapters[0], updated_at, noi_dung: 'Explicitly saved package' }];
      saved = Response.json(rows);
      expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(rows);
    }
    expect(match).not.toHaveBeenCalled();
    expect(resolveBundle).not.toHaveBeenCalled();
  });

  it('does not apply article freshness rules to another public cache domain', async () => {
    const path = '/api/talks/fixture-book';
    const album = { id: article.id, tieu_de: 'Cached talk', updated_at: oldDate, visibility: 'public' };
    remember(path, album);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(album);
    expect(resolveBundle).not.toHaveBeenCalled();
  });

  it('retains undated changed chapter content despite independently cached older article metadata', async () => {
    remember('/api/articles/fixture-book', { ...article, updated_at: oldDate });
    const path = '/api/articles/fixture-book/chapters?so_thu_tu=eq.0';
    const rows = [{ ...chapters[0], noi_dung: 'Remote revision saved after the parent metadata, with no source date' }];
    remember(path, rows);
    expect(await (await readOfflineApiResponse(url(path)))?.json()).toEqual(rows);
    expect(await entries.get(cacheKey(path))!.clone().json()).toEqual(rows);
  });

  it('retains an undated complete cached table of contents with an additional forty-first chapter', async () => {
    remember('/api/articles/fixture-book', { ...article, updated_at: oldDate });
    const path = '/api/articles/fixture-book/chapters?order=so_thu_tu.asc&limit=5000';
    const rows = Array.from({ length: 41 }, (_, so_thu_tu) => ({
      id: `chapter-${so_thu_tu}`, bai_viet_id: article.id, so_thu_tu,
      tieu_de: `Chapter ${so_thu_tu + 1}`, noi_dung: `Saved chapter ${so_thu_tu + 1}`,
    }));
    remember(path, rows);
    const response = await readOfflineApiResponse(url(path));
    const restored = await response?.json();
    expect(restored).toEqual(rows);
    expect(restored).toHaveLength(41);
  });
});
