import { expect, test, type Page } from '@playwright/test';
import book from '../../src/lib/data/scripture-copying/dia-tang.json' with { type: 'json' };
import legacy from '../../src/lib/data/scripture-copying/dia-tang-legacy.json' with { type: 'json' };
import { beginScriptureCopying, deferStartupNotification, loginAsMember } from './runtime-helpers';

test.beforeEach(async ({ page }) => { await deferStartupNotification(page); });
const editor = (page: Page) => page.locator('#copy-text');
const save = (page: Page) => page.locator('.top-save-button');
const leaveDialog = (page: Page) => page.getByRole('dialog', { name: 'Lưu bản chép trước khi rời?', exact: true });
const snapshot = (text: string, chapter = 1) => ({
  sutraId: book.id, chapter, runId: '11111111-1111-4111-8111-111111111111', sourceVersion: book.version,
  texts: book.chapters[chapter - 1].blocks.map((_, index) => index === 0 ? text : ''),
  revision: 1, savedAt: '2026-11-27T05:00:00.000Z', completedBlocks: 0, complete: false,
});
async function mockLatest(page: Page, read: () => ReturnType<typeof snapshot> | null) {
  await page.route('**/api/practice/copying?latest=1', route => route.fulfill({ json: { copy: read() } }));
}
async function localAccountText(page: Page, version = book.version): Promise<string> {
  return page.evaluate(({ version, id }) => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('drafts');
      const read = tx.objectStore('drafts').get(`tt_copy_v1:${encodeURIComponent('account:e2e-member')}:${id}:${version}:1`);
      tx.oncomplete = () => { resolve(read.result?.texts[0] ?? ''); db.close(); };
      tx.onerror = () => { reject(tx.error); db.close(); };
    };
  }), { version, id: book.id });
}
async function expectRecovered(page: Page, fullText: string) {
  await expect.poll(() => localAccountText(page)).toBe(fullText);
  if (page.viewportSize()!.width > 700) await expect(editor(page)).toHaveText(fullText);
  else {
    // Mobile hiển thị một trang của draft; không dùng soft-wrap innerText làm nội dung bền vững.
    await expect.poll(() => editor(page).textContent()).not.toBe('');
    expect(fullText).toContain((await editor(page).textContent())!);
  }
}
async function leaveLocally(page: Page) {
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: 'Rời không lưu', exact: true }).click();
  await expect(page.getByTestId('start-copying')).toBeVisible();
}

test('explicit Save acknowledges before success and another device opens the same account chapter', async ({ page, browser, baseURL }, testInfo) => {
  await loginAsMember(page);
  await mockLatest(page, () => null);
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method()); });
  await page.goto('/tu-tap/chep-kinh');
  await expect(page.locator('#copy-chapter')).toBeEnabled();
  await page.locator('#copy-chapter').selectOption('2');
  await beginScriptureCopying(page);
  const typed = 'Nam mô Địa Tạng Bồ Tát · bản đã lưu';
  await editor(page).pressSequentially(typed);
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(requests).toEqual(['GET']);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/practice/copying', async route => {
    if (route.request().method() === 'PUT') await gate;
    await route.continue();
  });
  await save(page).click();
  await expect(save(page)).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Đã lưu thành công trên máy chủ.', { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText('Đã lưu thành công trên máy chủ.', { exact: true })).toBeVisible();
  expect(requests).toEqual(['GET', 'PUT']);
  await save(page).click();
  expect(requests).toEqual(['GET', 'PUT']);
  await editor(page).press('End'); await editor(page).pressSequentially(' chưa gửi');
  await expect(page.getByText('Đã lưu thành công trên máy chủ.', { exact: true })).toHaveCount(0);
  expect(requests).toEqual(['GET', 'PUT']);
  const box = await save(page).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(await save(page).evaluate(node => !!node.closest('.writing-bar'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('copying-top-save.png') });

  const other = await browser.newContext({ baseURL, viewport: page.viewportSize()!, serviceWorkers: 'block' });
  try {
    const second = await other.newPage(); await deferStartupNotification(second); await loginAsMember(second);
    const reads: string[] = [];
    second.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') reads.push(request.method()); });
    await second.goto('/tu-tap/chep-kinh');
    await expect(second.locator('#copy-chapter')).toHaveValue('2');
    await beginScriptureCopying(second);
    await expect(editor(second)).toHaveText(typed);
    expect(reads).toEqual(['GET']);
    await second.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
    await expect(leaveDialog(second)).toHaveCount(0);
    await beginScriptureCopying(second);
    expect(reads).toEqual(['GET']);
  } finally { await other.close(); }
});

test('local draft stays local through Stay, Leave without saving, and reentry', async ({ page }) => {
  await loginAsMember(page); await mockLatest(page, () => null);
  const puts: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/practice/copying') puts.push(request.url()); });
  await page.goto('/tu-tap/chep-kinh'); await beginScriptureCopying(page);
  await editor(page).pressSequentially('Nháp chỉ ở trên máy');
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Ở lại', exact: true }).click();
  await expect(editor(page)).toHaveText('Nháp chỉ ở trên máy');
  await leaveLocally(page);
  await beginScriptureCopying(page);
  await expect(editor(page)).toHaveText('Nháp chỉ ở trên máy');
  expect(puts).toEqual([]);
});

