// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PersonalEventsModal from '../../../src/lib/components/practice/reminder/PersonalEventsModal.svelte';
import PersonalEventsSyncStatus from '../../../src/lib/components/practice/reminder/PersonalEventsSyncStatus.svelte';
import PersonalReminderTiming from '../../../src/lib/components/practice/reminder/PersonalReminderTiming.svelte';
import DeletePersonalEventDialog from '../../../src/lib/components/practice/reminder/DeletePersonalEventDialog.svelte';
import HomeDailyReminders from '../../../src/lib/components/home/HomeDailyReminders.svelte';
import NativeSelectPicker from '../../../src/lib/components/layout/NativeSelectPicker.svelte';
import * as sessions from '../../../src/lib/stores/session.svelte';
import { personalEventFormIssue } from '../../../src/lib/domain/personal-event-form';
import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import { compile } from 'svelte/compiler';

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), native: false, masterEnabled: true, sync: vi.fn(), alert: vi.fn() }));
vi.mock('$lib/browser/app-dialog', () => ({ alertInApp: mocks.alert }));
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: () => ({ destroy() {} }) }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => mocks.native, nativePlatform: () => mocks.native ? 'ios' : 'web' }));
vi.mock('$lib/browser/practice-reminder-service', () => ({
  loadReminderSettings: () => ({ masterEnabled: mocks.masterEnabled }),
  syncRemindersWithSystem: mocks.sync,
}));
vi.mock('$lib/browser/personal-lunar-events', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/lib/browser/personal-lunar-events')>();
  return {
    ...original,
    loadPersonalLunarEvents: () => [{
      id: 'storage-failure-event', title: 'Ngày lễ đã lưu', type: 'gia-dinh',
      lunarDay: 15, lunarMonth: 7, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z',
    }],
    addPersonalLunarEvent: mocks.add,
    deletePersonalLunarEvent: mocks.remove,
  };
});

let instance: ReturnType<typeof PersonalEventsModal> | undefined;
let unhandled: unknown[];
function captureError(event: ErrorEvent) {
  unhandled.push(event.error);
  event.preventDefault();
}
const settle = async () => { for (let index = 0; index < 4; index++) { await Promise.resolve(); flushSync(); } };

it('keeps timing edits local until save and cancels back to the saved configuration', async () => {
  const onsave = vi.fn().mockResolvedValue(true);
  const view = mount(PersonalReminderTiming, { target: document.body, props: {
    config: { beforeEnabled: true, dayEnabled: true, daysBefore: 1, beforeTime: '19:30', dayTime: '06:00' }, onsave,
  } });
  try {
    flushSync();
    const leadTime = document.querySelector<HTMLSelectElement>('.personal-timing select')!;
    leadTime.value = 'custom'; leadTime.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    let days = document.querySelector<HTMLInputElement>('.personal-timing input[type="number"]')!;
    days.value = '100'; days.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(days.checkValidity()).toBe(true);
    expect(onsave).not.toHaveBeenCalled();
    const cancel = document.querySelector<HTMLButtonElement>('.timing-actions button[type="button"]')!;
    cancel.click(); flushSync();
    expect(leadTime.value).toBe('1');
    expect(document.querySelector('.personal-timing input[type="number"]')).toBeNull();
    expect(onsave).not.toHaveBeenCalled();
    leadTime.value = 'custom'; leadTime.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    days = document.querySelector<HTMLInputElement>('.personal-timing input[type="number"]')!;
    days.value = '100'; days.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    const times = document.querySelectorAll<HTMLInputElement>('.personal-timing input[type="time"]');
    times[0].value = '21:45'; times[0].dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    document.querySelector('form.personal-timing')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(onsave).toHaveBeenCalledExactlyOnceWith({ beforeEnabled: true, dayEnabled: true, daysBefore: 100, beforeTime: '21:45', dayTime: '06:00' });
    days.value = '101'; days.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(days.checkValidity()).toBe(false);
    document.querySelector('form.personal-timing')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(onsave).toHaveBeenCalledTimes(1);
  } finally { await unmount(view); }
});

