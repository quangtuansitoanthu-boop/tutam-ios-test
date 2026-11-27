import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { STORE_URLS } from '$lib/contracts/native-app-update';
import Harness from './startup-prompts-harness.svelte';
import NotificationPromptModal from '$lib/components/notifications/NotificationPromptModal.svelte';

const mocks = vi.hoisted(() => ({
  platform: vi.fn(), getInfo: vi.fn(), addListener: vi.fn(), permission: vi.fn(),
}));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: mocks.getInfo, addListener: mocks.addListener } }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: mocks.platform }));
vi.mock('$lib/browser/native-api', () => ({ resolvePublicUrl: (path: string) => `https://example.test${path}` }));
vi.mock('$lib/browser/native-notifications', () => ({
  getUnifiedNotificationPermission: mocks.permission, getExactReminderPermission: vi.fn(),
}));

let component: ReturnType<typeof Harness> | undefined;
let standalonePrompt: ReturnType<typeof NotificationPromptModal> | undefined;
let visibility: DocumentVisibilityState;
const listeners = new Map<string, Array<(state?: { isActive: boolean }) => void>>();
const release = { version: '1.0.10', build: '10', storeUrl: STORE_URLS.ios };
const fetchPolicy = vi.fn();
const dialogMethods = ['showModal', 'close'].map(name =>
  [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
const settle = async () => {
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
  flushSync();
};
const visible = () => document.querySelector<HTMLDialogElement>('dialog.native-update-dialog');
const permission = () => document.querySelector<HTMLDialogElement>('dialog.notification-modal-card');
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}
function nativeActive(active: boolean) {
  const name = mocks.platform() === 'ios' ? active ? 'resume' : 'pause' : 'appStateChange';
  for (const listener of listeners.get(name) ?? []) listener({ isActive: active });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  listeners.clear();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); // jsdom has no viewport scrolling.
  mocks.platform.mockReturnValue('ios');
  mocks.getInfo.mockResolvedValue({ version: '1.0.9', build: '9' });
  mocks.permission.mockResolvedValue('prompt');
  mocks.addListener.mockImplementation(async (name, callback) => {
    listeners.set(name, [...listeners.get(name) ?? [], callback]);
    return { remove: vi.fn(async () => {}) };
  });
  fetchPolicy.mockResolvedValue(Response.json({ nativeUpdates: { ios: release } }));
  vi.stubGlobal('fetch', fetchPolicy);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.open = false; },
  });
});

afterEach(async () => {
  if (component) await unmount(component);
  if (standalonePrompt) await unmount(standalonePrompt);
  component = undefined;
  standalonePrompt = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  for (const [name, descriptor] of dialogMethods) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([true, false])('keeps both dialogs behind startup artwork, then gives the update priority (release: %s)', async hasRelease => {
  if (!hasRelease) fetchPolicy.mockResolvedValue(Response.json({ nativeUpdates: { ios: null } }));
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.advanceTimersByTimeAsync(1800);
  await settle();
  expect(fetchPolicy).toHaveBeenCalledTimes(1);
  expect(visible()).toBeNull();
  expect(permission()).toBeNull();
  component.finishStartup();
  await settle();
  if (hasRelease) {
    expect(visible()?.open).toBe(true);
    expect(permission()).toBeNull();
    visible()!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
  }
  expect(visible()).toBeNull();
  expect(permission()?.open).toBe(true);
  expect(fetchPolicy).toHaveBeenCalledTimes(1);
});

it('coalesces permission reads when DOM visibility and the native bridge report the same foreground', async () => {
  standalonePrompt = mount(NotificationPromptModal, { target: document.body });
  flushSync();
  await vi.advanceTimersByTimeAsync(1800);
  await settle();
  expect(permission()?.open).toBe(true);
  permission()!.dispatchEvent(new Event('cancel', { cancelable: true }));
  await settle();
  setVisibility('hidden');
  let complete!: (permission: string) => void;
  mocks.permission.mockReset().mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  setVisibility('visible');
  for (const active of listeners.get('appStateChange') ?? []) {
    active({ isActive: true });
    active({ isActive: true });
  }
  await settle();
  expect(mocks.permission).toHaveBeenCalledTimes(1);
  expect(permission()).toBeNull();
  complete('prompt');
  await settle();
  expect(permission()?.open).toBe(true);
  expect(fetchPolicy).not.toHaveBeenCalled();
});

it('starts a fresh foreground permission read and ignores the previous opening resolving late', async () => {
  let oldOpening!: (permission: string) => void;
  let newOpening!: (permission: string) => void;
  mocks.permission
    .mockImplementationOnce(() => new Promise(resolve => { oldOpening = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { newOpening = resolve; }));
  standalonePrompt = mount(NotificationPromptModal, { target: document.body });
  flushSync();
  await vi.advanceTimersByTimeAsync(1800);
  await settle();
  expect(mocks.permission).toHaveBeenCalledTimes(1);
  setVisibility('hidden');
  setVisibility('visible');
  await settle();
  expect(mocks.permission).toHaveBeenCalledTimes(2);
  oldOpening('prompt');
  await settle();
  expect(permission()).toBeNull();
  newOpening('prompt');
  await settle();
  expect(permission()?.open).toBe(true);
});

it.each([
  ['ios', false, false], ['ios', true, false], ['ios', true, true],
  ['android', false, false], ['android', true, false], ['android', true, true],
] as const)('keeps permission closed on %s until the resumed update finishes (dismissed: %s, native first: %s)', async (platform, dismissed, nativeFirst) => {
  mocks.platform.mockReturnValue(platform);
  fetchPolicy.mockResolvedValueOnce(Response.json({ nativeUpdates: { ios: null, android: null } }));
  component = mount(Harness, { target: document.body });
  component.finishStartup();
  flushSync();
  await vi.advanceTimersByTimeAsync(1800);
  await settle();
  expect(permission()?.open).toBe(true);
  if (dismissed) {
    permission()!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
  }
  setVisibility('hidden');
  nativeActive(false);
  await settle();
  expect(permission()).toBeNull();
  let complete!: (response: Response) => void;
  fetchPolicy.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }));
  if (nativeFirst) nativeActive(true);
  setVisibility('visible');
  // The DOM event can arrive before the native bridge has delivered resume.
  await settle();
  expect(permission()).toBeNull();
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
  nativeActive(true);
  nativeActive(true);
  await settle();
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
  complete(Response.json({ nativeUpdates: { [platform]: { ...release, storeUrl: STORE_URLS[platform] } } }));
  await settle();
  expect(visible()?.open).toBe(true);
  expect(permission()).toBeNull();
  visible()!.dispatchEvent(new Event('cancel', { cancelable: true }));
  await settle();
  expect(permission()?.open).toBe(true);
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
});
