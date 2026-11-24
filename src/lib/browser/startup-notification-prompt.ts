import { browser } from '$app/environment';
import { isNativeApp } from '$lib/browser/native-platform';
import {
  getUnifiedNotificationPermission,
  requestUnifiedNotificationPermission,
  getExactReminderPermission,
  requestExactReminderPermission,
} from '$lib/browser/native-notifications';
import { syncRemindersWithSystem } from '$lib/browser/practice-reminder-service';

export const STARTUP_NOTIFICATION_PROMPT_KEY = 'tutam_startup_notification_prompt_v1';
export const STARTUP_NOTIFICATION_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 ngày

export interface StartupNotificationPromptState {
  decision: 'granted' | 'dismissed';
  until?: number;
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (browser && typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function isStartupNotificationPromptSnoozed(storage?: Storage): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    const raw = target.getItem(STARTUP_NOTIFICATION_PROMPT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StartupNotificationPromptState;
    if (parsed.decision === 'granted') return true;
    if (parsed.until && Date.now() < parsed.until) return true;
    return false;
  } catch {
    return false;
  }
}

export function dismissStartupNotificationPrompt(storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    const state: StartupNotificationPromptState = {
      decision: 'dismissed',
      until: Date.now() + STARTUP_NOTIFICATION_SNOOZE_MS,
    };
    target.setItem(STARTUP_NOTIFICATION_PROMPT_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors
  }
}

export function recordStartupNotificationPromptGranted(storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    const state: StartupNotificationPromptState = {
      decision: 'granted',
    };
    target.setItem(STARTUP_NOTIFICATION_PROMPT_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors
  }
}

export type NotificationPermissionMissing = 'none' | 'notification' | 'exact_alarm';

export interface NotificationPromptRequirement {
  showPrompt: boolean;
  missing: NotificationPermissionMissing;
}

export function evaluateNotificationPromptRequirement(
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported',
  exactPermission: 'granted' | 'denied' | 'unsupported',
): NotificationPromptRequirement {
  if (permission === 'unsupported') {
    return { showPrompt: false, missing: 'none' };
  }
  if (permission !== 'granted') {
    return { showPrompt: true, missing: 'notification' };
  }
  if (exactPermission === 'denied') {
    return { showPrompt: true, missing: 'exact_alarm' };
  }
  return { showPrompt: false, missing: 'none' };
}

export function shouldPresentNativeUpdateDialog(input: {
  home: boolean;
  hasRelease: boolean;
  appDialogOpen: boolean;
  dismissedInOpening: boolean;
  blocked: boolean;
}): boolean {
  return input.home && input.hasRelease && !input.appDialogOpen && !input.dismissedInOpening && !input.blocked;
}

export function shouldPresentNotificationPromptDialog(input: {
  blocked: boolean;
  dismissedInSession: boolean;
  isAdminRoute: boolean;
  hasBlockingOverlay: boolean;
  missing: NotificationPermissionMissing;
}): boolean {
  return (
    !input.blocked &&
    !input.dismissedInSession &&
    !input.isAdminRoute &&
    !input.hasBlockingOverlay &&
    input.missing !== 'none'
  );
}

export async function shouldShowStartupNotificationPrompt(storage?: Storage): Promise<boolean> {
  if (!browser || !isNativeApp()) return false;
  if (isStartupNotificationPromptSnoozed(storage)) return false;
  const permission = await getUnifiedNotificationPermission();
  return permission === 'prompt';
}

export async function requestStartupNotificationPermission(
  storage?: Storage,
  locale = 'vi',
): Promise<'granted' | 'denied'> {
  const result = await requestUnifiedNotificationPermission();
  if (result === 'granted') {
    recordStartupNotificationPromptGranted(storage);
    try {
      if ((await getExactReminderPermission()) === 'denied') {
        await requestExactReminderPermission();
      }
    } catch {
      // Exact alarm prompt failure should not block notification flow
    }
    try {
      void syncRemindersWithSystem(undefined, locale);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('quangtu:notification-permission-granted'));
      }
    } catch {
      // Sync failure should not block prompt completion
    }
    return 'granted';
  } else {
    dismissStartupNotificationPrompt(storage);
    return 'denied';
  }
}
