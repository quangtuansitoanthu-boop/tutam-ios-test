import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

function databaseHarness() {
  const stores = new Set(['items', 'meta']);
  const createIndex = vi.fn();
  const createObjectStore = vi.fn((name: string) => { stores.add(name); return { createIndex }; });
  const handles: { onclose?: () => void; onversionchange?: () => void; close: ReturnType<typeof vi.fn> }[] = [];
  let version = 1;
  const open = vi.fn((_name: string, nextVersion: number) => {
    const handle = {
      onclose: undefined as (() => void) | undefined, onversionchange: undefined as (() => void) | undefined,
      close: vi.fn(), objectStoreNames: { contains: (name: string) => stores.has(name) }, createObjectStore,
      transaction: () => {
        const transaction = { oncomplete: undefined as (() => void) | undefined,
          objectStore: () => ({ put: () => { setImmediate(() => transaction.oncomplete?.()); } }) };
        return transaction;
      },
    };
    handles.push(handle);
    const request = { result: handle, onsuccess: undefined as (() => void) | undefined,
      onupgradeneeded: undefined as (() => void) | undefined };
    setImmediate(() => { if (nextVersion > version) { request.onupgradeneeded?.(); version = nextVersion; } request.onsuccess?.(); });
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  return { open, handles, stores, createObjectStore, createIndex };
}

it('adds response storage to the version-one content database without replacing existing stores', async () => {
  vi.resetModules(); const harness = databaseHarness();
  const { ensureResponseStorage, CONTENT_INDEX_DATABASE } = await import('$lib/browser/offline-content-index');
  await ensureResponseStorage();
  expect(harness.open).toHaveBeenCalledWith(CONTENT_INDEX_DATABASE, 2);
  expect(harness.createObjectStore).toHaveBeenCalledExactlyOnceWith('responses', { keyPath: ['cacheName', 'url'] });
  expect(harness.createIndex).toHaveBeenCalledWith('cacheName', 'cacheName');
  expect([...harness.stores]).toEqual(['items', 'meta', 'responses']);
});

it.each(['content', 'talk'])('reopens the %s singleton after a storage close and ignores another old close event', async kind => {
  vi.resetModules(); const harness = databaseHarness();
  const perform = kind === 'content'
    ? (await import('$lib/browser/offline-content-index')).ensureResponseStorage
    : () => import('$lib/browser/talk-catalog-cache').then(module => module.recordTalkCatalogSyncTime());
  await perform(); expect(harness.open).toHaveBeenCalledOnce();
  const old = harness.handles[0]; expect(old.onclose).toBeTypeOf('function'); old.onclose?.();
  await perform(); expect(harness.open).toHaveBeenCalledTimes(2);
  old.onclose?.(); await perform(); expect(harness.open).toHaveBeenCalledTimes(2);
});
