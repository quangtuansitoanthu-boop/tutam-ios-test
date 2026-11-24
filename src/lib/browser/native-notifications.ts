/**
 * Unified notification abstraction.
 *
 * - On Capacitor Android/iOS: uses @capacitor/local-notifications (native OS notifications).
 * - On Web browser: falls back to the Web Notification API via ServiceWorker.
 *
 * Android WebView does NOT support the Web Notification API, so the native
 * Capacitor plugin is required for the app to show any OS-level notification.
 */

import { isNativeApp, nativePlatform } from './native-platform';

const notificationQaOperations = ['sample-ui', 'sample-service', 'permission-ui', 'ios-section-gate', 'native-check', 'native-request', 'native-show'] as const;
const notificationQaPhases = ['start', 'end', 'import-start', 'import-ready', 'native-start', 'settled', 'failed', 'new', 'reuse', 'await', 'await-settled', 'released', 'check-start', 'check-settled', 'request-start', 'request-settled', 'schedule-start', 'schedule-settled', 'channel-start', 'channel-settled', 'fallback-start', 'fallback-settled', 'sync-start', 'sync-settled'] as const;
type NotificationQaResult = 'granted' | 'denied' | 'prompt' | 'unsupported' | boolean;
let notificationQaRows = 0;
let notificationQaOperationId = 0;

/** Fixed phases only, forwarded to the existing opt-in DEBUG iOS QA writer. */
export function beginNativeNotificationQA(operation: typeof notificationQaOperations[number]):
  ((phase: typeof notificationQaPhases[number], result?: NotificationQaResult) => void) | undefined {
  try {
    if (typeof window === 'undefined' || !isNativeApp() || nativePlatform() !== 'ios'
      || notificationQaRows >= 96 || !notificationQaOperations.includes(operation)) return;
    const handler = (window as Window & { webkit?: { messageHandlers?: { tutamQAEvents?: { postMessage: (body: string) => void } } } }).webkit?.messageHandlers?.tutamQAEvents;
    if (typeof handler?.postMessage !== 'function') return;
    const operationId = ++notificationQaOperationId;
    return (phase, result) => {
      try {
        if (notificationQaRows >= 96 || !notificationQaPhases.includes(phase)
          || (result !== undefined && typeof result !== 'boolean' && !['granted', 'denied', 'prompt', 'unsupported'].includes(result))) return;
        const time = performance.now();
        if (!Number.isFinite(time)) return;
        notificationQaRows += 1;
        handler.postMessage(JSON.stringify({ type: 'notification-phase', operation, operationId, phase,
          time, ...(result === undefined ? {} : { result }) }));
      } catch { /* Diagnostic failures must not change notification behavior. */ }
    };
  } catch { return; }
}

/** Chỉ đọc quyền đặc biệt Android; việc mở cài đặt thuộc luồng xin quyền riêng. */
export async function getExactReminderPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (nativePlatform() !== 'android') return 'unsupported';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch { return 'unsupported'; }
}

export async function requestExactReminderPermission(): Promise<void> {
  if (nativePlatform() !== 'android') return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.changeExactNotificationSetting();
}

const STARTUP_EXACT_PERMISSION_KEY = 'tt_exact_alarm_startup_requested_v1';
let startupExactPermissionRequest: Promise<void> | null = null;

export async function requestStartupExactReminderPermission(shouldContinue: () => boolean = () => true): Promise<void> {
  if (typeof window === 'undefined' || !isNativeApp() || nativePlatform() !== 'android') return;
  if (!startupExactPermissionRequest) {
    startupExactPermissionRequest = (async () => {
      try {
        if (await getExactReminderPermission() !== 'denied' || !shouldContinue()) return;
        // Quyền thuộc thiết bị, không thuộc tài khoản; đánh dấu trước khi rời app
        // để lần quay lại từ cài đặt không mở yêu cầu lần nữa.
        const storage = window.localStorage;
        if (storage.getItem(STARTUP_EXACT_PERMISSION_KEY)) return;
        storage.setItem(STARTUP_EXACT_PERMISSION_KEY, '1');
        try {
          await requestExactReminderPermission();
        } catch {
          storage.removeItem(STARTUP_EXACT_PERMISSION_KEY);
        }
      } catch {
        // Bridge hoặc storage chưa sẵn sàng không được ngăn app khởi động.
      }
    })();
  }
  try {
    await startupExactPermissionRequest;
  } finally {
    startupExactPermissionRequest = null;
  }
}

