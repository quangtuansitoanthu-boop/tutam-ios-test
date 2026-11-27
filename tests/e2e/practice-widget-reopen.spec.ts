import { expect, test } from '@playwright/test';
import { deferStartupNotification, settleClient } from './runtime-helpers';

for (const tab of ['personal', 'community'] as const) {
  for (const [section, label] of [['kinh', 'Tụng, Đọc Kinh'], ['tri-chu', 'Trì Chú']] as const) {
    test(`the ${section} widget opens its catalog from the restored ${tab} tab`, async ({ page }) => {
      await deferStartupNotification(page);
      await page.addInitScript(tab => history.replaceState({ ...history.state, tuTapUpgradeTab: tab }, '', location.href), tab);
      await page.goto('/tu-tap');
      await settleClient(page);
      await expect(page.locator('.personal-practice')).toBeVisible();
      await page.evaluate(section => {
        const path = `/tu-tap?muc=${section}`;
        history.replaceState(history.state, '', path);
        window.dispatchEvent(new CustomEvent('quangtu:practice-widget-open', { detail: { path } }));
      }, section);
      await expect(page.locator('.personal-practice')).toHaveCount(0);
      await expect(page.locator('.tt-section-title')).toContainText(label, { ignoreCase: true });
      expect(await page.evaluate(() => history.state.tuTapUpgradeTab)).toBeUndefined();
    });
  }
}

test('a repeated practice widget link opens the closed tool without resetting an active rosary', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  const openWidget = () => page.evaluate(() => {
    const path = '/tu-tap?action=rosary';
    history.replaceState(history.state, '', path);
    window.dispatchEvent(new CustomEvent('quangtu:practice-widget-open', { detail: { path } }));
  });
  await openWidget();
  const begin = page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true });
  await expect(begin).toBeVisible();
  await begin.click();
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  await openWidget();
  await expect(begin).toHaveCount(0);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_rosary_count'))).toBe('0');
  await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toHaveCount(0);
  await openWidget();
  await expect(begin).toBeVisible();
  await begin.click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
});
