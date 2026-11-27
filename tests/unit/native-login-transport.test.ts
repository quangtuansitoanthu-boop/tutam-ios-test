import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const mocks = vi.hoisted(() => ({ native: vi.fn(() => true), request: vi.fn(), apply: vi.fn(() => true), snapshot: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native }, CapacitorHttp: { request: mocks.request } }));
vi.mock('$lib/stores/session.svelte', () => ({
  SESSION_CHANGE_EVENT: 'quangtu:session-changed',
  getBrowserSessionSnapshot: mocks.snapshot,
  applyBrowserSession: mocks.apply,
  detectUserRole: (_email: string, _name: string, role: string) => role === 'admin' ? 'admin' : 'user',
}));
import { verifyNativeLogin } from '../../src/lib/browser/native-auth-transport';
import { loginWithAppleNative, loginWithGoogleNative } from '../../src/lib/browser/native-auth';
import * as nativeAuth from '../../src/lib/browser/native-auth';
import { beginNativeAuthMutation, isNativeAuthMutationActive } from '../../src/lib/browser/native-auth-transaction';

const login = () => ({ success: true, userId: 'server-user',
  user: { id: 'server-user', email: 'verified@example.test', displayName: 'Verified Name', avatarUrl: 'https://example.test/avatar', role: 'user' },
  session: { csrfToken: 'server-csrf', expiresAt: new Date(Date.now() + 3600_000).toISOString() } });
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', 'ios-client.apps.googleusercontent.com');
  mocks.native.mockReturnValue(true);
  const cap = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
    GoogleAuth: { initialize: vi.fn(), signOut: vi.fn(), signIn: vi.fn(async () => ({ id: 'sdk-user', email: 'sdk@example.test', name: 'SDK Name', authentication: { idToken: 'google-token' } })) },
    SignInWithApple: { authorize: vi.fn(async () => ({ response: { identityToken: 'apple-token', authorizationCode: 'apple-code' } })) },
  } };
  vi.stubGlobal('Capacitor', cap);
  vi.stubGlobal('window', { Capacitor: cap, location: { origin: 'https://localhost', reload: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  mocks.snapshot.mockReturnValue({ authenticated: false, user: null, csrfToken: null });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  mocks.request.mockResolvedValue({ status: 200, data: login(), headers: { 'content-type': 'application/json' } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([true, false])('only persists the Worker host after a successful native verification (%s)', async (success) => {
  const oldOrigin = 'https://quangtu.vn';
  const worker = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
  const values = new Map([['quangtu_active_url', oldOrigin]]);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  fetcher.mockResolvedValueOnce(new Response('<html>parked</html>', { headers: { 'content-type': 'text/html' } }));
  fetcher.mockResolvedValueOnce(Response.json({ ok: true, service: 'quangtu-worker', database: 'sealed' }));
  mocks.request.mockImplementationOnce(async () => {
    expect(values.get('quangtu_active_url')).toBe(oldOrigin);
    return { status: success ? 200 : 401, data: success ? login() : { message: 'Denied' }, headers: {} };
  });

  expect(await loginWithGoogleNative()).toMatchObject({ success });
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: worker + '/api/auth/native-verify' }));
  expect(values.get('quangtu_active_url')).toBe(success ? worker : oldOrigin);
});

describe('native login transport and session validation', () => {
  it.each([-5, '-5'])('recognizes localized iOS Google cancellation code %s and permits retry', async code => {
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    google.signIn.mockRejectedValueOnce({ code, message: 'Người dùng đã đóng cửa sổ đăng nhập.' });
    expect(await loginWithGoogleNative()).toEqual({ success: false, error: 'Đã hủy đăng nhập.' });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(isNativeAuthMutationActive()).toBe(false);
    expect(await loginWithGoogleNative()).toEqual({ success: true });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each(['initialize', 'signOut'] as const)('stops iOS Google login when %s fails instead of restoring an old account', async method => {
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    google[method].mockRejectedValueOnce(new Error('Native Google setup failed.'));
    expect(await loginWithGoogleNative()).toMatchObject({ success: false });
    expect(google.signIn).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(isNativeAuthMutationActive()).toBe(false);
    expect(await loginWithGoogleNative()).toEqual({ success: true });
  });
  it('keeps unrelated iOS Google errors containing 10 out of the Android SHA configuration branch', async () => {
    (window as any).Capacitor.Plugins.GoogleAuth.signIn.mockRejectedValueOnce({ code: '-2', message: 'Keychain error 101.' });
    expect(await loginWithGoogleNative()).toEqual({ success: false, error: 'Keychain error 101.' });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('keeps explicit non-cancellation iOS Google errors visible even when their message mentions cancellation', async () => {
    (window as any).Capacitor.Plugins.GoogleAuth.signIn.mockRejectedValueOnce({ code: '-2', message: 'Keychain unavailable after cancellation.' });
    expect(await loginWithGoogleNative()).toEqual({ success: false, error: 'Keychain unavailable after cancellation.' });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([
    [{ code: '12501', message: 'Đã đóng' }, 'Đã hủy đăng nhập.'],
    [new Error('SIGN_IN_CANCELLED'), 'Đã hủy đăng nhập.'],
    [{ code: '10', message: 'Developer error' }, 'Mã 10'],
  ])('preserves Android Google error classification for %j', async (error, expected) => {
    (window as any).Capacitor.getPlatform = () => 'android';
    (window as any).Capacitor.Plugins.GoogleAuth.signIn.mockRejectedValueOnce(error);
    expect(await loginWithGoogleNative()).toMatchObject({ success: false, error: expect.stringContaining(expected) });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(isNativeAuthMutationActive()).toBe(false);
  });
  it('switches iOS Google A to B after logout and a cancelled retry without publishing A again', async () => {
    const signIn = loginWithGoogleNative;
    const sdk = (window as any).Capacitor.Plugins.GoogleAuth.signIn;
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const receipt = (id: string) => ({ ...login(), userId: id, user: { ...login().user, id }, session: { ...login().session, csrfToken: `csrf-${id}` } });
    mocks.request.mockResolvedValueOnce({ status: 200, data: receipt('account-a'), headers: {} });
    expect(await signIn()).toEqual({ success: true });
    mocks.snapshot.mockReturnValue({ authenticated: true, user: { id: 'account-a', role: 'user' }, csrfToken: 'csrf-account-a' });
    // Caller revokes the server session before this native cleanup; no provider token is needed to log out.
    await nativeAuth.logoutNativeAuth();
    expect(storage.has('tutam_native_auth_provider')).toBe(false);
    mocks.snapshot.mockReturnValue({ authenticated: false, user: null, csrfToken: null });
    sdk.mockRejectedValueOnce({ code: '-5', message: 'Đóng đăng nhập' });
    expect(await signIn()).toEqual({ success: false, error: 'Đã hủy đăng nhập.' });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(isNativeAuthMutationActive()).toBe(false);
    mocks.request.mockResolvedValueOnce({ status: 200, data: receipt('account-b'), headers: {} });
    expect(await signIn()).toEqual({ success: true });
    expect(mocks.apply.mock.calls.map(([session]) => session.user.id)).toEqual(['account-a', 'account-b']);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(storage.get('tutam_native_auth_provider')).toBe('google');
    expect(isNativeAuthMutationActive()).toBe(false);
  });
  it.each([
    { domain: 'com.apple.AuthenticationServices.AuthorizationError', code: 1001 },
    { domain: 'com.apple.AuthenticationServices.AuthorizationError', code: '1001' },
    new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)'),
  ])('treats Apple authorization cancellation as a silent result and permits a fresh retry: %j', async error => {
    const apple = (window as any).Capacitor.Plugins.SignInWithApple;
    apple.authorize.mockRejectedValueOnce(error);
    expect(await loginWithAppleNative()).toEqual({ success: false });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(isNativeAuthMutationActive()).toBe(false);
    expect(await loginWithAppleNative()).toEqual({ success: true });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { domain: 'NetworkError', code: 1001, message: 'Network request failed (1001)' },
    { code: 1001, message: 'Some unrelated error 1001' },
    { domain: 'com.apple.AuthenticationServices.AuthorizationError', code: 1000, message: 'Authorization configuration failed' },
    { code: 1000, message: 'com.apple.AuthenticationServices.AuthorizationError error 1001.' },
    new Error('The operation failed. (com.apple.AuthenticationServices.AuthorizationError error 10010.)'),
  ])('keeps a genuine Apple/provider failure visible instead of suppressing unrelated cancellation-like text: %j', async error => {
    (window as any).Capacitor.Plugins.SignInWithApple.authorize.mockRejectedValueOnce(error);
    expect(await loginWithAppleNative()).toMatchObject({ success: false, error: expect.any(String) });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(isNativeAuthMutationActive()).toBe(false);
  });
  it.each([
    ['vi', 'Chưa thể đăng nhập bằng Apple. Vui lòng thử lại hoặc chọn đăng nhập bằng Google.'],
    ['en', 'Could not sign in with Apple. Please try again or sign in with Google.'],
  ])('explains the Apple system error in %s and allows a fresh attempt', async (locale, message) => {
    vi.stubGlobal('localStorage', { getItem: () => locale, setItem: vi.fn() });
    const apple = (window as any).Capacitor.Plugins.SignInWithApple;
    apple.authorize.mockRejectedValueOnce(new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)'));
    expect(await loginWithAppleNative()).toEqual({ success: false, error: message });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(isNativeAuthMutationActive()).toBe(false);
    expect(await loginWithAppleNative()).toEqual({ success: true });
  });
  it('keeps Apple deletion reauthorization cancellation friendly without returning credentials or replacing the session', async () => {
    (window as any).Capacitor.Plugins.SignInWithApple.authorize.mockRejectedValueOnce(
      new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)'));
    await expect(nativeAuth.authorizeAppleAccountDeletion()).rejects.toThrow('Chưa thể xác minh phiên đăng nhập. Vui lòng thử lại.');
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it('does not start SDK or cookie verification while logout/delete owns the native transaction', async () => {
    const release = beginNativeAuthMutation()!;
    try {
      expect((await loginWithGoogleNative()).success).toBe(false);
      expect(mocks.request).not.toHaveBeenCalled();
      expect((window as any).Capacitor.Plugins.GoogleAuth.signIn).not.toHaveBeenCalled();
    } finally { release(); }
    expect((await loginWithGoogleNative()).success).toBe(true);
  });
  it('holds the native cookie transaction through server receipt and local session publication', async () => {
    let finish!: () => void;
    mocks.request.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ status: 200, data: login(), headers: {} }); }));
    const pending = loginWithGoogleNative();
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    const heldDuringHttp = isNativeAuthMutationActive();
    const competing = beginNativeAuthMutation(); competing?.();
    let heldDuringPublication = false;
    mocks.apply.mockImplementationOnce(() => {
      heldDuringPublication = isNativeAuthMutationActive();
      return true;
    });
    finish();
    expect((await pending).success).toBe(true);
    expect(heldDuringHttp).toBe(true);
    expect(competing).toBeNull();
    expect(heldDuringPublication).toBe(true);
    expect(isNativeAuthMutationActive()).toBe(false);
  });
  it.each([false, true])('keeps equivalent resume valid but latches a replaced session even when it changes back (changed=%s)', async changed => {
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    google.signIn.mockImplementationOnce(async () => {
      const initial = mocks.snapshot();
      const callback = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === 'quangtu:session-changed')![1] as EventListener;
      if (changed) mocks.snapshot.mockReturnValue({ authenticated: true, user: { id: 'replacement', role: 'user' }, csrfToken: 'new-csrf' });
      callback(new Event('quangtu:session-changed'));
      mocks.snapshot.mockReturnValue(initial);
      return { id: 'sdk-user', authentication: { idToken: 'google-token' } };
    });
    expect((await loginWithGoogleNative()).success).toBe(!changed);
    expect(mocks.request).toHaveBeenCalledTimes(changed ? 0 : 1);
    const [event, callback] = vi.mocked(window.addEventListener).mock.calls[0];
    expect(window.removeEventListener).toHaveBeenCalledWith(event, callback);
  });
  it.each([
    ['google', loginWithGoogleNative], ['apple', loginWithAppleNative],
  ] as const)('drops a stale %s SDK result before sending a session-changing verification request', async (provider, signIn) => {
    const plugins = (window as any).Capacitor.Plugins;
    const sdk = provider === 'google' ? plugins.GoogleAuth.signIn : plugins.SignInWithApple.authorize;
    const original = sdk.getMockImplementation()!;
    sdk.mockImplementationOnce(async () => {
      const result = await original();
      mocks.snapshot.mockReturnValue({ authenticated: true, user: { id: 'replacement', role: 'user' }, csrfToken: 'new-csrf' });
      return result;
    });
    expect((await signIn()).success).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it('does not sign out a replacement Google SDK account after delayed initialization', async () => {
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    google.initialize.mockImplementationOnce(async () => {
      mocks.snapshot.mockReturnValue({ authenticated: true, user: { id: 'replacement', role: 'user' }, csrfToken: 'new-csrf' });
    });
    expect((await loginWithGoogleNative()).success).toBe(false);
    expect(google.signOut).not.toHaveBeenCalled();
    expect(google.signIn).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([
    ['google', loginWithGoogleNative], ['apple', loginWithAppleNative],
  ] as const)('does not apply a stale %s verification receipt to the local session', async (provider, signIn) => {
    mocks.request.mockImplementationOnce(async () => {
      mocks.snapshot.mockReturnValue({ authenticated: true, user: { id: 'replacement', role: 'user' }, csrfToken: 'new-csrf' });
      return { status: 200, data: login(), headers: {} };
    });
    expect((await signIn()).success).toBe(false);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it('rejects a second provider while a native login is pending and permits retry after it settles', async () => {
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    let finish!: () => void;
    google.signIn.mockImplementationOnce(() => new Promise(resolve => {
      finish = () => resolve({ id: 'sdk-user', authentication: { idToken: 'google-token' } });
    }));
    const first = loginWithGoogleNative();
    await vi.waitFor(() => expect(google.signIn).toHaveBeenCalledTimes(1));
    expect((await loginWithAppleNative()).success).toBe(false);
    expect((window as any).Capacitor.Plugins.SignInWithApple.authorize).not.toHaveBeenCalled();
    finish();
    expect((await first).success).toBe(true);
    expect((await loginWithAppleNative()).success).toBe(true);
  });
  it.each([false, true])('does not sign out a replacement Google account after delayed initialize (reject=%s)', async reject => {
    let finish!: () => void;
    let current = true;
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    google.initialize.mockImplementation(() => new Promise<void>((resolve, fail) => { finish = () => reject ? fail(new Error('already initialized')) : resolve(); }));
    vi.stubGlobal('localStorage', { getItem: () => 'google', removeItem: vi.fn(), setItem: vi.fn() });
    const pending = nativeAuth.logoutNativeAuth(() => current);
    expect(google.initialize).toHaveBeenCalledTimes(1);
    current = false; finish(); await pending;
    expect(google.signOut).not.toHaveBeenCalled();
  });
  it('does not touch native credentials when the captured logout is already stale', async () => {
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    const storage = { getItem: vi.fn(() => 'google'), removeItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    await nativeAuth.logoutNativeAuth(() => false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(google.initialize).not.toHaveBeenCalled();
    expect(google.signOut).not.toHaveBeenCalled();
  });
  it('preserves the legacy native logout call without a guard argument', async () => {
    const google = (window as any).Capacitor.Plugins.GoogleAuth;
    vi.stubGlobal('localStorage', { getItem: () => 'google', removeItem: vi.fn(), setItem: vi.fn() });
    await nativeAuth.logoutNativeAuth();
    expect(google.signOut).toHaveBeenCalledTimes(1);
  });
  it('forwards the Apple authorization code with the verified login without persisting credentials', async () => {
    expect(await loginWithAppleNative()).toEqual({ success: true });
    expect(mocks.request.mock.calls[0][0].data).toMatchObject({ provider: 'apple', token: 'apple-token', authorizationCode: 'apple-code' });
    expect(JSON.stringify(vi.mocked(localStorage.setItem).mock.calls)).not.toMatch(/apple-token|apple-code/);
  });
  it('reauthorizes Apple for account deletion without replacing the session or storing credentials', async () => {
    const authorize = Reflect.get(nativeAuth, 'authorizeAppleAccountDeletion') as (() => Promise<{ appleIdentityToken: string; appleAuthorizationCode: string }>) | undefined;
    expect(authorize).toBeTypeOf('function');
    expect(await authorize!()).toEqual({ appleIdentityToken: 'apple-token', appleAuthorizationCode: 'apple-code' });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it.each(['identityToken', 'authorizationCode'])('does not return incomplete Apple deletion credentials without %s', async missing => {
    const response = { identityToken: 'apple-token', authorizationCode: 'apple-code', [missing]: '' };
    (window as any).Capacitor.Plugins.SignInWithApple.authorize.mockResolvedValue({ response });
    const authorize = Reflect.get(nativeAuth, 'authorizeAppleAccountDeletion') as (() => Promise<unknown>) | undefined;
    expect(authorize).toBeTypeOf('function');
    await expect(authorize!()).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it.each(['android', 'web'])('does not open Apple deletion authorization on %s', async platform => {
    (window as any).Capacitor.getPlatform = () => platform;
    const authorize = Reflect.get(nativeAuth, 'authorizeAppleAccountDeletion') as (() => Promise<unknown>) | undefined;
    expect(authorize).toBeTypeOf('function');
    await expect(authorize!()).rejects.toThrow();
    expect((window as any).Capacitor.Plugins.SignInWithApple.authorize).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('discards Apple deletion credentials when the confirmed principal changes during authorization', async () => {
    let current = true;
    (window as any).Capacitor.Plugins.SignInWithApple.authorize.mockImplementationOnce(async () => {
      current = false;
      return { response: { identityToken: 'old-owner-token', authorizationCode: 'old-owner-code' } };
    });
    const authorize = Reflect.get(nativeAuth, 'authorizeAppleAccountDeletion') as (shouldContinue: () => boolean) => Promise<unknown>;
    await expect(authorize(() => current)).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it('uses the iOS OAuth client instead of the web client for the iOS SDK', async () => {
    expect(await loginWithGoogleNative()).toEqual({ success: true });
    expect((window as any).Capacitor.Plugins.GoogleAuth.initialize).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'ios-client.apps.googleusercontent.com',
    }));
  });
  it('uses the packaged public iOS client when the local build environment omits it', async () => {
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', '');
    expect(await loginWithGoogleNative()).toMatchObject({ success: true });
    expect((window as any).Capacitor.Plugins.GoogleAuth.initialize).toHaveBeenCalledWith(expect.objectContaining({
      clientId: '18472854734-vgfm8pjcp8o2817e2dlg4pfun4blam3s.apps.googleusercontent.com',
    }));
    expect(mocks.request).toHaveBeenCalledOnce();
  });
  it.each([
    ['google', loginWithGoogleNative],
  ] as const)('verifies %s directly on the canonical API when the saved Vercel host redirects with 308', async (provider, signIn) => {
    vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu.vercel.app', setItem: vi.fn() });
    mocks.request.mockImplementation(async ({ url }) => url.startsWith('https://quangtu.vercel.app/')
      ? { status: 308, data: 'Redirecting...', headers: { location: 'https://quangtu.vn/api/auth/native-verify' } }
      : { status: 200, data: login(), headers: { 'content-type': 'application/json' } });

    expect(await signIn()).toEqual({ success: true });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://quangtu.vn/api/auth/native-verify', method: 'POST',
      data: expect.objectContaining({ provider }),
      headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'content-type': 'application/json' }),
    }));
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ user: login().user, csrfToken: 'server-csrf' }));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ['google', loginWithGoogleNative], ['apple', loginWithAppleNative],
  ] as const)('sends %s through native JSON and uses the verified server identity', async (provider, signIn) => {
    expect(await signIn()).toEqual({ success: true });
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST',
      url: 'https://quangtu-web.quangtu-ansitoanthu.workers.dev/api/auth/native-verify',
      headers: expect.objectContaining({ origin: 'https://quangtu-web.quangtu-ansitoanthu.workers.dev', accept: 'application/json', 'content-type': 'application/json' }),
      data: expect.objectContaining({ provider }), connectTimeout: 12_000, readTimeout: 12_000,
    }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ user: login().user, csrfToken: 'server-csrf' }));
  });
  it.each([{}, { ...login(), session: {} }, { ...login(), user: { id: 'wrong-user' } }, { ...login(), success: false }])('rejects incomplete success without applying a session: %j', async (data) => {
    mocks.request.mockResolvedValue({ status: 200, data, headers: {} });
    expect((await loginWithGoogleNative()).success).toBe(false);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('reports non-JSON failures with HTTP status and request ID, without exposing HTML', async () => {
    mocks.request.mockResolvedValue({ status: 403, data: '<html>private gateway diagnostic</html>', headers: { 'content-type': 'text/html', 'x-request-id': 'trace-123' } });
    const result = await loginWithGoogleNative();
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('HTTP 403, mã trace-123') });
    expect(result.error).not.toContain('private gateway');
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('preserves JSON authentication errors', async () => {
    mocks.request.mockResolvedValue({ status: 401, data: { message: 'Token hết hạn.' }, headers: {} });
    await expect(verifyNativeLogin({ provider: 'google', token: 'expired' })).rejects.toThrow('Token hết hạn.');
  });
  it('does not retry a failed native POST through browser fetch', async () => {
    mocks.request.mockRejectedValue(new Error('Network failed'));
    expect((await loginWithGoogleNative()).success).toBe(false);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('keeps the browser transport available outside native', async () => {
    mocks.native.mockReturnValue(false);
    fetcher.mockResolvedValue(Response.json(login()));
    await expect(verifyNativeLogin({ provider: 'google', token: 'test' })).resolves.toMatchObject({ userId: 'server-user' });
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
