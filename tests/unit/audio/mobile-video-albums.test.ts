import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTalkAlbums } from '../../../src/lib/browser/content-catalogs';
import { getOfflineTalks } from '../../../src/lib/browser/offline-bundled-resolver';
import { captureTalkCatalogScope, saveCachedTalkAlbums } from '../../../src/lib/browser/talk-catalog-cache';
import { isIosExcludedContent } from '../../../src/lib/domain/ios-content-policy';

vi.mock('../../../src/lib/browser/talk-catalog-cache', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/lib/browser/talk-catalog-cache')>();
  return { ...actual, saveCachedTalkAlbums: vi.fn(actual.saveCachedTalkAlbums) };
});

const ids = ['pt_drive_f72e42f4cbb7db4312f96f4a1f28e2b4', 'pt_drive_c435791b562e6f6e9d345b414df4a273'];
const bundled = JSON.parse(readFileSync('static/offline-data/talks.json', 'utf8'));
const landscapeAlbumId = 'pt_drive_0cbcd85f1caa5411a50fb3edf38156d3';
vi.mock('../../../src/lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: () => 'android' }));
vi.mock('../../../src/lib/browser/native-api', () => ({ resolveApiUrl: (path: string) => path, isHtmlResponse: () => false }));
vi.mock('../../../src/lib/browser/offline-bundled-resolver', () => ({
  getOfflineTalks: vi.fn(async () => bundled),
}));

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('mobile streaming talk additions', () => {
  it('shows all public bundled additions over an older installed catalog without replacing its data', async () => {
    const bundledIds = bundled.filter((row: { visibility?: string; tracks?: unknown[] }) =>
      row.visibility === 'public' && row.tracks?.length && !isIosExcludedContent(row),
    ).map((row: { id: string }) => row.id);
    const existingId = 'pt_bao_ung_hien_doi';
    const cachedOnly = { id: 'cached-only', tieu_de: 'Album còn trong cache', visibility: 'public',
      tracks: [{ title: 'Bài đã lưu', url: '/saved.mp3' }] };
    const cachedEdition = { ...cachedOnly, id: existingId, anh_dai_dien: 'covers/newer-admin-cover.webp' };
    await saveCachedTalkAlbums([cachedOnly, cachedEdition]);
    vi.mocked(saveCachedTalkAlbums).mockClear();
    vi.mocked(getOfflineTalks).mockResolvedValueOnce([
      ...bundled, { ...cachedOnly, id: 'bundled-private', visibility: 'private' },
    ]);

    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher);
    expect(albums.map(album => album.id).sort()).toEqual([...bundledIds, cachedOnly.id].sort());
    expect(albums.find(album => album.id === existingId)).toMatchObject(cachedEdition);
    expect(fetcher).not.toHaveBeenCalled();
    expect(saveCachedTalkAlbums).not.toHaveBeenCalled();
  });

  it('uses bundled tracks when a cached row for the same album is incomplete', async () => {
    const packaged = bundled.find((row: { id: string }) => row.id === 'pt_drive_1cf7f2c6a482093d3039c76b8a4ee9b5');
    await saveCachedTalkAlbums([{ ...packaged, tracks: '[' }]);
    const fetcher = vi.fn();

    const albums = (await fetchTalkAlbums(fetcher)).filter(album => album.id === packaged.id);
    expect(albums).toHaveLength(1);
    expect(albums[0].tracks).toHaveLength(packaged.tracks.length);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not restore an incomplete cached private album from an older public bundle', async () => {
    const packaged = bundled.find((row: { id: string }) => row.id === 'pt_drive_1cf7f2c6a482093d3039c76b8a4ee9b5');
    const user = { id: 'catalog-admin', email: '', avatarUrl: '', displayName: 'Admin', role: 'admin' };
    const scope = captureTalkCatalogScope(user.id, user.role);
    await saveCachedTalkAlbums([{ ...packaged, visibility: 'private', tracks: [] }], scope);
    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher, undefined, {
      authenticated: true, user, csrfToken: null, expiresAt: null,
    });

    expect(albums.some(album => album.id === packaged.id)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('can read its bundled albums when a legacy cached list contains a null row', async () => {
    localStorage.setItem('quangtu_cached_talk_catalog_v1', JSON.stringify([null]));
    const fetcher = vi.fn();

    expect(await fetchTalkAlbums(fetcher)).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids[0] })]));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns the bundled catalog while the cache write is still pending', async () => {
    let finishWrite!: () => void;
    vi.mocked(saveCachedTalkAlbums).mockImplementationOnce(() => new Promise<void>(resolve => { finishWrite = resolve; }));
    try {
      const albums = await fetchTalkAlbums(vi.fn());
      expect(albums.some(album => album.id === ids[0])).toBe(true);
      expect(finishWrite).toBeTypeOf('function');
    } finally { finishWrite?.(); }
  });
  it('ships metadata for 216 audio and 60 video tracks with original remote identities', async () => {
    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    const audio = albums.find(album => album.id === ids[0])!;
    const video = albums.find(album => album.id === ids[1])!;
    expect(audio.tracks).toHaveLength(216);
    expect(video.tracks).toHaveLength(60);
    expect(video.tracks.every(track => track.media_type === 'video')).toBe(true);
    expect(video.tracks.every(track => track.url.startsWith('/api/audio/drive/'))).toBe(true);
    expect(video.tracks.every(track => !('audio_url' in track))).toBe(true);
    expect(audio.tracks.every(track => !track.media_type)).toBe(true);
  });

  it('ships the same real 16-video album and packaged cover for web and native without source or audio sidecars', async () => {
    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher);
    const album = albums.find(item => item.id === landscapeAlbumId)!;
    const webRows = JSON.parse(readFileSync('src/lib/data/offline-talks.json', 'utf8'));
    const packaged = bundled.find((item: { id: string }) => item.id === landscapeAlbumId);
    expect(webRows.find((item: { id: string }) => item.id === landscapeAlbumId)).toEqual(packaged);
    expect(album).toMatchObject({
      tieu_de: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN',
      dien_gia: 'Vũ Tiến Dũng',
      visibility: 'public',
      anh_dai_dien: 'covers/kinh-dia-tang-vu-tien-dung.webp',
    });
    expect(existsSync(`static/${album.anh_dai_dien}`)).toBe(true);
    expect(album.tracks).toHaveLength(16);
    expect(album.tracks).toEqual(packaged.tracks);
    expect(new Set(album.tracks.map(track => track.url)).size).toBe(16);
    expect(album.tracks.map(track => Number(track.title.match(/^PHẨM (\d+)/u)?.[1]))).toEqual([
      1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10, 11, 12, 13,
    ]);
    for (const track of album.tracks) {
      expect(track.title).toMatch(/^PHẨM \d+: \S/u);
      expect(track).toMatchObject({ media_type: 'video', aspect_ratio: '16:9' });
      expect(track.url).toMatch(/^\/api\/audio\/drive\/[A-Za-z0-9_-]+$/u);
      expect(track.duration_sec).toBeGreaterThan(0);
      expect(track).not.toHaveProperty('audio_url');
    }
    expect(JSON.stringify(packaged)).not.toMatch(/youtube|nammodiatangvuongbotat99|Tiến Dũng AI|source_url|source_channel/iu);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('completes shortened Địa Tạng video chapter names from an installed catalog without rewriting it', async () => {
    const packaged = bundled.find((item: { id: string }) => item.id === landscapeAlbumId);
    const old = { ...packaged, tracks: JSON.stringify([
      { ...packaged.tracks[9], title: 'PHẨM 8 (PHẦN 1)' },
      { ...packaged.tracks[10], title: 'Phẩm 8: Tên đã được biên tập (Phần 2)' },
    ]) };
    await saveCachedTalkAlbums([old, { ...old, id: 'different-album' }]);
    vi.mocked(saveCachedTalkAlbums).mockClear();
    const fetcher = vi.fn();

    const albums = await fetchTalkAlbums(fetcher);
    expect(albums.find(album => album.id === landscapeAlbumId)?.tracks).toEqual([
      packaged.tracks[9],
      { ...packaged.tracks[10], title: 'Phẩm 8: Tên đã được biên tập (Phần 2)' },
    ]);
    expect(albums.find(album => album.id === 'different-album')?.tracks[0].title).toBe('PHẨM 8 (PHẦN 1)');
    expect(fetcher).not.toHaveBeenCalled();
    expect(saveCachedTalkAlbums).not.toHaveBeenCalled();
  });

  it('adds the real 16-video album once to an older native cache without replacing old metadata or fetching', async () => {
    const oldTracks = [{ title: 'Nội dung cũ đã lưu', url: '/old-preserved.mp3' }];
    await saveCachedTalkAlbums([{
      id: 'installed-old-album',
      tieu_de: 'Album trong bản app cũ',
      dien_gia: 'Tác giả cũ',
      anh_dai_dien: 'covers/user-kept-cover.webp',
      visibility: 'public',
      tracks: oldTracks,
    }]);
    const fetcher = vi.fn();
    for (let opened = 0; opened < 2; opened += 1) {
      const albums = await fetchTalkAlbums(fetcher);
      expect(albums.filter(album => album.id === landscapeAlbumId)).toHaveLength(1);
      expect(albums.find(album => album.id === landscapeAlbumId)?.tracks).toEqual(
        bundled.find((album: { id: string }) => album.id === landscapeAlbumId).tracks,
      );
      expect(albums.find(album => album.id === 'installed-old-album')).toMatchObject({
        tieu_de: 'Album trong bản app cũ',
        dien_gia: 'Tác giả cũ',
        anh_dai_dien: 'covers/user-kept-cover.webp',
        tracks: oldTracks,
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('adds the two bundled albums to an installed cache without refetching or replacing old rows', async () => {
    await saveCachedTalkAlbums([{ id: 'existing', tieu_de: 'Existing', tracks: [{ title: 'Old', url: '/old.mp3' }] }]);
    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher);
    expect(albums.map(album => album.id)).toEqual(expect.arrayContaining([...ids, 'existing']));
    expect(albums.find(album => album.id === 'existing')?.tracks[0].url).toBe('/old.mp3');
    expect(fetcher).not.toHaveBeenCalled();
    expect(bundled.filter((album: { id: string }) => ids.includes(album.id))).toHaveLength(2);
  });

  it('retains approved landscape video metadata from an installed cache without changing legacy tracks or fetching', async () => {
    await saveCachedTalkAlbums([{
      id: 'landscape-cache',
      tieu_de: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN',
      dien_gia: 'Vũ Tiến Dũng',
      visibility: 'public',
      tracks: JSON.stringify([
        { title: 'PHẨM 1', url: '/video-1.mp4', media_type: 'video', aspect_ratio: '16:9', duration_sec: 298 },
        { title: 'Video cũ', url: '/video-old.mp4', media_type: 'video', aspect_ratio: '4:3' },
        { title: 'Audio cũ', url: '/audio-old.mp3', aspect_ratio: '16:9' },
      ]),
    }]);
    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher);
    expect(albums.find(album => album.id === 'landscape-cache')).toMatchObject({
      dien_gia: 'Vũ Tiến Dũng',
      tracks: [
        { title: 'PHẨM 1', url: '/video-1.mp4', media_type: 'video', aspect_ratio: '16:9', duration_sec: 298 },
        { title: 'Video cũ', url: '/video-old.mp4', media_type: 'video' },
        { title: 'Audio cũ', url: '/audio-old.mp3' },
      ],
    });
    const tracks = albums.find(album => album.id === 'landscape-cache')!.tracks;
    expect(tracks[1]).not.toHaveProperty('aspect_ratio');
    expect(tracks[2]).not.toHaveProperty('media_type');
    expect(tracks[2]).not.toHaveProperty('aspect_ratio');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([null, 'covers/bao-ung-hien-doi-tap-1-20261022.webp', 'covers/newer-admin-cover.webp'])(
    'uses the packaged Báo Ứng Hiện Đời cover only for an old cached cover (%s)',
    async (cover) => {
      const id = 'pt_bao_ung_hien_doi';
      const packaged = bundled.find((album: { id: string }) => album.id === id);
      const tracks = [{ title: 'Cached track', url: '/cached.mp3' }];
      await saveCachedTalkAlbums([
        ...bundled.filter((album: { id: string }) => ids.includes(album.id)),
        { id, tieu_de: 'Báo Ứng Hiện Đời', anh_dai_dien: cover, tracks },
      ]);
      const fetcher = vi.fn();
      const albums = await fetchTalkAlbums(fetcher);
      expect(albums.find(album => album.id === id)).toMatchObject({
        anh_dai_dien: cover === 'covers/newer-admin-cover.webp' ? cover : packaged.anh_dai_dien,
        tracks,
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
