import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

test.beforeEach(async ({ page }) => {
  await loginAsMember(page);
  await page.goto('/kinh-sach');
  await settleClient(page);
  expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: true, user: { displayName: 'Thành viên E2E' } });
});

test('PDF download dialogs keep readable text with the dark app paper', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_dark_mode', '1');
    localStorage.setItem('tutam_locale', 'vi');
  });
  await page.goto('/?article=e2e-pdf');
  const dialog = page.locator('.pdf-offline-modal-card');
  await expect(dialog).toBeVisible();
  const contrast = () => dialog.evaluate(element => {
    const rgba = (color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const luminance = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, value, index) => {
      const normalized = value / 255;
      return sum + (normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const background = rgba(getComputedStyle(element).backgroundColor);
    // Conservative backing for the dark overlay below a translucent dialog.
    const backgroundLight = luminance(background.map((value, index) => index < 3 ? value * background[3] / 255 : value));
    return Array.from(element.querySelectorAll('h3, p, .pdf-dl-bytes-info')).map(node => {
      const textLight = luminance(rgba(getComputedStyle(node).color));
      return (Math.max(textLight, backgroundLight) + 0.05) / (Math.min(textLight, backgroundLight) + 0.05);
    });
  });
  expect(Math.min(...await contrast())).toBeGreaterThanOrEqual(4.5);
  await dialog.screenshot({ path: testInfo.outputPath('pdf-download-dark-warm-confirm.png') });
  let finishDownload!: () => void;
  const downloadGate = new Promise<void>(resolve => { finishDownload = resolve; });
  await page.route('**/assets/pdfs/bai-viet-mau-gieo-nhan-lanh.pdf*', async route => {
    await downloadGate;
    await route.abort('failed').catch(() => {});
  });
  await dialog.getByRole('button', { name: 'Tải về máy', exact: true }).click();
  await expect(page.locator('#pdf-dl-progress-title')).toBeVisible();
  expect(Math.min(...await contrast())).toBeGreaterThanOrEqual(4.5);
  await dialog.getByRole('button', { name: 'Hủy tải', exact: true }).click();
  finishDownload();
  await expect(dialog).toHaveCount(0);
});

