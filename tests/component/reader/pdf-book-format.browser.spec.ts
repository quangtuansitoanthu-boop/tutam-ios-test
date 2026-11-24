import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './pdf-book-format-harness.svelte';
import type { ReadingProgressRecord } from '$lib/browser/reading-activity-client';
const io = vi.hoisted(() => ({ preserved: vi.fn(), fetch: vi.fn(), progress: vi.fn(), enqueue: vi.fn(), schedule: vi.fn() }));
vi.mock('$lib/browser/pdf-book-transition', () => ({ hasPreservedOfflinePdf: io.preserved }));
vi.mock('$lib/components/reader/PdfCanvasReader.svelte', async () => ({ default: (await import('./pdf-book-format-placeholder.svelte')).default }));
vi.mock('$lib/components/reader/ReaderToolbar.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/comments/CommentsPanel.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/MostViewedArticles.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/ReadingAnnotations.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: async () => null }));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: io.fetch, getBrowserSession: async () => ({ authenticated: false }) }));
vi.mock('$lib/browser/reading-activity-client', () => ({
 createReadingActivityClient: () => ({ setSession() {}, flush: async () => {}, cachedProgress: () => [], cachedAnnotations: () => [], getProgress: io.progress, enqueueProgress: io.enqueue }),
 createThrottledReadingProgressWriter: () => ({ schedule: io.schedule, flush() {}, cancel() {} }), isReadingActivityCapacityError: () => false,
}));
let component: ReturnType<typeof Harness> | undefined;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(() => { vi.stubGlobal('caches', { open: async () => ({ keys: async () => [], match: async () => undefined }) }); });
beforeEach(() => { window.history.replaceState({}, '', '/'); Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) }); vi.clearAllMocks(); localStorage.clear(); io.preserved.mockResolvedValue(true); io.progress.mockResolvedValue(null); io.fetch.mockImplementation(async (url: string) => Response.json(url.includes('/chapters') ? [{ id: 'c1', so_thu_tu: 0, tieu_de: 'First', noi_dung: 'FIRST' }, { id: 'c2', so_thu_tu: 1, tieu_de: 'Second', noi_dung: 'SECOND' }] : { count: 1 })); Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 }))); });
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const journeyNotice = 'Sách này dựa trên trải nghiệm cá nhân trong các giấc mộng của cư sĩ Dương Sinh ở Thánh Hiền đường, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ';
const spiritNotice = 'Các câu chuyện được kể trong album này đều từ những giấc mơ độ vong của chị Hoa và các anh thầy pháp, đây đều là các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ';
const buddhistNotice = 'Các câu chuyện được kể trong sách này đều từ những giấc mơ của phật tử, đây đều là các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ';

it.each([
 ['tt_1781452671270', journeyNotice],
 ['tt_1781517395283', journeyNotice],
 ['tt_1781081372340_1_xqcxo', spiritNotice],
 ['phat-tu-thien-dia-du-ky-quyen-1', buddhistNotice],
 ['phat-tu-thien-dia-du-ky-quyen-2', buddhistNotice],
])('hides only the notice after ten seconds for book %s and shows it on reopening', async (id, copy) => {
 component = mount(Harness, { target: document.body }); await settle(); await settle();
 expect(document.querySelector('.content-experience-notice')).toBeNull();
 component.showBook(id); await settle(); await settle();
 vi.useFakeTimers();
 // Start a fresh opening with the clock controlled before the notice timer starts.
 component.showBook(null); flushSync(); component.showBook(id); flushSync();
 await vi.advanceTimersByTimeAsync(0); flushSync();
 expect(document.querySelector('.content-experience-notice em')?.textContent).toBe(copy);
 expect(document.querySelector('.content-experience-notice strong')?.textContent).toBe('Lưu ý về nội dung:');
 await vi.advanceTimersByTimeAsync(9999); flushSync();
 expect(document.querySelector('.content-experience-notice')).not.toBeNull();
 const requests = io.fetch.mock.calls.length;
 await vi.advanceTimersByTimeAsync(1); flushSync();
 expect(document.querySelector('.content-experience-notice')).toBeNull();
 expect(document.querySelector('.reader-modal')).not.toBeNull();
 expect(io.fetch.mock.calls.length).toBe(requests);
 component.showBook(null); flushSync(); component.showBook(id); flushSync();
 await vi.advanceTimersByTimeAsync(0); flushSync();
 expect(document.querySelector('.content-experience-notice em')?.textContent).toBe(copy);
});

