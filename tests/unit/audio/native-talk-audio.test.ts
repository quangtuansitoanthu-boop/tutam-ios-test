import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NativeTalkAudio, cacheNativeTalk, evictNativeTalkCache, nativeTalkUrl, type NativeAudioState } from '../../../src/lib/browser/native-talk-audio';

const album = { id: 'talks', title: 'Pháp thoại', description: 'Quang Từ', tracks: [
  { title: 'Bài một', url: 'https://media.quangtu.vn/one.mp3' },
  { title: 'Bài hai', url: 'https://media.quangtu.vn/two.mp3' },
] };
let state: NativeAudioState;
let publish: (state: NativeAudioState) => void;
let plugin: any;
beforeEach(() => {
  vi.stubGlobal('document', Object.assign(new EventTarget(), { baseURI: 'https://localhost', visibilityState: 'visible' }));
  state = { queueId: '', trackIndex: 0, position: 0, duration: 120, playing: false, playWhenReady: false,
    buffering: false, ended: false, speed: 1, volume: 1, error: '', sleepRemainingMs: 0, sleepAtEnd: false };
  plugin = {
    addListener: vi.fn(async (_: string, listener: typeof publish) => { publish = listener; return { remove: vi.fn() }; }),
    setQueue: vi.fn(async (options: any) => { state = { ...state, queueId: options.queueId, trackIndex: options.index, position: options.position }; return state; }),
    play: vi.fn(async () => (state = { ...state, playing: true, playWhenReady: true })),
    pause: vi.fn(async () => (state = { ...state, playing: false, playWhenReady: false })),
    stop: vi.fn(async () => ({ ...state, queueId: '' })),
    options: vi.fn(async (options: any) => (state = { ...state, ...options })),
    seek: vi.fn(async (options: any) => (state = { ...state, ...options })),
    sleep: vi.fn(async () => state),
    peek: vi.fn(async () => state),
    getState: vi.fn(async () => state),
  };
});
afterEach(() => vi.unstubAllGlobals());

it('orders native eviction after an existing write and before a replacement download of the same key', async () => {
  let releaseWrite!: () => void;
  const order: string[] = [];
  const cache = { cacheStatus: vi.fn(async () => ({ bytes: 0 })), cacheChunk: vi.fn(async () => {
    order.push('write');
    if (order.length === 1) await new Promise<void>(resolve => { releaseWrite = resolve; });
  }) };
  const eviction = { evictCache: vi.fn(async () => { order.push('evict'); }) };
  const key = album.tracks[0].url;
  const first = cacheNativeTalk(key, new Blob(['first']), cache);
  await vi.waitFor(() => expect(releaseWrite).toBeTypeOf('function'));
  const removing = evictNativeTalkCache([key, key], () => true, eviction);
  const next = cacheNativeTalk(key, new Blob(['next']), cache);
  expect(eviction.evictCache).not.toHaveBeenCalled();
  releaseWrite();
  await Promise.all([first, removing, next]);
  expect(order).toEqual(['write', 'evict', 'write']);
  expect(eviction.evictCache).toHaveBeenCalledWith({ keys: [key] });
});

it('does not evict cache for a stale principal or hide a native I/O failure', async () => {
  const eviction = { evictCache: vi.fn(async () => { throw new Error('disk failure'); }) };
  await expect(evictNativeTalkCache([album.tracks[0].url], () => false, eviction)).rejects.toMatchObject({ name: 'AbortError' });
  expect(eviction.evictCache).not.toHaveBeenCalled();
  await expect(evictNativeTalkCache([album.tracks[0].url], () => true, eviction)).rejects.toThrow('disk failure');
});

it('gives Android the entire playlist and restores the selected position', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 1, 42);
  expect(plugin.setQueue).toHaveBeenCalledWith(expect.objectContaining({ albumId: 'talks', tracks: album.tracks, index: 1, position: 42 }));
  await audio.play();
  expect(audio.currentTime).toBe(42);
  expect(audio.paused).toBe(false);
  audio.dispose();
});

it('maps bundled meditation to a local native asset instead of fetching it from the backend', () => {
  expect(nativeTalkUrl('https://localhost/assets/audio/nhac-thien-01.m4a'))
    .toBe('asset:///public/assets/audio/nhac-thien-01.m4a');
});