test('mobile PDF tools require explicit navigation and expose clickable saved pages', async ({ page }, testInfo) => {
  // These controls start from page one independently of other tests using the
  // shared member. Resume behavior has its own saved-progress regression.
  await page.route('**/api/reading/progress/pdf/e2e-pdf', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { progress: null } });
    else await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?article=e2e-pdf');
  await settleClient(page);
  await page.getByRole('button',{name:'Đọc online',exact:true}).click();
  const reader = page.getByRole('dialog', { name: 'Bài PDF kiểm thử E2E' });
  const toggle = reader.getByRole('button', { name: 'Công cụ', exact: true });
  const tools = reader.getByRole('region', { name: 'Công cụ đọc', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(reader.locator('.pdf-controls')).toBeHidden();
  await toggle.click();
  await expect(tools).toBeVisible();
  await expect(reader.getByRole('slider')).toHaveCount(0);
  const input = reader.getByRole('spinbutton', { name: 'Số trang PDF' });
  await expect(input).toBeEnabled();
  await input.fill('99');
  await input.press('Enter');
  await expect(reader.locator('.pdf-page-status > span')).toHaveText('Trang 1 / 3');
  await input.fill('3');
  await expect(reader.locator('.pdf-page-status > span')).toHaveText('Trang 1 / 3');
  await input.press('Enter');
  await expect(reader.locator('.pdf-page-status > span')).toHaveText('Trang 3 / 3');
  await reader.getByRole('button', { name: 'Đánh dấu trang', exact: true }).click();
  const listButton = reader.getByRole('button', { name: 'Trang đã đánh dấu', exact: true });
  await listButton.click();
  const bookmarks = reader.getByRole('region', { name: 'Danh sách trang đã đánh dấu' });
  await expect(bookmarks).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-pdf-bookmarks.png') });
  await bookmarks.getByRole('button', { name: /^Trang 3(?: Đang đọc)?$/ }).click();
  await expect(bookmarks).toHaveCount(0);
  await listButton.click();
  await page.keyboard.press('Escape');
  await expect(bookmarks).toHaveCount(0);
  await expect(listButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tools).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(reader).toBeVisible();
  await page.reload();
  await settleClient(page);
  await page.getByRole('button',{name:'Đọc online',exact:true}).click();
  await toggle.click();
  await listButton.click();
  await expect(bookmarks.getByRole('button', { name: /^Trang 3(?: Đang đọc)?$/ })).toBeVisible();
  await bookmarks.getByRole('button', { name: 'Xóa đánh dấu trang 3' }).click();
  await expect(bookmarks).toContainText('Chưa có trang đánh dấu');
  await bookmarks.getByRole('button', { name: 'Đóng danh sách đánh dấu' }).click();
  await reader.getByTitle('Ảnh thu nhỏ các trang').click();
  await expect(tools).toBeHidden();
  await reader.getByRole('button', { name: 'Đóng bảng điều hướng' }).click();
  await toggle.click();
  await reader.getByTitle('Tô sáng và ghi chú văn bản PDF').click();
  await expect(tools).toBeHidden();
  await reader.getByRole('button', { name: 'Đóng bảng trích dẫn' }).click();
  await toggle.click();
  await reader.locator('.pdf-offline-main-btn').click();
  await expect(reader.locator('.pdf-offline-modal-backdrop')).toBeVisible();
  await reader.getByRole('button', { name: 'Đọc online', exact:true }).click();
  await page.screenshot({ path: testInfo.outputPath('mobile-pdf-tools.png') });
  await reader.getByRole('button', { name: 'Đóng công cụ' }).click();
  await expect(tools).toBeHidden();
});

test('mobile ebook tools have visible labels and close without closing the book', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  const reader = page.getByRole('dialog', { name: 'Sách nhiều tập E2E' });
  const toggle = reader.getByRole('button', { name: 'Công cụ', exact: true });
  const tools = reader.getByRole('region', { name: 'Công cụ đọc', exact: true });
  await expect(tools).toBeHidden();
  await toggle.click();
  await page.screenshot({ path: testInfo.outputPath('mobile-ebook-tools.png') });
  for (const label of ['Đánh dấu', 'Nghe', 'Chia sẻ', 'Cuộn']) {
    await expect(tools.locator('.action-label').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
  }
  await tools.getByRole('button', { name: 'Chữ lớn hơn' }).click();
  await expect(reader.locator('.font-size')).toHaveText('16px');
  await reader.getByRole('button', { name: 'Đóng công cụ' }).click();
  await expect(tools).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(reader).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(toggle).toBeHidden();
  await expect(reader.locator('.reader-toolbar').getByRole('button', { name: 'Chữ lớn hơn' })).toBeVisible();
});

test('desktop PDF bookmark list is outside the scroll clipping boundary', async ({ page }) => {
  await page.route('**/api/reading/progress/pdf/e2e-pdf', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { progress: null } });
    else await route.continue();
  });
  await page.goto('/?article=e2e-pdf');
  await settleClient(page);
  await page.getByRole('button',{name:'Đọc online',exact:true}).click();
  const reader = page.getByRole('dialog', { name: 'Bài PDF kiểm thử E2E' });
  await expect(reader.locator('.pdf-page-status > span')).toHaveText('Trang 1 / 3');
  await reader.getByRole('button', { name: 'Đánh dấu trang', exact: true }).click();
  await reader.getByRole('button', { name: 'Trang đã đánh dấu', exact: true }).click();
  const bookmarks = reader.getByRole('region', { name: 'Danh sách trang đã đánh dấu' });
  await bookmarks.getByRole('button', { name: /^Trang 1(?: Đang đọc)?$/ }).click();
  await expect(bookmarks).toHaveCount(0);
});
