import { expect, test } from '@playwright/test';
import { deferStartupNotification, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }, info) => {
  if (info.title.startsWith('bowing principal settlement')) await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('personal routine saves and starts bowing with the standalone fullscreen layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session' ? { authenticated: false, user: null, csrfToken: null, expiresAt: null } : [] }));
  await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mounted="1"]');
  await page.getByRole('button', { name: 'Thời khóa tu tập', exact: true }).click();
  const list = page.getByRole('region', { name: 'Thời khóa tu tập', exact: true });
  await expect(list.getByText('Buổi tối', { exact: true })).toHaveCount(0);
  await list.getByRole('button', { name: 'Tạo thời khóa mới', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo thời khóa mới', exact: true });
  await expect(dialog.locator('.step-card')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Thêm bước', exact: true }).click();
  const steps = page.getByRole('dialog', { name: 'Thêm bước', exact: true });
  await expect(steps.getByRole('button', { name: 'Lần tràng hạt', exact: true })).toBeVisible();
  await steps.getByRole('button', { name: 'Lễ Phật & Sám Hối', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Thêm bước', exact: true }).click();
  await steps.getByRole('button', { name: 'Thiền định', exact: true }).click();
  await expect(dialog.locator('.step-card')).toHaveCount(2);
  await dialog.getByRole('textbox', { name: 'Tên thời khóa' }).fill('Kiểm tra Lễ Phật');
  await dialog.getByRole('button', { name: 'Lưu thời khóa', exact: true }).click();
  await expect(list.getByRole('status')).toHaveText('Đã lưu thời khóa trên thiết bị.');
  await expect(page).toHaveURL(/action=thoi-khoa/u);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(list).toBeVisible();
  const editButton = list.getByRole('button', { name: 'Sửa Kiểm tra Lễ Phật', exact: true });
  await editButton.click();
  const edit = page.getByRole('dialog', { name: 'Sửa thời khoá' });
  await edit.getByRole('textbox', { name: 'Tên thời khóa' }).fill('Bản nháp chưa lưu');
  await edit.locator('summary').first().click();
  await page.setViewportSize({ width: 375, height: 360 });
  const footer = edit.locator('footer');
  const initialFooter = await footer.boundingBox();
  expect(initialFooter).not.toBeNull();
  expect(initialFooter!.y + initialFooter!.height).toBeLessThanOrEqual(360);
  const scrollTop = await edit.locator('.routine-dialog-body').evaluate(body => {
    body.scrollTop = body.scrollHeight;
    return body.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  expect(await footer.boundingBox()).toEqual(initialFooter);
  await edit.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(editButton).toBeFocused();
  await expect(list.getByText('Bản nháp chưa lưu')).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 844 });
  await editButton.click();
  await expect(edit.getByRole('textbox', { name: 'Tên thời khóa' })).toHaveValue('Kiểm tra Lễ Phật');
  await edit.getByRole('textbox', { name: 'Tên thời khóa' }).fill('Lễ Phật buổi sáng');
  await edit.getByRole('button', { name: 'Lưu thời khóa', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await list.getByRole('button', { name: 'Bắt đầu Lễ Phật buổi sáng', exact: true }).click();
  await page.getByRole('dialog', { name: 'Bắt đầu thời khoá tu tập?' }).getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  const portrait = page.locator('.lp-fullscreen-img');
  await expect(portrait).toBeVisible();
  for (const viewport of [{ width: 375, height: 844 }, { width: 1100, height: 800 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const picture = (await portrait.boundingBox())!;
    expect(picture.width).toBeCloseTo(viewport.width, 0);
    expect(picture.height).toBeCloseTo(viewport.height, 0);
    expect(picture.y).toBeCloseTo(0, 0);
    await expect(portrait).toHaveCSS('object-fit', viewport.width > viewport.height ? 'contain' : 'cover');
    await expect(page.locator('.lp-fullscreen-screen .routine-session')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 375, height: 844 });
  await page.locator('.lp-fullscreen-counter').click();
  const count = page.locator('.lp-fullscreen-counter [aria-live]');
  await expect(count).toHaveText('1 / 3 lạy');
  await page.getByRole('button', { name: 'Quay về màn hình chuẩn bị', exact: true }).click();
  await expect(page.locator('.lp .routine-session').getByText('Lễ Phật buổi sáng', { exact: true })).toBeVisible();
  await page.locator('.lp__action-btn--start').click();
  await expect(count).toHaveText('1 / 3 lạy');
});

test('personal routine can save a dedication added before its bundled template finishes loading', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.route('**/api/**', route => route.fulfill({ status: 503 }));
  let releaseTemplate!: () => void;
  const templateGate = new Promise<void>(resolve => { releaseTemplate = resolve; });
  await page.route('**/offline-data/chapters/tt_1781274943336.json', async route => {
    await templateGate;
    await route.continue();
  });
  await page.goto('/tu-tap');
  await page.waitForSelector('[data-mounted="1"]');
  await page.getByRole('button', { name: 'Thời khóa tu tập', exact: true }).click();
  const list = page.getByRole('region', { name: 'Thời khóa tu tập', exact: true });
  await list.getByRole('button', { name: 'Tạo thời khóa mới', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo thời khóa mới', exact: true });
  await dialog.getByRole('combobox', { name: 'Thêm bước', exact: true }).click();
  await page.getByRole('dialog', { name: 'Thêm bước' }).getByRole('button', { name: 'HỒI HƯỚNG', exact: true }).click();
  releaseTemplate();
  await expect(dialog.locator('.step-card')).toHaveCount(1);
  await dialog.getByRole('combobox', { name: 'Thêm bước', exact: true }).click();
  await page.getByRole('dialog', { name: 'Thêm bước' }).getByRole('button', { name: 'Thiền định', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lưu thời khóa', exact: true }).click();
  await expect(list.getByRole('status')).toHaveText('Đã lưu thời khóa trên thiết bị.');
  await list.getByRole('button', { name: 'Sửa Thời khoá sáng', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa thời khoá' });
  await edit.locator('.step-card summary').filter({ hasText: 'HỒI HƯỚNG' }).click();
  const text = await edit.getByRole('textbox', { name: 'Lời hồi hướng riêng' }).inputValue();
  expect(text).toContain('HỒI HƯỚNG');
});

test('Back from standalone bowing retains the count when local saving fails and allows one successful retry', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T01:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith('tt_practice_logs_v1') && document.documentElement.dataset.failBowingSave === '1') {
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session'
    ? { authenticated: false, user: null, csrfToken: null, expiresAt: null } : [] }));
  await page.goto('/tu-tap');
  await page.waitForSelector('[data-mounted="1"]');
  await page.locator('.tt-mode-card--le-phat').click();
  await page.locator('#lp-bell-select').selectOption('none');
  await page.getByRole('button', { name: /BẮT ĐẦU ĐẢNH LỄ/ }).click();
  await page.locator('.lp-fullscreen-counter').click();
  await page.evaluate(() => { document.documentElement.dataset.failBowingSave = '1'; });
  await page.goBack();
  const confirmation = page.getByRole('dialog', { name: 'Ghi nhận công phu Lễ Phật', exact: true });
  await expect(confirmation.getByRole('alert')).toContainText('Số lần lạy được giữ nguyên');
  await expect(confirmation.getByRole('spinbutton', { name: 'Số lần đảnh lễ', exact: true })).toHaveValue('1');
  await expect(page.locator('.lp-fullscreen-screen')).toBeVisible();
  await page.evaluate(() => { delete document.documentElement.dataset.failBowingSave; });
  await confirmation.getByRole('button', { name: /Ghi nhận 1 lạy/ }).click();
  await expect(page.locator('.lp-fullscreen-screen')).not.toBeVisible();
  await expect(page.locator('.tt-mode-card--rec')).toBeVisible();
  const saved = await page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.endsWith('tt_practice_logs_v1'))
    .flatMap(key => JSON.parse(localStorage.getItem(key) || '[]')));
  expect(saved.filter((log: { type: string; count: number }) => log.type === 'Lễ Phật' && log.count === 1)).toHaveLength(1);
});

for (const failFirstSave of [false, true]) test(`bowing principal settlement preserves A five bows exactly once and credits B zero (storage failure=${failFirstSave})`, async ({ page, baseURL }) => {
  const now = new Date('2026-11-04T00:00:00Z');
  await page.clock.install({ time: now });
  await page.setViewportSize({ width: 390, height: 844 });
  await useNativeApiWithLocalBackend(page);
  await deferStartupNotification(page);
  const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'quangtu_principal_v1:bowing-a:tt_practice_logs_v1'
        && document.documentElement.dataset.failPrincipalBowingSave === '1') {
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  const account = (id: string, expiresAt: string) => ({ authenticated: true,
    user: { id, email: `${id}@example.test`, displayName: id, avatarUrl: '', role: 'user' },
    csrfToken: `fixture-${id}`, expiresAt });
  const accounts = {
    a: account('bowing-a', '2026-11-04T00:01:00Z'),
    b: account('bowing-b', '2026-11-04T00:02:00Z'),
    returnedA: account('bowing-a', '2026-11-04T01:00:00Z'),
  };
  let phase: keyof typeof accounts = 'a';
  await page.route('**/api/**', route => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: { ...headers,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': route.request().headers()['access-control-request-headers'] || 'content-type,x-csrf-token',
    } })
    : route.fulfill({ headers, json: new URL(route.request().url()).pathname === '/api/session' ? accounts[phase] : [] }));
  const initialSession = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
  await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
  expect(await (await initialSession).json()).toEqual(accounts.a);
  await page.waitForSelector('[data-mounted="1"]');
  await page.clock.runFor(32);
  await page.locator('.tt-mode-card--le-phat').click();
  await page.locator('#lp-bell-select').selectOption('none');
  await page.locator('.lp__action-btn--start').click();
  const counter = page.locator('.lp-fullscreen-counter');
  const count = counter.locator('[aria-live]');
  await expect(count).toHaveText('0 / 21 lạy');
  for (let index = 0; index < 5; index++) await counter.click();
  await expect(count).toHaveText('5 / 21 lạy');
  if (failFirstSave) await page.evaluate(() => { document.documentElement.dataset.failPrincipalBowingSave = '1'; });
  phase = 'b';
  const switchToB = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
  await page.clock.fastForward(60_000);
  expect(await (await switchToB).json()).toEqual(accounts.b);
  await page.clock.runFor(32);
  await expect(page.locator('.lp-fullscreen-screen')).not.toBeVisible();

  const logs = () => page.evaluate(() => {
    const read = (principal: string) => JSON.parse(localStorage.getItem(`quangtu_principal_v1:${principal}:tt_practice_logs_v1`) || '[]')
      .filter((log: { type: string }) => log.type === 'Lễ Phật');
    return { a: read('bowing-a'), b: read('bowing-b') };
  });
  expect((await logs()).b).toEqual([]);
  if (failFirstSave) expect((await logs()).a).toEqual([]);
  // Component Lễ Phật vẫn mount khi đóng; B không được mở lại bộ đếm đang giữ của A.
  await page.locator('.tt-mode-card--le-phat').click();
  if (!await page.locator('.lp-fullscreen-screen').isVisible()) {
    await page.locator('#lp-bell-select').selectOption('none');
    await page.locator('.lp__action-btn--start').click();
  }
  await expect(count).toHaveText('0 / 21 lạy');
  if (failFirstSave) {
    await page.evaluate(() => { delete document.documentElement.dataset.failPrincipalBowingSave; });
    phase = 'returnedA';
    const returnToA = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
    await page.clock.fastForward(60_000);
    expect(await (await returnToA).json()).toEqual(accounts.returnedA);
    await page.clock.runFor(32);
    await page.locator('.tt-mode-card--le-phat').click();
    if (!await page.locator('.lp-fullscreen-screen').isVisible()) {
      await page.locator('#lp-bell-select').selectOption('none');
      await page.locator('.lp__action-btn--start').click();
    }
    const displayedA = async () => Number((await counter.innerText()).match(/\d+/u)?.[0] ?? 0);
    await expect.poll(async () => (await logs()).a.reduce((sum: number, log: { count: number }) => sum + log.count, 0) + await displayedA()).toBe(5);
    if (await displayedA() === 5) {
      await page.locator('.lp-fullscreen-finish-btn').click();
      await page.getByRole('dialog', { name: 'Ghi nhận công phu Lễ Phật', exact: true }).getByRole('button', { name: /Ghi nhận 5 lạy/ }).click();
    }
  }
  await expect.poll(async () => (await logs()).a).toEqual([expect.objectContaining({ type: 'Lễ Phật', count: 5 })]);
  expect((await logs()).b).toEqual([]);
});
