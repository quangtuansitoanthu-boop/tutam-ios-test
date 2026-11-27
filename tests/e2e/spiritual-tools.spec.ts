import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { BIORHYTHM_PROFILE_KEY, DREAM_JOURNAL_KEY } from '../../src/lib/browser/storage-contract';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    if ('Notification' in window) Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  });
});

for (const { width, theme } of [
  { width: 375, theme: 'light' }, { width: 375, theme: 'dark' },
  { width: 960, theme: 'light' }, { width: 960, theme: 'dark' },
] as const) {
  test(`works offline in-place and persists a biorhythm profile at ${width}px ${theme}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(mode => localStorage.setItem('tutam_dark_mode', mode === 'dark' ? '1' : '0'), theme);
    await page.goto('/tu-tap/nhip-sinh-hoc');
    await settleClient(page);
    const birth = page.getByLabel('Ngày sinh (Dương lịch)');
    await expect(birth).toBeEnabled();
    await page.getByLabel('Họ và tên').fill('An kiểm thử');
    await birth.fill('15/08/1992');
    await birth.blur();
    await expect(page.locator('.bio-table tbody tr')).toHaveCount(7);
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').birthDate, principalStorageKey(null, BIORHYTHM_PROFILE_KEY))).toBe('1992-08-15');
    const requests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Ngày sau', exact: true }).click();
    const chart = page.locator('.bio-chart svg');
    await chart.scrollIntoViewIfNeeded();
    const lastPlotPoint = await chart.evaluate(svg => {
      const bounds = svg.getBoundingClientRect();
      const canvas = svg as SVGSVGElement;
      const plot = svg.querySelector('rect')!;
      return {
        x: bounds.left + (Number(plot.getAttribute('x')) + Number(plot.getAttribute('width'))) / canvas.viewBox.baseVal.width * bounds.width,
        y: bounds.top + bounds.height / 2,
      };
    });
    await page.mouse.click(lastPlotPoint.x, lastPlotPoint.y);
    await expect(page.locator('.bio-day-center strong')).toHaveText((await chart.locator('text').last().textContent())!.trim());
    await page.getByRole('button', { name: 'Về hôm nay', exact: true }).click();
    await page.getByRole('button', { name: /Mở rộng/ }).click();
    await expect(page.locator('.bio-metric')).toHaveCount(6);
    if (width === 375 && theme === 'light') {
      await page.screenshot({ path: test.info().outputPath('biorhythm-mobile.png'), fullPage: true });
    }
    await page.getByRole('button', { name: /Hướng dẫn/, exact: false }).last().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.setOffline(false);
    await page.reload();
    await settleClient(page);
    await expect(birth).toHaveValue('15/08/1992');
    await expect(page.getByLabel('Họ và tên')).toHaveValue('An kiểm thử');
  });
}

test('searches the full dream collection, restores mobile list with browser Back and reopens saved notes', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/tu-tap/giai-mong');
  await settleClient(page);
  await expect(page.locator('.dream-topic-card')).toHaveCount(10);
  await expect(page.locator('.dream-row-btn')).toHaveCount(10);
  const search = page.getByRole('searchbox', { name: 'Tìm kiếm giấc mơ' });
  await search.fill('ran can');
  const first = page.locator('#dream-row-ran-bi-can');
  const title = await first.locator('strong').innerText();
  await first.click();
  await expect(page.locator('.dream-sheet-title')).toContainText(title);
  await page.screenshot({ path: test.info().outputPath('dream-mobile.png') });
  await page.goBack();
  await expect(search).toHaveValue('ran can');
  await expect(first).toBeFocused();
  await first.click();
  await page.getByLabel('Ghi chú giấc mơ của bạn').fill('Ghi chú <riêng> & tiếng Việt');
  await page.getByRole('button', { name: 'Lưu vào nhật ký trên thiết bị', exact: true }).click();
  await expect(page.getByText('Đã lưu giấc mơ vào nhật ký.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]').length, principalStorageKey(null, DREAM_JOURNAL_KEY))).toBe(1);
  await page.reload();
  await settleClient(page);
  await page.locator('.dream-history summary').click();
  await page.locator('.dream-history-open').click();
  await expect(page.getByLabel('Ghi chú giấc mơ của bạn')).toHaveValue('Ghi chú <riêng> & tiếng Việt');
  await context.setOffline(true);
  await page.locator('.qts-nav .nav-back-circle-btn').click();
  await search.fill('nguoi mat');
  await page.locator('.dream-row-btn').first().click();
  await expect(page.locator('.dream-article')).toContainText('KINH ĐỊA TẠNG');
  await context.setOffline(false);
  await page.getByRole('button', { name: /^Xóa mục này/ }).click();
  await page.getByRole('dialog').locator('.app-dialog-actions .primary').click();
  await expect(page.locator('.dream-history-open')).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]').length, principalStorageKey(null, DREAM_JOURNAL_KEY))).toBe(0);
});

test('provides English controls and identifies the Vietnamese dream reading collection', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'en'));
  await page.goto('/tu-tap/nhip-sinh-hoc');
  await settleClient(page);
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.getByLabel('Birth date (Gregorian)')).toBeVisible();
  await page.goto('/tu-tap/giai-mong');
  await settleClient(page);
  await expect(page.getByRole('searchbox', { name: 'Search dreams' })).toBeVisible();
  await page.getByRole('button', { name: /Guide/ }).last().click();
  await expect(page.getByRole('dialog')).toContainText('The dream articles are currently available in Vietnamese.');
});

for (const width of [375, 960]) {
  test(`keeps dream search and reading usable at ${width}px in dark mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
    await page.goto('/tu-tap/giai-mong');
    await settleClient(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.dream-topic-card')).toHaveCount(10);
    await page.getByRole('searchbox', { name: 'Tìm kiếm giấc mơ' }).fill('ran can');
    await page.locator('#dream-row-ran-bi-can').click();
    await expect(page.locator('.dream-sheet-title')).toHaveText('Mơ bị rắn cắn');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('clears stale desktop dream details for an empty search and reports unreadable journals', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), principalStorageKey(null, DREAM_JOURNAL_KEY));
  await page.goto('/tu-tap/giai-mong');
  await settleClient(page);
  await expect(page.locator('.dream-sheet-title')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm kiếm giấc mơ' }).fill('zz-no-match-987');
  await expect(page.locator('.dream-sheet-title')).toHaveCount(0);
  await expect(page.getByText('Chưa có giấc mơ khớp với từ khóa', { exact: true })).toBeVisible();
  await page.locator('.dream-history summary').click();
  await expect(page.getByText(/Chưa đọc được nhật ký trên thiết bị/)).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), principalStorageKey(null, DREAM_JOURNAL_KEY))).toBe('{broken');
});

test.describe('installed PWA tools', () => {
  test.use({ serviceWorkers: 'allow' });

  test('opens both public tool routes directly after the network goes offline', async ({ page, context }) => {
    await page.goto('/tu-tap/giai-mong');
    await settleClient(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.goto('/tu-tap/nhip-sinh-hoc');
    await expect(page.getByLabel('Ngày sinh (Dương lịch)')).toBeEnabled();
    await page.getByLabel('Ngày sinh (Dương lịch)').fill('2000-01-01');
    await expect(page.locator('.bio-table tbody tr')).toHaveCount(7);
    await page.goto('/tu-tap/giai-mong');
    await expect(page.getByRole('searchbox', { name: 'Tìm kiếm giấc mơ' })).toBeVisible();
    await expect(page.locator('.dream-row-btn')).toHaveCount(10);
    await page.getByRole('searchbox', { name: 'Tìm kiếm giấc mơ' }).fill('ran can chan');
    await expect(page.locator('#dream-row-ran-bi-can')).toBeVisible();
    await context.setOffline(false);
  });
});
