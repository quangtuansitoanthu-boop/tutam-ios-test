import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './content-update-transition-harness.svelte';
const io = vi.hoisted(() => ({ check: vi.fn(), download: vi.fn(), apply: vi.fn() }));
vi.mock('$lib/browser/content-update-client', () => ({ checkContentUpdates: io.check, downloadContentUpdates: io.download, ContentUpdateUnavailableError: class extends Error {} }));
vi.mock('$lib/browser/content-catalogs', () => ({ applyManualCatalogState: io.apply }));
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: () => ({ destroy() {} }) }));
const plan = { items: [], sizes: [], bytes: 0, unknownImages: 0, pdfTransitions: [{ item: { row: { id: 'book', tieu_de: 'An Sỹ Toàn Thư' } }, record: { key: 'a:book' } }] };
let component: ReturnType<typeof Harness> | undefined;
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); io.check.mockResolvedValue(plan); io.download.mockResolvedValue({ completed: 0, failed: [], pdfRemoved: ['An Sỹ Toàn Thư'], pdfRetained: [] }); });
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); localStorage.clear(); });
async function ready() {
  component = mount(Harness, { target: document.body });
  flushSync();
  const trigger = document.querySelector<HTMLButtonElement>('#content-updates button[aria-haspopup="dialog"]');
  expect(trigger?.getAttribute('aria-label')).toBe('Cập nhật nội dung');
  trigger!.click();
  await settle();
}
it('checks again after fourteen days and only opens the dialog when books are available', async () => {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  const now = 1_800_000_000_000;
  const day = 24 * 60 * 60 * 1000;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  io.check.mockResolvedValueOnce({ items: [], sizes: [], bytes: 0, unknownImages: 0 })
    .mockResolvedValueOnce({ items: [{ group: 'book' }], sizes: [], bytes: 0, unknownImages: 0 });
  try {
    component = mount(Harness, { target: document.body });
    await settle();
    expect(io.check).toHaveBeenCalledOnce();
    expect(io.check.mock.calls[0][3]).toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
    clock.mockReturnValue(now + 13 * day);
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(io.check).toHaveBeenCalledOnce();
    clock.mockReturnValue(now + 14 * day);
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(io.check).toHaveBeenCalledTimes(2);
    expect(document.querySelector('dialog')).not.toBeNull();
    expect(io.download).not.toHaveBeenCalled();
  } finally { clock.mockRestore(); vi.unstubAllGlobals(); }
});
it('shows the approved replacement notice even when bundled text needs no download', async () => {
 await ready(); expect(document.body.textContent).toContain('Không cần tải lại nội dung'); expect(document.body.textContent).toContain('Dấu trang và ghi chú của PDF không tự chuyển'); expect(button('Cập nhật và thay PDF')).toBeTruthy();
 button('Để sau').click(); await settle(); expect(io.download).not.toHaveBeenCalled();
});
it('announces removal only after completion and keeps a retry action for cleanup failure', async () => {
 await ready(); io.download.mockResolvedValueOnce({ completed: 0, failed: [], pdfRemoved: [], pdfRetained: ['An Sỹ Toàn Thư'] });
 button('Cập nhật và thay PDF').click(); await settle(); expect(document.body.textContent).toContain('Chưa xóa được bản PDF cũ'); expect(button('Kiểm tra lại')).toBeTruthy(); expect(document.body.textContent).not.toContain('Đã xóa bản PDF cũ trên máy:');
});
it('cancels on account switch and rejects stale result/refresh for the previous principal', async () => {
 await ready(); let resolve!: (v: unknown) => void; io.download.mockImplementation(() => new Promise(done => { resolve = done; }));
 button('Cập nhật và thay PDF').click(); await settle(); const [, signal, , , context] = io.download.mock.calls[0];
 document.querySelector<HTMLButtonElement>('#switch-account')!.click(); await settle(); expect(signal.aborted).toBe(true); expect(context.isCurrent()).toBe(false);
 resolve({ completed: 1, failed: [], pdfRemoved: ['An Sỹ Toàn Thư'], pdfRetained: [] }); await settle(); expect(document.querySelector('dialog')).toBeNull(); expect(io.apply).not.toHaveBeenCalled();
});
it('stop cancels pending deletion work and never reports success before the ack', async () => {
 await ready(); io.download.mockImplementation(() => new Promise(() => {})); button('Cập nhật và thay PDF').click(); await settle();
 const [, signal] = io.download.mock.calls[0]; expect(document.body.textContent).not.toContain('Đã xóa bản PDF cũ trên máy:'); button('Dừng tải').click(); await settle(); expect(signal.aborted).toBe(true);
});

it('cancels an old intent even when account A switches to B and back within one render turn', async () => {
 await ready(); io.download.mockImplementation(() => new Promise(() => {})); button('Cập nhật và thay PDF').click(); await settle();
 const [, signal, , , context] = io.download.mock.calls[0];
 document.querySelector<HTMLButtonElement>('#aba-account')!.click(); await settle();
 expect(context.isCurrent()).toBe(false); expect(signal.aborted).toBe(true); expect(document.querySelector('dialog')).toBeNull();
});
