import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  getPermission: vi.fn<() => Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>>(),
  requestPermission: vi.fn<() => Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>>(),
  getExactPermission: vi.fn<() => Promise<'granted' | 'denied' | 'unsupported'>>(),
  requestExactPermission: vi.fn<() => Promise<void>>(),
  syncReminders: vi.fn(),
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: mocks.isNative }));
vi.mock('$lib/browser/native-notifications', () => ({
  getUnifiedNotificationPermission: mocks.getPermission,
  requestUnifiedNotificationPermission: mocks.requestPermission,
  getExactReminderPermission: mocks.getExactPermission,
  requestExactReminderPermission: mocks.requestExactPermission,
}));
vi.mock('$lib/browser/practice-reminder-service', () => ({
  syncRemindersWithSystem: mocks.syncReminders,
}));

import {
  STARTUP_NOTIFICATION_PROMPT_KEY,
  STARTUP_NOTIFICATION_SNOOZE_MS,
  dismissStartupNotificationPrompt,
  isStartupNotificationPromptSnoozed,
  recordStartupNotificationPromptGranted,
  requestStartupNotificationPermission,
  shouldShowStartupNotificationPrompt,
} from '../../src/lib/browser/startup-notification-prompt';

describe('Startup Notification Prompt Logic', () => {
  let memoryStorage: Map<string, string>;
  let mockStorage: Storage;

  beforeEach(() => {
    vi.resetModules();
    memoryStorage = new Map<string, string>();
    mockStorage = {
      getItem: vi.fn((key: string) => memoryStorage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        memoryStorage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        memoryStorage.delete(key);
      }),
      clear: vi.fn(() => memoryStorage.clear()),
      key: vi.fn(),
      length: 0,
    };
    vi.stubGlobal('localStorage', mockStorage);
    mocks.isNative.mockReturnValue(true);
    mocks.getPermission.mockResolvedValue('prompt');
    mocks.requestPermission.mockResolvedValue('granted');
    mocks.getExactPermission.mockResolvedValue('granted');
    mocks.requestExactPermission.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not show on web environment (isNativeApp is false)', async () => {
    mocks.isNative.mockReturnValue(false);
    const shouldShow = await shouldShowStartupNotificationPrompt(mockStorage);
    expect(shouldShow).toBe(false);
  });

  it('does not show when permission is already granted', async () => {
    mocks.getPermission.mockResolvedValue('granted');
    const shouldShow = await shouldShowStartupNotificationPrompt(mockStorage);
    expect(shouldShow).toBe(false);
  });

  it('does not show when permission is already denied', async () => {
    mocks.getPermission.mockResolvedValue('denied');
    const shouldShow = await shouldShowStartupNotificationPrompt(mockStorage);
    expect(shouldShow).toBe(false);
  });

  it('shows on native app when permission is prompt and not snoozed', async () => {
    mocks.getPermission.mockResolvedValue('prompt');
    const shouldShow = await shouldShowStartupNotificationPrompt(mockStorage);
    expect(shouldShow).toBe(true);
  });

  it('does not show when prompt was previously dismissed within snooze window', async () => {
    dismissStartupNotificationPrompt(mockStorage);
    expect(isStartupNotificationPromptSnoozed(mockStorage)).toBe(true);

    const shouldShow = await shouldShowStartupNotificationPrompt(mockStorage);
    expect(shouldShow).toBe(false);
  });

  it('shows again after snooze period expires', async () => {
    const expiredTime = Date.now() - 1000;
    mockStorage.setItem(
      STARTUP_NOTIFICATION_PROMPT_KEY,
      JSON.stringify({ decision: 'dismissed', until: expiredTime })
    );

    expect(isStartupNotificationPromptSnoozed(mockStorage)).toBe(false);
    const shouldShow = await shouldShowStartupNotificationPrompt(mockStorage);
    expect(shouldShow).toBe(true);
  });

  it('never shows again once user granted permission', async () => {
    recordStartupNotificationPromptGranted(mockStorage);
    expect(isStartupNotificationPromptSnoozed(mockStorage)).toBe(true);

    const shouldShow = await shouldShowStartupNotificationPrompt(mockStorage);
    expect(shouldShow).toBe(false);
  });

  it('requestStartupNotificationPermission records granted state upon approval and forwards locale', async () => {
    mocks.requestPermission.mockResolvedValue('granted');
    const result = await requestStartupNotificationPermission(mockStorage, 'en');
    expect(result).toBe('granted');
    expect(isStartupNotificationPromptSnoozed(mockStorage)).toBe(true);
    const stored = JSON.parse(mockStorage.getItem(STARTUP_NOTIFICATION_PROMPT_KEY)!);
    expect(stored.decision).toBe('granted');
    expect(mocks.syncReminders).toHaveBeenCalledWith(undefined, 'en');
  });

  it('requestStartupNotificationPermission triggers exact reminder prompt when exact alarm is denied', async () => {
    mocks.requestPermission.mockResolvedValue('granted');
    mocks.getExactPermission.mockResolvedValue('denied');
    const result = await requestStartupNotificationPermission(mockStorage);
    expect(result).toBe('granted');
    expect(mocks.requestExactPermission).toHaveBeenCalled();
    expect(mocks.syncReminders).toHaveBeenCalled();
  });

  it('requestStartupNotificationPermission snoozes upon user denial', async () => {
    mocks.requestPermission.mockResolvedValue('denied');
    const result = await requestStartupNotificationPermission(mockStorage);
    expect(result).toBe('denied');
    expect(isStartupNotificationPromptSnoozed(mockStorage)).toBe(true);
    const stored = JSON.parse(mockStorage.getItem(STARTUP_NOTIFICATION_PROMPT_KEY)!);
    expect(stored.decision).toBe('dismissed');
    expect(stored.until).toBeGreaterThan(Date.now());
  });
});
