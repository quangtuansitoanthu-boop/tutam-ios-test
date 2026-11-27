import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ match: vi.fn() }));
vi.mock('$lib/browser/offline-response-cache', () => ({ openOfflineResponseCache: async () => ({ match: mocks.match }) }));
import { loadEnglishSingleArticleContent } from '../../src/lib/browser/english-pack';
const id = 'nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni';

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('navigator', { onLine: false }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('reads a single English article by alias without consulting a chapter package', async () => {
  const fetcher = vi.fn(async () => Response.json({ [id]: { noi_dung: '<p>English ritual</p>' } }));
  vi.stubGlobal('fetch', fetcher);
  expect(await loadEnglishSingleArticleContent(`book_${id}`)).toBe('<p>English ritual</p>');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(mocks.match).not.toHaveBeenCalled();
});

it.each(['missing', 'unavailable'])('uses an already saved English chapter when the legacy article map is %s', async mode => {
  const fetcher = vi.fn(async () => {
    if (mode === 'unavailable') throw new Error('asset unavailable');
    return Response.json({});
  });
  vi.stubGlobal('fetch', fetcher);
  mocks.match.mockImplementation(async (key: string) => key.startsWith(`/offline-data/chapters-en/${id}.json?`)
    ? Response.json([{ noi_dung: '<p>Saved English ritual</p>' }]) : undefined);
  expect(await loadEnglishSingleArticleContent(id)).toBe('<p>Saved English ritual</p>');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/offline-data/articles-en.json', expect.anything());
});

it('leaves untranslated articles and unavailable packages to the Vietnamese fallback', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  mocks.match.mockResolvedValue(undefined);
  expect(await loadEnglishSingleArticleContent('unknown-article')).toBeNull();
  expect(mocks.match).not.toHaveBeenCalled();
  expect(await loadEnglishSingleArticleContent(id)).toBeNull();
});

it('preserves cancellation after a map response arrives', async () => {
  const controller = new AbortController();
  const reason = new Error('reader changed');
  vi.stubGlobal('fetch', vi.fn(async () => {
    controller.abort(reason);
    return Response.json({ [id]: { noi_dung: '<p>Late response</p>' } });
  }));
  await expect(loadEnglishSingleArticleContent(id, controller.signal)).rejects.toBe(reason);
  expect(mocks.match).not.toHaveBeenCalled();
});

it.each(['android', 'ios'])('keeps excluded content out of the direct single-article loader on %s', async platform => {
  vi.stubEnv('VITE_CONTENT_PLATFORM', platform);
  vi.stubGlobal('fetch', vi.fn());
  expect(await loadEnglishSingleArticleContent('tt_tro_ve_tu_xu_tuyet')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
