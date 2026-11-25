import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { deferJournalNotifications, openJournalSection } from './helpers/journal-controls';

for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`journal icon tools preserve the other field and require confirmation ${width} ${dark}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await deferJournalNotifications(page);
    await page.addInitScript(() => {
      localStorage.setItem('tt_reflection_guide_seen_v1', '1');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => { (window as Window & { copiedText?: string }).copiedText = text; },
      } });
    });
    await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' }); await settleClient(page);
    await page.evaluate(dark => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, dark);
    await page.locator('.tt-mode-card--reflection').click();
    await expect(page.locator('.guide-toggle-button')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('.guide-toggle-button').click();
    const journal = page.locator('.personal-journal');
    const entries = [
      ['repentance', 'Nội dung riêng ô thứ nhất.\nGiữ nguyên dấu và dòng.'],
      ['good-deed', 'Nội dung riêng ô thứ hai.'],
    ] as const;
    for (const [id, value] of entries) {
      const card = await openJournalSection(journal, id, width === 375);
      await expect(card.getByRole('button', { name: 'Sao chép nội dung', exact: true })).toBeDisabled();
      await expect(card.getByRole('button', { name: 'Xoá hết', exact: true })).toBeDisabled();
      const buttons = card.locator('.editor-tools button');
      await expect(buttons).toHaveCount(3);
      for (const button of await buttons.all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      await card.locator('textarea').fill(value);
    }
    const writes: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
    });
    for (const [id, value] of entries) {
      const card = await openJournalSection(journal, id, width === 375);
      await card.getByRole('button', { name: 'Sao chép nội dung', exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(value);
      await expect(page.getByRole('status').filter({ hasText: 'Đã sao chép.' })).toBeVisible();
      const expand = card.getByRole('button', { name: 'Toàn màn hình', exact: true });
      await expect(expand).toHaveText('');
      await expand.click();
      const zen = page.locator('dialog.zen-overlay');
      await expect(zen).toBeVisible(); await expect(zen.locator('textarea')).toHaveValue(value);
      await zen.getByRole('button', { name: /Thu nhỏ/u }).first().click();
      await card.getByRole('button', { name: 'Xoá hết', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Xoá hết nội dung?', exact: true });
      await expect(confirm).toContainText('Bạn muốn xoá hết dữ liệu trong ô hiện có?');
      await confirm.getByRole('button', { name: 'Hủy', exact: true }).click();
      await expect(card.locator('textarea')).toHaveValue(value);
    }
    const repentance = await openJournalSection(journal, 'repentance', width === 375);
    await repentance.getByRole('button', { name: 'Xoá hết', exact: true }).click();
    await page.getByRole('dialog', { name: 'Xoá hết nội dung?', exact: true }).getByRole('button', { name: 'Xoá hết', exact: true }).click();
    await expect(repentance.locator('textarea')).toHaveValue('');
    const goodDeed = await openJournalSection(journal, 'good-deed', width === 375);
    await expect(goodDeed.locator('textarea')).toHaveValue(entries[1][1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
  });
}
