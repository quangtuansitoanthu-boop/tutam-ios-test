import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeAudioState, NativeTalkAudio } from '../../../src/lib/browser/native-talk-audio';
const bridge = vi.hoisted(() => ({ plugin: {} as any, platform: 'android' }));
vi.mock('@capacitor/core', async original => ({
  ...await original<object>(),
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => bridge.plugin,
}));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: () => bridge.platform }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({
  resolveOfflineBundledResponse: async () => null,
  getOfflineTalks: async () => [],
}));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url, isHtmlResponse: () => false }));
vi.mock('$lib/browser/offline-audio-database', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/browser/offline-audio-database')>();
  const authorize: typeof actual.canAccessAudioAlbum = (album, access) => album.id === 'native-three' ? Promise.resolve(true) : actual.canAccessAudioAlbum(album, access);
  return { ...actual, canAccessAudioAlbum: authorize, getOfflineTrack: vi.fn(async () => null), getOfflineTracksForAlbum: vi.fn(async () => []) };
});
vi.mock('$lib/browser/media-session', () => ({ configureMediaSession: () => () => {}, updateMediaSessionMetadata() {}, updateMediaSessionPositionState() {}, updateMediaSessionPlaybackState() {} }));
import { AudioPlayerController } from '../../../src/lib/browser/audio-player-controller';
import { getOfflineTrack, getOfflineTracksForAlbum } from '../../../src/lib/browser/offline-audio-database';
import { fetchTalkAlbums } from '../../../src/lib/browser/content-catalogs';
import publicTalkStreams from '$lib/data/public-talk-streams.json';
import { markVerifiedTalkCatalog } from '$lib/browser/talk-catalog-proof';

const album = { id: 'native-three', title: 'Album', description: '', tracks: [0, 1, 2].map(i => ({ title: `Part ${i}`, url: `https://media.quangtu.vn/${i}.mp3` })) };
let state: NativeAudioState;
let publish: (state: NativeAudioState) => void;
let controller: AudioPlayerController;
describe.each(['android', 'ios'])('native playback on %s', platform => {
beforeEach(() => {
  vi.mocked(getOfflineTrack).mockReset().mockResolvedValue(null);
  vi.mocked(getOfflineTracksForAlbum).mockReset().mockResolvedValue([]);
  bridge.platform = platform;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { baseURI: 'https://localhost', visibilityState: 'visible' }));
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) });
  vi.stubGlobal('MediaError', { MEDIA_ERR_ABORTED: 1, MEDIA_ERR_NETWORK: 2 });
  state = { queueId: 'existing', album, trackIndex: 0, position: 4, duration: 12,
    playing: true, playWhenReady: true, buffering: false, ended: false, speed: 1.5,
    volume: 0.4, repeat: 2, error: '', sleepRemainingMs: 0, sleepAtEnd: false };
  Object.assign(bridge.plugin, {
    addListener: vi.fn(async (_: string, listener: typeof publish) => { publish = listener; return { remove: vi.fn() }; }),
    peek: vi.fn(async () => state), getState: vi.fn(async () => state),
    setQueue: vi.fn(async (options: any) => (state = { ...state, queueId: options.queueId, trackIndex: options.index, position: options.position, playing: false, playWhenReady: false, ended: false })),
    options: vi.fn(async (options: any) => (state = { ...state, ...options })),
    play: vi.fn(async () => (state = { ...state, playing: true, playWhenReady: true })),
    pause: vi.fn(async () => (state = { ...state, playing: false, playWhenReady: false })),
    seek: vi.fn(async (options: any) => (state = { ...state, ...options, ended: false })),
    sleep: vi.fn(async () => state), stop: vi.fn(async () => ({ ...state, queueId: '' })),
    cacheStatus: vi.fn(async () => ({ bytes: 0 })), cacheChunk: vi.fn(async () => undefined),
  });
  controller = new AudioPlayerController();
});
afterEach(async () => {
  controller.destroy();
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
  vi.unstubAllGlobals();
});