it('retains the timing draft on storage failure and disables controls for inactive reminders', async () => {
  const onsave = vi.fn().mockResolvedValue(false);
  const view = mount(PersonalReminderTiming, { target: document.body, props: {
    config: { beforeEnabled: true, dayEnabled: true, daysBefore: 1, beforeTime: '19:30', dayTime: '06:00' }, onsave,
  } });
  try {
    flushSync();
    const leadTime = document.querySelector<HTMLSelectElement>('.personal-timing select')!;
    leadTime.value = 'custom'; leadTime.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    const toggles = document.querySelectorAll<HTMLInputElement>('.personal-timing input[type="checkbox"]');
    toggles[0].click(); flushSync();
    expect(document.querySelector<HTMLInputElement>('.personal-timing input[type="number"]')!.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('.personal-timing input[type="time"]')!.disabled).toBe(true);
    document.querySelector('form.personal-timing')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.querySelector('.timing-error')!.textContent).toContain('Không thể lưu');
    expect(toggles[0].checked).toBe(false);
  } finally { await unmount(view); }
});
beforeEach(() => {
  mocks.alert.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  unhandled = [];
  window.addEventListener('error', captureError);
  mocks.add.mockReset().mockImplementation(() => { throw new DOMException('Storage is full', 'QuotaExceededError'); });
  mocks.remove.mockReset().mockImplementation(() => { throw new DOMException('Storage is full', 'QuotaExceededError'); });
  mocks.native = false;
  mocks.masterEnabled = true;
  mocks.sync.mockReset().mockResolvedValue({ success: true, scheduledCount: 1 });
});
afterEach(async () => {
  if (instance) await unmount(instance);
  instance = undefined;
  window.removeEventListener('error', captureError);
  localStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function open() {
  instance = mount(PersonalEventsModal, { target: document.body, props: { open: true, onClose() {} } });
  flushSync();
}
function submitAnniversary(titleText = 'Ngày lễ mới') {
  const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
  title.value = titleText;
  title.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  title.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

it('retries a failed calendar pull only after the Retry click and coalesces repeated clicks into one GET', async () => {
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockReturnValue({
    authenticated: true, user: { id: 'retry-owner', displayName: 'Retry', role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  });
  const key = 'tutam_personal_lunar_events:v2:user:retry-owner';
  const event = { id: 'saved', title: 'Ngày lễ đã lưu', type: 'gia-dinh', lunarDay: 15, lunarMonth: 7 };
  localStorage.setItem(key, JSON.stringify({ version: 2, events: [event], base: [event], revision: 1,
    pending: false, status: 'error', recovery: [event], guestTransferReceipts: ['saved-receipt'] }));
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ events: [event], revision: 2 }));
  const view = mount(PersonalEventsSyncStatus, { target: document.body });
  try {
    await settle();
    expect(fetcher).not.toHaveBeenCalled();
    const retry = [...document.querySelectorAll<HTMLButtonElement>('.sync-note button')]
      .find(button => button.textContent?.includes('Thử lại'))!;
    expect(retry).toBeDefined();
    retry.click(); retry.click();
    await vi.waitFor(() => {
      flushSync();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(document.querySelector('.sync-note')).toBeNull();
    });
    const [, init] = fetcher.mock.calls[0];
    expect(init?.method ?? 'GET').toBe('GET');
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ status: 'synced', revision: 2,
      events: [event], recovery: [event], guestTransferReceipts: ['saved-receipt'] });
    expect(unhandled).toEqual([]);
  } finally { await unmount(view); }
});

it('keeps the real anniversary select as the visible control after the shared picker chooses a value', async () => {
  open();
  // This file mocks the dialog action; the real app's modal owner supplies [open].
  document.querySelector('.pem-dialog')!.setAttribute('open', '');
  const picker = mount(NativeSelectPicker, { target: document.body, props: { route: '/', principal: null } });
  try {
    await settle();
    for (const [id, value] of [['pem-select-type', 'phat-nguyen'], ['pem-select-day', '19'], ['pem-select-month', '10']]) {
      const select = document.getElementById(id) as HTMLSelectElement;
      for (const type of ['pointerdown', 'pointerup']) {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 40 });
        Object.assign(event, { pointerId: 1, isPrimary: true });
        select.dispatchEvent(event);
      }
      await settle();
      expect(document.querySelector('.rosary-select__dialog')).not.toBeNull();
      expect(document.querySelector('.rosary-select__trigger')).toBeNull();
      document.querySelector<HTMLButtonElement>(`.rosary-select__option[data-value="${value}"]`)!.click();
      await settle();
      expect(document.querySelector('.rosary-select__dialog')).toBeNull();
      expect(document.getElementById(id)).toBe(select);
      expect(select.value).toBe(value);
      expect(select.hidden).toBe(false);
    }
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  } finally { await unmount(picker); }
});

