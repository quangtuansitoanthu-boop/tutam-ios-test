import { describe, expect, it } from 'vitest';
import { GET } from '../../src/routes/api/app-version/+server';
import { parseStoreRelease, isOlderNativeBuild, STORE_URLS } from '../../src/lib/contracts/native-app-update';

describe('native app update policy', () => {
  it('preserves the legacy response when the store releases are not configured', async () => {
    const response = await GET({ platform: { env: {} } } as never);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      minVersion: '1.0.0', latestBuild: expect.any(String), nativeUpdates: { ios: null, android: null },
    });
  });

  it('allows a published iOS target independently of Google Play', async () => {
    const ios = { version: '1.0.10', storeUrl: STORE_URLS.ios };
    const android = { version: '1.2.29', build: '33', storeUrl: 'https://play.google.com/apps/testing/vn.quangtu.tutam' };
    const response = await GET({ platform: { env: { NATIVE_APP_UPDATES: JSON.stringify({ ios, android }) } } } as never);
    expect((await response.json()).nativeUpdates).toEqual({ ios, android: null });
  });

  it('requires the official app listing and release build on Android', () => {
    const release = { storeUrl: STORE_URLS.android, version: '1.2.29', build: '33' };
    expect(parseStoreRelease('android', release)).toEqual(release);
    expect(parseStoreRelease('android', { ...release, build: undefined })).toBeNull();
    expect(parseStoreRelease('android', { ...release, storeUrl: STORE_URLS.android + '.other' })).toBeNull();
    expect(parseStoreRelease('ios', { version: '1.0.2', storeUrl: 'https://apps.apple.com/app/id123' })).toBeNull();
    expect(parseStoreRelease('ios', { version: '1.0.2-beta', storeUrl: STORE_URLS.ios })).toBeNull();
  });

  it('compares iOS version parts and Android build numbers without offering downgrades', () => {
    const ios = { version: '1.0.10', storeUrl: STORE_URLS.ios };
    expect(isOlderNativeBuild('ios', { version: '1.0.9', build: '9999' }, ios)).toBe(true);
    expect(isOlderNativeBuild('ios', { version: '1.0.10', build: '1' }, ios)).toBe(false);
    expect(isOlderNativeBuild('ios', { version: '1.1', build: '1' }, ios)).toBe(false);
    expect(isOlderNativeBuild('ios', { version: 'invalid', build: '1' }, ios)).toBe(false);
    expect(isOlderNativeBuild('ios', { version: '1.0', build: '1' }, { ...ios, version: '1.0.0' })).toBe(false);
    const android = { version: '1.2.29', build: '100', storeUrl: STORE_URLS.android };
    expect(isOlderNativeBuild('android', { version: '1.2.29', build: '99' }, android)).toBe(true);
    expect(isOlderNativeBuild('android', { version: '1.2.29', build: '100' }, android)).toBe(false);
    expect(isOlderNativeBuild('android', { version: '1.2.29', build: '101' }, android)).toBe(false);
    expect(isOlderNativeBuild('android', { version: '1.2.30', build: '99' }, android)).toBe(false);
    expect(isOlderNativeBuild('android', { version: '1.2.28', build: '101' }, android)).toBe(false);
  });
});