it('resumes a visible video on lock only after the native pause acknowledgement and honors the next lock-screen pause', async () => {
  await controller.ready;
  const url = album.tracks[0].url;
  await controller.playTrack({ ...album, tracks: [{ ...album.tracks[0], media_type: 'video' }] });
  bridge.plugin.play.mockClear();
  let finishPause!: () => void;
  bridge.plugin.pause.mockImplementationOnce(() => new Promise<NativeAudioState>(resolve => {
    finishPause = () => resolve(state = { ...state, playing: false, playWhenReady: false });
  }));
  const release = controller.holdVideoPlayback(url);
  await vi.waitFor(() => expect(finishPause).toBeTypeOf('function'));
  Object.assign(document, { visibilityState: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  release();
  expect(bridge.plugin.play).not.toHaveBeenCalled();
  finishPause();
  await vi.waitFor(() => expect(bridge.plugin.play).toHaveBeenCalledOnce());
  expect(controller.snapshot.playing).toBe(true);
  publish(state = { ...state, playing: false, playWhenReady: false });
  expect(controller.videoPlaybackRequested).toBe(false);
  expect(controller.snapshot.playing).toBe(false);
});

it('cancels a queued native resume when the user pauses before the frame hold pause is acknowledged', async () => {
  await controller.ready;
  const url = album.tracks[0].url;
  await controller.playTrack({ ...album, tracks: [{ ...album.tracks[0], media_type: 'video' }] });
  let finishPause!: () => void;
  bridge.plugin.pause.mockImplementationOnce(() => new Promise<NativeAudioState>(resolve => {
    finishPause = () => resolve(state = { ...state, playing: false, playWhenReady: false });
  }));
  bridge.plugin.play.mockClear();
  const release = controller.holdVideoPlayback(url);
  await vi.waitFor(() => expect(finishPause).toBeTypeOf('function'));
  release();
  controller.pause();
  finishPause();
  await vi.waitFor(() => expect(bridge.plugin.pause).toHaveBeenCalledTimes(2));
  expect(bridge.plugin.play).not.toHaveBeenCalled();
  expect(controller.snapshot.playing).toBe(false);
});

it('keeps a video paused when the native sleep timer expires during alignment', async () => {
  await controller.ready;
  const url = album.tracks[0].url;
  await controller.playTrack({ ...album, tracks: [{ ...album.tracks[0], media_type: 'video' }] });
  publish(state = { ...state, sleepRemainingMs: 150 });
  const release = controller.holdVideoPlayback(url);
  await vi.waitFor(() => expect(bridge.plugin.pause).toHaveBeenCalled());
  publish(state = { ...state, sleepRemainingMs: 0, playing: false, playWhenReady: false });
  bridge.plugin.play.mockClear();
  release();
  expect(controller.videoPlaybackRequested).toBe(false);
  expect(controller.snapshot.playing).toBe(false);
  expect(bridge.plugin.play).not.toHaveBeenCalled();
});

it('awaits the frame hold pause discovered by a foreground refresh of a stale paused clock', async () => {
  await controller.ready;
  const url = album.tracks[0].url;
  await controller.load({ ...album, tracks: [{ ...album.tracks[0], media_type: 'video' }] });
  const audio = controller.audio as NativeTalkAudio;
  expect(audio.paused).toBe(true);
  const release = controller.holdVideoPlayback(url);
  let finishPause!: () => void;
  bridge.plugin.pause.mockImplementationOnce(() => new Promise<NativeAudioState>(resolve => {
    finishPause = () => resolve(state = { ...state, playing: false, playWhenReady: false, position: 52.3 });
  }));
  state = { ...state, playing: true, playWhenReady: true, position: 52 };
  document.dispatchEvent(new Event('visibilitychange'));
  const observed = vi.fn(() => audio.currentTime);
  const ready = audio.refreshVideoPosition().then(observed);
  await vi.waitFor(() => expect(finishPause).toBeTypeOf('function'));
  expect(observed).not.toHaveBeenCalled();
  finishPause();
  expect(await ready).toBe(52.3);
  expect(bridge.plugin.getState).toHaveBeenCalledOnce();
  controller.pause();
  release();
});

it('switches the native queue to Archive and Drive at the interrupted position', async () => {
  await controller.ready;
  const [albumId, files] = Object.entries(publicTalkStreams)[0];
  const [id, archive] = Object.entries(files)[0];
  const url = `/api/audio/drive/${id}`;
  await controller.playTrack(markVerifiedTalkCatalog({ ...album, id: albumId, visibility: 'public', tracks: [{ title: 'Talk', url }] }, { authenticated: false, user: null }));
  publish({ ...state, playing: false, playWhenReady: false, position: 42, error: 'HTTP 429' });
  await vi.waitFor(() => expect(bridge.plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({
    position: 42, tracks: [{ title: 'Talk', url: archive }],
  })));
  await vi.waitFor(() => expect(controller.snapshot.playing).toBe(true));
  publish({ ...state, playing: false, playWhenReady: false, position: 49, error: 'Archive disconnected' });
  await vi.waitFor(() => expect(bridge.plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({
    position: 49, tracks: [{ title: 'Talk', url: expect.stringContaining('drive.usercontent.google.com') }],
  })));
  expect(controller.snapshot.album?.tracks[0].url).toBe(url);
});

it('resumes the Archive-first Báo Ứng Hiện Đời queue on Drive without changing the catalog URL', async () => {
  await controller.ready;
  const albumId = 'pt_bao_ung_hien_doi';
  const [driveId, url] = Object.entries(publicTalkStreams[albumId])[0];
  const track = { title: 'Tập 1 · Phần 1', url };
  const current = markVerifiedTalkCatalog({
    ...album, id: albumId, visibility: 'public', tracks: [track],
  }, { authenticated: false, user: null });
  await controller.playTrack(current);
  expect(bridge.plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({ tracks: [track] }));
  publish({ ...state, playing: false, playWhenReady: false, position: 42, error: 'Archive disconnected' });
  await vi.waitFor(() => expect(bridge.plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({
    position: 42,
    tracks: [{ ...track, url: `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t` }],
  })));
  await vi.waitFor(() => expect(controller.snapshot.playing).toBe(true));
  expect(controller.snapshot.album?.tracks[0].url).toBe(url);
});

it('recovers a Báo Ứng Hiện Đời queue already playing on Drive with its Archive catalog URL', async () => {
  await controller.ready;
  controller.destroy();
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
  bridge.plugin.stop.mockClear();
  const albumId = 'pt_bao_ung_hien_doi';
  const [driveId, archive] = Object.entries(publicTalkStreams[albumId])[0];
  const url = `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
  const playingAlbum = { ...album, id: albumId, visibility: 'public' as const, tracks: [{ title: 'Tập 1 · Phần 1', url }] };
  bridge.plugin.peek.mockResolvedValueOnce({
    ...state, album: playingAlbum, position: 87, playing: true, playWhenReady: true, ended: false,
  });
  controller = new AudioPlayerController();
  await controller.ready;
  expect(controller.snapshot).toMatchObject({
    playing: true, currentTime: 87, album: { id: albumId, tracks: [{ title: 'Tập 1 · Phần 1', url: archive }] },
  });
  expect(bridge.plugin.setQueue).not.toHaveBeenCalled();
});

it('uses a finite root lease for rosary without repeating the completion bells', async () => {
  await controller.ready;
  const onState = vi.fn(), interrupted = vi.fn();
  const lease = await controller.beginPracticePlayback({ ...album, id: 'practice:rosary' }, 1, onState, interrupted, undefined, { finite: true });
  expect(lease).not.toBeNull();
  expect(bridge.plugin.options).toHaveBeenCalledWith({ repeat: 0 });
  expect(bridge.plugin.sleep).toHaveBeenLastCalledWith({ remainingMs: 0, atEnd: false });
  publish({ ...state, position: 108, ended: true, playWhenReady: false });
  expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ position: 108, ended: true }));
  lease?.stop();
  expect(interrupted).toHaveBeenCalledOnce();
});

it('restores repeat, speed and volume from the running service rather than resetting its queue', async () => {
  await controller.ready;
  expect(controller.snapshot).toMatchObject({ repeat: 2, speed: 1.5, volume: 0.4, playing: true, currentTime: 4 });
  expect(bridge.plugin.setQueue).not.toHaveBeenCalled();
  controller.cycleRepeat();
  await vi.waitFor(() => expect(bridge.plugin.options).toHaveBeenCalledWith({ repeat: 0 }));
});

it('does not migrate a private album into the guest native queue', async () => {
  await controller.ready;
  const privateAlbum = { ...album, visibility: 'private' as const };
  vi.mocked(getOfflineTrack).mockResolvedValue({ url: album.tracks[0].url, albumId: album.id, title: 'Private track', blob: new Blob(['private bytes']), downloadedAt: 1 });
  expect(await controller.load(privateAlbum)).toBe(false);
  expect(bridge.plugin.cacheChunk).not.toHaveBeenCalled();
  expect(bridge.plugin.setQueue).not.toHaveBeenCalled();
});

it('stops a private native queue when the same account loses its privileged role', async () => {
  await controller.ready;
  controller.setSession({ authenticated: true, csrfToken: 'test', user: { id: 'same-account', role: 'admin' } });
  expect(await controller.load({ ...album, visibility: 'private' })).toBe(true);
  await controller.play();
  bridge.plugin.stop.mockClear();
  controller.setSession({ authenticated: true, csrfToken: 'new-token', user: { id: 'same-account', role: 'user' } });
  expect(controller.snapshot.album).toBeNull();
  expect(controller.snapshot.playing).toBe(false);
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
});

it('keeps the current public native queue through same-identity token refresh', async () => {
  await controller.ready;
  controller.setSession({ authenticated: true, csrfToken: 'first', user: { id: 'same-account', role: 'admin' } });
  expect(await controller.load(album)).toBe(true);
  await controller.play();
  bridge.plugin.stop.mockClear();
  controller.setSession({ authenticated: true, csrfToken: 'refreshed', user: { id: 'same-account', role: 'admin' } });
  expect(controller.snapshot.album?.id).toBe(album.id);
  expect(controller.snapshot.playing).toBe(true);
  expect(bridge.plugin.stop).not.toHaveBeenCalled();
});

it('streams a current public catalog album even when catalog persistence is blocked and no bundle exists', async () => {
  await controller.ready;
  const write = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key.startsWith('quangtu_cached_talk_catalog') || key.startsWith('quangtu_talk_catalog_meta')) {
      throw new DOMException('Storage blocked', 'QuotaExceededError');
    }
    write(key, value);
  });
  const fetched = await fetchTalkAlbums(vi.fn(async () => Response.json([{
    id: 'new-public-online', tieu_de: 'New public online', visibility: 'public',
    tracks: [{ title: 'Public online track', url: 'https://media.quangtu.vn/new-public-online.mp3' }],
  }])) as typeof fetch);
  const current = fetched.find(item => item.id === 'new-public-online')!;
  expect(current).toBeDefined();
  const descriptor = { ...current, title: current.tieu_de, description: current.mo_ta || '', tracks: current.tracks };
  expect(await controller.load(descriptor)).toBe(true);
  expect(bridge.plugin.setQueue).toHaveBeenCalledWith(expect.objectContaining({ albumId: 'new-public-online' }));
});

it('does not stop a newer allowed queue when a stale recovery returns a restricted album', async () => {
  await controller.ready;
  controller.destroy();
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
  bridge.plugin.stop.mockClear();
  vi.stubEnv('VITE_CONTENT_PLATFORM', 'ios');
  const restricted = { ...state, album: { ...album, id: 'pt_1782208869321' } };
  let release!: (value: NativeAudioState) => void;
  bridge.plugin.peek.mockImplementationOnce(() => new Promise<NativeAudioState>(resolve => { release = resolve; }));
  controller = new AudioPlayerController();
  try {
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await controller.playTrack(album);
    expect(controller.snapshot.album?.id).toBe(album.id);
    expect(controller.snapshot.playing).toBe(true);
    release(restricted);
    await controller.ready;
    expect(controller.audio.src).not.toBe('');
    expect(controller.snapshot.album?.id).toBe(album.id);
    expect(bridge.plugin.stop).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

it('restores the previous volume after muting and unmuting a recovered player', async () => {
  await controller.ready;
  controller.toggleMute(); controller.toggleMute();
  await vi.waitFor(() => expect(bridge.plugin.options).toHaveBeenLastCalledWith({ volume: 0.4 }));
});

it('observes autonomous screen-off track advances and final stop without replaying the native queue', async () => {
  await controller.ready;
  publish({ ...state, trackIndex: 1, position: 1 });
  expect(controller.snapshot).toMatchObject({ trackIndex: 1, currentTime: 1, playing: true });
  publish({ ...state, trackIndex: 2, position: 12, playing: false, playWhenReady: false, ended: true });
  expect(controller.snapshot).toMatchObject({ trackIndex: 2, playing: false });
  expect(bridge.plugin.setQueue).not.toHaveBeenCalled();
  expect(bridge.plugin.play).not.toHaveBeenCalled();
});

it('offers Play after a native source error and retries on the first tap', async () => {
  await controller.ready;
  state = { ...state, playing: false, playWhenReady: true, buffering: false, error: 'Source error' };
  const waiting = vi.fn();
  controller.audio.addEventListener('waiting', waiting);
  publish(state);
  expect(controller.snapshot.playing).toBe(false);
  expect(controller.snapshot.error).toContain('Không thể phát bài');
  expect(controller.audio.paused).toBe(true);
  expect(waiting).not.toHaveBeenCalled();

  bridge.plugin.play.mockResolvedValueOnce({ ...state, error: '', buffering: true });
  await controller.play();
  expect(bridge.plugin.play).toHaveBeenCalledOnce();
  expect(controller.snapshot).toMatchObject({ playing: true, error: null });
  expect(waiting).toHaveBeenCalledOnce();
  publish({ ...state, error: '', playing: true });
  expect(controller.snapshot.playing).toBe(true);
});

it('restores a failed native session with its track and a Play action', async () => {
  await controller.ready;
  controller.destroy();
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
  bridge.plugin.stop.mockClear();
  state = { ...state, playing: false, playWhenReady: true, error: 'Source error' };
  controller = new AudioPlayerController();
  await controller.ready;
  expect(controller.snapshot).toMatchObject({ album, trackIndex: 0, playing: false, currentTime: 4 });
  expect(controller.audio.paused).toBe(true);
  expect(bridge.plugin.play).not.toHaveBeenCalled();
});

it('Play all replaces the complete native playlist, disables repeat-one, and starts at the first part', async () => {
  state.repeat = 1;
  await controller.ready;
  await controller.playAll(album);
  expect(bridge.plugin.setQueue).toHaveBeenCalledWith(expect.objectContaining({ tracks: album.tracks, index: 0, position: 0 }));
  expect(bridge.plugin.options).toHaveBeenCalledWith({ repeat: 0 });
  expect(controller.snapshot).toMatchObject({ trackIndex: 0, repeat: 0, playing: true });
});
});