it('keeps home anniversary control text consistent and reachable in both CSS engines', async () => {
  open();
  const markup = document.querySelector('.pem-dialog')!.outerHTML;
  const filename = 'src/lib/components/practice/reminder/PersonalEventsModal.svelte';
  const css = compile(readFileSync(filename, 'utf8'), { filename, generate: 'client', cssHash: () => 'personal-event-geometry' }).css!.code;
  const globals = ['tokens.css', 'master-shell.css', 'ui-refresh.css', 'interaction-performance.css']
    .map(name => readFileSync(`src/lib/styles/${name}`, 'utf8')).join('\n');
  const violations: unknown[] = [];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ hasTouch: true });
      await page.route('**/*', route => route.abort());
      for (const native of [false, true]) for (const theme of ['light', 'dark']) for (const viewport of [{ width: 375, height: 844 }, { width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 844, height: 220 }, { width: 568, height: 180 }]) {
        await page.setViewportSize(viewport);
        await page.setContent(`<html data-native-app="${native}" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globals}:root{--ui-font-scale:1.2}${css}</style></head><body>${markup}</body></html>`);
        await page.locator('body *').evaluateAll(elements => elements.forEach(element => element.classList.add('personal-event-geometry')));
        await page.locator('dialog').evaluate(dialog => (dialog as HTMLDialogElement).showModal());
        const typography = await page.locator('dialog').evaluate(dialog => {
          const fields = [...dialog.querySelectorAll<HTMLElement>('.pem-input,.pem-select')].map(element => {
            const style = getComputedStyle(element);
            return { id: element.id, size: style.fontSize, weight: style.fontWeight, family: style.fontFamily };
          });
          const label = getComputedStyle(dialog.querySelector('.pem-label')!);
          const recurrence = getComputedStyle(dialog.querySelector('.pem-frequency button')!);
          return { fields, labelSize: parseFloat(label.fontSize), recurrenceSize: parseFloat(recurrence.fontSize) };
        });
        const titleText = typography.fields.find(field => field.id === 'pem-input-title')!;
        if (typography.fields.some(field => parseFloat(field.size) < 16 || field.size !== titleText.size || field.weight !== titleText.weight || field.family !== titleText.family)) {
          violations.push({ engine: engine.name(), native, theme, viewport, typography });
        }
        expect(typography.labelSize).toBeLessThan(parseFloat(titleText.size));
        expect(typography.recurrenceSize).toBeLessThan(parseFloat(titleText.size));
        const footerTop = (await page.locator('.pem-footer').boundingBox())!.y;
        // Use the mounted component's DOM and actual CSS; no app data, network or native keyboard is involved.
        for (const selector of ['.pem-close-btn', '#pem-input-title', '#pem-select-type', '#pem-input-note', '.pem-done-btn', '.pem-submit-btn', '.pem-close-btn']) {
          const result = await page.locator(selector).evaluate(async element => {
            element.scrollIntoView({ block: 'center', inline: 'nearest' });
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const box = element.getBoundingClientRect();
            const dialog = element.closest('dialog')!.getBoundingClientRect();
            const points = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]];
            const hit = points.every(([x, y]) => element.contains(document.elementFromPoint(box.x + box.width / 2 + x, box.y + box.height / 2 + y)));
            return { hit, width: box.width, height: box.height, y: box.y, bottom: box.bottom, dialogTop: dialog.top, dialogBottom: dialog.bottom };
          });
          if (!result.hit || result.width < 44 || result.height < 44 || result.y < result.dialogTop || result.bottom > result.dialogBottom) {
            violations.push({ engine: engine.name(), native, theme, viewport, selector, ...result });
          }
          if (viewport.height >= 390) expect((await page.locator('.pem-footer').boundingBox())!.y).toBeCloseTo(footerTop);
        }
      }
    } finally { await browser.close(); }
  }
  expect(violations).toEqual([]);
}, 30_000);

