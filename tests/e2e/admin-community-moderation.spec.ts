import { expect, test, type Locator } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';
import type { ModerationQueueItem } from '../../src/lib/contracts/community-moderation';

const comment: ModerationQueueItem = {
  id: '71', kind: 'comments', revision: 3, submittedAt: '2026-11-04T03:00:00Z',
  displayName: 'Thành viên chờ duyệt', avatarUrl: '', content: 'Nội dung cần xem xét', articleId: 'kinh-duy-ma-cat',
  moderationStatus: 'pending', member: { id: 'member-review', name: 'Thành viên chờ duyệt', role: 'user', status: 'active', isSelf: false },
};

test('moderation keeps rejection reason on failure and never submits duplicate decisions', async ({ page }) => {
  await loginAsAdmin(page);
  let writes = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/admin/community/moderation?*', route => route.fulfill({ json: { items: [comment], nextCursor: null } }));
  await page.route('**/api/admin/community/moderation/comments/71', async route => {
    writes++;
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({ action: 'reject', revision: 3, reason: 'Cần chỉnh sửa nội dung' });
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: { code: 'unavailable', message: 'Chưa cập nhật được' } } });
  });
  await page.goto('/admin/community?moderation=comments');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await moderation.getByRole('button', { name: /^(?:▼\s*)?Xem nội dung & ngữ cảnh$/u, exact: true }).click();
  await expect(moderation.getByText('Nội dung cần xem xét', { exact: true }).last()).toBeVisible();
  await moderation.getByRole('button', { name: 'Từ chối', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Từ chối nội dung', exact: true });
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  expect(writes).toBe(0);
  await dialog.getByLabel('Lý do từ chối').fill('Cần chỉnh sửa nội dung');
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Đang xử lý…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release!();
  await expect(dialog.getByRole('alert')).toContainText('Chưa cập nhật được');
  await expect(dialog.getByLabel('Lý do từ chối')).toHaveValue('Cần chỉnh sửa nội dung');
  expect(writes).toBe(1);
});

