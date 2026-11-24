import { describe, expect, it } from 'vitest';
import { practiceSyncStatusText } from '../../../src/lib/i18n/practice-sync-status';
import type { PracticeSessionOutboxStatus } from '../../../src/lib/browser/practice-session-outbox';

const status: PracticeSessionOutboxStatus = {
  principalId: 'account-a', pendingOperations: 2, phase: 'pending', failure: null, canRetry: true,
};

describe('practice sync notice visibility', () => {
  it.each([false, true])('keeps healthy background sync quiet (English: %s)', english => {
    for (const legacyPending of [false, true]) {
      expect(practiceSyncStatusText(null, legacyPending, english)).toBe('');
      for (const phase of ['idle', 'pending', 'syncing'] as const) {
        expect(practiceSyncStatusText({ ...status, phase }, legacyPending, english)).toBe('');
      }
    }
  });

  it.each([false, true])('retains actionable failures with legacy work pending (English: %s)', english => {
    const failures = ['storage', 'authentication', 'rejected', 'offline', 'retryable'] as const;
    for (const failure of failures) {
      for (const legacyPending of [false, true]) {
        const current = { ...status, phase: 'failed' as const, failure };
        const before = structuredClone(current);
        const message = practiceSyncStatusText(current, legacyPending, english);
        expect(message.length).toBeGreaterThan(0);
        expect(current).toEqual(before);
        if (failure === 'storage') expect(message).toContain(english ? 'Cannot access' : 'Không thể truy cập');
        if (failure === 'authentication') expect(message).toContain(english ? 'Sign in again' : 'Đăng nhập lại');
        if (failure === 'rejected') expect(message).toContain(english ? 'Contact support' : 'liên hệ hỗ trợ');
      }
    }
    expect(practiceSyncStatusText({ ...status, pendingOperations: 0, failure: 'storage', phase: 'failed' }, false, english)).not.toBe('');
  });
});
