import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setStyle: vi.fn(), iosStyle: vi.fn(), iosBackground: vi.fn(),
  addListener: vi.fn(), getAppearance: vi.fn(),
  native: false, platform: 'web',
}));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ setStyle: mocks.setStyle, addListener: mocks.addListener, getAppearance: mocks.getAppearance }) }));
vi.mock('../../src/lib/browser/native-platform', () => ({
  isNativeApp: () => mocks.native, nativePlatform: () => mocks.platform,
}));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: mocks.iosStyle, setBackgroundColor: mocks.iosBackground },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));
import { watchNativeSystemAppearance, nativeSystemBarsSurface, overrideNativeSystemBars, syncNativeSystemBars } from '../../src/lib/browser/native-system-bars';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.native = false; mocks.platform = 'web'; });

it.each([true, false])('uses the Android inset owner for dark=%s without legacy StatusBar calls', async (dark) => {
  mocks.native = true; mocks.platform = 'android';
  await syncNativeSystemBars(dark, '#15120d');
  expect(mocks.setStyle).toHaveBeenCalledExactlyOnceWith({ dark, backgroundColor: '#15120d' });
  expect(mocks.iosStyle).not.toHaveBeenCalled();
  expect(mocks.iosBackground).not.toHaveBeenCalled();
});

it('preserves iOS style and background updates', async () => {
  mocks.native = true; mocks.platform = 'ios';
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.iosStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
  expect(mocks.iosBackground).toHaveBeenCalledWith({ color: '#FAF1E4' });
  expect(mocks.setStyle).toHaveBeenCalledWith({ dark: false, backgroundColor: '#FAF1E4' });
});

it.each(['android', 'ios'])('expands short hex for every %s bridge call and restores the latest theme', async platform => {
  mocks.native = true; mocks.platform = platform;
  await syncNativeSystemBars(false, '#fff');
  expect(mocks.setStyle).toHaveBeenLastCalledWith({ dark: false, backgroundColor: '#ffffff' });
  if (platform === 'ios') expect(mocks.iosBackground).toHaveBeenLastCalledWith({ color: '#ffffff' });
  const restore = overrideNativeSystemBars(true, '#123');
  await syncNativeSystemBars(false, '#fff');
  expect(mocks.setStyle).toHaveBeenLastCalledWith({ dark: true, backgroundColor: '#112233' });
  if (platform === 'ios') expect(mocks.iosBackground).toHaveBeenLastCalledWith({ color: '#112233' });
  restore();
  await syncNativeSystemBars(false, '#fff');
  expect(mocks.setStyle).toHaveBeenLastCalledWith({ dark: false, backgroundColor: '#ffffff' });
  if (platform === 'ios') expect(mocks.iosBackground).toHaveBeenLastCalledWith({ color: '#ffffff' });
});

it('does not call native plugins on web', async () => {
  await syncNativeSystemBars(true, '#15120d');
  expect(mocks.setStyle).not.toHaveBeenCalled();
  expect(mocks.iosStyle).not.toHaveBeenCalled();
});

