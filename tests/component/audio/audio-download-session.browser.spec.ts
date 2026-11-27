import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import type { Writable } from 'svelte/store';
import { dismissTopModal } from '$lib/browser/modal-dialog';
import type { AudioPlayerSnapshot } from '$lib/browser/audio-player-controller';
import { audioPlayer } from '$lib/stores/audio-player.svelte';
import Harness from './audio-download-session-harness.svelte';

const mocks = vi.hoisted(() => ({
  tracks: new Map<string, { url: string; albumId: string; title: string; blob: Blob; downloadedAt: number }>(),
  albums: new Map<string, { id: string }>(), remove: vi.fn(), pendingSignal: undefined as AbortSignal | undefined,
  snapshotGate: undefined as Promise<void> | undefined,
  native: true,
  singleTrack: undefined as undefined | Parameters<typeof import('$lib/browser/audio-downloads').downloadSingleTrackFile>[1],
  singleTrackGate: undefined as Promise<void> | undefined,
  backHandler: undefined as ((event: { canGoBack: boolean }) => void) | undefined,
}));
vi.mock('$app/environment', () => ({ browser: true, dev: true }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: async (_event: string, handler: typeof mocks.backHandler) => { mocks.backHandler = handler; return { remove: async () => {} }; },
  exitApp: vi.fn(),
} }));
vi.mock('$lib/browser/talk-video-mirror', () => ({ attachTalkVideoMirror: () => () => {} }));
vi.mock('$lib/browser/native-fullscreen', () => ({ setImmersiveFullscreen: async () => {} }));
vi.mock('$lib/browser/audio-downloads', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/browser/audio-downloads')>();
  return { ...actual, downloadSingleTrackFile: (...args: Parameters<typeof actual.downloadSingleTrackFile>) => {
    if (!mocks.singleTrackGate) return actual.downloadSingleTrackFile(...args);
    mocks.singleTrack = args[1];
    return mocks.singleTrackGate;
  } };
});
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => mocks.native, nativePlatform: () => mocks.native ? 'android' : 'web' }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url, resolvePublicUrl: (url: string) => url, isHtmlResponse: () => false, fetchNativeJsonMutation: async () => null }));
vi.mock('$lib/browser/offline-audio-database', async importOriginal => ({
  ...await importOriginal<typeof import('$lib/browser/offline-audio-database')>(),
  getOfflineTrack: async (url: string) => mocks.tracks.get(url) ?? null,
  putOfflineTrack: async (track: typeof mocks.tracks extends Map<string, infer T> ? T : never) => { mocks.tracks.set(track.url, track); },
  putOfflineAlbum: async (album: { id: string }) => { mocks.albums.set(album.id, album); },
  offlineStorageBytes: async () => [...mocks.tracks.values()].reduce((total, track) => total + track.blob.size, 0),
  deleteOfflineAlbum: mocks.remove,
  readOfflineLibrarySnapshot: async () => {
    await mocks.snapshotGate;
    const albums = [...mocks.albums.values()];
    const trackUrlsByAlbum = new Map(albums.map(album => [album.id,
      new Set(['/audio/first-private.mp3', '/audio/pending-private.mp3'])]));
    for (const track of mocks.tracks.values()) {
      const urls = trackUrlsByAlbum.get(track.albumId) ?? new Set<string>();
      urls.add(track.url);
      trackUrlsByAlbum.set(track.albumId, urls);
    }
    return { albums, bytes: 0, trackUrlsByAlbum, trackCounts: { 'pending-private': mocks.tracks.size } };
  },
}));
vi.mock('$lib/stores/audio-player.svelte', async () => {
  const { writable } = await import('svelte/store');
  const snapshot = { album: null, trackIndex: 0, playing: false, currentTime: 0, duration: 0, speed: 1, repeat: 0,
    volume: 1, muted: false, retry: 0, error: null, recentAlbumIds: [], sleepTimerRemainingMs: 0, sleepTimerEndOfTrack: false };
  return { audioPlayer: writable(snapshot), getAudioPlayer: async () => ({ ready: Promise.resolve(), snapshot, playTrack() {}, playAll() {}, seek() {} }) };
});

