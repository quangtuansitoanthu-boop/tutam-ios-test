import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { deferJournalNotifications, openJournalSection } from './helpers/journal-controls';

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`journal save feedback ${width} ${dark}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await deferJournalNotifications(page);
      await page.addInitScript(value => {
        localStorage.setItem('tt_reflection_guide_seen_v1', '1');
        localStorage.setItem('tutam_dark_mode', value ? '1' : '0');
      }, dark);
      await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session'
        ? { authenticated: false, user: null, csrfToken: null, expiresAt: null }
        : new URL(route.request().url()).pathname === '/api/presence' ? { enabled: false, activeCount: 0 } : [] }));
      await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' }); await settleClient(page);
      await page.locator('.tt-mode-card--reflection').click();
      await expect(page.locator('.guide-toggle-button')).toHaveAttribute('aria-expanded', 'true');
      await page.locator('.guide-toggle-button').click();
      await expect(page.getByText('Cài đặt lưu ngay trên máy.', { exact: false })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Khôi phục cài đặt từ máy chủ' })).toHaveCount(0);
      const journal = page.locator('.personal-journal');
      await expect(journal.getByText('Nội dung mặc định chỉ lưu riêng', { exact: false })).toHaveCount(0);
      for (const id of ['repentance', 'good-deed'] as const) {
        const section = await openJournalSection(journal, id, width === 375);
        expect((await section.locator('textarea').boundingBox())!.height).toBeGreaterThanOrEqual(280);
        await section.locator('.snippet-pill').first().click();
        await expect(section.locator('textarea')).not.toHaveValue('');
      }
      await page.screenshot({ path: info.outputPath('journal-compact-fields.png') });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const feedback = page.locator('dialog.app-dialog');
      for (const id of ['repentance', 'good-deed'] as const) {
        const section = await openJournalSection(journal, id, width === 375);
        const editor = section.locator('textarea');
        const save = section.getByRole('button', { name: 'Lưu riêng tư', exact: true });
        await editor.fill('từ '.repeat(49)); await save.click();
        await expect(feedback).toContainText('còn thiếu 1 từ');
        await expect(editor).toHaveValue('từ '.repeat(49));
        await feedback.getByRole('button').click();
        await editor.fill('từ '.repeat(50)); await save.click();
        await expect(feedback).toContainText('Đã lưu riêng trên thiết bị.');
        await feedback.getByRole('button').click();
        await expect(save).toBeFocused();
      }
      const repentance = await openJournalSection(journal, 'repentance', width === 375);
      await repentance.getByRole('button', { name: 'Toàn màn hình' }).click();
      const zen = page.locator('dialog.zen-overlay');
      await zen.locator('textarea').fill('từ '.repeat(49));
      await zen.locator('.zen-save-btn').click();
      await expect(feedback).toContainText('còn thiếu 1 từ');
      await page.screenshot({ path: info.outputPath('journal-save-warning.png') });
      await page.keyboard.press('Escape');
      await expect(feedback).toHaveCount(0); await expect(zen).toBeVisible();
      await zen.locator('textarea').fill('từ '.repeat(50)); await zen.locator('.zen-save-btn').click();
      await expect(feedback).toContainText('Đã lưu riêng trên thiết bị.');
      await page.screenshot({ path: info.outputPath('journal-save-success.png') });
      await feedback.getByRole('button').click();
      await expect(zen.locator('.zen-save-btn')).toBeFocused();
      await zen.locator('.zen-close-btn').click();
    });
  }
}
