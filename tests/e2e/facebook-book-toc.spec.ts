import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

const bookId = 'tuyen-tap-phap-facebook-quang-tu';
const newTitle = 'CÔNG ĐỨC THÙ THẮNG CỦA VIỆC NIỆM 7 VỊ PHẬT KHI CÚNG CÔ HỒN TẠI GIA';
const entries = [
  { title: 'Bài viết mở đầu', video: false },
  { title: 'Bài viết tiếp theo', video: false },
  { title: 'Bài giảng bằng hình ảnh', video: true },
  { title: 'Bài viết về thiện tâm', video: false },
  { title: 'Bài viết về nhân quả', video: false },
  { title: 'Bài giảng cuối tuyển tập', video: true },
  ...Array.from({ length: 15 }, () => ({ title: 'Bài giảng bổ sung', video: true })),
  ...Array.from({ length: 493 }, () => ({ title: 'Bài viết trong tuyển tập', video: false })),
  { title: newTitle, video: false },
];
const chapters = entries.map(({ title, video }, index) => ({
  id: title === newTitle ? 14532 : 18000 + index,
  bai_viet_id: bookId,
  so_thu_tu: index,
  tieu_de: title,
  tom_tat: video ? '[Có Video] Tóm tắt bài giảng' : '',
  noi_dung: `<p>Nội dung riêng của ${title}.</p>`,
}));
const expectedNumbers = chapters.map((_, index) => String(index + 1));
const book = {
  id: bookId, tieu_de: 'Tuyển tập Facebook kiểm thử', danh_muc: 'SÁCH KHUYẾN THIỆN',
  has_muc_luc: 1, so_tap: chapters.length, trang_thai: 'Hoàn thành',
};

for (const { width, dark } of [{ width: 1440, dark: false }, { width: 375, dark: true }]) {
  test(`Facebook anthology TOC numbers match the video-first list at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((night) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', night ? '1' : '0');
      localStorage.setItem('tutam_media_prompt_seen_tuyen-tap-phap-facebook-quang-tu', '1');
      if ('Notification' in window) {
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
      }
    }, dark);
    await loginAsMember(page);
    await page.route((url) => ['/api/data/baiviet', '/api/articles', '/offline-bundled-articles.json'].includes(url.pathname),
      (route) => route.fulfill({ json: [book] }));
    // Bộ đọc ưu tiên bản offline, nên cùng fixture cho asset cục bộ và API fallback.
    await page.route((url) =>
      url.pathname === `/api/articles/${bookId}/chapters` ||
      url.pathname === `/offline-data/chapters/${bookId}.json`,
    (route) => {
      const order = new URL(route.request().url()).searchParams.get('so_thu_tu');
      return route.fulfill({ json: order ? chapters.filter((chapter) => `eq.${chapter.so_thu_tu}` === order) : chapters });
    });

    await page.goto(`/kinh-sach?article=${bookId}`);
    await settleClient(page);
    const reader = page.locator('.reader-modal');
    await expect(reader).toBeVisible({ timeout: 15_000 });
    const items = reader.locator('.toc-item');
    const numbers = reader.locator('.toc-number');
    const search = reader.getByRole('searchbox', { name: 'Tìm kiếm trong mục lục' });
    await expect(items.first()).toContainText(entries[2].title);
    await expect(items.nth(1)).toContainText(entries[5].title);
    await expect(items.nth(17)).toContainText(entries[0].title);
    await expect(items.nth(18)).toContainText(entries[1].title);
    await expect(items.nth(19)).toContainText(newTitle);
    await expect(items.nth(20)).toContainText(entries[3].title);
    await expect(numbers).toHaveText(expectedNumbers);
    await search.fill('20');
    await expect(numbers).toHaveText(['20']);
    await expect(items).toContainText(newTitle);
    await items.click();
    await expect(page).toHaveURL(/[?&]chap=515(?:&|$)/u);
    await expect(reader.locator('.reader-content')).toContainText(newTitle);
    await reader.locator('.reader-back').click();
    await search.fill('video');
    await expect(search).toHaveValue('video');
    await expect(numbers).toHaveText(expectedNumbers.slice(0, 17));
    await search.fill('nhân quả');
    await expect(numbers).toHaveText(['22']);
    await search.fill('2');
    await expect(numbers).toHaveText(['2']);
    await expect(items).toContainText(entries[5].title);
    await items.click();
    await expect(page).toHaveURL(/[?&]chap=6(?:&|$)/u);
    await expect(reader.locator('.reader-content')).toContainText(entries[5].title);
    await reader.locator('.reader-back').click();
    await search.fill('');
    await expect(numbers).toHaveText(expectedNumbers);
    await expect(reader.locator('.toc-item.is-active .toc-number')).toHaveText('2');

    await page.goto(`/kinh-sach?article=${bookId}&chap=3`);
    await settleClient(page);
    await expect(reader.locator('.reader-content')).toContainText(entries[2].title);
  });
}
