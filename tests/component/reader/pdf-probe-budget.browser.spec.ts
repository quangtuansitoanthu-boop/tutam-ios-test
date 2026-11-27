import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './pdf-probe-budget-harness.svelte';
import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

const mocks = vi.hoisted(() => ({ stored: false, getDocument: vi.fn(), probe: vi.fn(), version: vi.fn(), bytes: vi.fn(), download: vi.fn(), worker: {}, gestures: vi.fn(() => vi.fn()) }));
vi.mock('$lib/components/comments/CommentsPanel.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/ReaderToolsPanel.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/MostViewedArticles.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/PdfAnnotations.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/browser/pdfjs-loader', () => ({ loadPdfjs: async () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }), getPdfjsWorker: () => mocks.worker }));
vi.mock('$lib/browser/network-deadline', () => ({ fetchBoundedBytes: mocks.bytes }));
vi.mock('$lib/browser/session-csrf', () => ({ getBrowserSession: async () => ({ authenticated: false, user: null }) }));
vi.mock('$lib/browser/pdf-gesture-controller', () => ({ installPdfGestures: mocks.gestures }));
vi.mock('$lib/browser/reading-activity-client', () => ({
  createReadingActivityClient: () => ({ setSession() {}, flush: async () => {}, cachedProgress: () => [], getProgress: async () => null }),
  createThrottledReadingProgressWriter: () => ({ schedule() {}, flush() {}, cancel() {} }), isReadingActivityCapacityError: () => false,
}));
vi.mock('$lib/browser/pdf-offline-downloads', () => ({
  probePdfTotalBytes: mocks.probe, probeOfflinePdfSourceVersion: mocks.version,
  resolvePdfRequestUrl: (source: string) => source,
  readPdfOfflineState: async () => mocks.stored ? { ownerId: 'anonymous', sourceUrl: '/probe.pdf', sourceVersion: 'size:9', sizeBytes: 9,
    blob: { arrayBuffer: async () => new TextEncoder().encode('%PDF-test').buffer } } : null,
  offlinePdfNeedsUpdate: () => false, downloadPdfForOffline: mocks.download, removePdfOfflineCopy: vi.fn(),
}));

let component: ReturnType<typeof Harness> | undefined;
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  localStorage.clear(); mocks.stored = false;
  mocks.probe.mockReset().mockResolvedValue(1000);
  mocks.version.mockReset().mockResolvedValue(null);
  mocks.bytes.mockReset().mockRejectedValue(new TypeError('Network unavailable'));
  mocks.download.mockReset();
  mocks.gestures.mockClear();
  mocks.getDocument.mockReset().mockImplementation(() => ({ promise: new Promise(() => {}), destroy: async () => {} }));
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('crypto', { subtle: {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected network request'); }));
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); localStorage.clear();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

it('performs one size probe for an uncached PDF across confirmation and online reading', async () => {
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(mocks.probe).toHaveBeenCalledTimes(1));
  const online = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Đọc online'));
  expect(online).toBeDefined(); online!.click(); flushSync();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1));
  expect(mocks.probe).toHaveBeenCalledTimes(1);
});

it('performs no size or version probe when opening a stored PDF while offline', async () => {
  mocks.stored = true;
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1));
  expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array) }));
  expect(mocks.probe).not.toHaveBeenCalled(); expect(mocks.version).not.toHaveBeenCalled();
});

it.each([false, true])('does not pass the previous principal downloaded bytes after a switch during Blob reading (switch back: %s)', async switchBack => {
  let complete!: (bytes: ArrayBuffer) => void;
  const arrayBuffer = vi.fn(() => new Promise<ArrayBuffer>(resolve => { complete = resolve; }));
  const saved = { ownerId: 'anonymous', sourceUrl: '/probe.pdf', sizeBytes: 20, blob: { arrayBuffer } };
  mocks.download.mockResolvedValue(saved);
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(document.querySelector('.btn-confirm')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.btn-confirm')!.click(); flushSync();
  await vi.waitFor(() => expect(arrayBuffer).toHaveBeenCalledTimes(1));

  window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, {
    detail: { authenticated: true, user: { id: 'reader-B' }, csrfToken: 'B' },
  }));
  if (switchBack) window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, {
    detail: { authenticated: false, user: null },
  }));
  flushSync();
  complete(new TextEncoder().encode('account-A-only bytes').buffer);
  await Promise.resolve(); await Promise.resolve(); flushSync();

  expect(mocks.download).toHaveBeenCalledTimes(1);
  expect(mocks.getDocument).not.toHaveBeenCalled();
  expect(document.querySelector('.pdf-error-retry-btn')).not.toBeNull();
});

