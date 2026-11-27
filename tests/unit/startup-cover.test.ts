// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ ready: vi.fn(), platform: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ ready: mocks.ready }) }));
vi.mock('../../src/lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: mocks.platform }));
import { dismissStartupCover } from '../../src/lib/browser/native-startup-screen';

type StartupCover = HTMLElement & { artworkPainted?: Promise<number> };
let cover: StartupCover;
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => window.clearTimeout(frame));
  mocks.platform.mockReturnValue('ios');
  mocks.ready.mockReset().mockResolvedValue(undefined);
  document.documentElement.dataset.nativeApp = 'true';
  cover = document.createElement('div');
  cover.id = 'app-startup';
  cover.artworkPainted = Promise.resolve(performance.now());
  document.body.append(cover);
});
afterEach(() => {
  stop?.(); stop = undefined;
  document.body.replaceChildren();
  delete document.documentElement.dataset.nativeApp;
  delete document.documentElement.dataset.nativeStartup;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('releases startup prompts only after the artwork reading time and fade have both completed', async () => {
  const done = vi.fn();
  stop = dismissStartupCover(done);
  await vi.advanceTimersByTimeAsync(1800);
  expect(cover.isConnected).toBe(true);
  expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1200);
  expect(cover.classList.contains('startup-ready')).toBe(true);
  expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(240);
  expect(cover.isConnected).toBe(false);
  expect(done).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.ready).not.toHaveBeenCalled();
});

it('counts the three seconds from artwork paint, including a slow image decode', async () => {
  let painted!: (time: number) => void;
  cover.artworkPainted = new Promise(resolve => { painted = resolve; });
  const done = vi.fn();
  stop = dismissStartupCover(done);
  await vi.advanceTimersByTimeAsync(1000);
  painted(performance.now());
  await vi.advanceTimersByTimeAsync(2999);
  expect(cover.classList.contains('startup-ready')).toBe(false);
  await vi.advanceTimersByTimeAsync(241);
  expect(cover.isConnected).toBe(false);
  expect(done).toHaveBeenCalledTimes(1);
});

it('unblocks prompts when the existing HTML failsafe removes a cover whose artwork never resolves', async () => {
  cover.artworkPainted = new Promise(() => {});
  const done = vi.fn();
  stop = dismissStartupCover(done);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(done).not.toHaveBeenCalled();
  cover.remove();
  await Promise.resolve();
  expect(done).toHaveBeenCalledTimes(1);
});

it.each(['web', 'android', 'missing'] as const)('does not hold prompts for a %s cover already hidden or removed', async kind => {
  if (kind === 'web') delete document.documentElement.dataset.nativeApp;
  if (kind === 'android') {
    document.documentElement.dataset.nativeStartup = 'true';
    mocks.platform.mockReturnValue('android');
  }
  if (kind === 'missing') cover.remove();
  const done = vi.fn();
  stop = dismissStartupCover(done);
  await vi.advanceTimersByTimeAsync(32);
  expect(cover.isConnected).toBe(false);
  expect(done).toHaveBeenCalledTimes(1);
  expect(mocks.ready).toHaveBeenCalledTimes(kind === 'android' ? 1 : 0);
});

it('does not remove the cover or notify a disposed layout after artwork resolves late', async () => {
  let painted!: (time: number) => void;
  cover.artworkPainted = new Promise(resolve => { painted = resolve; });
  const done = vi.fn();
  stop = dismissStartupCover(done);
  await vi.advanceTimersByTimeAsync(32);
  stop();
  painted(performance.now());
  await vi.advanceTimersByTimeAsync(5000);
  expect(cover.isConnected).toBe(true);
  expect(done).not.toHaveBeenCalled();
});