let component: ReturnType<typeof Harness> | undefined;
const playerState = audioPlayer as Writable<AudioPlayerSnapshot>;
const inertDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert');
beforeEach(() => {
  // jsdom chưa phản chiếu inert; giữ cùng hợp đồng property/attribute như trình duyệt.
  if (!inertDescriptor) Object.defineProperty(HTMLElement.prototype, 'inert', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('inert'); },
    set(this: HTMLElement, value: boolean) { this.toggleAttribute('inert', value); },
  });
  localStorage.clear();
  mocks.tracks.clear(); mocks.albums.clear(); mocks.remove.mockReset(); mocks.pendingSignal = undefined;
  mocks.snapshotGate = undefined;
  mocks.native = true;
  mocks.singleTrack = undefined;
  mocks.singleTrackGate = undefined;
  mocks.backHandler = undefined;
  playerState.update(state => ({ ...state, album: null, trackIndex: 0, playing: false, currentTime: 0, duration: 0 }));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/audio/first-private.mp3') return new Response(new Blob(['saved partial bytes']));
    if (String(input) !== '/audio/pending-private.mp3') throw new Error(`Unexpected request: ${String(input)}`);
    mocks.pendingSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      const cancel = () => reject(new DOMException('Transfer aborted', 'AbortError'));
      if (mocks.pendingSignal?.aborted) cancel();
      else mocks.pendingSignal?.addEventListener('abort', cancel, { once: true });
    });
  }));
});

it('finishes reading offline state for the new principal when session hydration overlaps the first snapshot', async () => {
  let releaseSnapshot!: () => void;
  mocks.snapshotGate = new Promise<void>(resolve => { releaseSnapshot = resolve; });
  component = mount(Harness, { target: document.body });
  flushSync();
  await tick();
  component.changeSession('account');
  releaseSnapshot();
  await vi.waitFor(() => expect(document.querySelector('.album-offline-notice')).not.toBeNull());
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (!inertDescriptor) delete (HTMLElement.prototype as Partial<HTMLElement>).inert;
  vi.unstubAllGlobals();
  document.body.replaceChildren(); localStorage.clear();
});