it('keeps theme usable if the Android bridge rejects a call', async () => {
  mocks.native = true; mocks.platform = 'android';
  mocks.setStyle.mockRejectedValueOnce(new Error('Bridge unavailable'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(syncNativeSystemBars(true, '#15120d')).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});

it('keeps light status text on a dark modal when the app theme changes, then restores the latest theme', async () => {
  mocks.native = true; mocks.platform = 'ios';
  await syncNativeSystemBars(false, '#FAF1E4');
  const restore = overrideNativeSystemBars(true, '#171320');
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.iosStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
  expect(mocks.iosBackground).toHaveBeenLastCalledWith({ color: '#171320' });
  restore();
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.iosStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
  expect(mocks.iosBackground).toHaveBeenLastCalledWith({ color: '#FAF1E4' });
});

it('restores Android system bars after a modal closes before an earlier bridge update completes', async () => {
  mocks.native = true; mocks.platform = 'android';
  let finish!: () => void;
  mocks.setStyle.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const initial = syncNativeSystemBars(false, '#FAF1E4');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const restore = overrideNativeSystemBars(true, '#171320');
  restore();
  finish();
  await initial;
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.setStyle.mock.calls.map(([appearance]) => appearance)).toEqual([
    { dark: false, backgroundColor: '#FAF1E4' },
    { dark: true, backgroundColor: '#171320' },
    { dark: false, backgroundColor: '#FAF1E4' },
    { dark: false, backgroundColor: '#FAF1E4' },
  ]);
});

it('does not retain native modal overrides in the web runtime', async () => {
  const restore = overrideNativeSystemBars(true, '#171320');
  restore();
  expect(mocks.iosStyle).not.toHaveBeenCalled();
  expect(mocks.setStyle).not.toHaveBeenCalled();
});

function surfaceFixture(initial: string) {
  let color = initial;
  let changed = () => {};
  const disconnect = vi.fn();
  const node = { parentElement: null } as HTMLElement;
  vi.stubGlobal('getComputedStyle', () => ({ backgroundColor: color }));
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { changed = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  return { node, disconnect, change(next: string) { color = next; changed(); } };
}

it.each(['android', 'ios'])('follows selected paper rather than global theme on %s', async platform => {
  mocks.native = true; mocks.platform = platform;
  await syncNativeSystemBars(true, '#15120d');
  const fixture = surfaceFixture('rgb(244, 236, 216)');
  const surface = nativeSystemBarsSurface(fixture.node);
  for (const [css, hex, dark] of [
    ['rgb(244, 236, 216)', '#f4ecd8', false],
    ['rgb(255, 255, 255)', '#ffffff', false],
    ['rgb(250, 246, 238)', '#faf6ee', false],
    ['rgb(232, 232, 232)', '#e8e8e8', false],
    ['rgb(21, 18, 13)', '#15120d', true]
  ] as const) {
    fixture.change(css);
    await syncNativeSystemBars(true, '#15120d');
    expect(mocks.setStyle).toHaveBeenLastCalledWith({ dark, backgroundColor: hex });
  }
  surface.destroy();
  fixture.change('rgb(255, 255, 255)');
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.setStyle).toHaveBeenLastCalledWith({ dark: false, backgroundColor: '#FAF1E4' });
  expect(fixture.disconnect).toHaveBeenCalledOnce();
});

it('restores latest paper after closing a nested fullscreen surface', async () => {
  mocks.native = true; mocks.platform = 'android';
  const fixture = surfaceFixture('rgb(244, 236, 216)');
  const surface = nativeSystemBarsSurface(fixture.node);
  const restore = overrideNativeSystemBars(true, '#171320');
  fixture.change('rgb(255, 255, 255)');
  await syncNativeSystemBars(true, '#15120d');
  expect(mocks.setStyle).toHaveBeenLastCalledWith({ dark: true, backgroundColor: '#171320' });
  restore();
  await syncNativeSystemBars(true, '#15120d');
  expect(mocks.setStyle).toHaveBeenLastCalledWith({ dark: false, backgroundColor: '#ffffff' });
  surface.destroy();
  await syncNativeSystemBars(true, '#15120d');
});

it('does not observe the DOM on web', () => {
  const observer = vi.fn();
  vi.stubGlobal('MutationObserver', observer);
  nativeSystemBarsSurface({} as HTMLElement).destroy();
  expect(observer).not.toHaveBeenCalled();
});


it('uses Android appearance and ignores a stale initial result after a native event', async () => {
  mocks.native = true; mocks.platform = 'android';
  let event!: (value: { dark: boolean }) => void;
  let finish!: (value: { dark: boolean }) => void;
  const remove = vi.fn().mockResolvedValue(undefined);
  mocks.addListener.mockImplementationOnce(async (_name, callback) => { event = callback; return { remove }; });
  mocks.getAppearance.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const changed = vi.fn();
  const stop = watchNativeSystemAppearance(changed);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  event({ dark: true });
  finish({ dark: false });
  await Promise.resolve();
  expect(changed.mock.calls).toEqual([[true]]);
  stop();
  event({ dark: false });
  expect(changed).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});

it('reads initial Android appearance and removes its listener on disposal', async () => {
  mocks.native = true; mocks.platform = 'android';
  const remove = vi.fn().mockResolvedValue(undefined);
  mocks.addListener.mockResolvedValueOnce({ remove });
  mocks.getAppearance.mockResolvedValueOnce({ dark: true });
  const changed = vi.fn();
  const stop = watchNativeSystemAppearance(changed);
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(true));
  stop();
  expect(remove).toHaveBeenCalledOnce();
});

it('removes an asynchronously registered listener after early disposal without reading appearance', async () => {
  mocks.native = true; mocks.platform = 'android';
  let finish!: (handle: { remove: ReturnType<typeof vi.fn> }) => void;
  mocks.addListener.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const remove = vi.fn().mockResolvedValue(undefined);
  const changed = vi.fn();
  const stop = watchNativeSystemAppearance(changed);
  stop(); finish({ remove });
  await Promise.resolve();
  expect(remove).toHaveBeenCalledOnce();
  expect(mocks.getAppearance).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it('keeps media-query fallback when an older Android bridge rejects appearance subscription or getter', async () => {
  mocks.native = true; mocks.platform = 'android';
  const changed = vi.fn();
  mocks.addListener.mockRejectedValueOnce(new Error('Unimplemented'));
  const first = watchNativeSystemAppearance(changed);
  await Promise.resolve(); first();
  const remove = vi.fn().mockResolvedValue(undefined);
  mocks.addListener.mockResolvedValueOnce({ remove });
  mocks.getAppearance.mockRejectedValueOnce(new Error('Unimplemented'));
  const second = watchNativeSystemAppearance(changed);
  await vi.waitFor(() => expect(mocks.getAppearance).toHaveBeenCalledOnce());
  second();
  expect(remove).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
});

it.each(['web', 'ios'])('keeps %s appearance on the existing media-query path', platform => {
  mocks.native = platform !== 'web'; mocks.platform = platform;
  watchNativeSystemAppearance(vi.fn())();
  expect(mocks.addListener).not.toHaveBeenCalled();
  expect(mocks.getAppearance).not.toHaveBeenCalled();
});