it('keeps missing album artwork empty instead of sending the app logo as a cover', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  expect(plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: '', originalArtwork: '' }));
  await audio.setQueue({ ...album, artwork: '   ' }, 0, 0);
  expect(plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: '' }));
  audio.dispose();
});

it('passes the actual album cover to native while retaining its original crop metadata', async () => {
  const audio = new NativeTalkAudio(plugin);
  const artwork = 'https://localhost/covers/album.png#pos=50%25%2012%25';
  await audio.setQueue({ ...album, artwork }, 0, 0);
  expect(plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({
    artwork: 'asset:///public/covers/album.png', originalArtwork: artwork,
  }));
  audio.dispose();
});

it('coalesces foreground and practice clock refreshes through one native state read', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  await Promise.all([audio.refreshState(), audio.refreshState()]);
  expect(plugin.getState).toHaveBeenCalledOnce();
  audio.dispose();
});

it('waits for the wake-up state, the frame hold pause, and a queued seek before exposing the video clock', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 8);
  let finishRead!: (state: NativeAudioState) => void;
  let finishPause!: (state: NativeAudioState) => void;
  let finishSeek!: (state: NativeAudioState) => void;
  plugin.getState.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
  plugin.pause.mockImplementationOnce(() => new Promise(resolve => { finishPause = resolve; }));
  plugin.seek.mockImplementationOnce(() => new Promise(resolve => { finishSeek = resolve; }));
  audio.addEventListener('play', () => { void audio.pause(); }, { once: true });
  document.dispatchEvent(new Event('visibilitychange'));
  const ready = vi.fn();
  const wake = audio.refreshVideoPosition().then(ready);
  await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'));
  expect(audio.currentTime).toBe(8);
  finishRead({ ...state, playing: true, playWhenReady: true, position: 57 });
  await vi.waitFor(() => expect(finishPause).toBeTypeOf('function'));
  expect(ready).not.toHaveBeenCalled();
  audio.currentTime = 90;
  finishPause({ ...state, position: 57.3 });
  await vi.waitFor(() => expect(finishSeek).toBeTypeOf('function'));
  expect(ready).not.toHaveBeenCalled();
  finishSeek({ ...state, position: 89.9 });
  await wake;
  expect(audio.currentTime).toBe(89.9);
  expect(plugin.getState).toHaveBeenCalledOnce();
  audio.dispose();
});

it('syncs lock-screen pause, seeking and autonomous next-track changes', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  await audio.play();
  const pause = vi.fn(); const track = vi.fn();
  audio.addEventListener('pause', pause);
  audio.addEventListener('trackchange', track);
  publish({ ...state, playing: false, playWhenReady: false, position: 65 });
  expect(pause).toHaveBeenCalledOnce();
  expect(audio.currentTime).toBe(65);
  publish({ ...state, trackIndex: 1, playing: true, playWhenReady: true, position: 3 });
  expect(track).toHaveBeenCalledOnce();
  expect(audio.currentTime).toBe(3);
  audio.dispose();
});

it('keeps the latest scrub position through queued native ticks and accepts the confirmed position', async () => {
  const audio = new NativeTalkAudio(plugin);
  const seeking = vi.fn(() => audio.currentTime);
  audio.addEventListener('seeking', seeking);
  audio.currentTime = 30;
  expect(seeking).not.toHaveBeenCalled();
  await audio.setQueue(album, 0, 10);
  await audio.play();
  let complete!: (value: NativeAudioState) => void;
  plugin.seek.mockReturnValueOnce(new Promise<NativeAudioState>(resolve => { complete = resolve; }));
  audio.currentTime = 80;
  expect(seeking.mock.results.map(result => result.value)).toEqual([80]);
  await vi.waitFor(() => expect(plugin.seek).toHaveBeenCalledOnce());
  const original = { ...state, position: 11, observedAtMs: 100 };
  publish(original);
  expect(audio.currentTime).toBe(80);
  audio.currentTime = 25;
  expect(seeking.mock.results.map(result => result.value)).toEqual([80, 25]);
  publish({ ...original, playWhenReady: false, playing: false, observedAtMs: 101 });
  expect(audio.paused).toBe(true);
  expect(audio.currentTime).toBe(25);
  plugin.seek.mockImplementationOnce(async () => (state = { ...state, position: 24.8, observedAtMs: 120 }));
  complete({ ...state, position: 80, observedAtMs: 105 });
  await vi.waitFor(() => expect(audio.currentTime).toBe(24.8));
  publish(original);
  expect(audio.currentTime).toBe(24.8);
  publish({ ...state, position: 4, observedAtMs: 130 });
  expect(audio.currentTime).toBe(4);
  audio.dispose();
  audio.currentTime = 99;
  expect(seeking).toHaveBeenCalledTimes(2);
});

