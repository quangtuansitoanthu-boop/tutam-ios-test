import { expect, test, type Locator } from '@playwright/test';
import { choosePdfOnline, settleClient } from './runtime-helpers';

async function expectUserSelect(locator: Locator, expected: 'none' | 'text'): Promise<void> {
  await expect.poll(() => locator.evaluate(element => {
    const style = getComputedStyle(element);
    return style.getPropertyValue('user-select') || style.getPropertyValue('-webkit-user-select');
  })).toBe(expected);
}

for (const width of [375, 1440]) {
  test(`chrome cannot select text while search remains editable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/kinh-sach');
    await settleClient(page);

    const heading = page.locator('.library-title');
    await expectUserSelect(heading, 'none');
    await heading.dblclick();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    const navLabel = page.locator('.qts-bottom-nav__item span').last();
    if (width === 375) await expectUserSelect(navLabel, 'none');

    const search = page.locator('.search-input');
    await expectUserSelect(search, 'text');
    await search.fill('Nội dung tìm kiếm');
    await search.press('ControlOrMeta+A');
    expect(await search.evaluate((element: HTMLInputElement) =>
      element.selectionEnd! - element.selectionStart!,
    )).toBe('Nội dung tìm kiếm'.length);
    await search.press('Backspace');
    await expect(search).toHaveValue('');
  });
}

test('book prose and its descendants retain real text selection', async ({ page }) => {
  await page.goto('/?article=e2e-public');
  await settleClient(page);
  const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true });
  await expect(reader).toBeVisible();
  const prose = reader.locator('.reader-content p').first();
  await expect(prose).toBeVisible();
  await expectUserSelect(prose, 'text');
  await prose.dblclick();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim() ?? '')).not.toBe('');
  await expectUserSelect(reader.locator('.reader-back'), 'none');
});

test('PDF text remains selectable while its toolbar is not', async ({ page }) => {
  await page.goto('/?article=e2e-pdf');
  await settleClient(page);
  await choosePdfOnline(page);
  const text = page.locator('.pdf-text-layer span').first();
  await expect(text).toBeAttached();
  await expectUserSelect(text, 'text');
  await expectUserSelect(page.locator('.reader-back'), 'none');
});

test('failed clipboard action keeps the guide address available to select manually', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => { throw new Error('clipboard_denied'); } },
  }));
  await page.goto('/huong-dan#bo-thi-may-nghe-phap');
  await settleClient(page);
  const section = page.locator('#bo-thi-may-nghe-phap');
  await expect(section).toHaveAttribute('open', '');
  const card = section.locator('.guide-link-card').filter({ hasText: 'Google Drive' });
  await card.getByRole('button', { name: 'Sao chép link', exact: true }).click();
  const address = card.locator('.guide-link-address');
  await expect(address).toBeVisible();
  await expectUserSelect(address, 'text');
  await address.dblclick();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim() ?? '')).not.toBe('');
});