it('hides the offline recommendation after ten seconds and resets on reopening', async () => {
  vi.useFakeTimers();
  component = mount(Harness, { target: document.body });
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-offline-notice')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(9999); flushSync();
  expect(document.querySelector('.album-offline-notice')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(1); flushSync();
  expect(document.querySelector('.album-offline-notice')).toBeNull();
  (document.querySelector('.pt-as-back') as HTMLButtonElement).click(); flushSync();
  (document.querySelector('.pt-card-thumb') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-offline-notice')).not.toBeNull();
});

it('does not recommend downloading an album already saved offline', async () => {
  mocks.albums.set('pending-private', { id: 'pending-private' });
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-btn-offline')?.textContent).toContain('Xóa'));
  expect(document.querySelector('.album-offline-notice')).toBeNull();
});

it('continues an offline album when a catalog track was replaced at the same track count', async () => {
  const id = 'pending-private';
  mocks.albums.set(id, { id });
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-btn-offline')?.textContent).toContain('Xóa'));
  component.replaceTrack();
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-btn-offline')?.textContent).toContain('Tải tiếp'));
  (document.querySelector('.pt-as-btn-offline') as HTMLButtonElement).click();
  flushSync();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(document.querySelector('.pt-card-meta-offline')).toBeNull();
});

const dreamStoryAlbumIds = [
  'pt_drive_69bc37dd604011a70e5c4e38337865a8',
  'pt_drive_c435791b562e6f6e9d345b414df4a273',
  'pt_drive_f72e42f4cbb7db4312f96f4a1f28e2b4',
];
const dreamStoryNotice = 'Các câu chuyện được kể trong album này đều từ những giấc mơ độ vong của chị Hoa và các anh thầy pháp, đây đều là các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ';

it('uses the exact Huệ Hiền dream wording and hides only the notice after ten seconds', async () => {
  vi.useFakeTimers();
  component = mount(Harness, { target: document.body });
  await vi.advanceTimersByTimeAsync(0); flushSync();
  component.showAlbum('pt_1781961851755');
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-story-notice em')?.textContent).toBe('Các câu chuyện được kể trong album này đều từ những giấc mơ của cư sĩ Thích Nữ Huệ Hiền, đây đều là các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ');
  await vi.advanceTimersByTimeAsync(9999); flushSync();
  expect(document.querySelector('.album-story-notice')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(1); flushSync();
  expect(document.querySelector('.album-story-notice')).toBeNull();
  expect(document.querySelector('.album-dialog')).not.toBeNull();
});

it.each(['pt_drive_74959767068eaae1db4846f62b62eda8', 'pt_drive_d22e45028d45ede832a28bc87237d5d3'])('uses the separate Dương Sinh wording for journey album %s', async id => {
  vi.useFakeTimers();
  component = mount(Harness, { target: document.body });
  await vi.advanceTimersByTimeAsync(0); flushSync();
  component.showAlbum(id);
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-story-notice em')?.textContent).toBe('Sách này dựa trên trải nghiệm cá nhân trong các giấc mộng của cư sĩ Dương Sinh ở Thánh Hiền đường, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ');
  await vi.advanceTimersByTimeAsync(10_000); flushSync();
  expect(document.querySelector('.album-story-notice')).toBeNull();
  expect(document.querySelector('.album-dialog')).not.toBeNull();
});

it.each(dreamStoryAlbumIds)('shows the exact story notice for ten seconds, including downloaded album %s', async id => {
  vi.useFakeTimers();
  mocks.albums.set(id, { id });
  component = mount(Harness, { target: document.body });
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-story-notice')).toBeNull();
  const requestsBefore = vi.mocked(fetch).mock.calls.length;
  component.showAlbum(id);
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-story-notice em')?.textContent).toBe(dreamStoryNotice);
  await vi.advanceTimersByTimeAsync(9999); flushSync();
  expect(document.querySelector('.album-story-notice')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(1); flushSync();
  expect(document.querySelector('.album-story-notice')).toBeNull();
  expect(vi.mocked(fetch).mock.calls.length).toBe(requestsBefore);
  (document.querySelector('.pt-as-back') as HTMLButtonElement).click(); flushSync();
  (document.querySelectorAll('.pt-card-thumb')[1] as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-story-notice em')?.textContent).toBe(dreamStoryNotice);
});

it('cancels the previous story notice timeout when switching albums and excludes unrelated albums', async () => {
  vi.useFakeTimers();
  component = mount(Harness, { target: document.body });
  await vi.advanceTimersByTimeAsync(0); flushSync();
  component.showAlbum(dreamStoryAlbumIds[0]);
  await vi.advanceTimersByTimeAsync(0); flushSync();
  await vi.advanceTimersByTimeAsync(9000); flushSync();
  component.showAlbum(dreamStoryAlbumIds[1]);
  await vi.advanceTimersByTimeAsync(0); flushSync();
  await vi.advanceTimersByTimeAsync(1000); flushSync();
  expect(document.querySelector('.album-story-notice')).not.toBeNull();
  component.showAdditionalAlbum();
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-story-notice')).toBeNull();
});

it.each([false, true])('keeps offline recommendation correct when filtering reveals an album (saved: %s)', async saved => {
  if (saved) mocks.albums.set('new-album', { id: 'new-album' });
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.album-offline-notice')).not.toBeNull());
  component!.showAdditionalAlbum(); flushSync();
  await vi.waitFor(() => expect(document.querySelector('#album-title')?.textContent).toBe('Newly visible album'));
  if (saved) {
    expect(document.querySelector('.album-offline-notice')).toBeNull();
    expect(document.querySelector('.pt-as-btn-offline')?.textContent).toContain('Xóa');
  } else {
    expect(document.querySelector('.album-offline-notice')).not.toBeNull();
  }
});

async function beginTransfer() {
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-btn-offline')).not.toBeNull());
  (document.querySelector('.pt-as-btn-offline') as HTMLButtonElement).click();
  await vi.waitFor(() => expect((document.querySelector('.audio-offline-confirm-submit') as HTMLButtonElement | null)?.disabled).toBe(false));
  (document.querySelector('.audio-offline-confirm-submit') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(mocks.pendingSignal).toBeDefined());
  expect(document.querySelector('.audio-offline-modal-sub')?.textContent).toContain('Owner A private album');
  expect(mocks.tracks.size).toBe(1);
}

it.each(['back', 'escape'] as const)('cancels the top download on %s and keeps its album open for resume', async mode => {
  await beginTransfer();
  if (mode === 'back') {
    expect(dismissTopModal()).toBe(true);
  } else {
    const cancel = document.querySelector<HTMLButtonElement>('.audio-offline-modal-actions button')!;
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    cancel.dispatchEvent(escape);
    // Browsers with native <dialog> dispatch cancel after an unhandled Escape.
    if (!escape.defaultPrevented) cancel.closest('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
  }
  await vi.waitFor(() => expect(mocks.pendingSignal?.aborted).toBe(true));
  expect(document.querySelector('.audio-offline-modal-backdrop')).toBeNull();
  expect(document.querySelector('#album-title')?.textContent).toBe('Owner A private album');
  expect(mocks.tracks.size).toBe(1);
  expect(mocks.albums.size).toBe(0);
});

it.each(['logout', 'account', 'role'] as const)('aborts and closes private transfer UI immediately after session %s while retaining partial bytes', async mode => {
  await beginTransfer();
  component!.changeSession(mode); flushSync();
  await vi.waitFor(() => expect(mocks.pendingSignal?.aborted).toBe(true));
  expect(document.querySelector('.audio-offline-modal-backdrop')).toBeNull();
  expect(document.querySelector('.album-dialog')).toBeNull();
  expect(mocks.tracks.size).toBe(1);
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('keeps a pending transfer during same-identity token refresh', async () => {
  await beginTransfer();
  component!.changeSession('token'); flushSync();
  expect(mocks.pendingSignal?.aborted).toBe(false);
  expect(document.querySelector('.audio-offline-modal-backdrop')).not.toBeNull();
  expect(document.querySelector('.album-dialog')).not.toBeNull();
  expect(mocks.tracks.size).toBe(1);
});

async function beginSingleTrackTransfer() {
  mocks.native = false;
  let finish!: () => void;
  mocks.singleTrackGate = new Promise<void>(resolve => { finish = resolve; });
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-track-dl-btn')).not.toBeNull());
  (document.querySelector('.pt-as-track-dl-btn') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(mocks.singleTrack).toBeDefined());
  return finish;
}

it.each(['logout', 'account', 'role'] as const)('aborts a single MP3 transfer on session %s and ignores late progress and completion', async mode => {
  const finish = await beginSingleTrackTransfer();
  try {
    component!.changeSession(mode); flushSync();
    expect(mocks.singleTrack?.signal?.aborted).toBe(true);
    // Reopening exposes the same status owner, so stale callbacks cannot hide behind a closed dialog.
    (document.querySelector('.pt-card-thumb') as HTMLButtonElement).click(); flushSync();
    const status = document.querySelector('.album-status')?.textContent ?? '';
    mocks.singleTrack!.onProgress?.({ completed: 0, total: 1, currentTitle: 'Saved first track', bytesDownloaded: 512, bytesTotal: 1024 });
    flushSync();
    expect(document.querySelector('.album-status')?.textContent ?? '').toBe(status);
    finish(); await tick(); flushSync();
    expect(document.querySelector('.album-status')?.textContent ?? '').toBe(status);
  } finally { finish(); }
});

it('aborts a single MP3 transfer when AudioCatalog unmounts and tolerates late callbacks', async () => {
  const finish = await beginSingleTrackTransfer();
  try {
    await unmount(component!); component = undefined;
    expect(mocks.singleTrack?.signal?.aborted).toBe(true);
    mocks.singleTrack!.onProgress?.({ completed: 0, total: 1, currentTitle: 'Saved first track', bytesDownloaded: 512, bytesTotal: 1024 });
    finish(); await tick(); flushSync();
    expect(document.querySelector('.album-status')).toBeNull();
  } finally { finish(); }
});

it('keeps a single MP3 transfer alive across same-principal token refresh', async () => {
  const finish = await beginSingleTrackTransfer();
  try {
    expect(mocks.singleTrack?.signal).toBeDefined();
    component!.changeSession('token'); flushSync();
    expect(mocks.singleTrack!.signal!.aborted).toBe(false);
    mocks.singleTrack!.onProgress?.({ completed: 0, total: 1, currentTitle: 'Saved first track', bytesDownloaded: 512, bytesTotal: 1024 });
    flushSync();
    expect(document.querySelector('.album-status')?.textContent).toContain('50%');
    finish(); await tick(); flushSync();
    expect(document.querySelector('.album-status')?.textContent).toContain('Đã tải Saved first track.');
  } finally { finish(); }
});

it('does not request login when a remembered member cannot currently verify download credentials', async () => {
  // Native keeps MP3 export hidden; this shared auth action is exposed on web.
  mocks.native = false;
  const loginRequired = vi.fn();
  window.addEventListener('quangtu:login-required', loginRequired);
  try {
    component = mount(Harness, { target: document.body });
    flushSync();
    await vi.waitFor(() => expect(document.querySelector('.pt-as-track-dl-btn')).not.toBeNull());
    component!.changeSession('remembered'); flushSync();
    vi.stubGlobal('fetch', vi.fn(async input => {
      if (String(input).endsWith('/api/session')) return new Response('unavailable', { status: 503 });
      throw new Error(`Unexpected download request: ${String(input)}`);
    }));
    (document.querySelector('.pt-as-track-dl-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Không thể tải Saved first track.'));
    expect(loginRequired).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('quangtu:login-required', loginRequired);
  }
});

async function openFocusAlbum(video = false): Promise<HTMLElement> {
  component = mount(Harness, { target: document.body });
  flushSync(); await tick();
  await vi.waitFor(() => expect(document.querySelector('.album-dialog')).not.toBeNull());
  if (video) {
    const album = component.showVideoAlbum();
    playerState.update(state => ({ ...state, album: { id: album.id, title: album.tieu_de, tracks: album.tracks } }));
    flushSync(); await tick();
    await vi.waitFor(() => expect(document.querySelector('.album-overlay.video-full')).not.toBeNull());
  }
  return document.querySelector<HTMLElement>('.album-dialog')!;
}

function albumFocusButtons(dialog: HTMLElement): HTMLButtonElement[] {
  return [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    .filter(button => !button.closest('[inert], [hidden], [aria-hidden="true"]'));
}

function pressTab(target: HTMLElement, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, shiftKey });
  target.dispatchEvent(event);
  return event;
}

it.each([false, true])('album focus scope: keeps a normal album nonmodal and lets Tab reach external player/navigation controls (native=%s)', async native => {
  mocks.native = native;
  const dialog = await openFocusAlbum();
  expect(dialog.getAttribute('aria-modal')).toBe('false');
  const external = document.createElement('section');
  external.innerHTML = '<button aria-label="Tạm dừng">Pause</button><nav><button>Trang Chủ</button></nav>';
  document.body.append(external);
  const [pause, navigation] = [...external.querySelectorAll('button')];
  const pauseAction = vi.fn(); pause.addEventListener('click', pauseAction);
  const buttons = albumFocusButtons(dialog);
  buttons.at(-1)!.focus();
  expect(pressTab(buttons.at(-1)!).defaultPrevented).toBe(false);
  pause.focus(); await tick();
  expect(document.activeElement).toBe(pause);
  expect(pause.closest('[inert]')).toBeNull();
  pause.click(); expect(pauseAction).toHaveBeenCalledOnce();
  navigation.focus(); expect(document.activeElement).toBe(navigation);
  buttons[0].focus();
  expect(pressTab(buttons[0], true).defaultPrevented).toBe(false);
});

it('album focus scope: traps fullscreen video focus and restores nonmodal semantics on Escape before closing the album', async () => {
  const dialog = await openFocusAlbum(true);
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  const buttons = albumFocusButtons(dialog);
  expect(buttons.length).toBeGreaterThan(1);
  buttons.at(-1)!.focus();
  expect(pressTab(buttons.at(-1)!).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(buttons[0]);
  dialog.focus();
  expect(pressTab(dialog, true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(buttons.at(-1));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flushSync(); await tick();
  expect(document.querySelector('.album-dialog')).toBe(dialog);
  expect(document.querySelector('.album-overlay.video-full')).toBeNull();
  expect(dialog.getAttribute('aria-modal')).toBe('false');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flushSync();
  expect(document.querySelector('.album-dialog')).toBeNull();
});

it.each([false, true])('album focus scope: yields to nested login and restores the appropriate album scope (fullscreen=%s)', async fullscreen => {
  const dialog = await openFocusAlbum(fullscreen);
  const overlay = document.querySelector<HTMLElement>('.album-overlay')!;
  window.dispatchEvent(new CustomEvent('quangtu:login-modal-closed', { detail: { open: true } }));
  flushSync();
  expect(overlay.hasAttribute('inert')).toBe(true);
  expect(overlay.getAttribute('aria-hidden')).toBe('true');
  expect(dialog.getAttribute('aria-modal')).toBe('false');
  expect(pressTab(dialog, true).defaultPrevented).toBe(false);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flushSync(); expect(document.querySelector('.album-dialog')).toBe(dialog);
  window.dispatchEvent(new CustomEvent('quangtu:login-modal-closed', { detail: { open: false } }));
  flushSync();
  expect(overlay.hasAttribute('inert')).toBe(false);
  expect(overlay.hasAttribute('aria-hidden')).toBe(false);
  expect(dialog.getAttribute('aria-modal')).toBe(String(fullscreen));
});

it('album focus scope: native Back still closes the album before history and returns focus to its opener', async () => {
  await openFocusAlbum();
  document.querySelector<HTMLButtonElement>('.pt-as-back')!.click(); flushSync();
  const opener = document.querySelector<HTMLButtonElement>('.pt-card-thumb')!;
  opener.click(); flushSync(); await tick();
  const back = document.querySelector<HTMLButtonElement>('.pt-as-back')!;
  Object.defineProperty(back, 'offsetParent', { value: document.body });
  const originalPush = window.history.pushState, originalReplace = window.history.replaceState;
  const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  try {
    const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
    await initializeNativeBackButton();
    expect(mocks.backHandler).toBeTypeOf('function');
    mocks.backHandler!({ canGoBack: true }); flushSync();
    expect(document.querySelector('.album-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(historyBack).not.toHaveBeenCalled();
  } finally {
    window.history.pushState = originalPush; window.history.replaceState = originalReplace;
  }
});
