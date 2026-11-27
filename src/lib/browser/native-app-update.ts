import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { APP_VERSION_PATH, isOlderNativeBuild, parseStoreRelease, type StoreRelease, type UpdatePlatform } from '$lib/contracts/native-app-update';
import { resolvePublicUrl } from './native-api';
import { isNativeApp, nativePlatform } from './native-platform';
import { requestDeadline } from './network-deadline';

export const SNOOZE_UPDATE_STORAGE_KEY = 'tutam_native_update_snooze';
export const SNOOZE_UPDATE_DURATION_MS = 24 * 60 * 60 * 1000;

export interface SnoozeRecord {
  version: string;
  build?: string;
  until: number;
}

export function isUpdateSnoozed(
  candidate: StoreRelease,
  storage?: Storage | null,
  now = Date.now(),
): boolean {
  try {
    const targetStorage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const raw = targetStorage?.getItem(SNOOZE_UPDATE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as Partial<SnoozeRecord>;
    if (data.version === candidate.version && (candidate.build == null || data.build === candidate.build)) {
      return typeof data.until === 'number' && now < data.until;
    }
  } catch {}
  return false;
}

export function snoozeUpdate(
  candidate: StoreRelease,
  storage?: Storage | null,
  now = Date.now(),
): void {
  try {
    const targetStorage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const record: SnoozeRecord = {
      version: candidate.version,
      build: candidate.build,
      until: now + SNOOZE_UPDATE_DURATION_MS,
    };
    targetStorage?.setItem(SNOOZE_UPDATE_STORAGE_KEY, JSON.stringify(record));
  } catch {}
}

export function watchNativeAppUpdates(
  onRelease: (release: StoreRelease | null) => void,
  onCheckingChange?: (checking: boolean) => void,
): () => void {
  if (!isNativeApp()) return () => {};
  const currentPlatform = nativePlatform();
  if (currentPlatform === 'web') return () => {};
  const platform: UpdatePlatform = currentPlatform;

  let disposed = false;
  const pageDocument = typeof document === 'undefined' ? undefined : document;
  let foreground = pageDocument?.visibilityState !== 'hidden';
  let check: AbortController | undefined;
  const listeners: PluginListenerHandle[] = [];

  async function checkOpening() {
    if (disposed || navigator.onLine === false) return;
    const opening = new AbortController();
    check = opening;
    onCheckingChange?.(true);
    const deadline = requestDeadline(opening.signal, 4_000);
    // A native App.getInfo call cannot be cancelled by the fetch signal.
    const timedOut = new Promise<null>(resolve => {
      deadline.signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    try {
      const release = await Promise.race([checkForUpdate(platform, deadline.signal), timedOut]);
      if (!opening.signal.aborted && navigator.onLine) onRelease(release);
    } finally {
      deadline.dispose();
      if (check === opening && !disposed && !opening.signal.aborted) {
        check = undefined;
        onCheckingChange?.(false);
      }
    }
  }

  function changeForeground(active: boolean) {
    if (disposed || active === foreground) return;
    foreground = active;
    if (active) void checkOpening();
    else {
      check?.abort();
      check = undefined;
      onRelease(null);
      onCheckingChange?.(false);
    }
  }

  async function track(registration: Promise<PluginListenerHandle>) {
    try {
      const listener = await registration;
      if (disposed) await listener.remove();
      else listeners.push(listener);
    } catch { /* Kiểm tra một lần khi mở nguội vẫn có thể chạy. */ }
  }

  // Reserve update priority before permission listeners handle the DOM resume.
  // Native resume can arrive later; both signals share the same opening guard.
  const onVisibilityChange = () => changeForeground(pageDocument?.visibilityState !== 'hidden');
  pageDocument?.addEventListener('visibilitychange', onVisibilityChange, true);
  if (platform === 'ios') {
    void track(App.addListener('pause', () => changeForeground(false)));
    void track(App.addListener('resume', () => changeForeground(true)));
  } else {
    void track(App.addListener('appStateChange', ({ isActive }) => changeForeground(isActive)));
  }
  if (foreground) void checkOpening();

  return () => {
    disposed = true;
    check?.abort();
    pageDocument?.removeEventListener('visibilitychange', onVisibilityChange, true);
    for (const listener of listeners) void listener.remove().catch(() => {});
  };
}

async function checkForUpdate(platform: UpdatePlatform, signal: AbortSignal): Promise<StoreRelease | null> {
  try {
    const installed = await App.getInfo();
    if (signal.aborted) return null;
    const response = await fetch(resolvePublicUrl(APP_VERSION_PATH), {
      credentials: 'omit', cache: 'no-store', signal,
    });
    if (!response.ok) return null;
    const policy = await response.json() as { nativeUpdates?: Partial<Record<UpdatePlatform, unknown>> } | null;
    const release = parseStoreRelease(platform, policy?.nativeUpdates?.[platform]);
    return !signal.aborted && release && isOlderNativeBuild(platform, installed, release) ? release : null;
  } catch {
    return null;
  }
}