it('stops applying a pending seek when native playback advances tracks', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 10);
  let complete!: (value: NativeAudioState) => void;
  plugin.seek.mockReturnValueOnce(new Promise<NativeAudioState>(resolve => { complete = resolve; }));
  audio.currentTime = 80;
  await vi.waitFor(() => expect(plugin.seek).toHaveBeenCalledOnce());
  const old = { ...state, position: 80, observedAtMs: 40 };
  publish({ ...state, trackIndex: 1, position: 0, observedAtMs: 50 });
  complete(old);
  await new Promise(resolve => setTimeout(resolve, 0));
  publish(old);
  expect(audio.src).toBe(album.tracks[1].url);
  expect(audio.currentTime).toBe(0);
  audio.dispose();
});

it('restores the last actual position after a failed seek and reports the error', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 15);
  plugin.seek.mockRejectedValueOnce(new Error('seek unavailable'));
  audio.currentTime = 77;
  await vi.waitFor(() => expect(audio.error?.message).toBe('seek unavailable'));
  expect(audio.currentTime).toBe(15);
  audio.dispose();
});

it('keeps the recovered position without raising a playback error when iOS resets during a seek', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 10);
  await audio.play();
  let cancel!: (reason: unknown) => void;
  plugin.seek.mockReturnValueOnce(new Promise<NativeAudioState>((_, reject) => { cancel = reject; }));
  const onError = vi.fn();
  audio.addEventListener('error', onError);
  audio.currentTime = 40;
  await vi.waitFor(() => expect(plugin.seek).toHaveBeenCalledOnce());
  state = { ...state, position: 40, playing: false, playWhenReady: false };
  publish(state);
  cancel({ code: 'AUDIO_SERVICES_RESET' });
  await audio.refreshState();
  expect(audio.paused).toBe(true);
  expect(audio.currentTime).toBe(40);
  expect(onError).not.toHaveBeenCalled();
  expect(plugin.play).toHaveBeenCalledOnce();
  audio.dispose();
});

it('uses a newer lock-screen position when it arrives before the seek response', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 12);
  let complete!: (value: NativeAudioState) => void;
  plugin.seek.mockReturnValueOnce(new Promise<NativeAudioState>(resolve => { complete = resolve; }));
  audio.currentTime = 90;
  await vi.waitFor(() => expect(plugin.seek).toHaveBeenCalledOnce());
  publish({ ...state, position: 4, observedAtMs: 80 });
  expect(audio.currentTime).toBe(90);
  complete({ ...state, position: 90, observedAtMs: 70 });
  await vi.waitFor(() => expect(audio.currentTime).toBe(4));
  audio.dispose();
});

it('drops a rejected in-flight seek and queued scrubs after a new album is selected', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 12);
  let fail!: (reason: Error) => void;
  plugin.seek.mockReturnValueOnce(new Promise<NativeAudioState>((_, reject) => { fail = reject; }));
  const error = vi.fn();
  audio.addEventListener('error', error);
  audio.currentTime = 90;
  await vi.waitFor(() => expect(plugin.seek).toHaveBeenCalledOnce());
  audio.currentTime = 45;
  const next = audio.setQueue({ ...album, id: 'new' }, 0, 3);
  fail(new Error('previous queue has been cleared'));
  await next;
  expect(error).not.toHaveBeenCalled();
  expect(plugin.seek).toHaveBeenCalledTimes(1);
  expect(audio.currentTime).toBe(3);
  audio.dispose();
});