test('admin community shows two main queues and keeps reflection filters inside their queue', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await loginAsAdmin(page);
  const reads: string[] = [];
  await page.route('**/api/admin/community/moderation?*', async route => {
    reads.push(new URL(route.request().url()).searchParams.get('kind')!);
    await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto('/admin/community');
  await settleClient(page);
  const tabs = page.getByRole('navigation', { name: 'Hàng chờ kiểm duyệt', exact: true });
  await expect(tabs.getByRole('button')).toHaveText(['Quán chiếu thiện ác', 'Bình luận']);
  await expect(tabs.getByRole('button', { name: 'Quán chiếu thiện ác', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => reads).toEqual(['mindful']);
  const mindful = page.getByRole('region', { name: 'Quán chiếu thiện ác', exact: true });
  await expect(mindful.getByText('Không còn bài chờ duyệt')).toBeVisible();
  await expect(mindful.getByRole('group', { name: 'Trạng thái', exact: true }).getByRole('button')).toHaveCount(2);
  await expect(mindful.getByRole('group', { name: 'Loại bài', exact: true }).getByRole('button')).toHaveCount(3);
  await expect(mindful.getByRole('button', { name: 'Trang sau', exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, mindful);
  await touchModeration(tabs.getByRole('button', { name: 'Bình luận', exact: true }));
  await expect(page.getByRole('group', { name: 'Loại bài', exact: true })).toHaveCount(0);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await expect(moderation.getByText('Không có nội dung chờ xử lý', { exact: true })).toBeVisible();
  await expect.poll(() => reads).toEqual(['mindful', 'comments']);
  await touchModeration(tabs.getByRole('button', { name: 'Quán chiếu thiện ác', exact: true }));
  await expect(mindful).toBeVisible();
  expect(reads).toEqual(['mindful', 'comments']);
  await page.goto('/admin/community?moderation=profiles');
  await expect(page.getByRole('region', { name: 'Tên/ảnh công khai chờ duyệt' })).toBeVisible();
  await expect.poll(() => reads).toEqual(['mindful', 'comments', 'profiles']);
});


test('reloading the selected comment queue preserves its URL and filters', async ({ page }) => {
  await loginAsAdmin(page);
  await page.route('**/api/admin/community/moderation?*', route => route.fulfill({
    json: { items: [], nextCursor: null },
  }));
  await page.goto('/admin/community?moderation=mindful&period=today#review');
  const queues = page.getByRole('navigation', { name: 'Hàng chờ kiểm duyệt', exact: true });
  const comments = queues.getByRole('button', { name: 'Bình luận', exact: true });
  await comments.click();
  await expect(comments).toHaveAttribute('aria-pressed', 'true');
  const selected = new URL(page.url());
  expect(selected.searchParams.get('period')).toBe('today');
  expect(selected.hash).toBe('#review');
  await page.reload();
  await expect(comments).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Kiểm duyệt nội dung' })).toBeVisible();
});
test('reported content hides through its target revision and resolves the report separately', async ({ page }) => {
  await loginAsAdmin(page);
  const writes: Array<{ path: string; body: unknown }> = [];
  const report: ModerationQueueItem = {
    ...comment, id: 'report-1', kind: 'reports', revision: 5, content: 'Báo cáo cần xử lý', reportReason: 'spam',
    target: { ...comment, kind: 'comments', moderationStatus: 'approved' },
  };
  await page.route('**/api/admin/community/moderation?*', route => route.fulfill({ json: { items: [report], nextCursor: null } }));
  await page.route('**/api/admin/community/moderation/*/*', async route => {
    writes.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.fulfill({ json: { updated: true } });
  });
  await page.goto('/admin/community?moderation=reports');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Báo cáo', exact: true });
  await moderation.getByRole('button', { name: /^(?:▼\s*)?Xem nội dung & ngữ cảnh$/u, exact: true }).click();
  await moderation.getByRole('article', { name: 'Nội dung & ngữ cảnh', exact: true }).getByRole('button', { name: 'Ẩn nội dung vi phạm', exact: true }).click();
  const hide = page.getByRole('dialog', { name: 'Ẩn nội dung vi phạm?', exact: true });
  await hide.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => writes).toEqual([{ path: '/api/admin/community/moderation/comments/71', body: { action: 'hide', revision: 3 } }]);
  await expect(hide).toHaveCount(0);
  await moderation.getByRole('button', { name: /^(?:▼\s*)?Xem nội dung & ngữ cảnh$/u, exact: true }).click();
  await moderation.getByRole('article', { name: 'Nội dung & ngữ cảnh', exact: true }).getByRole('button', { name: 'Đánh dấu đã xử lý', exact: true }).click();
  await page.getByRole('dialog', { name: 'Đánh dấu báo cáo đã xử lý?', exact: true }).getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toEqual({ path: '/api/admin/community/moderation/reports/report-1', body: { action: 'resolve', revision: 5 } });
});

test('moderation pagination reuses its principal cache and keeps stale decisions blocked', async ({ page }) => {
  await loginAsAdmin(page);
  const reads: string[] = [];
  await page.route('**/api/admin/community/moderation?*', async route => {
    const after = new URL(route.request().url()).searchParams.get('after') || '';
    reads.push(after);
    await route.fulfill({ json: { items: [{ ...comment, id: after ? '72' : '71' }], nextCursor: after ? null : 'cursor-2' } });
  });
  let writes = 0;
  await page.route('**/api/admin/community/moderation/comments/71', async route => {
    writes++;
    await route.fulfill({ status: 409, json: { error: { code: 'conflict' } } });
  });
  await page.goto('/admin/community?moderation=comments');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await moderation.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect.poll(() => reads).toEqual(['', 'cursor-2']);
  await moderation.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await moderation.getByRole('button', { name: /^(?:▼\s*)?Xem nội dung & ngữ cảnh$/u, exact: true }).click();
  await moderation.getByRole('button', { name: 'Duyệt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Duyệt nội dung này?', exact: true });
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Nội dung đã được thay đổi');
  await expect(dialog.getByRole('button', { name: 'Xác nhận', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Tải lại hàng đợi', exact: true })).toBeVisible();
  expect(writes).toBe(1);
  expect(reads).toEqual(['', 'cursor-2']);
});

test('session loss clears moderation context and closes a private rejection draft', async ({ page }) => {
  await loginAsAdmin(page);
  await page.route('**/api/admin/community/moderation?*', route => route.fulfill({ json: { items: [comment], nextCursor: null } }));
  await page.goto('/admin/community?moderation=comments');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await moderation.getByRole('button', { name: /^(?:▼\s*)?Xem nội dung & ngữ cảnh$/u, exact: true }).click();
  await moderation.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Lý do từ chối').fill('Bản nháp riêng');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('quangtu:session-changed', {
    detail: { authenticated: false, user: null, csrfToken: null, expiresAt: null },
  })));
  await expect(page.getByRole('dialog', { name: 'Từ chối nội dung', exact: true })).toHaveCount(0);
  await expect(moderation).not.toContainText(comment.content);
  await expect(moderation.getByRole('alert')).toContainText('Bạn không có quyền truy cập');
});

async function touchModeration(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await button.click();
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, region: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  const clippedControls = await region.getByRole('button').evaluateAll(buttons => buttons
    .filter(button => {
      const { left, right } = button.getBoundingClientRect();
      return left < -1 || right > window.innerWidth + 1 || button.scrollWidth > button.clientWidth + 1;
    })
    .map(button => button.textContent?.trim()));
  expect(clippedControls).toEqual([]);
}

test('[moderation48h] cold and repeated warm notification links reopen the mindful queue after manual tabs', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/hydration/iu.test(message.text()) && ['warning', 'error'].includes(message.type())) errors.push(message.text()); });
  const notification = { id: `mindful-navigation-${info.testId}`, type: 'pending_mindful', title: 'Bài chia sẻ cần xét duyệt',
    message: 'Mở hàng đợi bài chia sẻ đang chờ.', timestamp: new Date().toISOString(),
    link: '/admin/community?moderation=mindful', badge: 'Chờ duyệt', level: 'info' };
  await page.route('**/api/admin/notifications', route => route.fulfill({ json: { notifications: [notification], total: 1 } }));
  const queues: string[] = [];
  const writes: string[] = [];
  const documents: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest() && request.resourceType() === 'document') documents.push(request.url());
    if (path.startsWith('/api/admin/community/moderation') && request.method() !== 'GET') writes.push(`${request.method()} ${path}`);
  });
  await page.route('**/api/admin/community/moderation?*', async route => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind')!;
    queues.push(kind);
    expect(url.searchParams.get('limit')).toBe('20');
    await route.fulfill({ json: { items: [], nextCursor: null,
      ...(kind === 'mindful' ? { summary: { pending: { count: 0, capped: false }, published: { count: 0, capped: false } } } : {}) } });
  });
  await loginAsAdmin(page);
  await page.goto('/admin/community?period=today&moderation=mindful#review');
  await settleClient(page);
  const mindful = page.getByRole('region', { name: 'Quán chiếu thiện ác', exact: true });
  await expect(mindful).toBeVisible();
  await expect(mindful.getByRole('button', { name: 'Quán chiếu thiện ác', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(mindful.getByText('Không còn bài chờ duyệt', { exact: true })).toBeVisible();
  expect(queues).toEqual(['mindful']);
  documents.length = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    await touchModeration(mindful.getByRole('button', { name: 'Bình luận', exact: true }));
    const comments = page.getByRole('region', { name: 'Kiểm duyệt nội dung', exact: true });
    await expect(comments.getByRole('button', { name: 'Bình luận', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const manualUrl = new URL(page.url());
    expect(manualUrl.searchParams.get('moderation')).toBe('comments');
    if (attempt === 0) {
      expect(manualUrl.searchParams.get('period')).toBe('today');
      expect(manualUrl.hash).toBe('#review');
    }
    await touchModeration(page.locator('.notification-bell-btn'));
    await page.getByRole('tab', { name: 'Phê duyệt', exact: true }).click();
    await touchModeration(page.locator('.notification-item').filter({ hasText: notification.title }));
    await expect(page).toHaveURL(new URL(notification.link, page.url()).href);
    await expect(mindful.getByRole('button', { name: 'Quán chiếu thiện ác', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(mindful.getByText('Không còn bài chờ duyệt', { exact: true })).toBeVisible();
  }
  expect(queues).toEqual(['mindful', 'comments', 'mindful', 'mindful']);
  expect(documents).toEqual([]);
  expect(writes).toEqual([]);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('mindful-queue-reopened-notification.png'), fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});

for (const width of [375, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`[moderation48h] bulk review freezes all filtered pages and resumes explicitly at ${width}px in ${theme} mode`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(theme => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, theme);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await loginAsAdmin(page);
    const postKind = width === 375 && theme === 'dark' ? 'repentance' : width === 1440 && theme === 'light' ? 'good_deed' : undefined;
    const label = postKind === 'repentance' ? 'Sám hối' : postKind === 'good_deed' ? 'Làm việc thiện' : 'Tất cả';
    const submittedAt = new Date().toISOString();
    const reads: URL[] = [];
    let complete = false;
    await page.route('**/api/admin/community/moderation?*', async route => {
      const url = new URL(route.request().url());
      reads.push(url);
      const after = url.searchParams.get('after');
      const items: ModerationQueueItem[] = complete ? [] : Array.from({ length: 20 }, (_, index) => ({
        ...comment, id: `mindful-${after ? 20 : 0}-${index}`, kind: 'mindful', revision: 1, submittedAt,
        mindfulKind: (url.searchParams.get('postKind') || 'repentance') as 'repentance' | 'good_deed',
        articleId: null, content: `Bài chia sẻ đang chờ ${after ? 20 : 0}-${index}. Tôi nguyện tập lắng nghe, thực hành chánh niệm và gìn giữ lời nói an lành.`,
        reviewState: 'pending', reviewDueAt: new Date(Date.parse(submittedAt) + 48 * 60 * 60_000).toISOString(), publishedAt: null,
      }));
      await route.fulfill({ json: { items, nextCursor: complete || after ? null : 'queue-page-2',
        summary: { pending: { count: complete ? 0 : 99, capped: !complete }, published: { count: complete ? 99 : 0, capped: complete } } } });
    });
    const preparations: Array<{ operationId: string; postKind?: string }> = [];
    let cutoff = '';
    await page.route('**/api/admin/community/moderation/mindful/approve-all/prepare', async route => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(postKind ? ['operationId', 'postKind'] : ['operationId']);
      expect(typeof body.operationId).toBe('string');
      expect(body.operationId).not.toBe('');
      expect(body.postKind).toBe(postKind);
      preparations.push(body);
      cutoff = new Date().toISOString();
      await route.fulfill({ json: { operationId: body.operationId, cutoff, summary: { count: 99, capped: true },
        expiresAt: new Date(Date.parse(cutoff) + 30 * 60_000).toISOString() } });
    });
    const chunks: Array<{ operationId: string; cutoff: string; after: string | null; postKind?: string }> = [];
    await page.route('**/api/admin/community/moderation/mindful/approve-all', async route => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      chunks.push(body);
      expect(body).toEqual({ operationId: preparations.at(-1)!.operationId, cutoff,
        after: chunks.length === 1 ? null : 'chunk-after-100', ...(postKind ? { postKind } : {}) });
      if (chunks.length === 2) return route.fulfill({ status: 503, json: { error: { code: 'temporarily_unavailable' } } });
      complete = chunks.length === 3;
      await route.fulfill({ json: { operationId: body.operationId, cutoff: body.cutoff,
        updated: complete ? 5 : 100, conflicted: 0, nextCursor: complete ? null : 'chunk-after-100' } });
    });
    await page.goto('/admin/community?moderation=mindful');
    await settleClient(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const moderation = page.getByRole('region', { name: 'Quán chiếu thiện ác', exact: true });
    const filter = moderation.getByRole('group', { name: 'Loại bài', exact: true });
    await touchModeration(filter.getByRole('button', { name: label, exact: true }));
    await expect(filter.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(moderation.getByRole('button', { name: /^Chờ duyệt\s+99\+/u })).toHaveAttribute('aria-pressed', 'true');
    await expectNoHorizontalOverflow(page, moderation);
    await page.screenshot({ path: info.outputPath(`moderation-hierarchy-${width}-${theme}.png`), animations: 'disabled' });
    await touchModeration(moderation.getByRole('button', { name: 'Trang sau', exact: true }));
    await expect(moderation.locator('.admin-moderation-list')).toContainText('Bài chia sẻ đang chờ 20-0.');
    const readCount = reads.length;
    await touchModeration(moderation.getByRole('button', { name: 'Trang trước', exact: true }));
    await expect(moderation.locator('.admin-moderation-list')).toContainText('Bài chia sẻ đang chờ 0-0.');
    expect(reads).toHaveLength(readCount);
    expect(reads.every(url => url.searchParams.get('kind') === 'mindful' && url.searchParams.get('state') === 'pending')).toBe(true);
    expect(reads.at(-1)!.searchParams.get('postKind')).toBe(postKind ?? null);
    const approveAll = moderation.getByRole('button', { name: /^Duyệt tất cả\s*\(99\+\)$/u });
    await touchModeration(approveAll);
    const dialog = page.getByRole('dialog', { name: 'Duyệt tất cả quán chiếu đang chờ?', exact: true });
    await expect(dialog).toBeVisible();
    expect(preparations).toHaveLength(1);
    await expect(dialog).toContainText('gồm cả các trang kết quả khác');
    await expect(dialog).toContainText(`Bộ lọc: ${label}`);
    await expect(dialog).toContainText('Bài trong phạm vi: 99+');
    expect(chunks).toEqual([]);
    await touchModeration(dialog.getByRole('button', { name: 'Hủy', exact: true }));
    await expect(dialog).toHaveCount(0);
    expect(chunks).toEqual([]);
    await touchModeration(approveAll);
    await expect(dialog).toBeVisible();
    expect(preparations).toHaveLength(2);
    expect(preparations[0].operationId).not.toBe(preparations[1].operationId);
    await touchModeration(dialog.getByRole('button', { name: 'Xác nhận', exact: true }));
    await expect(dialog.getByRole('alert')).toContainText('Lượt duyệt đã dừng.');
    expect(chunks).toHaveLength(2);
    await expect(dialog.getByRole('status')).toHaveText('Đã duyệt 100 bài · 0 bài đã thay đổi.');
    const layout = await dialog.locator('p').evaluateAll(nodes => nodes.map(node => ({
      alignment: getComputedStyle(node).textAlign, width: node.clientWidth, contentWidth: node.scrollWidth,
    })));
    expect(layout.length).toBeGreaterThanOrEqual(4);
    expect(layout.every(paragraph => paragraph.alignment === 'justify' && paragraph.contentWidth <= paragraph.width + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`bulk-partial-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
    await touchModeration(dialog.getByRole('button', { name: 'Hủy', exact: true }));
    await expect(dialog).toHaveCount(0);
    await expect(filter.getByRole('button', { name: 'Tất cả', exact: true })).toBeDisabled();
    expect(chunks).toHaveLength(2);
    await touchModeration(moderation.getByRole('button', { name: 'Tiếp tục lượt duyệt', exact: true }));
    await touchModeration(dialog.getByRole('button', { name: 'Tiếp tục lượt duyệt', exact: true }));
    await expect(dialog).toHaveCount(0);
    await expect(moderation.getByRole('status')).toHaveText('Đã hoàn tất lượt duyệt. Đã duyệt 105 bài · 0 bài đã thay đổi.');
    expect(chunks).toHaveLength(3);
    expect(chunks[2]).toEqual(chunks[1]);
    expect(preparations).toHaveLength(2);
    await expect(filter.getByRole('button', { name: 'Tất cả', exact: true })).toBeEnabled();
    await expect(moderation.getByRole('button', { name: /^Chờ duyệt\s+0$/u })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });
}
