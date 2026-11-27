import { expect, test } from '@playwright/test';
import { deferStartupNotification } from './runtime-helpers';

test.beforeEach(async ({ page }) => {
  await deferStartupNotification(page);
  page.on('dialog', dialog => dialog.accept());
  // Các bài hồi quy cũ giữ nháp local khi quay lại; hành vi xác nhận được kiểm tra riêng.
  await page.addLocatorHandler(page.getByRole('dialog', { name: /^(Lưu bản chép trước khi rời\?|Save your copy before leaving\?)$/ }), dialog =>
    dialog.getByRole('button', { name: /^(Rời không lưu|Leave without saving)$/ }).click());
});

for (const locale of ['vi', 'en'] as const) {
  test(`copying preparation ${locale} keeps drafts and adds no cloud requests`, async ({ page }, testInfo) => {
    const cloudRequests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/practice/copying') cloudRequests.push(request.method());
    });
    await page.addInitScript(language => localStorage.setItem('tutam_locale', language), locale);
    await page.goto('/tu-tap/chep-kinh');
    await page.getByTestId('start-copying').click();
    const guide = page.getByTestId('copying-preparation');
    await expect(guide).toBeVisible();
    await expect(page.locator('h1')).toBeFocused();
    const expand = () => guide.getByRole('button', { name: locale === 'vi' ? 'Xem hướng dẫn' : 'Show guide', exact: true });
    const collapse = () => guide.getByRole('button', { name: locale === 'vi' ? 'Thu gọn' : 'Collapse', exact: true });
    await expect(expand()).toHaveAttribute('aria-expanded', 'false');
    await expect(guide.locator('section').first()).toBeHidden();
    // Safari does not focus a button on pointer click; test keyboard focus retention explicitly.
    await expand().focus();
    await expand().press('Enter');
    await expect(collapse()).toHaveAttribute('aria-expanded', 'true');
    await expect(guide.locator('section:visible')).toHaveCount(6);
    await collapse().press('Enter');
    await expect(guide.locator('section:visible')).toHaveCount(0);
    await expect(expand()).toBeFocused();
    await expect(guide.locator('section')).toHaveCount(6);
    await expect(guide.locator('details, a')).toHaveCount(0);
    await expect(page.locator('#copy-text')).toHaveCount(0);
    await expect(page.locator('.stepper li[aria-current="step"]')).toContainText(locale === 'vi' ? 'Hướng dẫn' : 'Guide');
    await expect(page.getByRole('button', { name: locale === 'vi' ? 'Quay lại' : 'Back', exact: true })).toHaveCount(1);
    await expect(page.locator('[data-copying-guide-back]')).toHaveCount(0);
    for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${locale}-${width}-${theme}-collapsed.png`) });
      await expand().click();
      const toggleBox = await collapse().boundingBox();
      expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: testInfo.outputPath(`${locale}-${width}-${theme}-expanded.png`) });
      await collapse().click();
    }
    await page.getByTestId('confirm-copying-guide').click();
    const editor = page.locator('#copy-text');
    await expect(editor).toBeVisible();
    await editor.pressSequentially('Nam mô Phật');
    await expect(page.getByText(locale === 'vi' ? 'Đã lưu trên máy' : 'Saved on this device', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: locale === 'vi' ? 'Đổi kinh hoặc phẩm' : 'Change scripture or chapter', exact: true }).click();
    await expect(page.locator('.books')).toBeVisible();
    await page.getByTestId('start-copying').click();
    await expect(guide).toBeVisible();
    await expect(expand()).toHaveAttribute('aria-expanded', 'false');
    await expect(editor).toHaveCount(0);
    const back = page.getByRole('navigation', { name: 'Tu Tập Phật Pháp', exact: true })
      .getByRole('button', { name: locale === 'vi' ? 'Quay lại' : 'Back', exact: true });
    await back.click();
    await page.locator('.books button').first().click();
    await expect(guide).toBeVisible();
    await page.getByTestId('confirm-copying-guide').click();
    await expect(editor).toHaveText('Nam mô Phật');
    await page.getByRole('button', { name: locale === 'vi' ? 'Đổi kinh hoặc phẩm' : 'Change scripture or chapter', exact: true }).click();
    await expect(page.locator('.books')).toBeVisible();
    for (let index = 0; index < 3; index += 1) {
      const book = page.locator('.books button').nth(index);
      const title = await book.locator('strong').innerText();
      await book.click();
      await expect(guide).toBeVisible();
      for (const heading of [page.locator('.choose-header > p'), page.locator('#copy-preparation-book')]) {
        await expect(heading).toHaveText(title, { useInnerText: true });
        await expect(heading).toHaveCSS('text-align', 'center');
        await expect(heading).toHaveCSS('font-weight', '700');
      }
      await expect(guide.locator('section')).toHaveCount(6);
      await back.click();
    }
    expect(cloudRequests).toEqual([]);
  });
}
