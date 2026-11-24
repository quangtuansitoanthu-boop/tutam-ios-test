import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ native: true, request: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => bridge.native, nativePlatform: () => 'ios' }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { requestPermissions: bridge.request } }));
import { requestUnifiedNotificationPermission } from '$lib/browser/native-notifications';

beforeEach(() => { bridge.native = true; bridge.request.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

it('shares one native authorization request across concurrent reminder entry points', async () => {
  let finish!: (value: { display: string }) => void;
  bridge.request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = requestUnifiedNotificationPermission();
  const second = requestUnifiedNotificationPermission();
  await vi.waitFor(() => expect(bridge.request).toHaveBeenCalled());
  const calls = bridge.request.mock.calls.length;
  finish({ display: 'granted' });
  await expect(Promise.all([first, second])).resolves.toEqual(['granted', 'granted']);
  expect(calls).toBe(1);
});

it('allows a retry after a native bridge failure instead of caching unsupported forever', async () => {
  bridge.request.mockRejectedValueOnce(new Error('bridge unavailable')).mockResolvedValueOnce({ display: 'granted' });
  await expect(requestUnifiedNotificationPermission()).resolves.toBe('unsupported');
  await expect(requestUnifiedNotificationPermission()).resolves.toBe('granted');
});

it('keeps browser authorization on its existing browser API', async () => {
  bridge.native = false;
  const requestPermission = vi.fn(async () => 'denied');
  vi.stubGlobal('window', { Notification: {} });
  vi.stubGlobal('Notification', { requestPermission });
  await expect(requestUnifiedNotificationPermission()).resolves.toBe('denied');
  expect(requestPermission).toHaveBeenCalledOnce();
  expect(bridge.request).not.toHaveBeenCalled();
});

it('leaves QA tracing inactive without the existing native debug handler', async () => {
  vi.resetModules();
  const { beginNativeNotificationQA } = await import('$lib/browser/native-notifications');
  vi.stubGlobal('window', {});
  expect(beginNativeNotificationQA('sample-ui')).toBeUndefined();
  expect(bridge.request).not.toHaveBeenCalled();
});

it('sends only allowlisted phase fields and rejects arbitrary diagnostic content', async () => {
  vi.resetModules();
  const { beginNativeNotificationQA } = await import('$lib/browser/native-notifications');
  const postMessage = vi.fn();
  vi.stubGlobal('window', { webkit: { messageHandlers: { tutamQAEvents: { postMessage } } } });
  const trace = beginNativeNotificationQA('native-check');
  expect(trace).toBeTypeOf('function');
  trace?.('start');
  trace?.('settled', 'granted');
  trace?.('https://private.invalid/token' as never);
  trace?.('failed', { secret: 'private-content' } as never);
  expect(beginNativeNotificationQA('private-content' as never)).toBeUndefined();
  expect(postMessage).toHaveBeenCalledTimes(2);
  const records = postMessage.mock.calls.map(([body]) => JSON.parse(body));
  expect(records[0]).toEqual({ type: 'notification-phase', operation: 'native-check', operationId: expect.any(Number), phase: 'start', time: expect.any(Number) });
  expect(records[1]).toEqual({ ...records[0], phase: 'settled', time: expect.any(Number), result: 'granted' });
  expect(records[0].operationId).toBeGreaterThan(0);
  expect(JSON.stringify(records)).not.toMatch(/private|token|secret/);
  vi.stubGlobal('performance', { now: () => 'private-content' });
  trace?.('start');
  expect(postMessage).toHaveBeenCalledTimes(2);
  expect(bridge.request).not.toHaveBeenCalled();
});

it('bounds phase messages across operations in one document', async () => {
  vi.resetModules();
  const { beginNativeNotificationQA } = await import('$lib/browser/native-notifications');
  const postMessage = vi.fn();
  vi.stubGlobal('window', { webkit: { messageHandlers: { tutamQAEvents: { postMessage } } } });
  const first = beginNativeNotificationQA('sample-ui');
  const second = beginNativeNotificationQA('native-check');
  for (let index = 0; index < 150; index += 1) { first?.('start'); second?.('settled', true); }
  expect(postMessage).toHaveBeenCalledTimes(96);
  expect(beginNativeNotificationQA('native-request')).toBeUndefined();
  expect(bridge.request).not.toHaveBeenCalled();
});

it('contains a failed QA writer without changing the caller control flow', async () => {
  vi.resetModules();
  const { beginNativeNotificationQA } = await import('$lib/browser/native-notifications');
  vi.stubGlobal('window', { webkit: { messageHandlers: { tutamQAEvents: { postMessage: () => { throw new Error('writer unavailable'); } } } } });
  const trace = beginNativeNotificationQA('sample-ui');
  expect(() => trace?.('start')).not.toThrow();
  expect(bridge.request).not.toHaveBeenCalled();
});
