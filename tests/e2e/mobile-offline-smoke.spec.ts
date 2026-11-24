import { expect, test } from '@playwright/test';

for (const [route, catalog] of [['/phap-thoai', 'talks'], ['/kinh-sach', 'books'], ['/tu-tap', 'practice']] as const) {
  test(`${catalog} search clears from a full touch target and returns focus to the input`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
      await page.goto(route);
      if (catalog === 'practice') await page.locator('.tt-mode-card--tri-chu').click();
      const search = page.getByRole('searchbox');
      await search.fill('Kinh');
      const clear = page.getByRole('button', { name: 'Xóa tìm kiếm', exact: true });
      await expect(clear).toBeVisible();
      const size = await clear.evaluate((button: HTMLElement) => Math.min(button.offsetWidth, button.offsetHeight));
      expect(size).toBeGreaterThanOrEqual(44);
      await clear.tap({ position: { x: 4, y: 22 } });
      await expect(search).toHaveValue('');
      await expect(search).toBeFocused();
      await expect(clear).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test('bundled native catalog paths and navigation survive unavailable APIs in the browser harness', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
  // Activate the native data paths only; OS plugins are checked on the emulator.
  await page.evaluate(() => {
    const win = window as unknown as { CapacitorCustomPlatform: { name: string }; Capacitor?: { isNativePlatform: () => boolean } };
    win.CapacitorCustomPlatform = { name: 'android' };
    win.Capacitor = { ...win.Capacitor, isNativePlatform: () => true };
  });
  const nav = page.getByRole('navigation', { name: 'Điều hướng nhanh' });
  await nav.getByRole('link', { name: 'Kinh sách', exact: true }).click();
  await expect(page.locator('.art-card').first()).toBeVisible();
  await nav.getByRole('link', { name: 'Tu tập', exact: true }).click();
  await expect(page.locator('.tt-mode-card--thien')).toBeVisible();
  await page.locator('.tt-mode-card--thien').click();
  await expect(page.locator('.meditation-chooser')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.meditation-chooser')).toHaveCount(0);
  await nav.getByRole('link', { name: 'Pháp thoại', exact: true }).click();
  await expect(page.locator('.pt-card').first()).toBeVisible();
  await page.locator('.pt-card-play-btn').first().click();
  await expect(page.locator('.pt-mini-player')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await nav.getByRole('link', { name: 'Cá nhân', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hành trình của bạn' })).toBeVisible();
  await expect(page.locator('.pt-mini-player')).toBeVisible();
  await nav.getByRole('link', { name: 'Trang chủ', exact: true }).click();
  await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
  expect(errors).toEqual([]);
});

test('personal calendar dialog traps and restores focus and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /Thêm ngày lễ cá nhân/ }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Quản lý Ngày Lễ Cá Nhân' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
