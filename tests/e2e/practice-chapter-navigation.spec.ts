import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('practice TOC keeps source ordinals separate from saved chapter positions', async ({ page }, testInfo) => {
  const articleId = 'tt_1780910773084';
  const chapters = [-1, 0, 1, 2, 3].map((order, index) => ({
    so_thu_tu: order,
    tieu_de: index === 0 ? 'Lời tựa' : `Phẩm ${index}`,
    tom_tat: '',
    noi_dung: `<p>Nội dung riêng của mục ${index} với thứ tự nguồn ${order}.</p>`,
  }));
  const orders: number[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.route('**/api/**', route => route.abort('failed'));
  // Buộc nội dung đi qua API để quan sát đúng khóa nguồn, không để bundle che lỗi lookup.
  await page.route('**/offline-bundled-articles.json', route => route.fulfill({ json: [{
    id: articleId, tieu_de: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN', danh_muc: 'KINH PHẬT',
    has_muc_luc: 1, so_tap: 5, tap_tieu_de: '[]', noi_dung: '',
  }] }));
  await page.route('**/offline-data/chapters/*.json', route => route.fulfill({ json: [] }));
  await page.route(url => url.pathname === '/api/data/tap_noi_dung' && url.searchParams.get('bai_viet_id') === `eq.${articleId}`, async route => {
    const order = new URL(route.request().url()).searchParams.get('so_thu_tu');
    if (order === null) return route.fulfill({ json: chapters.map(({ noi_dung, ...preview }) => preview) });
    const ordinal = Number(order.replace(/^eq\./u, ''));
    orders.push(ordinal);
    return route.fulfill({ json: chapters.filter(chapter => chapter.so_thu_tu === ordinal) });
  });
  await page.goto(`/tu-tap?article=${articleId}`);
  await settleClient(page);
  await expect(page.locator('.tt-preview__toc-list > button')).toHaveCount(5);
  await page.locator('.tt-preview__toc-list > button').filter({ hasText: 'Phẩm 3' }).click();
  await expect(page.locator('.tt-reader-chapter-title')).toHaveText('Phẩm 3');
  await expect(page.locator('.reader-content')).toContainText('Nội dung riêng của mục 3 với thứ tự nguồn 2.');
  await expect(page).toHaveURL(/chap=3/);
  expect(orders[0]).toBe(2);
  // Prefetch mục kế tiếp dùng nguồn 3; không thử nhầm nguồn 4 rồi mới quay lại.
  await expect.poll(() => orders.includes(3)).toBe(true);
  expect(orders).not.toContain(4);
  await page.locator('.tt-reader-practice-btn').click();
  await page.locator('.practice-confirm__primary').click();
  const session = page.locator('.tt-practice');
  await expect(session.locator('.ttp-content')).toContainText('Nội dung riêng của mục 3 với thứ tự nguồn 2.');
  for (const index of [0, 2, 3, 4]) {
    await session.locator('.ttp-toc-trigger').click();
    const toc = page.locator('.ttp-toc-dialog');
    const title = index === 0 ? 'Lời tựa' : `Phẩm ${index}`;
    const item = toc.locator('nav button').filter({ hasText: title });
    await expect(item.locator(':scope > span')).toHaveCSS('font-weight', '700');
    const status = toc.locator('small');
    await expect(status).toHaveCount(1);
    expect(Number(await status.evaluate(element => getComputedStyle(element).fontWeight))).toBeLessThan(700);
    await item.click();
    await expect(toc).toHaveCount(0);
    try {
      await expect(session.locator('.ttp-art-title')).toHaveText(title);
    } catch (error) {
      await testInfo.attach(`chapter-${index}-failure-state`, {
        contentType: 'application/json',
        body: JSON.stringify({
          expected: { index, title, sourceOrder: index - 1 }, orders, pageErrors, failedRequests,
          actual: await page.evaluate(() => ({
            url: location.href,
            chapterTitle: document.querySelector('.ttp-art-title')?.textContent,
            content: document.querySelector('.ttp-content')?.textContent,
            navigation: document.querySelector('.ttp-chapter-nav')?.textContent,
            feedback: [...document.querySelectorAll('[role="alert"], [role="status"]')].map(element => element.textContent),
            progress: localStorage.getItem('quangtu_principal_v1:anonymous:quangtu_reading_progress_v1'),
          })),
        }, null, 2),
      });
      throw error;
    }
    await expect(session.locator('.ttp-content')).toContainText(`Nội dung riêng của mục ${index} với thứ tự nguồn ${index - 1}.`);
    await expect.poll(() => page.evaluate(articleId => {
      const records = JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:quangtu_reading_progress_v1') || '[]');
      return records.find((record: { contentId: string }) => record.contentId === articleId)?.position?.chapterId;
    }, articleId)).toBe(String(index));
  }
  expect(orders).toContain(-1);
  expect(orders).toContain(1);
  expect(orders).toContain(2);
  expect(orders).toContain(3);
  expect(orders.every(order => [-1, 0, 1, 2, 3].includes(order))).toBe(true);
});

for (const article of ['tt_1780910773084', 'tt_nghi_thuc_tri_chu_bao_khiep_an']) {
  test(`practice chapter has only the top navigation for ${article}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto(`/tu-tap?article=${article}`);
    await settleClient(page);
    await page.locator('.tt-preview__toc-list > button').first().click();
    const top = page.locator('.chapter-nav');
    await expect(page.locator('.reader-content')).not.toBeEmpty();
    await expect(top).toHaveCount(1);
    await expect(page.locator('.chapter-nav--bottom')).toHaveCount(0);
    await expect(top.getByRole('button', { name: 'Bài tiếp', exact: true })).toBeVisible();
    await expect.poll(() => top.evaluate(element => {
      const title = element.querySelector('.chapter-nav-title')!.getBoundingClientRect();
      return [...element.querySelectorAll('button')].every(button => {
        const box = button.getBoundingClientRect();
        return box.width >= 44 && box.height >= 44
          && Math.min(title.right, box.right) <= Math.max(title.left, box.left);
      });
    })).toBe(true);
    const initialTitle = await page.locator('.tt-reader-chapter-title').textContent();
    await top.getByRole('button', { name: 'Bài tiếp', exact: true }).click();
    await expect(page.locator('.tt-reader-chapter-title')).not.toHaveText(initialTitle!);
    await expect(page.locator('.reader-content')).not.toBeEmpty();
    await top.getByRole('button', { name: 'Bài trước', exact: true }).click();
    await expect(page.locator('.tt-reader-chapter-title')).toHaveText(initialTitle!);
    await page.locator('.reader-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator('.reader-body .chapter-nav')).toHaveCount(0);
    await expect(top).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('opening practice sutra, mantra, or ritual with saved progress stays on TOC and respects explicit chapter choice', async ({ page }) => {
  const progressKey = 'quangtu_principal_v1:anonymous:quangtu_reading_progress_v1';
  const savedRows = [
    {
      contentKind: 'practice',
      contentId: 'tt_1780910773084',
      revision: 1,
      epoch: 1,
      percent: 30,
      position: { chapterId: '4', scrollTop: 480 },
      clientUpdatedAt: '2026-11-25T10:00:00.000Z',
    },
    {
      contentKind: 'practice',
      contentId: 'tt_nghi_thuc_tri_chu_bao_khiep_an',
      revision: 1,
      epoch: 1,
      percent: 50,
      position: { chapterId: '1', scrollTop: 240 },
      clientUpdatedAt: '2026-11-25T10:00:00.000Z',
    },
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ key, rows }) => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem(key, JSON.stringify(rows));
  }, { key: progressKey, rows: savedRows });
  await page.route('**/api/**', route => route.abort('failed'));

  // 1. Entering Kinh Địa Tạng normally must land on TOC, never auto-jump to Phẩm 4.
  await page.goto('/tu-tap?article=tt_1780910773084');
  await settleClient(page);
  await expect(page.locator('.tt-preview__toc-list > button').first()).toBeVisible();
  await expect(page.locator('.tt-reader-chapter-title')).toHaveCount(0);
  await expect(page).not.toHaveURL(/chap=/);

  // 2. Selecting Phẩm 1 explicitly and entering practice mode must keep Phẩm 1 at top (not jump back to Phẩm 4).
  await page.locator('.tt-preview__toc-list > button').filter({ hasText: 'PHẨM 1:' }).click();
  await expect(page.locator('.tt-reader-chapter-title')).toContainText('PHẨM 1:');
  await page.locator('.tt-reader-practice-btn').click();
  await page.locator('.practice-confirm__primary').click();
  await expect(page.locator('.tt-practice .ttp-art-title')).toContainText('PHẨM 1:');

  // 3. Entering Trì chú / Nghi thức normally also lands on TOC instead of auto-jumping.
  await page.goto('/tu-tap?article=tt_nghi_thuc_tri_chu_bao_khiep_an');
  await settleClient(page);
  await expect(page.locator('.tt-preview__toc-list > button').first()).toBeVisible();
  await expect(page.locator('.tt-reader-chapter-title')).toHaveCount(0);
  await expect(page).not.toHaveURL(/chap=/);

  // 4. Starting practice from TOC ("Bắt đầu tu tập") still resumes from saved progress (Phẩm 4).
  await page.goto('/tu-tap?article=tt_1780910773084');
  await settleClient(page);
  await page.locator('.tt-preview__start').click();
  await page.locator('.practice-confirm__primary').click();
  await expect(page.locator('.tt-practice .ttp-art-title')).toContainText('PHẨM 4:');
});