it.each([{ revision: 2 }, { events: [null], revision: 2 }])('keeps the home anniversary form usable with an invalid saved conflict snapshot %j', async remote => {
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockReturnValue({
    authenticated: true, user: { id: 'invalid-conflict-owner', displayName: 'QA', role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  });
  const key = 'tutam_personal_lunar_events:v2:user:invalid-conflict-owner';
  const saved = { id: 'storage-failure-event', title: 'Ngày lễ đã lưu', type: 'gia-dinh', lunarDay: 15, lunarMonth: 7, createdAt: 'legacy-date' };
  const raw = JSON.stringify({ version: 2, events: [saved], base: [saved], revision: 1, pending: true,
    status: 'conflict', remote, recovery: [saved], guestTransferReceipts: ['previous-transfer'] });
  localStorage.setItem(key, raw);
  const view = mount(HomeDailyReminders, { target: document.body, props: { selectedDate: new Date(2026, 10, 7, 12) } });
  try {
    await settle();
    document.querySelector<HTMLButtonElement>('.personal-add-more-btn')!.click(); await settle();
    expect(unhandled).toEqual([]);
    const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
    expect(title).not.toBeNull();
    title.value = 'Bản nháp vẫn nhập được'; title.dispatchEvent(new Event('input', { bubbles: true })); await settle();
    expect(document.querySelector('.pem-dialog .sync-note')?.textContent).toContain('Chưa đồng bộ được');
    expect(document.querySelector('.pem-dialog')?.textContent).not.toContain('Dùng danh sách trên tài khoản');
    document.querySelector<HTMLButtonElement>('.pem-close-btn')!.click(); await settle();
    expect(document.querySelector('.pem-dialog')).toBeNull();
    document.querySelector<HTMLButtonElement>('.personal-add-more-btn')!.click(); await settle();
    expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('Bản nháp vẫn nhập được');
    expect(localStorage.getItem(key)).toBe(raw);
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  } finally { await unmount(view); }
});

it('defaults both calendars to the device date and does not persist until saving', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 6, 10));
  open();
  expect(document.querySelector<HTMLSelectElement>('#pem-select-day')!.value).toBe('28');
  expect(document.querySelector<HTMLSelectElement>('#pem-select-month')!.value).toBe('9');
  Array.from(document.querySelectorAll<HTMLButtonElement>('.pem-mode-tabs button')).find(button => button.textContent?.trim() === 'Dương lịch')!.click();
  flushSync();
  expect(document.querySelector<HTMLSelectElement>('#pem-solar-day')!.value).toBe('6');
  expect(document.querySelector<HTMLSelectElement>('#pem-solar-month')!.value).toBe('11');
  expect(mocks.add).not.toHaveBeenCalled();
});

it('blocks a blank title, reports its field, and focuses it after the alert', async () => {
  open();
  submitAnniversary('   ');
  await settle();
  expect(mocks.alert).toHaveBeenCalledWith(expect.stringContaining('Tên ngày lễ / Sự kiện'), { title: 'Chưa đủ thông tin', presentation: 'personal-event' });
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(document.activeElement?.id).toBe('pem-input-title');
  expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
});

