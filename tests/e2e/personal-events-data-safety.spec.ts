import { expect, test } from '@playwright/test';
import { solarToLunar } from '../../src/lib/components/lunar/lunar-calendar';
import { deferStartupNotification } from './runtime-helpers';

test.beforeEach(async ({ page }) => deferStartupNotification(page));

for (const [name, remote] of [['missing remote list', { revision: 2 }], ['null remote row', { events: [null], revision: 2 }]] as const) {
  test(`home anniversary manager stays interactive and preserves a damaged account conflict (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    const owner = 'ui16-local-fixture';
    const session = { authenticated: true, user: { id: owner, displayName: 'QA UI16', email: 'ui16@example.test', role: 'user' },
      csrfToken: 'synthetic-local-csrf', expiresAt: '2099-01-01T00:00:00Z' };
    const event = { id: 'ui16-local', title: 'Ngày lễ QA', type: 'gio-chap', lunarDay: 15, lunarMonth: 7, createdAt: 'legacy-date' };
    const key = `tutam_personal_lunar_events:v2:user:${owner}`;
    const raw = JSON.stringify({ version: 2, events: [event], base: [event], revision: 1, pending: true, status: 'conflict', remote,
      recovery: [event], guestTransferReceipts: ['retained-receipt'] });
    await page.addInitScript(({ session, key, raw }) => {
      const host = window as unknown as Record<string, unknown>;
      host.CapacitorCustomPlatform = { name: 'ios' };
      host.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_native_session', JSON.stringify(session));
      localStorage.setItem(key, raw);
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }, { session, key, raw });
    let eventRequests = 0;
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/session') return route.fulfill({ json: session, headers: {
        'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true',
      } });
      if (url.pathname === '/api/personal-events') eventRequests++;
      return route.abort('failed');
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Thêm ngày lễ cá nhân', exact: true });
    await trigger.tap();
    const modal = page.locator('.pem-dialog');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.pem-list')).toContainText(event.title);
    await expect(modal.locator('.sync-note')).toContainText('Chưa đồng bộ được');
    await expect(modal.getByRole('button', { name: 'Dùng danh sách trên tài khoản', exact: true })).toHaveCount(0);
    await modal.locator('#pem-input-title').fill('Bản nháp vẫn sử dụng được');
    await modal.locator('.pem-close-btn').tap(); await expect(modal).toHaveCount(0);
    await trigger.tap(); await expect(modal).toBeVisible();
    await expect(modal.locator('#pem-input-title')).toHaveValue('Bản nháp vẫn sử dụng được');
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
    expect(eventRequests).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('personal event date-only draft survives reopen and calendar tabs preserve the chosen date', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 6, 10));
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/');
  await page.locator('.personal-add-first-btn').click();
  await page.locator('#pem-select-day').selectOption('6');
  await page.locator('#pem-select-month').selectOption('3');
  await page.keyboard.press('Escape');
  await page.locator('.personal-add-first-btn').click();
  await expect(page.locator('#pem-select-day')).toHaveValue('6');
  await expect(page.locator('#pem-select-month')).toHaveValue('3');
  await page.getByRole('button', { name: 'Dương lịch', exact: true }).click();
  const solarDay = Number(await page.locator('#pem-solar-day').inputValue());
  const solarMonth = Number(await page.locator('#pem-solar-month').inputValue());
  expect(solarToLunar(solarDay, solarMonth, 2026)).toMatchObject({ day: 6, month: 3 });
  await page.getByRole('button', { name: 'Âm lịch', exact: true }).click();
  await expect(page.locator('#pem-select-day')).toHaveValue('6');
  await expect(page.locator('#pem-select-month')).toHaveValue('3');
});

test.describe('personal anniversary validation and current date', () => {
  test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
  for (const locale of ['vi', 'en']) {
    test(`missing fields show an alert, focus the field and never save (${locale})`, async ({ page }, info) => {
      await page.setViewportSize({ width: locale === 'vi' ? 375 : 1440, height: 900 });
      await page.clock.setFixedTime(new Date('2026-11-06T17:30:00Z'));
      await page.addInitScript(lang => {
        localStorage.setItem('tutam_locale', lang);
        localStorage.setItem('tutam_dark_mode', lang === 'vi' ? '0' : '1');
      }, locale);
      let writes = 0;
      await page.route('**/api/**', route => {
        if (route.request().method() === 'POST' && new URL(route.request().url()).pathname === '/api/personal-events') writes++;
        return route.abort('failed');
      });
      await page.goto('/');
      await page.locator('.personal-add-first-btn').click();
      await expect(page.locator('#pem-select-day')).toHaveValue('29');
      await expect(page.locator('#pem-select-month')).toHaveValue('9');
      const submit = page.locator('.pem-form button[type="submit"]');
      await page.locator('#pem-input-title').fill('   ');
      await submit.click();
      const alert = page.locator('[data-app-message]');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(locale === 'vi' ? 'Tên ngày lễ / Sự kiện' : 'Event Name / Title');
      await alert.screenshot({ path: info.outputPath('missing-title.png') });
      await alert.getByRole('button').click();
      await expect(page.locator('#pem-input-title')).toBeFocused();
      await expect(page.locator('.pem-list')).toHaveCount(0);
      await page.locator('#pem-input-title').fill('Ngày thử nghiệm');
      await page.getByRole('button', { name: locale === 'vi' ? 'Dương lịch' : 'Solar', exact: true }).click();
      await expect(page.locator('#pem-solar-day')).toHaveValue('7');
      await expect(page.locator('#pem-solar-month')).toHaveValue('11');
      await page.locator('#pem-solar-day').selectOption('31');
      await page.locator('#pem-solar-month').selectOption('2');
      await submit.click();
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(locale === 'vi' ? 'Ngày dương lịch không hợp lệ' : 'Invalid solar date');
      await alert.getByRole('button').click();
      await expect(page.locator('#pem-solar-day')).toBeFocused();
      await expect(page.locator('#pem-input-title')).toHaveValue('Ngày thử nghiệm');
      await expect(page.locator('.pem-list')).toHaveCount(0);
      expect(writes).toBe(0);
      // A valid date saves with an empty optional note through the existing owner.
      await page.locator('#pem-solar-day').selectOption('7');
      await page.locator('#pem-solar-month').selectOption('11');
      await submit.click();
      await expect(page.locator('.pem-list')).toContainText('Ngày thử nghiệm');
    });
  }
});

test('keeps failed anniversary writes, retries with CSRF, and isolates the next account', async ({ page }) => {
  let failWrites = true;
  let account = 'events-qa-A';
  let remoteEvents: unknown[] = [];
  const writes: Array<{ headers: Record<string, string>; body: any }> = [];
  const session = (id: string) => ({ authenticated: true, user: { id, email: 'qa@example.test', displayName: 'Quang Từ', avatarUrl: '', role: 'user' }, csrfToken: 'real-test-csrf', expiresAt: '2099-01-01T00:00:00Z' });
  await page.addInitScript((saved) => {
    // This fixture restores a native cache; web SSR trusts its server cookie.
    const runtime = window as unknown as { Capacitor?: Record<string, unknown>; CapacitorCustomPlatform: { name: string } };
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = { ...runtime.Capacitor, isNativePlatform: () => true };
    if (!localStorage.getItem('tutam_native_session')) localStorage.setItem('tutam_native_session', JSON.stringify(saved));
    localStorage.setItem('tutam_locale', 'vi');
  }, session(account));
  await page.route('**/api/session', route => route.fulfill({ json: session(account) }));
  await page.route('**/api/personal-events', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { events: account === 'events-qa-A' ? remoteEvents : [], revision: remoteEvents.length ? 1 : 0 } });
    const body = route.request().postDataJSON();
    writes.push({ headers: route.request().headers(), body });
    if (failWrites) return route.fulfill({ status: 500, json: { error: 'unavailable' } });
    remoteEvents = body.events;
    return route.fulfill({ json: { ok: true, revision: 1 } });
  });
  await page.goto('/');
  await page.locator('.personal-add-first-btn').click();
  await page.locator('#pem-input-title').fill('Kỷ niệm riêng của A');
  await page.locator('.pem-form button[type="submit"]').click();
  await page.getByRole('dialog', { name: 'Đã thêm ngày lễ cá nhân', exact: true }).getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.locator('.pem-list')).toContainText('Kỷ niệm riêng của A');
  await expect(page.locator('.pem-dialog')).toContainText('Chưa đồng bộ được');
  expect(writes).toHaveLength(1);
  expect(writes[0].headers['x-csrf-token']).toBe('real-test-csrf');
  expect(writes[0].body.ownerId).toBe('events-qa-A');
  failWrites = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect.poll(() => remoteEvents.length).toBe(1);
  await expect(page.locator('.pem-dialog')).not.toContainText('Chưa đồng bộ được');
  account = 'events-qa-B';
  await page.evaluate(saved => localStorage.setItem('tutam_native_session', JSON.stringify(saved)), session(account));
  await page.reload();
  await page.locator('.personal-add-first-btn').click();
  await expect(page.locator('.pem-list')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('tutam_personal_lunar_events:v2:user:events-qa-A'))).toContain('Kỷ niệm riêng của A');
});