it('does not write reading progress for notice-collapse clamping, while retaining a later real scroll', async () => {
 io.preserved.mockResolvedValue(false);
 component = mount(Harness, { target: document.body }); await settle(); await settle();
 vi.useFakeTimers();
 component.showBook('tt_1781452671270'); flushSync();
 await vi.advanceTimersByTimeAsync(0); flushSync();
 (document.querySelector('.toc-item') as HTMLButtonElement).click();
 await vi.advanceTimersByTimeAsync(0); flushSync();
 const area = document.querySelector('.reader-scroll') as HTMLElement;
 let position = 2563;
 Object.defineProperties(area, {
   scrollHeight: { configurable: true, get: () => 3000 },
   clientHeight: { configurable: true, get: () => document.querySelector('.content-experience-notice') ? 387 : 567 },
   scrollTop: { configurable: true, get: () => Math.min(position, 3000 - area.clientHeight), set: value => { position = Number(value); } },
 });
 io.schedule.mockClear();
 await vi.advanceTimersByTimeAsync(10_000); flushSync();
 expect(area.scrollTop).toBe(2433);
 area.dispatchEvent(new Event('scroll'));
 await vi.advanceTimersByTimeAsync(32); flushSync();
 expect(io.schedule).not.toHaveBeenCalled();
 position = 2400;
 area.dispatchEvent(new Event('scroll'));
 await vi.advanceTimersByTimeAsync(32); flushSync();
 expect(io.schedule).toHaveBeenCalledTimes(1);
});
it('opens the retained current-owner document without a chapter or text-progress fetch', async () => {
 component = mount(Harness, { target: document.body }); await settle(); await settle();
 expect(document.querySelector('[data-legacy-pdf]')).not.toBeNull(); expect(io.fetch.mock.calls.filter(([url]) => url.includes('/chapters'))).toHaveLength(0); expect(io.progress).not.toHaveBeenCalled();
});
it('stays in the table of contents after returning from a chapter and refreshing the session', async () => {
 window.history.replaceState({ keep: true }, '', '/kinh-sach?article=converted-book');
 io.preserved.mockResolvedValue(false);
 component = mount(Harness, { target: document.body });
 await settle(); await settle();
 document.querySelectorAll<HTMLButtonElement>('.toc-item')[1].click();
 await settle();
 expect(new URL(window.location.href).searchParams.get('chap')).toBe('2');
 expect(document.body.textContent).toContain('SECOND');

 document.querySelector<HTMLButtonElement>('.reader-back')!.click();
 await settle();
 expect(document.querySelector('.toc')).not.toBeNull();
 window.dispatchEvent(new CustomEvent('quangtu:session-changed', { detail: { authenticated: true, user: { id: 'a' } } }));
 await settle(); await settle();
 expect(document.querySelector('.toc')).not.toBeNull();
 const params = new URL(window.location.href).searchParams;
 expect(params.get('article')).toBe('converted-book');
 expect(params.has('chap')).toBe(false);
 expect(window.history.state.keep).toBe(true);
});
it('consumes the initial continue-reading request once even when progress is refreshed', async () => {
 const progress: ReadingProgressRecord = {
   contentId: 'converted-book', contentKind: 'book', revision: 3, epoch: 1, deviceId: 'reader-test', deviceSequence: 1,
   percent: 50, total: 2, contentVersion: null, clientUpdatedAt: null, serverUpdatedAt: null,
   position: { chapterId: 'c2', chapterIdx: 1, scrollTop: 0 },
 };
 io.preserved.mockResolvedValue(false);
 io.progress.mockResolvedValue(progress);
 component = mount(Harness, { target: document.body, props: { initialProgress: progress } });
 await settle(); await settle();
 expect(document.body.textContent).toContain('SECOND');
 document.querySelector<HTMLButtonElement>('.reader-back')!.click();
 await settle();
 expect(document.querySelector('.toc')).not.toBeNull();
 window.dispatchEvent(new CustomEvent('quangtu:session-changed', { detail: { authenticated: true, user: { id: 'a' } } }));
 await settle(); await settle();
 expect(document.querySelector('.toc')).not.toBeNull();
});
it('switches to text after acknowledged cleanup and reuses the existing reader owner', async () => {
 component = mount(Harness, { target: document.body }); await settle(); io.preserved.mockResolvedValue(false);
 window.dispatchEvent(new CustomEvent('quangtu:offline-pdf-changed', { detail: { documentId: 'converted-book' } })); await settle(); await settle();
 expect(document.querySelector('[data-legacy-pdf]')).toBeNull(); expect(io.fetch.mock.calls.filter(([url]) => url.includes('/chapters'))).toHaveLength(1);
});
it('does not interpret saved PDF page progress as the chapter index or revision of a regular book', async () => {
 io.preserved.mockResolvedValue(false);
 component = mount(Harness, { target: document.body, props: { initialProgress: { contentId: 'converted-book', contentKind: 'pdf', percent: 80, revision: 99, position: { page: 80, scrollTop: 1234 } } as never } }); await settle(); await settle();
 expect(document.querySelector('[data-legacy-pdf]')).toBeNull(); expect(document.querySelector('.toc')).not.toBeNull(); expect(document.body.textContent).not.toContain('SECOND'); document.querySelector<HTMLButtonElement>('.toc-item')!.click(); await settle(); expect(io.schedule).toHaveBeenCalledWith(expect.objectContaining({ contentKind: 'book', baseRevision: 0 })); expect(io.schedule).not.toHaveBeenCalledWith(expect.objectContaining({ baseRevision: 99 }));
});

it('ignores a late retained-PDF lookup after switching account', async () => {
 let resolve!: (value: boolean) => void;
 io.preserved.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; })).mockResolvedValue(false);
 component = mount(Harness, { target: document.body }); await settle();
 window.dispatchEvent(new CustomEvent('quangtu:session-changed', { detail: { authenticated: true, user: { id: 'b' } } })); await settle(); await settle();
 resolve(true); await settle();
 expect(io.preserved).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'converted-book' }), 'b');
 expect(document.querySelector('[data-legacy-pdf]')).toBeNull(); expect(document.querySelector('.toc')).not.toBeNull();
});
