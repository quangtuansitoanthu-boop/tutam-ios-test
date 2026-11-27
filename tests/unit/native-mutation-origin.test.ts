import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { request, isNativePlatform } = vi.hoisted(() => ({
  request: vi.fn(), isNativePlatform: vi.fn(() => true),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform }, CapacitorHttp: { request } }));
import { fetchNativeJsonMutation } from '../../src/lib/browser/native-api';

beforeEach(() => {
  request.mockReset().mockResolvedValue({ status: 200, data: { joined: true }, headers: { 'content-type': 'application/json' } });
  isNativePlatform.mockReturnValue(true);
  vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
  vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu-web.quangtu-ansitoanthu.workers.dev' });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['/api/notifications/read-state', '/api/practice/sessions', '/api/practice/sessions/saved-id/complete'])(
  'sends %s with the origin of the active Worker', async (path) => {
  const worker = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
  await fetchNativeJsonMutation(path, {
    method: 'POST', headers: { 'x-csrf-token': 'server-token' }, body: '{"ids":["notice-1"]}',
  });
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    url: worker + path,
    headers: expect.objectContaining({ origin: worker, 'x-csrf-token': 'server-token' }),
  }));
});

describe('native community mutation transport', () => {
  it.each([
    ['POST', '/api/practice/mindful-posts'],
    ['POST', '/api/practice/mindful-posts/post-id/reactions'],
    ['DELETE', '/api/practice/mindful-posts/post-id'],
  ])('uses the signed-in backend origin for %s %s', async (method, path) => {
    for (const origin of ['https://quangtu-web.quangtu-ansitoanthu.workers.dev', 'https://quangtu.vn']) {
      vi.stubGlobal('localStorage', { getItem: () => origin });
      await fetchNativeJsonMutation(path, {
        method, headers: { 'x-csrf-token': 'server-token', 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: '{"content":"fixture"}' } : {}),
      });
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
        url: origin + path, headers: expect.objectContaining({ origin, 'x-csrf-token': 'server-token' }),
      }));
    }
  });

  it('never sends a write when the caller already cancelled it', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchNativeJsonMutation('/api/practice/campaigns/goal/join', {
      method: 'POST', body: '{}', signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it('stops waiting on cancellation without retrying or applying the late native receipt', async () => {
    let finish!: (response: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const pending = fetchNativeJsonMutation('/api/practice/campaigns/goal/join', {
      method: 'POST', body: '{}', signal: controller.signal,
    });
    expect(request).toHaveBeenCalledOnce();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    finish({ status: 200, data: { joined: true }, headers: { 'content-type': 'application/json' } });
    expect(request).toHaveBeenCalledOnce();
  });
  it('consumes a late native failure after cancellation', async () => {
    let fail!: (error: Error) => void;
    request.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const controller = new AbortController();
    const pending = fetchNativeJsonMutation('/api/practice/sessions', { method: 'POST', body: '{}', signal: controller.signal });
    controller.abort(new Error('principal_changed'));
    await expect(pending).rejects.toThrow('principal_changed');
    fail(new Error('late transport failure'));
    await Promise.resolve();
    expect(request).toHaveBeenCalledOnce();
  });
  it.each(['/api/auth/logout', '/api/auth/delete-account'])('keeps %s pending until native cookie changes settle after cancellation', async path => {
    let finish!: (response: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const pending = fetchNativeJsonMutation(path, { method: 'POST', body: '{"preserveSessionCookie":false}', signal: controller.signal });
    let settled = false;
    void pending.then(() => { settled = true; }, () => { settled = true; });
    controller.abort();
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false);
    finish({ status: 200, data: {}, headers: { 'set-cookie': '__Host-quangtu_session=; Max-Age=0; Path=/; Secure; HttpOnly' } });
    expect((await pending)!.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(request).toHaveBeenCalledOnce();
  });
  it.each(['POST', 'DELETE', 'PATCH'])('retains backend origin, CSRF and JSON on %s', async (method) => {
    const response = await fetchNativeJsonMutation('/api/practice/campaigns/goal/join', {
      method, headers: { 'x-csrf-token': 'server-token', 'content-type': 'application/json' }, body: '{}',
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://quangtu-web.quangtu-ansitoanthu.workers.dev/api/practice/campaigns/goal/join',
      method, data: {},
      headers: expect.objectContaining({ origin: 'https://quangtu-web.quangtu-ansitoanthu.workers.dev', 'x-csrf-token': 'server-token' }),
    }));
    expect(await response!.json()).toEqual({ joined: true });
  });
  it('handles an empty string body without throwing SyntaxError', async () => {
    const response = await fetchNativeJsonMutation('/api/practice/campaigns/goal/join', {
      method: 'POST', headers: { 'x-csrf-token': 'server-token', 'content-type': 'application/json' }, body: '',
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://quangtu-web.quangtu-ansitoanthu.workers.dev/api/practice/campaigns/goal/join',
      method: 'POST', data: undefined,
    }));
    expect(response!.status).toBe(200);
  });
  it('leaves web traffic, reads and other origins on the existing fetch path', async () => {
    isNativePlatform.mockReturnValue(false);
    expect(await fetchNativeJsonMutation('/api/practice/campaigns/goal/join', { method: 'POST' })).toBeNull();
    isNativePlatform.mockReturnValue(true);
    expect(await fetchNativeJsonMutation('/api/practice/campaigns', {})).toBeNull();
    expect(await fetchNativeJsonMutation('https://external.example/api/upload', { method: 'POST' })).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it('preserves failed responses so the card can display the server error', async () => {
    request.mockResolvedValue({ status: 403, data: { error: { message: 'CSRF token không hợp lệ.' } }, headers: { 'content-type': 'application/json' } });
    const response = await fetchNativeJsonMutation('/api/practice/campaigns/goal/join', { method: 'POST', body: '{}' });
    expect(response!.ok).toBe(false);
    expect((await response!.json()).error.message).toContain('CSRF');
  });
});