const ICON = '/assets/branding/tu-tap-logo.png';

export interface UnifiedNotificationScheduleOptions {
  id: number;
  title: string;
  body: string;
  sound?: string;
  largeBody?: string;
  summaryText?: string;
  schedule?: {
    at?: Date;
    repeats?: boolean;
    every?: 'year' | 'month' | 'two-weeks' | 'week' | 'day' | 'hour' | 'minute' | 'second';
    on?: {
      year?: number;
      month?: number;
      day?: number;
      weekday?: number;
      hour?: number;
      minute?: number;
    };
    allowWhileIdle?: boolean;
  };
  extra?: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

let channelCreated = false;

export async function ensureNotificationChannel(): Promise<void> {
  if (nativePlatform() !== 'android' || channelCreated) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({
      id: 'tutam_daily',
      name: 'Nhắc nhở tu tập & Thập Trai',
      description: 'Thông báo ngày Thập Trai, Vía Phật, Thọ Khang Bảo Giám và thời khóa tu tập',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#C8963E',
    });
    channelCreated = true;
  } catch (e) {
    console.warn('Could not create notification channel:', e);
  }
}

async function showNativeNotification(title: string, body: string, id?: number, sound?: string): Promise<void> {
  const qa = beginNativeNotificationQA('native-show');
  qa?.('channel-start');
  await ensureNotificationChannel();
  qa?.('channel-settled');
  qa?.('import-start');
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  qa?.('import-ready');
  qa?.('native-start');
  await LocalNotifications.schedule({
    notifications: [
      {
        id: id ?? (Date.now() % 2_147_483_647), // must be a 32-bit int
        title,
        body,
        channelId: 'tutam_daily',
        smallIcon: 'ic_notification_small',
        iconColor: '#C8963E',
        sound,
        attachments: undefined,
        actionTypeId: '',
        extra: null,
      },
    ],
  });
  qa?.('settled');
}

async function showWebNotification(title: string, options: NotificationOptions): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      // ready có thể chờ vô hạn nếu worker chưa đăng ký hoặc bị gỡ (ví dụ ở dev).
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active) {
        await registration.showNotification(title, options);
        return;
      }
    } catch {
      // fall through to constructor
    }
  }
  try {
    new Notification(title, options);
  } catch {
    // Notifications are best-effort
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request notification permission from the OS (native) or browser.
 * Returns 'granted' | 'denied' | 'prompt' | 'unsupported'.
 */
let nativePermissionRequest: Promise<'granted' | 'denied' | 'unsupported'> | null = null;

export async function requestUnifiedNotificationPermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (isNativeApp()) {
    const qa = beginNativeNotificationQA('native-request');
    qa?.(nativePermissionRequest === null ? 'new' : 'reuse');
    // A settings entry and an explicit permission button may arrive together.
    // Share only the in-flight OS dialog, never cache its result across retries.
    nativePermissionRequest ??= (async () => {
      try {
        qa?.('import-start');
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        qa?.('import-ready');
        qa?.('native-start');
        const result = await LocalNotifications.requestPermissions();
        const permission = result.display === 'granted' ? 'granted' as const : 'denied' as const;
        qa?.('settled', permission);
        return permission;
      } catch { qa?.('failed'); return 'unsupported' as const; }
    })();
    const request = nativePermissionRequest;
    qa?.('await');
    try { const result = await request; qa?.('await-settled', result); return result; }
    finally { if (nativePermissionRequest === request) { nativePermissionRequest = null; qa?.('released'); } }
  }

  // Web path
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.requestPermission() as Promise<'granted' | 'denied' | 'prompt'>;
}

/**
 * Check the current notification permission without prompting.
 * Returns 'granted' | 'denied' | 'prompt' | 'unsupported'.
 */
