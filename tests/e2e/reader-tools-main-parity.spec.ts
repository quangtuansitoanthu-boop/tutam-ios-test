import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const dark of [false, true]) {
  test(`reader shows an existing source chapter title only once dark=${dark}`, async ({ page }) => {
    await page.addInitScript(dark => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
    }, dark);
    const article = { id: 'reader-heading-test', tieu_de: 'Sách kiểm tra tiêu đề', has_muc_luc: 1, so_tap: 1, danh_muc: 'SÁCH', visibility: 'public' };
    const chapter = { id: 'heading-chapter', so_thu_tu: 0, tieu_de: 'HOẦNG TÉ', noi_dung: '<p style="text-align:center"><strong>HOẦNG TÉ</strong></p><p>Hoằng Tế Đại sư, họ Dao.</p>' };
    await page.route('**/api/**', route => route.abort());
    await page.route(/\/api\/(?:data\/baiviet|articles)(?:[/?]|$)/, route => route.fulfill({ json: [article] }));
    await page.route('**/api/articles/reader-heading-test/chapters?**', route => route.fulfill({ json: [chapter] }));
    await page.goto('/?article=reader-heading-test&chap=1');
    await settleClient(page);
    const reader = page.getByRole('dialog', { name: 'HOẦNG TÉ', exact: true });
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(reader).toBeVisible();
      await expect(reader.locator('.reader-chapter-banner')).toHaveCount(0);
      await expect(reader.locator('.reader-content p').first()).toHaveText('HOẦNG TÉ');
      await expect(reader.locator('.reader-content')).toContainText('Hoằng Tế Đại sư, họ Dao.');
      expect((await reader.locator('.reader-content').innerText()).match(/HOẦNG TÉ/gu)).toHaveLength(1);
    }
  });
  test(`reader tools keep font controls and close back to the book dark=${dark}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(value => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', value ? '1' : '0');
    }, dark);
    const article = { id: 'reader-ui-test', tieu_de: 'Sách kiểm tra công cụ', noi_dung: '', danh_muc: 'SÁCH KHUYẾN THIỆN', tags: [], tac_gia: 'Quang Từ', has_muc_luc: 1, so_tap: 22, visibility: 'public' };
    const chapters = Array.from({ length: 22 }, (_, index) => ({
      id: `reader-ui-chapter-${index + 1}`, so_thu_tu: index,
      tieu_de: `Chương ${index + 1}`, tom_tat: '',
      noi_dung: `<p>${`Nội dung chương ${index + 1}. `.repeat(100)}</p>`,
    }));
    await page.route(/\/api\/(?:data\/baiviet|articles)(?:[/?]|$)/, route => route.fulfill({ json: [article] }));
    await page.route('**/api/articles/reader-ui-test/chapters?**', route => {
      const order = new URL(route.request().url()).searchParams.get('so_thu_tu');
      return route.fulfill({ json: order === null ? chapters : chapters.filter(chapter => `eq.${chapter.so_thu_tu}` === order) });
    });
    await page.goto('/?article=reader-ui-test&chap=2');
    await settleClient(page);
    const reader = page.getByRole('dialog', { name: 'Chương 2', exact: true });
    await expect(reader).toBeVisible();
    await expect(reader.locator('.reader-top-toc-btn')).toHaveCount(0);
    await expect(reader.locator('.reader-chapter-banner-title')).toHaveText('Chương 2');
    await expect(reader.locator('.reader-chapter-banner-book, .reader-chapter-banner-badge')).toHaveCount(0);
    await expect(reader.locator('.reader-content')).toContainText('Nội dung chương 2.');
    expect(await reader.locator('.reader-top-actions').evaluate(element => element.scrollLeft)).toBe(0);
    const initialActions = (await reader.locator('.reader-top-actions').boundingBox())!;
    const initialDecrease = (await reader.locator('.reader-top-font-btn.minus').boundingBox())!;
    expect(initialDecrease.x, 'A− must be visible at the start of the toolbar before any scroll').toBeGreaterThanOrEqual(initialActions.x);
    expect(initialDecrease.x + initialDecrease.width).toBeLessThanOrEqual(initialActions.x + initialActions.width);
    const initialFontGroup = (await reader.locator('.reader-top-font-group').boundingBox())!;
    expect(initialFontGroup.x, 'The font group must start inside the toolbar with the 2/22 chapter badge').toBeGreaterThanOrEqual(initialActions.x);
    expect(initialFontGroup.x + initialFontGroup.width).toBeLessThanOrEqual(initialActions.x + initialActions.width);
    for (const viewport of [{ width: 320, height: 812 }, { width: 375, height: 812 }, { width: 430, height: 900 }, { width: 600, height: 812 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport);
      const back = reader.locator('.reader-back');
      await expect(back).toBeVisible();
      const box = await back.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      if (viewport.width <= 600) {
        const bar = (await reader.locator('.reader-top-bar').boundingBox())!;
        expect(await reader.locator('.reader-top-actions').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        for (const control of ['.reader-top-font-btn', '.reader-top-font-select', '.reader-top-speak-btn', '.reader-top-scroll-btn', '.reader-top-bookmark-btn']) {
          const items = reader.locator(control);
          for (const item of await items.all()) {
            const hit = await item.boundingBox();
            expect(hit?.width).toBeGreaterThanOrEqual(44);
            expect(hit?.height).toBeGreaterThanOrEqual(44);
            expect(hit!.x).toBeGreaterThanOrEqual(0);
            expect(hit!.x + hit!.width).toBeLessThanOrEqual(viewport.width);
            expect(hit!.y).toBeGreaterThanOrEqual(bar.y);
            expect(hit!.y + hit!.height).toBeLessThanOrEqual(bar.y + bar.height);
            const backBox = (await back.boundingBox())!;
            if (viewport.width > 400) expect(Math.abs(hit!.y + hit!.height / 2 - backBox.y - backBox.height / 2)).toBeLessThanOrEqual(2);
          }
        }
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const scroll = reader.locator('.reader-top-scroll-btn');
    await scroll.click();
    await expect(scroll).toHaveAttribute('aria-pressed', 'true');
    await scroll.click();
    await expect(scroll).toHaveAttribute('aria-pressed', 'false');
    const toggle = reader.getByRole('button', { name: 'Công cụ', exact: true });
    await toggle.click();
    const tools = reader.getByRole('region', { name: 'Công cụ đọc', exact: true });
    await expect(tools).toBeVisible();
    await expect(tools.locator('.toolbar-group').first()).toContainText('Cỡ chữ');
    await expect(tools.getByRole('combobox', { name: 'Cuộn tự động', exact: true })).toBeVisible();
    for (const name of ['Đánh dấu', 'Nghe', 'Chia sẻ', 'Cuộn']) await expect(tools.locator('.action-label').filter({ hasText: new RegExp(`^${name}$`) })).toBeVisible();
    const before = parseInt(await tools.locator('.font-size').innerText(), 10);
    await tools.getByRole('button', { name: 'Chữ lớn hơn', exact: true }).click();
    expect(parseInt(await tools.locator('.font-size').innerText(), 10)).toBeGreaterThan(before);
    await page.screenshot({ path: info.outputPath('reader-tools.png'), animations: 'disabled' });
    await reader.getByRole('button', { name: 'Đóng công cụ', exact: true }).click();
    await expect(tools).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(reader).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(toggle).toBeHidden();
    await expect(reader.getByRole('button', { name: 'Chữ lớn hơn', exact: true })).toBeVisible();
  });
}