it.each([
  ['pem-select-day', 'Ngày Âm'], ['pem-select-month', 'Tháng Âm'],
  ['pem-select-type', 'Phân loại sự kiện'],
])('blocks missing %s without saving and identifies the field', async (id, label) => {
  open();
  const select = document.getElementById(id) as HTMLSelectElement;
  const empty = document.createElement('option');
  empty.value = ''; select.append(empty);
  select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  submitAnniversary('Ngày lễ chưa đầy đủ');
  await settle();
  expect(mocks.alert).toHaveBeenCalledWith(expect.stringContaining(label), { title: id === 'pem-select-type' ? 'Chưa đủ thông tin' : 'Ngày chưa hợp lệ', presentation: 'personal-event' });
  expect(document.activeElement?.id).toBe(id);
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

function solarDate(day: number, month: number, frequency: 'yearly' | 'monthly') {
  Array.from(document.querySelectorAll<HTMLButtonElement>('.pem-mode-tabs button')).find(button => button.textContent?.trim() === 'Dương lịch')!.click();
  flushSync();
  for (const [id, value] of [['pem-solar-day', String(day)], ['pem-solar-month', String(month)]]) {
    const select = document.getElementById(id) as HTMLSelectElement;
    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  }
  Array.from(document.querySelectorAll<HTMLButtonElement>('#pem-solar-freq button')).find(button => button.textContent?.trim() === (frequency === 'monthly' ? 'Hàng tháng' : 'Hàng năm'))!.click();
  flushSync();
}

it.each(['lunar', 'solar'] as const)('keeps the chosen %s month when recurrence changes without saving the draft', mode => {
  open();
  if (mode === 'solar') solarDate(15, 8, 'yearly');
  const month = document.querySelector<HTMLSelectElement>(mode === 'solar' ? '#pem-solar-month' : '#pem-select-month')!;
  month.value = '8'; month.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  const recurrence = document.querySelector(mode === 'solar' ? '#pem-solar-freq' : '#pem-select-freq')!;
  const yearly = Array.from(recurrence.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Hàng năm')!;
  const monthly = Array.from(recurrence.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Hàng tháng')!;
  expect(yearly.getAttribute('aria-pressed')).toBe('true');
  monthly.click(); flushSync();
  expect(monthly.getAttribute('aria-pressed')).toBe('true');
  expect(yearly.getAttribute('aria-pressed')).toBe('false');
  expect(month.disabled).toBe(true);
  expect(month.value).toBe('0');
  yearly.click(); flushSync();
  expect(month.disabled).toBe(false);
  expect(month.value).toBe('8');
  expect(yearly.getAttribute('aria-pressed')).toBe('true');
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

it('keeps rejecting missing recurrence in the shared validator', () => {
  expect(personalEventFormIssue({ title: 'Ngày lễ chưa đầy đủ', frequency: '', type: 'gia-dinh', lunarDay: 15, lunarMonth: 8 }, ['gia-dinh'])).toBe('missingFrequency');
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

it.each([2, 4])('rejects a yearly solar day 31 in month %i without writing or scheduling and retains the form', async month => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'must-not-save' });
  open(); solarDate(31, month, 'yearly');
  expect(document.querySelector('.conversion-pill')?.textContent).toContain('Ngày không hợp lệ');
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const requests = vi.spyOn(globalThis, 'fetch');
  submitAnniversary('Ngày không tồn tại');
  await settle();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(writes).not.toHaveBeenCalled();
  expect(requests).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/ngày.*không hợp lệ/iu);
  expect(mocks.alert).toHaveBeenCalledWith(expect.stringContaining('Ngày dương lịch không hợp lệ'), { title: 'Ngày chưa hợp lệ', presentation: 'personal-event' });
  expect(document.querySelector('.pem-saved-message')).toBeNull();
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('Ngày không tồn tại');
  expect(unhandled).toEqual([]);
});

it.each([
  { day: 29, month: 2, frequency: 'yearly' as const },
  { day: 31, month: 2, frequency: 'monthly' as const },
])('preserves supported solar recurrence $day/$month $frequency', async ({ day, month, frequency }) => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'valid-solar-event' });
  open(); solarDate(day, month, frequency);
  submitAnniversary('Ngày hợp lệ');
  await settle();
  expect(mocks.add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    title: 'Ngày hợp lệ', calendarMode: 'solar', solarDay: day, solarMonth: month, frequency,
  }));
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector('.pem-saved-message[role="status"]')?.textContent).toBe('Đã lưu thành công');
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
  expect(unhandled).toEqual([]);
});

it('omits the redundant modal notification toggle since personal reminders default on and are configured in Settings', async () => {
  open();
  expect(document.querySelector('.pem-switch')).toBeNull();
  expect(document.querySelector('.pem-notify-toggle-card')).toBeNull();
  expect(unhandled).toEqual([]);
});

it('sets up native reminders from an explicit valid save while retaining the saved anniversary', async () => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'new-event' });
  open();
  expect(mocks.sync).not.toHaveBeenCalled();
  submitAnniversary();
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ masterEnabled: true }, 'vi');
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(unhandled).toEqual([]);
});

it.each([
  ['vi', 'Đã thêm ngày lễ cá nhân', 'Ngày lễ đã được lưu trên thiết bị.'],
  ['en', 'Personal anniversary added', 'The anniversary was saved on this device.'],
] as const)('shows the localized %s success dialog after the anniversary is saved', async (locale, title, message) => {
  localStorage.setItem('tutam_locale', locale);
  mocks.add.mockImplementation(() => {
    expect(mocks.alert).not.toHaveBeenCalled();
    return { id: 'new-event' };
  });
  open();
  submitAnniversary();
  await settle();
  expect(mocks.alert).toHaveBeenCalledExactlyOnceWith(message, { title, presentation: 'personal-event' });
});