it('reports the final native state as paused and never buffering after the album ends', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 1, 0); await audio.play();
  const waiting = vi.fn(); const ended = vi.fn();
  audio.addEventListener('waiting', waiting); audio.addEventListener('ended', ended);
  publish({ ...state, trackIndex: 1, position: 120, playing: false, playWhenReady: true, ended: true });
  expect(audio.paused).toBe(true);
  expect(waiting).not.toHaveBeenCalled();
  publish({ ...state, ended: true, playing: false });
  expect(ended).toHaveBeenCalledOnce();
  audio.dispose();
});

it('updates the current source when the service advances while the screen is off', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0); await audio.play();
  publish({ ...state, trackIndex: 1, position: 1 });
  expect(audio.src).toBe(album.tracks[1].url);
  audio.dispose();
});

it('ignores stale queue events when another album has been selected', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  const old = { ...state };
  await audio.setQueue({ ...album, id: 'new' }, 0, 20);
  publish({ ...old, playing: true, playWhenReady: true, position: 90 });
  expect(audio.currentTime).toBe(20);
  expect(audio.paused).toBe(true);
  audio.dispose();
});

it('does not drop a queued stop when the UI controller is destroyed', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  await audio.play();
  audio.pause(); audio.removeAttribute('src'); audio.load(); audio.dispose();
  await vi.waitFor(() => expect(plugin.stop).toHaveBeenCalledOnce());
  expect(plugin.pause).toHaveBeenCalledOnce();
});

it('finishes teardown safely when the native listener can no longer be removed', async () => {
  const remove = vi.fn().mockRejectedValue(new Error('Native bridge closed'));
  plugin.addListener.mockResolvedValueOnce({ remove });
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  audio.dispose();
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
});

it('keeps a failed listener registration observable to commands without rejecting globally while idle', async () => {
  plugin.addListener = async () => { throw new Error('Native listener unavailable'); };
  const audio = new NativeTalkAudio(plugin);
  // A user can leave the player idle before attempting playback or closing it.
  await new Promise(resolve => setTimeout(resolve, 10));
  await expect(audio.play()).rejects.toThrow('Native listener unavailable');
  expect(plugin.play).not.toHaveBeenCalled();
  audio.dispose();
});

it('reattaches to a running native session without replacing its playlist or position', async () => {
  state = { ...state, queueId: 'existing', album, trackIndex: 1, position: 77, playing: true, playWhenReady: true };
  const audio = new NativeTalkAudio(plugin);
  const recovered = await audio.recover();
  expect(recovered?.album?.id).toBe('talks');
  audio.adopt(recovered!);
  expect(audio.currentTime).toBe(77);
  expect(audio.paused).toBe(false);
  expect(plugin.setQueue).not.toHaveBeenCalled();
  audio.dispose();
});

it('transfers offline audio in bounded chunks and reuses a completed native copy', async () => {
  const bytes = new Uint8Array(900_000).fill(42);
  const blob = new Blob([bytes]);
  const cache = { cacheStatus: vi.fn(async () => ({ bytes: 0 })), cacheChunk: vi.fn(async () => {}) };
  await cacheNativeTalk(album.tracks[0].url, blob, cache);
  expect(cache.cacheChunk).toHaveBeenCalledTimes(3);
  const chunks = cache.cacheChunk.mock.calls.map(call => (call as unknown as [{ data: string; offset: number; last: boolean }])[0]);
  expect(chunks.map(chunk => chunk.offset)).toEqual([0, 393216, 786432]);
  expect(chunks.map(chunk => chunk.last)).toEqual([false, false, true]);
  expect(chunks.every(chunk => chunk.data.length < 800000)).toBe(true);
  expect(chunks.map(chunk => atob(chunk.data).length).reduce((a, b) => a + b)).toBe(bytes.length);
  cache.cacheStatus.mockResolvedValue({ bytes: blob.size });
  cache.cacheChunk.mockClear();
  await cacheNativeTalk(album.tracks[0].url, blob, cache);
  expect(cache.cacheChunk).not.toHaveBeenCalled();
  // Generated finite tracks reuse one slot; equal bytes do not prove equal cadence/content.
  await cacheNativeTalk(album.tracks[0].url, blob, cache, () => true, { replace: true });
  expect(cache.cacheChunk).toHaveBeenCalledTimes(3);
});
