import { expect, test, type Page } from '@playwright/test';
import { loginAsMember, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function followReaderLink(page: Page, href: string) {
  await page.evaluate(href => {
    const link = document.createElement('a');
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, href);
}

test('a warm homepage link replaces the current book and opens the requested chapter without reloading', async ({ page }) => {
  await loginAsMember(page);
  await useNativeApiWithLocalBackend(page);
  await page.goto('/?article=e2e-public');
  await settleClient(page);
  await expect(page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.set(window, '__warmReaderDocument', document));
  await followReaderLink(page, '/?article=e2e-ebook&chap=2');
  const reader = page.getByRole('dialog', { name: 'Phẩm Hai', exact: true });
  await expect(reader).toBeVisible();
  await expect(reader.locator('.reader-chapter-banner-title')).toHaveText('Phẩm Hai');
  await expect(reader.locator('.reader-top-toc-btn')).toHaveCount(0);
  await expect(reader.locator('.reader-content')).toContainText('Nội dung phẩm hai.');
  await expect(page.locator('.reader-modal')).toHaveCount(1);
  expect(await page.evaluate(() => Reflect.get(window, '__warmReaderDocument') === document)).toBe(true);
  await followReaderLink(page, '/?article=e2e-public');
  await expect(page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true })).toBeVisible();
  await expect(page.locator('.reader-content')).toContainText('Nội dung công khai giữ nguyên');
});

test('a delayed warm article lookup cannot replace a newer cached book', async ({ page }) => {
  await loginAsMember(page);
  await useNativeApiWithLocalBackend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let started!: () => void;
  const pending = new Promise<void>(resolve => started = resolve);
  await page.route(url => url.pathname === '/api/data/baiviet' && url.searchParams.get('id') === 'eq.warm-stale-book', async route => {
    started();
    await gate;
    await route.fulfill({ headers: { 'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true' }, json: [{ id: 'warm-stale-book', tieu_de: 'Kết quả cũ đến muộn', noi_dung: '<p>Không được thay sách mới.</p>', danh_muc: 'SÁCH KHUYẾN THIỆN' }] });
  });
  try {
    await page.goto('/?article=e2e-public');
    await settleClient(page);
    await expect(page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true })).toBeVisible();
    await followReaderLink(page, '/?article=warm-stale-book');
    await pending;
    await followReaderLink(page, '/?article=e2e-public');
    await expect(page).toHaveURL(/article=e2e-public/);
    const received = page.waitForResponse(response => new URL(response.url()).searchParams.get('id') === 'eq.warm-stale-book');
    release();
    await received;
    await settleClient(page);
    await expect(page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/article=e2e-public/);
    await expect(page.getByRole('dialog', { name: 'Kết quả cũ đến muộn', exact: true })).toHaveCount(0);
  } finally { release(); }
});

for (const entry of ['/', '/kinh-sach']) {
  for (const closeBeforeRefresh of [false, true]) {
    test(`${entry} initial article ${closeBeforeRefresh ? 'stays closed after dismissal' : 'survives a delayed expiry refresh'}`, async ({ page }) => {
      await loginAsMember(page);
      const fetchLocal = await useNativeApiWithLocalBackend(page);
      let sessions = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => release = resolve);
      let observeExpiry!: () => void;
      const expiryPending = new Promise<void>(resolve => observeExpiry = resolve);
      await page.route('**/api/session', async route => {
        sessions++;
        const response = await fetchLocal(route);
        if (sessions === 1) {
          const session = await response.response.json();
          expect(session).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
          await route.fulfill({ ...response, json: { ...session, expiresAt: new Date(Date.now() + 3000).toISOString() } });
          return;
        }
        observeExpiry();
        await gate;
        await route.fulfill(response);
      });
      try {
        await page.goto(`${entry}?article=e2e-public`);
        await settleClient(page);
        const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true });
        await expect(reader).toBeVisible();
        await expiryPending;
        if (closeBeforeRefresh) {
          await page.keyboard.press('Escape');
          await expect(reader).toHaveCount(0);
        }
        const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
        release();
        const response = await refreshed;
        expect(response.ok()).toBe(true);
        expect(await response.json()).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
        await settleClient(page);
        if (closeBeforeRefresh) {
          await expect(reader).toHaveCount(0);
          await expect(page).not.toHaveURL(/article=/);
        } else {
          await expect(reader).toBeVisible();
          await expect(page).toHaveURL(/article=e2e-public/);
          await expect(reader.locator('.reader-content')).not.toBeEmpty();
        }
        expect(sessions).toBe(2);
      } finally { release(); }
    });
  }
}