test('Save and leave waits for the server and failure keeps the editor and draft', async ({ page }) => {
  await loginAsMember(page); await mockLatest(page, () => null);
  let fail = true, puts = 0;
  await page.route('**/api/practice/copying', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    puts++;
    await route.fulfill(fail ? { status: 503, json: { error: { message: 'server unavailable' } } }
      : { json: { revision: 1, savedAt: '2026-11-27T06:00:00.000Z' } });
  });
  await page.goto('/tu-tap/chep-kinh'); await beginScriptureCopying(page);
  await editor(page).pressSequentially('Bản chỉ gửi khi bấm Lưu');
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: 'Lưu và rời', exact: true }).click();
  await expect(page.locator('.message')).toContainText('Chưa có mạng');
  await expect(editor(page)).toHaveText('Bản chỉ gửi khi bấm Lưu');
  expect(puts).toBe(0);
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: 'Lưu và rời', exact: true }).click();
  await expect(page.locator('.message')).toContainText('Chưa xác nhận lưu');
  await expect(editor(page)).toHaveText('Bản chỉ gửi khi bấm Lưu');
  expect(puts).toBe(1);
  fail = false;
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: 'Lưu và rời', exact: true }).click();
  await expect(page.getByTestId('start-copying')).toBeVisible();
  expect(puts).toBe(2);
});

test('opening a newer server copy preserves and recovers an unsent draft without PUT', async ({ page }) => {
  await loginAsMember(page);
  let cloud = snapshot('Bản lưu máy chủ cũ');
  await mockLatest(page, () => cloud);
  const puts: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/practice/copying') puts.push(request.url()); });
  await page.goto('/tu-tap/chep-kinh'); await beginScriptureCopying(page);
  await expect(editor(page)).toHaveText('Bản lưu máy chủ cũ');
  await editor(page).press('End'); await editor(page).pressSequentially(' và nháp chưa gửi');
  const unsent = 'Bản lưu máy chủ cũ và nháp chưa gửi';
  await expect.poll(() => localAccountText(page)).toBe(unsent);
  cloud = { ...snapshot('Bản lưu mới từ thiết bị khác'), revision: 2, savedAt: '2026-11-27T06:00:00.000Z' };
  page.on('dialog', dialog => dialog.accept());
  await page.reload(); await beginScriptureCopying(page);
  const conflict = page.getByRole('dialog', { name: 'Có phần chép mới chưa lưu lên máy chủ', exact: true });
  await expect(conflict).toBeVisible();
  await conflict.getByRole('button', { name: 'Mở bản đã lưu', exact: true }).click();
  await expect(editor(page)).toHaveText(cloud.texts[0]);
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Mở nháp chưa gửi', exact: true }).click();
  await expectRecovered(page, unsent);
  expect(puts).toEqual([]);
});

test('navigation to another section asks before leaving and never writes when declined', async ({ page }) => {
  await page.goto('/tu-tap/chep-kinh'); await beginScriptureCopying(page);
  const puts: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/practice/copying') puts.push(request.url()); });
  await editor(page).pressSequentially('Nháp khách còn nguyên');
  await page.evaluate(() => {
    const link = document.createElement('a'); link.href = '/tu-tap'; link.textContent = 'Đi tới Tu tập'; link.id = 'copy-navigation-fixture';
    document.querySelector('.copy-page')!.prepend(link);
  });
  await page.locator('#copy-navigation-fixture').click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Ở lại', exact: true }).click();
  await expect(page).toHaveURL(/\/tu-tap\/chep-kinh$/);
  await page.locator('#copy-navigation-fixture').click();
  await leaveDialog(page).getByRole('button', { name: 'Rời không lưu', exact: true }).click();
  await expect(page).toHaveURL(/\/tu-tap$/);
  expect(puts).toEqual([]);
});

test('switching to a saved older edition keeps the current-edition unsent draft reachable', async ({ page }) => {
  await loginAsMember(page);
  let cloud = snapshot('Bản hiện tại trên máy chủ');
  await mockLatest(page, () => cloud);
  const puts: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/practice/copying') puts.push(request.url()); });
  await page.goto('/tu-tap/chep-kinh'); await beginScriptureCopying(page);
  await editor(page).press('End'); await editor(page).pressSequentially(' và nháp mới');
  const unsent = 'Bản hiện tại trên máy chủ và nháp mới';
  await expect.poll(() => localAccountText(page)).toBe(unsent);
  cloud = { ...snapshot('Bản lưu theo kinh cũ'), sourceVersion: legacy.version,
    texts: legacy.chapters[0].blocks.map((_, index) => index === 0 ? 'Bản lưu theo kinh cũ' : '') };
  page.on('dialog', dialog => dialog.accept());
  await page.reload(); await beginScriptureCopying(page);
  const conflict = page.getByRole('dialog', { name: 'Có phần chép mới chưa lưu lên máy chủ', exact: true });
  await expect(conflict).toBeVisible();
  await conflict.getByRole('button', { name: 'Mở bản đã lưu', exact: true }).click();
  await expect(editor(page)).toHaveText('Bản lưu theo kinh cũ');
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Mở nháp chưa gửi', exact: true }).click();
  await expectRecovered(page, unsent);
  expect(puts).toEqual([]);
});
