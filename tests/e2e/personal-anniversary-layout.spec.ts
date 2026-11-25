import { expect, test, type Locator } from '@playwright/test';
import { deferStartupNotification, settleClient } from './runtime-helpers';

test.beforeEach(async ({ page }) => deferStartupNotification(page));

const events = [
  { id: 'layout-birthday', title: 'Sinh nhật mẹ', type: 'gia-dinh', calendarMode: 'solar', solarDay: 20, solarMonth: 11, lunarDay: 1, lunarMonth: 1, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'layout-memorial', title: 'Ngày giỗ ông bà và tưởng niệm gia đình', type: 'gio-chap', calendarMode: 'lunar', lunarDay: 15, lunarMonth: 7, frequency: 'yearly', note: 'Chuẩn bị hương hoa', createdAt: '2026-01-01T00:00:00Z' },
];

for (const [year, lunarDay] of [[2026, 2], [2027, 13]]) {
  test(`personal date conversion uses the device year ${year} in home and settings`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(year, 10, 10, 12));
    await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
    await page.route('**/api/**', route => route.abort());
    await page.goto('/');
    await settleClient(page);
    await page.locator('.personal-add-first-btn, .personal-add-more-btn').click();
    const modal = page.locator('.pem-dialog');
    await modal.getByRole('button', { name: 'Dương lịch', exact: true }).click();
    await modal.locator('#pem-solar-day').selectOption('10');
    await modal.locator('#pem-solar-month').selectOption('11');
    await expect(modal.locator('.conversion-pill')).toContainText(`Âm lịch năm ${year}:`);
    await expect(modal.locator('.conversion-pill')).toContainText(`${lunarDay <= 10 ? 'Mồng' : 'Ngày'} ${lunarDay} Tháng 10`);
    await page.goto('/ca-nhan?tab=settings');
    await settleClient(page);
    await page.locator('#settings-personal > summary').click();
    await page.locator('.personal-inline-add-btn').click();
    const editor = page.locator('.personal-inline-editor');
    await editor.getByRole('button', { name: 'Dương lịch', exact: true }).click();
    await editor.locator('.personal-select-sm').nth(0).selectOption('10');
    await editor.locator('.personal-select-sm').nth(1).selectOption('11');
    await expect(editor.locator('.personal-conversion-badge')).toContainText(`Âm lịch năm ${year}:`);
    await expect(editor.locator('.personal-conversion-badge')).toContainText(`Ngày ${lunarDay} Tháng 10`);
  });
}

