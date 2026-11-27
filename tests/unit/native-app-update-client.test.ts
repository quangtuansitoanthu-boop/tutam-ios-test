import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { STORE_URLS } from '../../src/lib/contracts/native-app-update';

const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  native: vi.fn(),
  getInfo: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock('@capacitor/app', () => ({ App: { getInfo: mocks.getInfo, addListener: mocks.addListener } }));
vi.mock('../../src/lib/browser/native-platform', () => ({ nativePlatform: mocks.platform, isNativeApp: mocks.native }));
vi.mock('../../src/lib/browser/native-api', () => ({ resolvePublicUrl: (path: string) => `https://example.test${path}` }));
import { watchNativeAppUpdates } from '../../src/lib/browser/native-app-update';

const ios = { version: '1.0.10', storeUrl: STORE_URLS.ios };
const fetchPolicy = vi.fn();
const remove = vi.fn(async () => {});
const listeners = new Map<string, (state?: { isActive: boolean }) => void>();
let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  listeners.clear();
  mocks.native.mockReturnValue(true);
  mocks.platform.mockReturnValue('ios');
  mocks.getInfo.mockResolvedValue({ version: '1.0.9', build: '9' });
  remove.mockResolvedValue(undefined);
  mocks.addListener.mockImplementation(async (name, callback) => {
    listeners.set(name, callback);
    return { remove };
  });
  fetchPolicy.mockImplementation(async () => Response.json({ nativeUpdates: { ios, android: null } }));
  vi.stubGlobal('fetch', fetchPolicy);
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('resolves the update before releasing the startup permission gate', async () => {
  const events: Array<boolean | typeof ios | null> = [];
  dispose = watchNativeAppUpdates(release => events.push(release), checking => events.push(checking));
  expect(events).toEqual([true]);
  await vi.waitFor(() => expect(events).toEqual([true, ios, false]));
  expect(fetchPolicy).toHaveBeenCalledTimes(1);
});

it('releases the permission gate after four seconds even if the native bridge stalls', async () => {
  vi.useFakeTimers();
  mocks.getInfo.mockReturnValue(new Promise(() => {}));
  const onCheckingChange = vi.fn();
  dispose = watchNativeAppUpdates(vi.fn(), onCheckingChange);
  expect(onCheckingChange.mock.calls).toEqual([[true]]);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(onCheckingChange.mock.calls).toEqual([[true], [false]]);
  expect(fetchPolicy).not.toHaveBeenCalled();
});

it('checks once per iOS opening and ignores duplicate foreground events', async () => {
  const onRelease = vi.fn();
  dispose = watchNativeAppUpdates(onRelease);
  await vi.waitFor(() => expect(onRelease).toHaveBeenLastCalledWith(ios));
  listeners.get('resume')?.();
  expect(fetchPolicy).toHaveBeenCalledTimes(1);
  expect(fetchPolicy).toHaveBeenCalledWith('https://example.test/api/app-version', expect.objectContaining({ credentials: 'omit' }));
  listeners.get('pause')?.();
  expect(onRelease).toHaveBeenLastCalledWith(null);
  listeners.get('resume')?.();
  listeners.get('resume')?.();
  await vi.waitFor(() => expect(onRelease).toHaveBeenNthCalledWith(3, ios));
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
  dispose();
  dispose = undefined;
  expect(remove).toHaveBeenCalledTimes(2);
});

