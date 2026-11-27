import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: vi.fn(), web: vi.fn(), refresh: vi.fn() }));
vi.mock('../../../src/lib/browser/native-api', () => ({ fetchNativeJsonMutation: mocks.native }));
vi.mock('../../../src/lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.web }));
vi.mock('$lib/stores/session.svelte', () => ({ refreshBrowserSession: mocks.refresh }));
import { readLatestCopyingSnapshot, sendCopyingSnapshot } from '../../../src/lib/browser/scripture-copying-api';
const payload = { runId: 'run', sutraId: 'dia-tang', chapter: 1, sourceVersion: 'v1', texts: ['Nam mô'], revision: 0, mutationId: 'mutation' };
const auth = { userId: 'a', csrfToken: 'csrf' };
const ack = { revision: 1, savedAt: '2026-10-23T00:00:00Z' };
beforeEach(() => { vi.resetAllMocks(); mocks.native.mockResolvedValue(null); mocks.web.mockResolvedValue(Response.json(ack)); mocks.refresh.mockResolvedValue(undefined); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('explicit copying mutation transport', () => {
  it('uses the existing native JSON transport once, keeps CSRF and skips web fallback', async () => {
    mocks.native.mockResolvedValue(Response.json(ack));
    expect(await sendCopyingSnapshot(payload, auth, new AbortController().signal)).toEqual(ack);
    expect(mocks.native).toHaveBeenCalledWith('/api/practice/copying', expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ 'x-csrf-token': 'csrf' }), body: JSON.stringify(payload) }));
    expect(mocks.web).not.toHaveBeenCalled();
  });
  it('uses one web mutation with cookies when native transport is inapplicable', async () => {
    await sendCopyingSnapshot(payload, auth, new AbortController().signal);
    expect(mocks.web).toHaveBeenCalledTimes(1);
    expect(mocks.web).toHaveBeenCalledWith('/api/practice/copying', expect.objectContaining({ credentials: 'include', method: 'PUT' }));
  });
  it('does not replay a native write or use web fallback on network failure, 401 or 5xx', async () => {
    mocks.native.mockRejectedValueOnce(new Error('timeout'));
    await expect(sendCopyingSnapshot(payload, auth, new AbortController().signal)).rejects.toThrow('timeout');
    for (const status of [401, 500]) {
      mocks.native.mockResolvedValueOnce(Response.json({ error: { message: 'Không thể lưu' } }, { status }));
      await expect(sendCopyingSnapshot(payload, auth, new AbortController().signal)).rejects.toThrow('Không thể lưu');
    }
    expect(mocks.native).toHaveBeenCalledTimes(3);
    expect(mocks.web).not.toHaveBeenCalled(); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('never starts a canceled mutation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(sendCopyingSnapshot(payload, auth, controller.signal)).rejects.toThrow('principal_changed');
    expect(mocks.native).not.toHaveBeenCalled(); expect(mocks.web).not.toHaveBeenCalled();
  });
  it('rejects an old-principal receipt when cancellation happens while parsing the body', async () => {
    const controller = new AbortController();
    mocks.native.mockResolvedValueOnce({ status: 200, ok: true, json: async () => { controller.abort(); return ack; } });
    await expect(sendCopyingSnapshot(payload, auth, controller.signal)).rejects.toThrow('principal_changed');
    expect(mocks.native).toHaveBeenCalledOnce();
    expect(mocks.web).not.toHaveBeenCalled();
  });
  it('does not process a stale 401 body after session refresh cancels the principal', async () => {
    const controller = new AbortController();
    const json = vi.fn(async () => ack);
    mocks.native.mockResolvedValueOnce({ status: 401, json });
    mocks.refresh.mockImplementationOnce(async () => { controller.abort(); });
    await expect(sendCopyingSnapshot(payload, auth, controller.signal)).rejects.toThrow('principal_changed');
    expect(json).not.toHaveBeenCalled();
    expect(mocks.web).not.toHaveBeenCalled();
  });
});