it.each(['denied', 'scheduler-error'] as const)('retains a saved native anniversary and distinguishes %s from a storage failure', async failure => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'new-event' });
  if (failure === 'denied') mocks.sync.mockResolvedValue({ success: false, scheduledCount: 0 });
  else mocks.sync.mockRejectedValue(new Error('OS unavailable'));
  open();
  submitAnniversary();
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Đã lưu ngày lễ');
  expect(document.querySelector('[role="alert"]')?.textContent).not.toContain('Không thể lưu thay đổi');
  expect(unhandled).toEqual([]);
});

it('keeps the native master switch off and reports it after saving an anniversary', async () => {
  mocks.native = true;
  mocks.masterEnabled = false;
  mocks.add.mockReturnValue({ id: 'new-event' });
  open();
  submitAnniversary();
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.masterEnabled).toBe(false);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('nhắc nhở chung đang tắt');
});

it('respects the personal notification preference stored from Settings when saving an anniversary', async () => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'new-event' });
  localStorage.setItem('tutam_personal_events_notify_enabled', '0');
  open();
  submitAnniversary('Ngày lễ khi tắt thông báo');
  await settle();
  expect(mocks.sync).not.toHaveBeenCalled();
  localStorage.setItem('tutam_personal_events_notify_enabled', '1');
  submitAnniversary('Ngày lễ khi bật thông báo');
  await settle();
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ masterEnabled: true }, 'vi');
});

it.each(['web', 'personal-off', 'invalid', 'storage-error'] as const)('does not set up native reminders for %s', async scenario => {
  mocks.native = scenario !== 'web';
  if (scenario === 'personal-off') localStorage.setItem('tutam_personal_events_notify_enabled', '0');
  if (scenario !== 'storage-error') mocks.add.mockReturnValue({ id: 'new-event' });
  open();
  submitAnniversary(scenario === 'invalid' ? '' : 'Ngày lễ mới');
  await settle();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(unhandled).toEqual([]);
});

it.each(['new-draft', 'account-change', 'unmount'] as const)('ignores a late native reminder failure after %s', async scenario => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'new-event' });
  let finish!: (result: { success: boolean; scheduledCount: number }) => void;
  mocks.sync.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  open();
  submitAnniversary();
  await settle();
  expect(mocks.sync).toHaveBeenCalledOnce();
  if (scenario === 'new-draft') {
    const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
    title.value = 'Bản nháp tiếp theo';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  } else if (scenario === 'account-change') {
    window.dispatchEvent(new CustomEvent('quangtu:session-changed'));
  } else {
    await unmount(instance!);
    instance = undefined;
  }
  finish({ success: false, scheduledCount: 0 });
  await settle();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  if (scenario === 'new-draft') expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('Bản nháp tiếp theo');
  expect(unhandled).toEqual([]);
});

it('keeps a new anniversary draft and reports a local storage failure without an uncaught error', async () => {
  open();
  const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
  title.value = 'Ngày lễ chưa lưu';
  title.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  title.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(title.value).toBe('Ngày lễ chưa lưu');
  expect(document.querySelector('[role="alert"]')?.textContent?.trim()).toBeTruthy();
  expect(document.querySelector('.pem-saved-message')).toBeNull();
  expect(mocks.alert).not.toHaveBeenCalled();
  expect(unhandled).toEqual([]);
});

