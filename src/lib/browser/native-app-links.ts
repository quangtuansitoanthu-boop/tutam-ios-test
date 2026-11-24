import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeApp } from './native-platform';
import { NATIVE_BACKEND_ORIGINS } from './native-backend-origin';
import { addNotificationActionListener } from './native-notifications';
import { CALENDAR_WIDGET_DATE_EVENT, parseCalendarWidgetDate } from './calendar-widget-link';
import { isPracticeWidgetTarget, PRACTICE_WIDGET_NAVIGATE_EVENT, PRACTICE_WIDGET_OPEN_EVENT } from './practice-widget-link';

export const WIDGET_GUIDE_OPEN_EVENT = 'quangtu:widget-guide-open';

export function resolveNativeAppPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\\]/u.test(value)) return null;
  try {
    let url: URL;
    if (value.startsWith('/') && !value.startsWith('//')) {
      url = new URL(value, 'https://quangtu.vn');
    } else {
      url = new URL(value);
      if (url.username || url.password || url.port) return null;
      if (url.protocol === 'vn.quangtu.tutam:') {
        const path = `/${`${url.hostname}${url.pathname}`.replace(/^\/+/, '')}`;
        url = new URL(`${path}${url.search}${url.hash}`, 'https://quangtu.vn');
      } else if (url.protocol !== 'https:' || !['quangtu.vn', 'www.quangtu.vn', new URL(NATIVE_BACKEND_ORIGINS[0]).hostname].includes(url.hostname)) {
        return null;
      }
    }
    const decoded = decodeURIComponent(url.pathname);
    // Deep link chỉ điều hướng trang; callback xác thực vẫn thuộc owner đăng nhập.
    if (/^\/\//u.test(decoded) || /[\u0000-\u0020\\]/u.test(decoded)
      || /^\/(?:api|auth|oauth)(?:\/|$)/u.test(decoded)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

// Android retains the cold URL; iOS can return the most recent warm URL.
const LAUNCH_CONSUMED_KEY = 'tutam_native_launch_consumed_url_v2';
const WARM_CONSUMED_KEY = 'tutam_native_warm_consumed_url';

function isLaunchUrlConsumed(path: string): boolean {
  try {
    const storage = window.sessionStorage;
    return storage.getItem(LAUNCH_CONSUMED_KEY) === path || storage.getItem(WARM_CONSUMED_KEY) === path;
  } catch {
    // A restricted browsing session must still be able to open native links.
    return false;
  }
}

function markUrlConsumed(key: string, path: string): void {
  try {
    window.sessionStorage.setItem(key, path);
  } catch {}
}

export function startNativeAppLinks(navigate: (path: string) => Promise<unknown> | void, beforeNavigate?: () => Promise<void>): () => void {
  if (!isNativeApp()) return () => {};
  let disposed = false;
  let receivedWarmUrl = false;
  let navigationGeneration = 0;
  let appHandle: PluginListenerHandle | null = null;
  let removeNotifications: (() => void) | null = null;
  let pendingPath: string | null = null;

  async function open(value: unknown): Promise<void> {
    const path = resolveNativeAppPath(value);
    if (disposed || !path || pendingPath === path) return;
    if (typeof window !== 'undefined'
      && `${window.location.pathname}${window.location.search}${window.location.hash}` === path) {
      navigationGeneration += 1;
      pendingPath = null;
      const target = new URL(path, 'https://quangtu.vn');
      const date = target.searchParams.get('calendarDate');
      // Cùng URL vẫn phải chọn lại ngày widget nếu người dùng vừa duyệt ngày khác trong lịch.
      if (target.pathname === '/' && parseCalendarWidgetDate(date)) {
        window.dispatchEvent(new CustomEvent(CALENDAR_WIDGET_DATE_EVENT, { detail: { date } }));
      }
      if (isPracticeWidgetTarget(target)) {
        // Đóng công cụ không nhất thiết đổi URL; chạm lại widget phải mở lại đúng công cụ.
        window.dispatchEvent(new CustomEvent(PRACTICE_WIDGET_OPEN_EVENT, { detail: { path } }));
      }
      if (target.pathname === '/huong-dan' && target.hash === '#widget-man-hinh-chinh') {
        window.dispatchEvent(new Event(WIDGET_GUIDE_OPEN_EVENT));
      }
      return;
    }
    pendingPath = path;
    const generation = ++navigationGeneration;
    try {
      const canNavigate = () => typeof window === 'undefined'
        || !isPracticeWidgetTarget(new URL(path, 'https://quangtu.vn'))
        || window.dispatchEvent(new CustomEvent(PRACTICE_WIDGET_NAVIGATE_EVENT, { cancelable: true, detail: { path } }));
      // Ask the mounted practice owner before changing its URL or timer state.
      if (!canNavigate()) return;
      if (beforeNavigate) {
        try { await beforeNavigate(); }
        catch { console.warn('Không thể cập nhật timer native trước khi điều hướng.'); }
      }
      if (disposed || generation !== navigationGeneration || !canNavigate()) return;
      await navigate(path);
      if (disposed || generation !== navigationGeneration || typeof window === 'undefined') return;
      const target = new URL(path, 'https://quangtu.vn');
      if (isPracticeWidgetTarget(target)
        && `${window.location.pathname}${window.location.search}${window.location.hash}` === path) {
        // Goto cùng route không mount lại trang; áp dụng ý định sau khi URL và UI đã cập nhật.
        window.dispatchEvent(new CustomEvent(PRACTICE_WIDGET_OPEN_EVENT, { detail: { path } }));
      }
    } catch {
      console.warn('Không thể mở trang từ liên kết native.');
    } finally {
      if (generation === navigationGeneration) pendingPath = null;
    }
  }

  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      if (disposed) return;
      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        const target = resolveNativeAppPath(url);
        if (!target) return;
        receivedWarmUrl = true;
        markUrlConsumed(WARM_CONSUMED_KEY, target);
        void open(target);
      });
      if (disposed) { await handle.remove(); return; }
      appHandle = handle;
      const launch = resolveNativeAppPath((await App.getLaunchUrl())?.url);
      if (!disposed && launch && !isLaunchUrlConsumed(launch)) {
        // Ghi nhận cả URL cũ trả về muộn để WebView tải lại không mở lại URL đó.
        markUrlConsumed(LAUNCH_CONSUMED_KEY, launch);
        if (!receivedWarmUrl) await open(launch);
      }
    } catch {
      console.warn('Không thể đăng ký liên kết native.');
    }
  })();
  void (async () => {
    try {
      const remove = await addNotificationActionListener(({ notification }) => {
        const target = resolveNativeAppPath(notification?.extra?.target ?? '/tu-tap');
        if (!target) return;
        // Notification hợp lệ mới hơn phải thắng URL khởi động đang chờ bridge trả về.
        receivedWarmUrl = true;
        void open(target);
      });
      if (disposed) remove?.();
      else removeNotifications = remove;
    } catch {
      console.warn('Không thể đăng ký thao tác thông báo native.');
    }
  })();

  return () => {
    if (disposed) return;
    disposed = true;
    removeNotifications?.();
    void appHandle?.remove().catch(() => console.warn('Không thể gỡ listener liên kết native.'));
    pendingPath = null;
  };
}