async function appearance(control: Locator) {
  return control.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, fontSize: style.fontSize, radius: style.borderRadius };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`home anniversary form matches settings controls (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(theme => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, theme);
    await page.route('**/api/**', route => route.abort('failed'));
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await settleClient(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('.personal-add-first-btn, .personal-add-more-btn').click();
      const modal = page.locator('.pem-dialog');
      await expect(modal).toBeVisible();
      const form = modal.locator('.pem-form');
      await form.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
      const validation = page.locator('[data-app-message]');
      await expect(validation).toHaveClass(/personal-event-dialog/);
      await expect(validation.getByRole('heading')).toHaveText('Chưa đủ thông tin');
      await expect(validation).toContainText('Tên ngày lễ / Sự kiện');
      await validation.getByRole('button').click();
      await expect(form.locator('#pem-input-title')).toBeFocused();
      await expect(modal.locator('.pem-saved-message')).toHaveCount(0);
      const yearly = form.getByRole('button', { name: 'Hàng năm', exact: true });
      const monthly = form.getByRole('button', { name: 'Hàng tháng', exact: true });
      const lunar = form.getByRole('button', { name: 'Âm lịch', exact: true });
      await expect(lunar).toHaveAttribute('aria-pressed', 'true');
      await expect(yearly).toHaveAttribute('aria-pressed', 'true');
      const month = form.locator('#pem-select-month');
      await month.selectOption('8');
      await monthly.click();
      await expect(monthly).toHaveAttribute('aria-pressed', 'true');
      await expect(yearly).toHaveAttribute('aria-pressed', 'false');
      await expect(month).toBeDisabled();
      await expect(month).toHaveValue('0');
      await yearly.click();
      await expect(month).toBeEnabled();
      await expect(month).toHaveValue('8');
      for (const control of await form.locator('input, select, button').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await modal.locator('.pem-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const title = form.locator('#pem-input-title');
      const titleBox = (await title.boundingBox())!, categoryBox = (await form.locator('#pem-select-type').boundingBox())!;
      expect(categoryBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
      const modalAppearance = await Promise.all([title, lunar, yearly, form.getByRole('button', { name: 'Lưu ngày lễ', exact: true })].map(appearance));
      await modal.screenshot({ path: testInfo.outputPath(`home-form-${theme}-${width}.png`) });
      await title.fill(`Ngày lễ kiểm tra ${width}`);
      await form.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
      await expect(modal.locator('.pem-saved-message[role="status"]')).toHaveText('Đã lưu thành công');
      await expect(modal.locator('.pem-list')).toContainText(`Ngày lễ kiểm tra ${width}`);
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await page.goto('/ca-nhan?tab=settings');
      await settleClient(page);
      await page.locator('#settings-personal > summary').click();
      await page.locator('.personal-inline-add-btn').click();
      const editor = page.locator('.personal-inline-editor');
      const settingsControls = [editor.locator('.personal-inline-title-input'), editor.getByRole('button', { name: 'Âm lịch', exact: true }), editor.getByRole('button', { name: 'Hàng năm', exact: true }), editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true })];
      expect(await Promise.all(settingsControls.map(appearance))).toEqual(modalAppearance);
      await editor.screenshot({ path: testInfo.outputPath(`settings-form-${theme}-${width}.png`) });
      await editor.getByRole('button', { name: 'Hủy', exact: true }).click();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`each personal anniversary keeps its own date beside its title (${theme})`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date(2026, 10, 20, 12));
    await page.addInitScript(({ theme, events }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
      localStorage.setItem('tutam_personal_lunar_events', JSON.stringify(events));
    }, { theme, events });
    await page.route('**/api/**', route => route.abort('failed'));
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await settleClient(page);
      const card = page.locator('.personal-reminder-card');
      const items = card.locator('.personal-list-item');
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText('20/11 Dương lịch');
      await expect(items.nth(1)).toContainText('Ngày 15 Tháng 07 Âm Lịch');
      await expect(items.nth(0).locator('.personal-today-tag')).toHaveText('Hôm nay ✨');
      await expect(items.nth(1).locator('.personal-today-tag')).toHaveCount(0);
      for (const item of await items.all()) {
        const title = await item.locator('.personal-item-title').boundingBox();
        const titleRow = await item.locator('.personal-item-title-row').boundingBox();
        const date = await item.locator('.personal-item-date').boundingBox();
        const bounds = await item.boundingBox();
        expect(Math.abs(date!.x - title!.x), 'Date must align with its own title, not become a separate full-width row').toBeLessThan(2);
        const gapBelowTitleRow = date!.y - (titleRow!.y + titleRow!.height);
        expect(gapBelowTitleRow).toBeGreaterThanOrEqual(0);
        expect(gapBelowTitleRow, 'The date belongs directly below the title and any wrapped badges').toBeLessThanOrEqual(12);
        expect(date!.x + date!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await card.screenshot({ path: testInfo.outputPath(`anniversaries-${theme}-${width}.png`) });
      await card.getByRole('button', { name: 'Thêm ngày lễ cá nhân' }).click();
      const modal = page.locator('.pem-dialog');
      for (const event of events) {
        const remove = modal.getByRole('button', { name: `Xóa ${event.title}`, exact: true });
        await expect(remove).toBeVisible();
        const bounds = (await remove.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
    }
  });
}