it.each(['timeout', 'new-draft', 'principal-change', 'close'] as const)('clears local save confirmation after %s', async scenario => {
  vi.useFakeTimers();
  let principal = 'saved-owner';
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: true, user: { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  mocks.add.mockImplementation(() => {
    expect(document.querySelector('.pem-saved-message')).toBeNull();
    return { id: 'saved-event' };
  });
  open();
  expect(document.querySelector('.pem-saved-message')).toBeNull();
  submitAnniversary();
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(document.querySelector('.pem-saved-message[role="status"]')?.textContent).toBe('Đã lưu thành công');
  if (scenario === 'timeout') {
    await vi.advanceTimersByTimeAsync(2800);
  } else if (scenario === 'new-draft') {
    const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
    title.value = 'Ngày tiếp theo'; title.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (scenario === 'principal-change') {
    principal = 'next-owner';
    window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
  } else {
    document.querySelector<HTMLButtonElement>('.pem-close-btn')!.click();
  }
  await settle();
  expect(document.querySelector('.pem-saved-message')).toBeNull();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(unhandled).toEqual([]);
});

it('keeps an existing anniversary and reports a failed local deletion without an uncaught error', async () => {
  open();
  document.querySelector<HTMLButtonElement>('.pem-delete-btn')!.click();
  await settle();
  document.querySelector<HTMLButtonElement>('.anniversary-delete-dialog button.delete')!.click();
  await settle();
  expect(mocks.remove).toHaveBeenCalledWith('storage-failure-event');
  expect(document.querySelector('.pem-item-title')?.textContent).toContain('Ngày lễ đã lưu');
  expect(document.querySelector('[role="alert"]')?.textContent?.trim()).toBeTruthy();
  expect(unhandled).toEqual([]);
});

it.each([['a', 'b'], ['a', null], [null, 'b']] as const)('clears an unsaved anniversary draft when principal changes from %s to %s', async (initial, next) => {
  let principal: string | null = initial;
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: principal !== null,
    user: principal === null ? null : { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  open();
  const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
  const note = document.querySelector<HTMLInputElement>('#pem-input-note')!;
  title.value = 'Bản nháp riêng'; title.dispatchEvent(new Event('input', { bubbles: true }));
  note.value = 'Ghi chú riêng'; note.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
  await settle();
  expect(title.value).toBe('Bản nháp riêng');
  expect(note.value).toBe('Ghi chú riêng');
  principal = next;
  window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
  await settle();
  expect(title.value).toBe('');
  expect(note.value).toBe('');
  expect(mocks.add).not.toHaveBeenCalled();
});

it('blocks saving the previous principal draft before the session event arrives', async () => {
  let principal = 'a';
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: true, user: { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  open();
  principal = 'b';
  submitAnniversary('Bản nháp tài khoản cũ');
  await settle();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
});

it.each([['a', 'b'], ['a', null], [null, 'b']] as const)('cancels a pending anniversary deletion when principal changes from %s to %s', async (initial, next) => {
  let principal: string | null = initial;
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: principal !== null,
    user: principal === null ? null : { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  const onCancel = vi.fn(), onConfirm = vi.fn();
  const view = mount(DeletePersonalEventDialog, { target: document.body, props: {
    event: { id: 'same-id', title: 'Ngày lễ tài khoản cũ', type: 'gia-dinh', lunarDay: 1, lunarMonth: 1, createdAt: '2026-01-01' },
    isEn: false, onCancel, onConfirm,
  } });
  try {
    flushSync();
    // Cùng tài khoản refresh phiên không được làm mất xác nhận đang mở.
    window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
    await settle();
    expect(onCancel).not.toHaveBeenCalled();
    principal = next;
    window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
    await settle();
    expect(onCancel).toHaveBeenCalledOnce();
    document.querySelector<HTMLButtonElement>('.anniversary-delete-dialog button.delete')?.click();
    expect(onConfirm).not.toHaveBeenCalled();
  } finally { await unmount(view); }
});

it('rechecks the anniversary deletion principal even before the session event is delivered', async () => {
  let principal = 'a';
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: true, user: { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  const onCancel = vi.fn(), onConfirm = vi.fn();
  const view = mount(DeletePersonalEventDialog, { target: document.body, props: {
    event: { id: 'same-id', title: 'Ngày lễ tài khoản cũ', type: 'gia-dinh', lunarDay: 1, lunarMonth: 1, createdAt: '2026-01-01' },
    isEn: false, onCancel, onConfirm,
  } });
  try {
    flushSync();
    principal = 'b';
    document.querySelector<HTMLButtonElement>('.anniversary-delete-dialog button.delete')!.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  } finally { await unmount(view); }
});

it('keeps the home anniversary card clean without inline delete controls (deletion stays in the manager modal)', async () => {
  const view = mount(HomeDailyReminders, { target: document.body, props: { selectedDate: new Date(2026, 10, 7, 12) } });
  try {
    flushSync();
    expect(document.querySelector('.personal-item-title')?.textContent).toContain('Ngày lễ đã lưu');
    expect(document.querySelector('.personal-delete-btn')).toBeNull();
    expect(document.querySelector('.personal-add-more-btn')).not.toBeNull();
    expect(unhandled).toEqual([]);
  } finally { await unmount(view); }
});
