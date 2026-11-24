import { describe, expect, it } from 'vitest';
import {
  evaluateNotificationPromptRequirement,
  shouldPresentNativeUpdateDialog,
  shouldPresentNotificationPromptDialog,
} from '../../src/lib/browser/startup-notification-prompt';

describe('startup prompt sequence & permission checks', () => {
  it('requires prompt when basic notification permission is prompt or denied', () => {
    expect(evaluateNotificationPromptRequirement('prompt', 'unsupported')).toEqual({
      showPrompt: true,
      missing: 'notification',
    });
    expect(evaluateNotificationPromptRequirement('denied', 'granted')).toEqual({
      showPrompt: true,
      missing: 'notification',
    });
  });

  it('requires prompt when basic notification is granted on Android but exact alarm is denied', () => {
    expect(evaluateNotificationPromptRequirement('granted', 'denied')).toEqual({
      showPrompt: true,
      missing: 'exact_alarm',
    });
  });

  it('does not prompt when basic notification is granted and exact alarm is granted or unsupported', () => {
    expect(evaluateNotificationPromptRequirement('granted', 'granted')).toEqual({
      showPrompt: false,
      missing: 'none',
    });
    expect(evaluateNotificationPromptRequirement('granted', 'unsupported')).toEqual({
      showPrompt: false,
      missing: 'none',
    });
  });

  it('does not prompt when notifications are unsupported on platform', () => {
    expect(evaluateNotificationPromptRequirement('unsupported', 'denied')).toEqual({
      showPrompt: false,
      missing: 'none',
    });
  });

  it('presents NativeUpdatePrompt first and blocks NotificationPromptModal until update prompt closes', () => {
    const updateVisible = shouldPresentNativeUpdateDialog({
      home: true,
      hasRelease: true,
      appDialogOpen: false,
      dismissedInOpening: false,
      blocked: false,
    });
    expect(updateVisible).toBe(true);

    // NotificationPromptModal must NOT open while NativeUpdatePrompt is visible
    expect(
      shouldPresentNotificationPromptDialog({
        blocked: updateVisible,
        dismissedInSession: false,
        isAdminRoute: false,
        hasBlockingOverlay: false,
        missing: 'notification',
      }),
    ).toBe(false);

    // After user closes NativeUpdatePrompt (dismissedInOpening = true), NotificationPromptModal opens
    const updateAfterDismiss = shouldPresentNativeUpdateDialog({
      home: true,
      hasRelease: true,
      appDialogOpen: false,
      dismissedInOpening: true,
      blocked: false,
    });
    expect(updateAfterDismiss).toBe(false);
    expect(
      shouldPresentNotificationPromptDialog({
        blocked: updateAfterDismiss,
        dismissedInSession: false,
        isAdminRoute: false,
        hasBlockingOverlay: false,
        missing: 'exact_alarm',
      }),
    ).toBe(true);
  });

  it('shows NativeUpdatePrompt again on next app opening even if dismissed in previous opening', () => {
    // Next opening resets dismissedInOpening = false (no 24h snooze)
    expect(
      shouldPresentNativeUpdateDialog({
        home: true,
        hasRelease: true,
        appDialogOpen: false,
        dismissedInOpening: false,
        blocked: false,
      }),
    ).toBe(true);
  });
});
