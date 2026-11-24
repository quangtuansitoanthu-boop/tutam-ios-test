import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Viewer from '../../../src/lib/components/audio/TalkVideoViewer.svelte';
import { audioPlayer } from '$lib/stores/audio-player.svelte';
import { writable } from 'svelte/store';

const hudMocks = vi.hoisted(() => ({ seek: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/stores/audio-player.svelte', async () => {
  const { writable } = await import('svelte/store');
  return { audioPlayer: writable({ playing: true, error: null, currentTime: 0, duration: 300, trackIndex: 0, album: { tracks: [{ title: 'Video' }] } }), getAudioPlayer: async () => ({ audio: new EventTarget(), seek: hudMocks.seek }) };
});
vi.mock('$lib/browser/talk-video-mirror', () => ({ attachTalkVideoMirror: () => () => {} }));
vi.mock('$lib/browser/offline-audio-database', () => ({ getOfflineTrack: async () => null }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url }));
vi.mock('$lib/browser/native-fullscreen', () => ({ setImmersiveFullscreen: async () => {} }));
const player = audioPlayer as unknown as ReturnType<typeof writable<{ playing: boolean; error: string | null; currentTime: number; duration: number; trackIndex: number; album: { tracks: { title: string }[] } }>>;
let component: ReturnType<typeof Viewer> | undefined;
const topbar = () => document.querySelector<HTMLElement>('.video-topbar')!;
const advance = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); flushSync(); };
async function open(expanded = true, landscape = true) {
  component = mount(Viewer, { target: document.body, props: { url: '/video.mp4', title: 'Video', expanded, landscape, onBack() {} } });
  flushSync(); await tick(); await vi.advanceTimersByTimeAsync(0); flushSync();
  document.querySelector('video')!.dispatchEvent(new Event('loadeddata')); flushSync();
}
function pointer(target: Element, type: string) { target.dispatchEvent(new MouseEvent(type, { bubbles: true })); flushSync(); }
beforeEach(() => {
  vi.useFakeTimers();
  hudMocks.seek.mockReset();
  player.set({ playing: true, error: null, currentTime: 0, duration: 300, trackIndex: 0, album: { tracks: [{ title: 'Video' }] } });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers();
});
it.each([true, false])('hides after three seconds despite clock ticks and reveals on tap (landscape=%s)', async landscape => {
  await open(true, landscape);
  for (let i = 1; i <= 2; i++) { await advance(1000); player.update(s => ({ ...s, currentTime: i })); flushSync(); }
  await advance(999); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(false);
  await advance(1); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(true);
  expect(topbar().getAttribute('aria-hidden')).toBe('true');
  const reveal = document.querySelector<HTMLButtonElement>('.video-hud-reveal')!;
  expect(reveal.getAttribute('aria-label')).toBe('Hiện điều khiển video');
  reveal.click(); flushSync(); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(false);
  await advance(3000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(true);
});
it('keeps controls for paused, loading, player errors and slider interaction', async () => {
  await open();
  player.update(s => ({ ...s, playing: false })); flushSync(); await advance(4000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(false);
  player.update(s => ({ ...s, playing: true })); flushSync();
  document.querySelector('video')!.dispatchEvent(new Event('waiting')); flushSync(); await advance(4000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(false);
  document.querySelector('video')!.dispatchEvent(new Event('playing')); flushSync();
  player.update(s => ({ ...s, error: 'Network error' })); flushSync(); await advance(4000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(false);
  player.update(s => ({ ...s, error: null })); flushSync();
  pointer(document.querySelector('input')!, 'pointerdown'); await advance(4000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(false);
  document.dispatchEvent(new Event('pointerup')); flushSync(); await advance(3000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(true);
});
it('pins keyboard focus but does not pin pointer focus', async () => {
  await open();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  const button = topbar().querySelector('button')!; button.focus(); flushSync();
  await advance(4000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(false);
  pointer(button, 'pointerdown'); button.focus(); document.dispatchEvent(new Event('pointerup')); flushSync();
  await advance(3000); expect((topbar().getAttribute('aria-hidden') === 'true')).toBe(true);
});
it('leaves inline controls visible and cleans up on close', async () => {
  await open(false); await advance(4000);
  expect(document.querySelector('.video-caption')!.hasAttribute('inert')).toBe(false);
  expect(document.querySelector('.video-hud-reveal')).toBeNull();
  await unmount(component!); component = undefined;
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps a failed transport command visible', async () => {
  await open();
  document.querySelector<HTMLButtonElement>('.toggle')!.click();
  await Promise.resolve(); await Promise.resolve(); flushSync();
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  await advance(4000);
  expect(topbar().getAttribute('aria-hidden')).toBe('false');
});

it('ignores short buffering after the first frame but shows sustained buffering', async () => {
  await open();
  const video = document.querySelector('video')!;
  const source = video.getAttribute('src');
  await advance(3000);
  expect(topbar().getAttribute('aria-hidden')).toBe('true');
  for (const duration of [100, 250, 100]) {
    video.dispatchEvent(new Event('waiting')); flushSync();
    await advance(duration);
    expect(topbar().getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.video-caption > p')).toBeNull();
    expect(document.querySelector('video')).toBe(video);
    expect(video.getAttribute('src')).toBe(source);
    video.dispatchEvent(new Event('playing')); flushSync();
  }
  video.dispatchEvent(new Event('waiting')); flushSync();
  await advance(700);
  expect(topbar().getAttribute('aria-hidden')).toBe('false');
  video.dispatchEvent(new Event('playing')); flushSync();
  await advance(3000);
  expect(topbar().getAttribute('aria-hidden')).toBe('true');
});

it('previews every seek input and commits only the completed change', async () => {
  await open(false);
  const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!;
  for (const position of [120, 30, 200]) {
    slider.value = String(position);
    slider.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    const expected = Math.floor(position / 60) + ':' + String(position % 60).padStart(2, '0');
    expect(document.querySelector('.seek-row')!.textContent).toContain(expected);
    expect(hudMocks.seek).not.toHaveBeenCalled();
  }
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); flushSync();
  expect(hudMocks.seek).toHaveBeenCalledExactlyOnceWith(200);
});
