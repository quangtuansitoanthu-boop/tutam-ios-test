import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readOfflineApiResponse, storeApiResponse } from '../../src/lib/browser/native-api-cache';

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