describe('latest account copying read', () => {
  const copy = { sutraId: 'dia-tang', chapter: 2, runId: 'c1111111-1111-4111-8111-111111111111', sourceVersion: 'v1',
    texts: ['Nam mô'], revision: 2, savedAt: '2026-11-27T06:00:00.000Z', completedBlocks: 0, complete: false };
  it('uses one abortable private GET and leaves mutation transport unused', async () => {
    mocks.web.mockResolvedValueOnce(Response.json({ copy }));
    const signal = new AbortController().signal;
    expect(await readLatestCopyingSnapshot(signal)).toEqual(copy);
    expect(mocks.web).toHaveBeenCalledExactlyOnceWith('/api/practice/copying?latest=1', { signal: expect.any(AbortSignal), credentials: 'include', cache: 'no-store' });
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('supports an account without any server copy', async () => {
    mocks.web.mockResolvedValueOnce(Response.json({ copy: null }));
    expect(await readLatestCopyingSnapshot(new AbortController().signal)).toBeNull();
  });
  it.each([
    { sutraId: 'unknown' }, { chapter: 0 }, { runId: '../other' }, { sourceVersion: '' }, { texts: ['valid', 1] },
    { texts: [] }, { revision: 0 }, { savedAt: 'not-a-date' }, { completedBlocks: 2 }, { complete: 1 },
  ])('rejects invalid snapshot fields %j before passing data to the workspace', async changed => {
    mocks.web.mockResolvedValueOnce(Response.json({ copy: { ...copy, ...changed } }));
    await expect(readLatestCopyingSnapshot(new AbortController().signal)).rejects.toThrow('Bản lưu không hợp lệ');
  });
  it('rejects an old-principal response even if abort happens while decoding the body', async () => {
    const controller = new AbortController();
    mocks.web.mockResolvedValueOnce({ ok: true, json: async () => { controller.abort(); return { copy }; } });
    await expect(readLatestCopyingSnapshot(controller.signal)).rejects.toThrow('principal_changed');
    mocks.web.mockClear();
    await expect(readLatestCopyingSnapshot(controller.signal)).rejects.toThrow('principal_changed');
    expect(mocks.web).not.toHaveBeenCalled();
  });
  it('reports read failure without retrying a write or refreshing another session', async () => {
    mocks.web.mockResolvedValueOnce(Response.json({ error: { message: 'Phiên đã hết hạn' } }, { status: 401 }));
    await expect(readLatestCopyingSnapshot(new AbortController().signal)).rejects.toThrow('Phiên đã hết hạn');
    expect(mocks.web).toHaveBeenCalledTimes(1);
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it.each(['request', 'body'] as const)('bounds a stalled %s to four seconds, aborts and cleans caller listeners', async phase => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const stalled = new Promise<never>(() => {});
    mocks.web.mockImplementationOnce(() => phase === 'request' ? stalled : Promise.resolve({ ok: true, json: () => stalled }));
    const reading = readLatestCopyingSnapshot(controller.signal);
    const rejected = expect(reading).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(4_000);
    await rejected;
    const forwarded = mocks.web.mock.calls[0][1].signal as AbortSignal;
    expect(forwarded.aborted).toBe(true);
    expect(mocks.web).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('forwards caller cancellation immediately and disposes the timeout after success or abort', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    mocks.web.mockImplementationOnce(() => new Promise<never>(() => {}));
    const reading = readLatestCopyingSnapshot(controller.signal);
    const rejected = expect(reading).rejects.toThrow('principal_changed');
    controller.abort();
    await rejected;
    expect(mocks.web.mock.calls[0][1].signal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);

    mocks.web.mockResolvedValueOnce(Response.json({ copy }));
    expect(await readLatestCopyingSnapshot(new AbortController().signal)).toEqual(copy);
    expect(vi.getTimerCount()).toBe(0);
  });
});
