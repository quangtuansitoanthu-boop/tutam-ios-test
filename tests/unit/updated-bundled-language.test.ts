import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ english: vi.fn(), saved: vi.fn(), hasEnglish: vi.fn(() => true) }));
vi.mock('$lib/browser/english-pack', () => ({ fetchEnglishChapters: mocks.english }));
vi.mock('$lib/domain/library/localized-article', () => ({ hasEnglishChapters: mocks.hasEnglish }));
vi.mock('$lib/browser/offline-content-packages', () => ({ readUpdatedContentResponse: mocks.saved, mergeUpdatedArticleRows: (rows: unknown) => rows }));
vi.mock('$lib/browser/ios-content-policy', () => ({ availableContent: (rows: unknown) => rows, blockedContentRequest: () => false }));

const vietnamese = [{ id: 'vi-new', so_thu_tu: 0, noi_dung: 'Bản Việt mới' }];
const english = [{ id: 'en-0', so_thu_tu: 0, noi_dung: 'English first' }, { id: 'en-1', so_thu_tu: 1, noi_dung: 'English second' }];
let locale: string;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); locale = 'en';
  mocks.hasEnglish.mockReturnValue(true);
  mocks.saved.mockImplementation(async () => Response.json(vietnamese));
  mocks.english.mockImplementation(async () => Response.json(english));
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'tutam_locale' ? locale : null });
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/offline-bundled-articles.json') return Response.json([{ id: 'book-a', tieu_de: 'Sách', has_muc_luc: 1, so_tap: 2 }]);
    throw new Error(`Unexpected request ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

it('prefers the existing English chapter pack to a newly downloaded Vietnamese snapshot', async () => {
  const { readUpdatedBundledContentResponse } = await import('$lib/browser/offline-bundled-resolver');
  const response = await readUpdatedBundledContentResponse(new URL('https://quangtu.vn/api/articles/book-a/chapters'));
  expect(await response!.json()).toEqual(english);
  expect(mocks.english).toHaveBeenCalledOnce();
});
it('keeps the same PostgREST chapter filter for the English pack', async () => {
  const { readUpdatedBundledContentResponse } = await import('$lib/browser/offline-bundled-resolver');
  const response = await readUpdatedBundledContentResponse(new URL('https://quangtu.vn/api/data/tap_noi_dung?bai_viet_id=eq.book-a&so_thu_tu=eq.1'));
  expect(await response!.json()).toEqual([english[1]]);
});
it.each(['unavailable', 'missing-chapter', 'vi', 'no-english'])('retains the updated Vietnamese fallback for %s', async mode => {
  if (mode === 'unavailable') mocks.english.mockRejectedValue(new Error('offline'));
  if (mode === 'vi') locale = 'vi';
  if (mode === 'no-english') mocks.hasEnglish.mockReturnValue(false);
  const { readUpdatedBundledContentResponse } = await import('$lib/browser/offline-bundled-resolver');
  const response = await readUpdatedBundledContentResponse(new URL(`https://quangtu.vn/api/articles/book-a/chapters${mode === 'missing-chapter' ? '?so_thu_tu=eq.99' : ''}`));
  expect(await response!.json()).toEqual(vietnamese);
  if (mode === 'vi' || mode === 'no-english') expect(mocks.english).not.toHaveBeenCalled();
});