it.each(['ios', 'android'] as const)('reserves update priority on %s visibility before asynchronous native resume and dedupes both signals', async platform => {
  mocks.platform.mockReturnValue(platform);
  let visibilityState = 'visible';
  const document = new EventTarget();
  Object.defineProperty(document, 'visibilityState', { get: () => visibilityState });
  vi.stubGlobal('document', document);
  const onCheckingChange = vi.fn();
  dispose = watchNativeAppUpdates(vi.fn(), onCheckingChange);
  await vi.waitFor(() => expect(onCheckingChange).toHaveBeenLastCalledWith(false));
  visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  if (platform === 'ios') listeners.get('pause')?.();
  else listeners.get('appStateChange')?.({ isActive: false });

  // Permission listeners must already see the priority gate on this DOM event.
  const permissionResume = vi.fn(() => onCheckingChange.mock.lastCall?.[0]);
  document.addEventListener('visibilitychange', permissionResume);
  visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(permissionResume).toHaveReturnedWith(true);
  if (platform === 'ios') listeners.get('resume')?.();
  else listeners.get('appStateChange')?.({ isActive: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(fetchPolicy).toHaveBeenCalledTimes(2));
  expect(onCheckingChange.mock.calls.filter(([checking]) => checking)).toHaveLength(2);
  expect(permissionResume).toHaveBeenCalledTimes(2);
  document.removeEventListener('visibilitychange', permissionResume);
  dispose();
  dispose = undefined;
  const callsBefore = onCheckingChange.mock.calls.length;
  visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(onCheckingChange).toHaveBeenCalledTimes(callsBefore);
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
});

it('keeps unlisted Android quiet and ignores the result from an opening that already ended', async () => {
  mocks.platform.mockReturnValue('android');
  let complete: ((response: Response) => void) | undefined;
  fetchPolicy.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }));
  const onRelease = vi.fn();
  dispose = watchNativeAppUpdates(onRelease);
  await vi.waitFor(() => expect(fetchPolicy).toHaveBeenCalledTimes(1));
  const stateChange = listeners.get('appStateChange');
  stateChange?.({ isActive: false });
  stateChange?.({ isActive: true });
  const android = { version: '1.2.29', build: '33', storeUrl: STORE_URLS.android };
  complete?.(Response.json({ nativeUpdates: { android } }));
  await vi.waitFor(() => expect(onRelease).toHaveBeenCalledTimes(2));
  expect(onRelease.mock.calls).toEqual([[null], [null]]);
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
});

it.each(['ios', 'android'] as const)('reads the installed %s version again and stops prompting after update', async platform => {
  mocks.platform.mockReturnValue(platform);
  const android = { version: '1.0.10', build: '10', storeUrl: STORE_URLS.android };
  fetchPolicy.mockImplementation(async () => Response.json({ nativeUpdates: { ios, android } }));
  const onRelease = vi.fn();
  dispose = watchNativeAppUpdates(onRelease);
  await vi.waitFor(() => expect(onRelease).toHaveBeenLastCalledWith(platform === 'ios' ? ios : android));

  mocks.getInfo.mockResolvedValue({ version: '1.0.10', build: '10' });
  if (platform === 'ios') {
    listeners.get('pause')?.();
    listeners.get('resume')?.();
  } else {
    listeners.get('appStateChange')?.({ isActive: false });
    listeners.get('appStateChange')?.({ isActive: true });
  }
  await vi.waitFor(() => expect(onRelease).toHaveBeenCalledTimes(3));
  expect(onRelease.mock.calls.slice(1)).toEqual([[null], [null]]);
  expect(mocks.getInfo).toHaveBeenCalledTimes(2);
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
});

it.each([
  ['legacy server', { minVersion: '1.0.0', latestBuild: 'older-web-build' }],
  ['missing iOS release', { nativeUpdates: { android: { version: '1.2.29', build: '33', storeUrl: STORE_URLS.android } } }],
  ['invalid iOS release', { nativeUpdates: { ios: { ...ios, storeUrl: STORE_URLS.android } } }],
])('keeps the app usable with %s', async (_name, policy) => {
  fetchPolicy.mockResolvedValue(Response.json(policy));
  const onRelease = vi.fn();
  dispose = watchNativeAppUpdates(onRelease);
  await vi.waitFor(() => expect(onRelease).toHaveBeenCalledExactlyOnceWith(null));
});

it('does not ask the server on web or when native starts offline', () => {
  mocks.native.mockReturnValue(false);
  watchNativeAppUpdates(vi.fn())();
  expect(mocks.addListener).not.toHaveBeenCalled();
  mocks.native.mockReturnValue(true);
  vi.stubGlobal('navigator', { onLine: false });
  dispose = watchNativeAppUpdates(vi.fn());
  expect(mocks.getInfo).not.toHaveBeenCalled();
  expect(fetchPolicy).not.toHaveBeenCalled();
});
