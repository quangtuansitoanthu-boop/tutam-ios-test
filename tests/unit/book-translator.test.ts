import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.stubGlobal('navigator', { onLine: true }); });
afterEach(() => vi.unstubAllGlobals());
const translator = () => import('../../src/lib/browser/book-translator');

it('returns original content after a failed chunk without caching the successful partial translation', async () => {
  const body = `${'Đoạn một '.repeat(170)}\n${'Đoạn hai '.repeat(170)}`;
  const fetcher = vi.fn(async (url: string) => {
    const source = new URL(url).searchParams.get('q')!;
    return source.startsWith('Đoạn hai') ? new Response('', { status: 429 }) : Response.json([`English ${source.length}`]);
  });
  vi.stubGlobal('fetch', fetcher);
  const api = await translator();
  expect(await api.getOrTranslateContent('retry', 'Tiêu đề', body)).toMatchObject({ content: body, isOriginal: true });
  expect(api.getCachedTranslationSync('retry')).toBeNull();
  fetcher.mockImplementation(async () => Response.json(['English translation']));
  expect(await api.getOrTranslateContent('retry', 'Tiêu đề', body)).toMatchObject({ isOriginal: false, fromCache: false });
  expect(api.getCachedTranslationSync('retry')?.content).toContain('English translation');
  const calls = fetcher.mock.calls.length;
  expect(await api.getOrTranslateContent('retry', 'Tiêu đề', body)).toMatchObject({ fromCache: true });
  expect(fetcher).toHaveBeenCalledTimes(calls);
});

it('retains the public text fallback and retries a previously cached Vietnamese body', async () => {
  const api = await translator();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ invalid: true })));
  expect(await api.translateText('Bản gốc')).toBe('Bản gốc');
  await api.setCachedTranslation('poisoned', 'Translated title', 'Bản gốc');
  expect(await api.getOrTranslateContent('poisoned', 'Tựa đề', 'Bản gốc')).toMatchObject({ isOriginal: true, fromCache: false });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(['Translated successfully'])));
  expect(await api.getOrTranslateContent('poisoned', 'Tựa đề', 'Bản gốc')).toMatchObject({ isOriginal: false, fromCache: false });
});

it('writes chapter translations under the key shared with preload and reads the old double suffix', async () => {
  const api = await translator();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(['0|||Introduction\n1|||Practice'])));
  const chapters = [{ id: 'a', tieu_de: 'Mở đầu' }, { id: 'b', tieu_de: 'Thực hành' }];
  const translated = await api.getOrTranslateChapters('book', chapters);
  expect(translated).toEqual({ a: { tieu_de: 'Introduction' }, b: { tieu_de: 'Practice' } });
  expect(await api.getCachedTranslation('book_chapters')).toMatchObject({ content: JSON.stringify(translated) });
  expect(await api.getCachedTranslation('book_chapters_en')).toBeNull();
  await api.setCachedTranslation('legacy_chapters_en', 'Chapters Translation', JSON.stringify(translated));
  vi.stubGlobal('fetch', vi.fn());
  expect(await api.getOrTranslateChapters('legacy', chapters)).toEqual(translated);
  expect(await api.getCachedTranslation('legacy_chapters')).toMatchObject({ content: JSON.stringify(translated) });
  expect(fetch).not.toHaveBeenCalled();
});

it('does not cache failed or incomplete chapter lists', async () => {
  const api = await translator();
  const chapters = [{ id: 'a', tieu_de: 'Mở đầu' }, { id: 'b', tieu_de: 'Thực hành' }];
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
  expect(await api.getOrTranslateChapters('partial', chapters)).toEqual({});
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(['0|||Introduction'])));
  await api.getOrTranslateChapters('partial', chapters);
  expect(api.getCachedChaptersSync('partial')).toBeNull();
  expect(await api.getCachedTranslation('partial_chapters')).toBeNull();
});
