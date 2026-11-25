import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { deferStartupNotification, settleClient } from './runtime-helpers';
import { fixtureEnglishPack } from './helpers/personal-journal-zen';

for (const [name, width, height, dark, english] of [
  ['phone light', 375, 812, false, false],
  ['phone dark', 375, 812, true, false],
  ['desktop light', 1440, 900, false, false],
  ['desktop dark', 1440, 900, true, false],
  ['English phone large text', 375, 812, false, true],
] as const) {
  test(`home refuge banner: ${name}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
    await page.addInitScript(({ dark, english }) => {
      localStorage.setItem('tutam_locale', english ? 'en' : 'vi');
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
    }, { dark, english });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Nội dung phải đọc được khi backend không truy cập được.
    await page.route(url => url.pathname.startsWith('/api/'), route => route.abort());
    if (english) await fixtureEnglishPack(page);
    await deferStartupNotification(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settleClient(page);
    const title = english ? 'Short refuge & life release ritual' : 'Bài quy y & phóng sinh ngắn';
    const trigger = page.getByRole('button', { name: title, exact: true });
    const vegan = page.locator('a[href="/tu-tap/an-chay"]');
    await expect(trigger).toBeVisible();
    await expect(vegan).toBeVisible();
    await trigger.scrollIntoViewIfNeeded();
    const a = await trigger.boundingBox(), b = await vegan.boundingBox();
    expect(a && b).toBeTruthy();
    expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
    expect(Math.abs(a!.height - b!.height)).toBeLessThan(1);
    expect(Math.round(a!.y - b!.y - b!.height)).toBe(12);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(await overflow()).toBe(false);
    await page.screenshot({ path: info.outputPath('home.png') });
    if (english) await page.addStyleTag({ content: ':root { --ui-font-scale: 1.4 !important; }' });
    const previousOverflow = await page.evaluate(() => document.body.style.overflow);
    const requests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
    await trigger.click();
    const dialog = page.locator('.refuge-release-dialog');
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.locator('h1')).toBeFocused();
    const content = dialog.locator('.ritual-content');
    await expect(content).toHaveAttribute('lang', 'vi');
    await expect(content.locator('h2')).toHaveCount(2);
    const text = (await content.innerText()).normalize('NFC').replace(/\s+/gu, ' ').trim();
    expect(createHash('sha256').update(text).digest('hex')).toBe('5b5fb2578d4ce93736e69d74ec578cdd50fab941eebd08117fef27167303de85');
    await expect(content).toContainText('NGHI THỨC PHÓNG SINH NGẮN GỌN');
    expect(await content.locator('.ritual-verse').first().evaluate(e => getComputedStyle(e).textAlign)).toBe('center');
    expect(await content.locator('p:not(.ritual-verse)').first().evaluate(e => getComputedStyle(e).textAlign)).toBe('justify');
    for (const em of await content.locator('em').all()) {
      expect(await em.innerText()).toMatch(/^\(.*\)$/u);
      expect(await em.evaluate(e => getComputedStyle(e).fontStyle)).toBe('italic');
    }
    expect(await content.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(false);
    const close = dialog.getByRole('button', { name: english ? 'Close reading' : 'Đóng bài đọc' });
    const decrease = dialog.getByRole('button', { name: english ? 'Decrease font size' : 'Giảm cỡ chữ' });
    const increase = dialog.getByRole('button', { name: english ? 'Increase font size' : 'Tăng cỡ chữ' });
    await page.keyboard.press('Tab');
    await expect(decrease).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.locator('.ritual-font-val')).toHaveText('16px');
    await page.keyboard.press('Tab');
    await expect(increase).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.locator('.ritual-font-val')).toHaveText('18px');
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(decrease).toBeFocused();
    await page.screenshot({ path: info.outputPath('reading.png') });
    await content.evaluate(e => e.scrollTop = e.scrollHeight);
    await expect(content.locator('p').last()).toContainText('rốt cuộc đều chứng đắc Phật đạo.');
    await expect(content.locator('p').last()).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(previousOverflow);
    await trigger.click();
    await dialog.getByRole('button', { name: english ? 'Close reading' : 'Đóng bài đọc' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    expect(await overflow()).toBe(false);
    await expect(vegan).toHaveAttribute('href', '/tu-tap/an-chay');
  });
}