export async function getUnifiedNotificationPermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (isNativeApp()) {
    const qa = beginNativeNotificationQA('native-check');
    try {
      qa?.('import-start');
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      qa?.('import-ready');
      qa?.('native-start');
      const result = await LocalNotifications.checkPermissions();
      const permission = result.display === 'granted' ? 'granted' : result.display === 'denied' ? 'denied' : 'prompt';
      qa?.('settled', permission);
      return permission;
    } catch {
      qa?.('failed');
      return 'unsupported';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as 'granted' | 'denied' | 'prompt';
}

/**
 * Show a notification immediately (fire-and-forget, best-effort).
 * Requires permission to have been granted first.
 */
export async function showUnifiedNotification(
  title: string,
  body: string,
  id?: number,
  sound?: string,
): Promise<void> {
  if (isNativeApp()) {
    await showNativeNotification(title, body, id, sound);
    return;
  }

  await showWebNotification(title, { body, icon: ICON, badge: ICON });
}

/**
 * Schedule a batch of notifications (works primarily on Native Capacitor;
 * logs or performs best-effort fallback on web).
 */
export async function scheduleUnifiedNotifications(
  items: UnifiedNotificationScheduleOptions[],
): Promise<boolean> {
  if (items.length === 0) return true;

  if (isNativeApp()) {
    try {
      await ensureNotificationChannel();
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          sound: item.sound,
          largeBody: item.largeBody ?? item.body,
          summaryText: item.summaryText,
          channelId: 'tutam_daily',
          smallIcon: 'ic_notification_small',
          iconColor: '#C8963E',
          schedule: item.schedule as any,
          extra: item.extra ?? null,
        })),
      });
      return true;
    } catch (err) {
      console.error('Failed to schedule native notifications:', err);
      return false;
    }
  }

  // On Web: background scheduled notifications require Push service or active page;
  // best-effort info log
  return false;
}

const reminderTypes = new Set(['daily_schedule', 'lunar_eve', 'lunar_morning', 'personal_eve', 'personal_morning']);
/** Pending cancellation does not remove private content already visible in Notification Center. */
export async function clearDeliveredPersonalReminderNotifications(): Promise<void> {
  if (!isNativeApp()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { notifications } = await LocalNotifications.getDeliveredNotifications();
  // Android's delivered DTO exposes tag/data; iOS preserves the scheduled extra payload.
  const personal = notifications.filter(item => nativePlatform() === 'android'
    ? item.tag === 'tutam-personal'
    : item.extra?.type === 'personal_eve' || item.extra?.type === 'personal_morning');
  if (personal.length) await LocalNotifications.removeDeliveredNotifications({ notifications: personal });
}

export function isReminderNotification(item: { extra?: Record<string, unknown> }) {
  return typeof item.extra?.type === 'string' && reminderTypes.has(item.extra.type);
}
/** Include other consumers only to reserve their capacity; callers must not cancel them. */
export async function getPendingReminderNotifications(includeUnowned = false): Promise<Array<{ id: number; extra?: Record<string, unknown> }>> {
  if (!isNativeApp()) return [];
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { notifications } = await LocalNotifications.getPending();
  return includeUnowned ? notifications : notifications.filter(isReminderNotification);
}

/**
 * Cancel specific notifications by ID list.
 */
export async function cancelUnifiedNotifications(ids: number[], strict = false): Promise<void> {
  if (ids.length === 0) return;
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({
        notifications: ids.map((id) => ({ id })),
      });
    } catch (err) {
      if (strict) throw err;
      console.warn('Failed to cancel native notifications:', err);
    }
  }
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllUnifiedNotifications(): Promise<void> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length) {
        await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) });
      }
    } catch (err) {
      console.warn('Failed to cancel all native notifications:', err);
    }
  }
}

/**
 * Get pending scheduled notifications list.
 */
export async function getPendingUnifiedNotifications(): Promise<number[]> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const res = await LocalNotifications.getPending();
      return (res.notifications ?? []).map((n) => n.id);
    } catch (err) {
      console.warn('Failed to get pending notifications:', err);
      return [];
    }
  }
  return [];
}

/**
 * Listen for notification click actions (deep linking).
 */
export async function addNotificationActionListener(
  handler: (action: { id: number; actionId: string; notification: any }) => void,
): Promise<(() => void) | null> {
  if (!isNativeApp()) return null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const handle = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        handler({
          id: action.notification.id,
          actionId: action.actionId,
          notification: action.notification,
        });
      },
    );
    return () => {
      void handle.remove().catch(() => {
        console.warn('Could not remove notification action listener.');
      });
    };
  } catch (err) {
    console.warn('Could not register notification action listener:', err);
    return null;
  }
}