it('uses the downloaded bytes when their captured principal remains current', async () => {
  const bytes = new TextEncoder().encode('%PDF-same-principal').buffer;
  const saved = { ownerId: 'anonymous', sourceUrl: '/probe.pdf', sizeBytes: bytes.byteLength,
    blob: { arrayBuffer: async () => bytes } };
  mocks.download.mockResolvedValue(saved);
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(document.querySelector('.btn-confirm')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.btn-confirm')!.click(); flushSync();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1));
  expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: new Uint8Array(bytes) }));
  expect(mocks.download).toHaveBeenCalledTimes(1);
});

it('closes the canceled old-principal download modal and offers retry after its late receipt', async () => {
  let complete!: (record: unknown) => void;
  mocks.download.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(document.querySelector('.btn-confirm')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.btn-confirm')!.click(); flushSync();
  await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
  expect(document.querySelector('#pdf-dl-progress-title')).not.toBeNull();

  window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, {
    detail: { authenticated: true, user: { id: 'reader-B' }, csrfToken: 'B' },
  }));
  flushSync();
  expect(mocks.download.mock.calls[0][1].signal.aborted).toBe(true);
  complete({ ownerId: 'anonymous', sourceUrl: '/probe.pdf', sizeBytes: 20,
    blob: { arrayBuffer: async () => new TextEncoder().encode('old receipt').buffer } });
  await Promise.resolve(); await Promise.resolve(); flushSync();

  expect(document.querySelector('#pdf-dl-progress-title')).toBeNull();
  await vi.waitFor(() => expect(document.querySelector('.pdf-error-retry-btn')).not.toBeNull());
  expect(mocks.getDocument).not.toHaveBeenCalled();
});

it('aborts a pending document size probe when the reader unmounts', async () => {
  mocks.probe.mockImplementation(() => new Promise(() => {}));
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(mocks.probe).toHaveBeenCalledTimes(1));
  const signal = mocks.probe.mock.calls[0][2] as AbortSignal;
  expect(signal.aborted).toBe(false);
  await unmount(component); component = undefined;
  expect(signal.aborted).toBe(true);
});

async function chooseOnline() {
  await vi.waitFor(() => expect([...document.querySelectorAll('button')].some(button => button.textContent?.includes('Đọc online'))).toBe(true));
  [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Đọc online'))!.click(); flushSync();
}

it.each(['button', 'online'])('loads a new attempt after offline failure via %s', async retry => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pdf-offline-card')).not.toBeNull());
  online.mockReturnValue(true);
  if (retry === 'online') window.dispatchEvent(new Event('online'));
  else document.querySelector<HTMLButtonElement>('.btn-retry')!.click();
  flushSync();
  await chooseOnline();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1));
  expect(mocks.gestures).toHaveBeenCalledTimes(2);
  expect(mocks.gestures.mock.results[0].value).toHaveBeenCalledTimes(1);
});

it('destroys the failed task and uses a new generation for the error Retry button', async () => {
  const destroy = vi.fn(async () => {});
  mocks.getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('Range failed')), destroy }));
  component = mount(Harness, { target: document.body }); flushSync();
  await chooseOnline();
  await vi.waitFor(() => expect(document.querySelector('.pdf-error-retry-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.pdf-error-retry-btn')!.click(); flushSync();
  await chooseOnline();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(2));
  expect(destroy).toHaveBeenCalledTimes(1);
});

it('owns and destroys the fallback loading task while reusing the shared worker and assets', async () => {
  const primaryDestroy = vi.fn(async () => {});
  const fallbackDestroy = vi.fn(async () => {});
  mocks.bytes.mockResolvedValue(new TextEncoder().encode('%PDF-test').buffer);
  mocks.getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('Range failed')), destroy: primaryDestroy }))
    .mockImplementationOnce(() => ({ promise: new Promise(() => {}), destroy: fallbackDestroy }));
  component = mount(Harness, { target: document.body }); flushSync();
  await chooseOnline();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(2));
  for (const [options] of mocks.getDocument.mock.calls) expect(options).toMatchObject({
    worker: mocks.worker, cMapUrl: '/vendor/pdfjs/cmaps/', wasmUrl: '/vendor/pdfjs/wasm/', standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
  });
  expect(primaryDestroy).toHaveBeenCalledTimes(1);
  await unmount(component); component = undefined;
  expect(fallbackDestroy).toHaveBeenCalledTimes(1);
});

it('does not create a fallback loading task when its full fetch finishes after unmount', async () => {
  let complete!: (bytes: ArrayBuffer) => void;
  mocks.bytes.mockImplementation(() => new Promise<ArrayBuffer>(resolve => { complete = resolve; }));
  mocks.getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('Range failed')), destroy: vi.fn(async () => {}) }));
  component = mount(Harness, { target: document.body }); flushSync();
  await chooseOnline();
  await vi.waitFor(() => expect(mocks.bytes).toHaveBeenCalledTimes(1));
  await unmount(component); component = undefined;
  complete(new TextEncoder().encode('%PDF-test').buffer);
  await Promise.resolve(); await Promise.resolve();
  expect(mocks.getDocument).toHaveBeenCalledTimes(1);
});
