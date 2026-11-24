import { describe, expect, it } from 'vitest';
import {
  isUpdateSnoozed,
  snoozeUpdate,
  SNOOZE_UPDATE_STORAGE_KEY,
  SNOOZE_UPDATE_DURATION_MS,
} from '../../src/lib/browser/native-app-update';
import { STORE_URLS } from '../../src/lib/contracts/native-app-update';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

describe('native app update snooze', () => {
  const androidRelease = {
    version: '1.2.29',
    build: '33',
    storeUrl: STORE_URLS.android,
  };

  const iosRelease = {
    version: '1.2.29',
    storeUrl: STORE_URLS.ios,
  };

  it('is not snoozed when storage is empty', () => {
    const storage = new MockStorage();
    expect(isUpdateSnoozed(androidRelease, storage)).toBe(false);
  });

  it('snoozes an Android release for 24 hours', () => {
    const storage = new MockStorage();
    const now = 1_000_000;
    snoozeUpdate(androidRelease, storage, now);

    // Active within 24 hours
    expect(isUpdateSnoozed(androidRelease, storage, now + 1_000)).toBe(true);
    expect(isUpdateSnoozed(androidRelease, storage, now + SNOOZE_UPDATE_DURATION_MS - 1)).toBe(true);

    // Expired after 24 hours
    expect(isUpdateSnoozed(androidRelease, storage, now + SNOOZE_UPDATE_DURATION_MS + 1)).toBe(false);
  });

  it('does not snooze if a newer build or version is released', () => {
    const storage = new MockStorage();
    const now = 1_000_000;
    snoozeUpdate(androidRelease, storage, now);

    // Newer Android build
    const nextAndroidBuild = { ...androidRelease, build: '34' };
    expect(isUpdateSnoozed(nextAndroidBuild, storage, now + 100)).toBe(false);

    // Newer version
    const nextVersion = { ...androidRelease, version: '1.2.30', build: '34' };
    expect(isUpdateSnoozed(nextVersion, storage, now + 100)).toBe(false);
  });

  it('snoozes an iOS release and supports release without build number', () => {
    const storage = new MockStorage();
    const now = 1_000_000;
    snoozeUpdate(iosRelease, storage, now);

    expect(isUpdateSnoozed(iosRelease, storage, now + 1_000)).toBe(true);

    const nextIosVersion = { ...iosRelease, version: '1.2.30' };
    expect(isUpdateSnoozed(nextIosVersion, storage, now + 1_000)).toBe(false);
  });

  it('handles invalid or corrupted storage data safely', () => {
    const storage = new MockStorage();
    storage.setItem(SNOOZE_UPDATE_STORAGE_KEY, 'invalid-json');
    expect(isUpdateSnoozed(androidRelease, storage)).toBe(false);
  });
});
