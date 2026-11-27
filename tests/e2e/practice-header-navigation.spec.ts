import { expect, test } from '@playwright/test';
import { deferStartupNotification, settleClient } from './runtime-helpers';

test.beforeEach(async ({ page }) => { await deferStartupNotification(page); });

test('cold practice subpage Back returns to the hub without reloading the document', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap/an-chay', { waitUntil: 'domcontentloaded' });
  await settleClient(page);
  await page.evaluate(() => {
    Object.defineProperty(window.history, 'length', { configurable: true, get: () => 1 });
    (window as Window & { practiceBackDocumentMarker?: boolean }).practiceBackDocumentMarker = true;
  });
  await page.locator('.qts-nav').getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page).toHaveURL(/\/tu-tap$/u);
  await settleClient(page);
  expect(await page.evaluate(() =>
    (window as Window & { practiceBackDocumentMarker?: boolean }).practiceBackDocumentMarker,
  )).toBe(true);
});

test('practice header Back keeps an active tool callback ahead of route fallback', async ({ page }) => {
  await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
  await settleClient(page);
  await page.evaluate(() => {
    Object.defineProperty(window.history, 'length', { configurable: true, get: () => 1 });
    const state = window as Window & { practiceBackCallbackCount?: number };
    state.practiceBackCallbackCount = 0;
    document.dispatchEvent(new CustomEvent('qts:practice-header', { detail: {
      active: true,
      onBack: () => { state.practiceBackCallbackCount = (state.practiceBackCallbackCount ?? 0) + 1; },
    } }));
  });
  await page.locator('.qts-nav').getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page).toHaveURL(/\/tu-tap$/u);
  expect(await page.evaluate(() =>
    (window as Window & { practiceBackCallbackCount?: number }).practiceBackCallbackCount,
  )).toBe(1);
});

test('practice header Back preserves existing browser history navigation', async ({ page }) => {
  await page.goto('/tu-tap/an-chay', { waitUntil: 'domcontentloaded' });
  await settleClient(page);
  await page.evaluate(() => {
    (window as Window & { practiceBackDocumentMarker?: boolean }).practiceBackDocumentMarker = true;
    window.history.pushState(window.history.state, '', '/tu-tap/an-chay?headerHistory=1');
  });
  await page.locator('.qts-nav').getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page).toHaveURL(/\/tu-tap\/an-chay$/u);
  expect(await page.evaluate(() =>
    (window as Window & { practiceBackDocumentMarker?: boolean }).practiceBackDocumentMarker,
  )).toBe(true);
});
