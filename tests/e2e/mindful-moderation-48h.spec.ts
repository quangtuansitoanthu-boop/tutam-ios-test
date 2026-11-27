import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { loginAsAdmin, loginAsMember, settleClient } from './runtime-helpers';
import { useLocalMindfulPostResponses } from './helpers/mindful-local-response';
import { closeReflectionSubmissionNotice, reflectionSubmissionNotice } from './helpers/reflection-submission-notice';
import type { MindfulPost, MindfulPostKind } from '../../src/lib/contracts/mindful-community';

const endpoint = '/api/practice/mindful-posts';
const warning = 'Quý đạo hữu lưu ý: Các bài liên quan đến chính trị, tuyên truyền tà đạo, mê tín dị đoan, kêu gọi quyên góp tiền hoặc vi phạm chính sách sẽ bị gỡ bỏ. Tài khoản có thể bị khóa vĩnh viễn.';
const reviewDescription = 'Bài được gửi đến quản trị viên để duyệt trong 48 giờ. Sau thời hạn này, nếu không bị từ chối hoặc phát hiện vi phạm, bài sẽ tự đăng lên cộng đồng.';
const entries = [
  { kind: 'repentance', label: 'Nhìn lại lỗi lầm & sám hối', share: 'Gửi cộng đồng sám hối' },
  { kind: 'good_deed', label: 'Việc thiện lành đã làm', share: 'Chia sẻ việc lành' },
] as const;
const reflection = (label: string) => `${label}. ${'Hôm nay tôi tập lắng nghe và giữ tâm an lành. '.repeat(6)}`.trim();

test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Thông báo tu tập', exact: true }), async dialog => {
    await dialog.getByRole('button', { name: 'Để sau', exact: true }).click();
  });
});

async function touch(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await control.click();
}

async function openJournal(page: Page) {
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--reflection').click();
  await enterJournal(page);
}

async function enterJournal(page: Page) {
  const guide = page.getByTestId('reflection-guide');
  if (await guide.isVisible()) await guide.getByRole('button', { name: 'Tôi đã hiểu, Bắt đầu quán chiếu →', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true })).toBeVisible();
}

async function share(page: Page, kind: MindfulPostKind, readLocal?: Awaited<ReturnType<typeof useLocalMindfulPostResponses>>) {
  const item = entries.find(entry => entry.kind === kind)!;
  await touch(page.getByRole('button', { name: item.share, exact: true }));
  const dialog = page.getByRole('dialog', { name: 'Xác nhận chia sẻ', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(reviewDescription);
  await expect(dialog.getByText(warning, { exact: true })).toBeVisible();
  const response = page.waitForResponse(result => new URL(result.url()).pathname === endpoint && result.request().method() === 'POST')
    .then(async response => ({ response, payload: await (readLocal ? readLocal(response) : response.json()) }))
    .then(value => ({ value }), error => ({ error }));
  await touch(dialog.getByRole('button', { name: 'Đồng ý chia sẻ', exact: true }));
  const submitted = await response;
  if ('error' in submitted) throw submitted.error;
  await expect(dialog).toHaveCount(0);
  if (submitted.value.response.ok()) await closeReflectionSubmissionNotice(page);
  return submitted.value;
}

function trackRequests(page: Page) {
  const requests: Request[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith(endpoint) || ['/api/session', '/api/auth/session', '/api/auth/refresh'].includes(path)) requests.push(request);
  });
  return requests;
}

async function pendingNotice(page: Page, post: MindfulPost) {
  expect(post).toMatchObject({ status: 'hidden', reviewState: 'pending', reviewRevision: 1, publishedAt: null });
  expect(Date.parse(post.reviewDueAt!) - Date.parse(post.createdAt)).toBe(48 * 60 * 60_000);
  const panel = page.locator(post.kind === 'repentance' ? '#panel-repentance' : '#panel-good-deed');
  const notice = panel.locator('.reflection-review-notice');
  await expect(notice).toBeInViewport();
  await expect(notice).toHaveAttribute('data-review-state', 'pending');
  await expect(notice).toHaveAccessibleName('Trạng thái bài chia sẻ');
  await expect(notice.getByText('Đã gửi bài · Chờ duyệt', { exact: true })).toBeVisible();
  await expect(page.locator('.personal-journal > .reflection-review-notice[data-review-state="pending"]')).toHaveCount(0);
  await expect(panel.locator('.share-status--banner')).toHaveCount(0);
  const details = notice.getByRole('button', { name: 'Chi tiết', exact: true });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  expect((await notice.boundingBox())!.height).toBeLessThanOrEqual(52);
  await expect(notice.locator(`time[datetime="${post.reviewDueAt}"]`)).toBeHidden();
  await touch(details);
  await expect(notice.getByRole('button', { name: 'Thu gọn' })).toHaveAttribute('aria-expanded', 'true');
  await expect(notice).toContainText(reviewDescription);
  await expect(notice).toContainText('Bài đang chờ chỉ hiển thị với bạn và quản trị viên, chưa hiển thị với cộng đồng.');
  await expect(notice).toContainText('Mốc 48 giờ');
  await expect(notice.locator(`time[datetime="${post.createdAt}"]`)).toBeVisible();
  await expect(notice.locator(`time[datetime="${post.reviewDueAt}"]`)).toBeVisible();
  const paragraphs = await notice.locator('p').evaluateAll(nodes => nodes.map(node => ({
    text: node.textContent?.trim(), alignment: getComputedStyle(node).textAlign,
    width: node.clientWidth, contentWidth: node.scrollWidth,
  })));
  expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  expect(paragraphs.every(paragraph => paragraph.text && paragraph.alignment === 'justify' && paragraph.contentWidth <= paragraph.width + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await touch(notice.getByRole('button', { name: 'Thu gọn', exact: true }));
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(notice.locator(`time[datetime="${post.reviewDueAt}"]`)).toBeHidden();
  await expect(reflectionSubmissionNotice(page)).toHaveCount(0);
  return notice;
}

test('[moderation48h] real local D1 keeps two submissions private until admin approval, rejection or deletion', async ({ page, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
  const principal = 'e2e-mindful-48h-lifecycle';
  const token = `${principal}-session-token`;
  const readLocal = await useLocalMindfulPostResponses(page, baseURL!);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 844 });
  await loginAsMember(page, token);
  await openJournal(page);
  await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).fill('Đồng Tu Chờ Duyệt');
  const requests = trackRequests(page);
  const posts: MindfulPost[] = [];
  const goodDeedDraft = reflection(`Bài kiểm duyệt good_deed ${info.testId}`);
  await page.locator('#tab-good-deed').click();
  await page.getByRole('textbox', { name: entries[1].label, exact: true }).fill(goodDeedDraft);
  await page.locator('#tab-repentance').click();
  for (const item of entries) {
    const content = reflection(`Bài kiểm duyệt ${item.kind} ${info.testId}`);
    const editor = page.getByRole('textbox', { name: item.label, exact: true });
    if (item.kind === 'good_deed') {
      await page.locator('#tab-good-deed').click();
      await expect(editor).toHaveValue(goodDeedDraft);
    } else {
      await editor.fill(content);
    }
    requests.length = 0;
    const { response, payload: result } = await share(page, item.kind, readLocal);
    expect(response.ok(), JSON.stringify(result)).toBe(true);
    expect(result).toMatchObject({ accountLocked: false, accountLockReason: null });
    const post: MindfulPost = result.post;
    await expect(page.getByRole('textbox', { name: item.label, exact: true })).toHaveValue('');
    await pendingNotice(page, post);
    expect(requests.map(request => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([`POST ${endpoint}`]);
    posts.push(post);
  }
  const publicPosts = await page.request.get(`${endpoint}?period=all`);
  expect(publicPosts.ok()).toBe(true);
  expect((await publicPosts.json()).items.some((post: MindfulPost) => posts.some(own => own.id === post.id))).toBe(false);
  const mine = await page.request.get(`${endpoint}?mine=1&period=all`);
  expect(mine.ok()).toBe(true);
  expect((await mine.json()).items.filter((post: MindfulPost) => posts.some(own => own.id === post.id)))
    .toEqual(expect.arrayContaining(posts.map(post => expect.objectContaining({ id: post.id, reviewState: 'pending', reviewDueAt: post.reviewDueAt }))));
  await touch(page.getByRole('button', { name: 'Cộng đồng', exact: true }));
  for (const post of posts) await expect(page.locator('.mindful-community article').filter({ hasText: post.content.slice(0, 120) })).toHaveCount(0);
  await touch(page.getByRole('button', { name: /Bài của tôi$/u }));
  for (const post of posts) {
    const own = page.locator('.mindful-community article').filter({ hasText: post.content.slice(0, 120) });
    if (post.content.length > 280) await touch(own.getByRole('button', { name: /^Đọc toàn văn/u }));
    await expect(own.locator('.content')).toHaveText(post.content);
    await expect(own).toContainText('Đã gửi bài · Đang chờ xét duyệt');
    await expect(own.locator(`time[datetime="${post.reviewDueAt}"]`)).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('own-pending-mobile.png'), fullPage: true, animations: 'disabled' });

  const notificationReads: Request[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/admin/notifications') notificationReads.push(request); });
  const notificationResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/notifications');
  await loginAsAdmin(page);
  const notifications = await notificationResponse;
  expect(notifications.ok()).toBe(true);
  const notices = (await readLocal(notifications)).notifications;
  const pendingNotification = notices.find((notice: { type: string; link: string }) => notice.type === 'pending_mindful' && notice.link === '/admin/community?moderation=mindful');
  expect(pendingNotification).toBeDefined();
  await touch(page.locator('.notification-bell-btn'));
  await expect.poll(() => notificationReads.length).toBe(2);
  await page.locator('.notification-item').filter({ hasText: pendingNotification.title }).first().click();
  await expect(page).toHaveURL(/\/admin\/community\?moderation=mindful/u);
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Quán chiếu thiện ác', exact: true });
  await expect(moderation).toBeVisible();
  const decision = async (post: MindfulPost, action: 'approve' | 'reject') => {
    const row = moderation.locator('.admin-moderation-list > *').filter({ hasText: post.content });
    await touch(row.getByRole('button', { name: /^(?:▼\s*)?Xem quán chiếu & ngữ cảnh$/u }));
    const detail = moderation.getByRole('article', { name: 'Nội dung quán chiếu', exact: true });
    await expect(detail).toContainText(post.content);
    const changes: Request[] = [];
    const record = (request: Request) => {
      if (new URL(request.url()).pathname.endsWith(`/mindful/${post.id}`) && request.method() === 'PATCH') changes.push(request);
    };
    page.on('request', record);
    await touch(detail.getByRole('button', { name: action === 'approve' ? 'Duyệt & đăng ngay' : 'Từ chối', exact: true }));
    const dialog = page.getByRole('dialog', { name: action === 'approve' ? 'Duyệt nội dung này?' : 'Từ chối nội dung', exact: true });
    if (action === 'reject') {
      await touch(dialog.getByRole('button', { name: 'Xác nhận', exact: true }));
      expect(changes).toEqual([]);
      await dialog.getByLabel('Lý do từ chối', { exact: true }).fill('Xin bổ sung lời phát nguyện rõ ràng.');
    }
    const result = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/mindful/${post.id}`) && response.request().method() === 'PATCH');
    await touch(dialog.getByRole('button', { name: 'Xác nhận', exact: true }));
    expect((await result).ok()).toBe(true);
    await expect(dialog).toHaveCount(0);
    expect(changes).toHaveLength(1);
    expect(changes[0].postDataJSON()).toMatchObject({ action, revision: 1, ...(action === 'reject' ? { reason: 'Xin bổ sung lời phát nguyện rõ ràng.' } : {}) });
    page.off('request', record);
  };
  await decision(posts[0], 'approve');
  await decision(posts[1], 'reject');
  const published = await page.request.get(`${endpoint}?period=all`);
  expect(published.ok()).toBe(true);
  const visible: MindfulPost[] = (await published.json()).items;
  const approvedPublic = visible.find(post => post.id === posts[0].id);
  expect(approvedPublic).toMatchObject({ id: posts[0].id, status: 'published', isOwn: false });
  expect(Number.isFinite(Date.parse(approvedPublic!.publishedAt!))).toBe(true);
  for (const field of ['reviewState', 'reviewDueAt', 'reviewRevision', 'reviewReason', 'policyCode']) expect(approvedPublic).not.toHaveProperty(field);
  expect(visible.some(post => post.id === posts[1].id)).toBe(false);
  const publishedQueueResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/admin/community/moderation' && url.searchParams.get('kind') === 'mindful'
      && url.searchParams.get('state') === 'published' && response.request().method() === 'GET';
  });
  await touch(moderation.getByRole('button', { name: /^Đã đăng/u }));
  const publishedQueue = await publishedQueueResponse;
  expect(publishedQueue.ok()).toBe(true);
  expect((await readLocal(publishedQueue)).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: posts[0].id, reviewState: 'approved', revision: 2, publishedAt: approvedPublic!.publishedAt }),
  ]));
  await touch(moderation.locator('.admin-moderation-list > *').filter({ hasText: posts[0].content }).getByRole('button', { name: /^(?:▼\s*)?Xem quán chiếu & ngữ cảnh$/u }));
  const remove = moderation.getByRole('article', { name: 'Nội dung quán chiếu', exact: true }).getByRole('button', { name: 'Xóa bài đã đăng', exact: true });
  await touch(remove);
  const dialog = page.getByRole('dialog', { name: 'Xóa bài đã đăng?', exact: true });
  const writes: Request[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith(`/mindful/${posts[0].id}`) && request.method() === 'PATCH') writes.push(request);
  });
  await touch(dialog.getByRole('button', { name: 'Hủy', exact: true }));
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([]);
  await touch(remove);
  const deleted = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/mindful/${posts[0].id}`) && response.request().method() === 'PATCH');
  await touch(dialog.getByRole('button', { name: 'Xác nhận', exact: true }));
  expect((await deleted).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0].postDataJSON()).toMatchObject({ action: 'delete', revision: 2 });
  await loginAsMember(page, token);
  await openJournal(page);
  const finalMine = await page.request.get(`${endpoint}?mine=1&period=all`);
  expect(finalMine.ok()).toBe(true);
  const finalPosts: MindfulPost[] = (await finalMine.json()).items;
  expect(finalPosts.some(post => post.id === posts[0].id)).toBe(false);
  expect(finalPosts).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: posts[1].id, status: 'hidden', reviewState: 'rejected', reviewReason: 'Xin bổ sung lời phát nguyện rõ ràng.' }),
  ]));
  const finalPublic = await page.request.get(`${endpoint}?period=all`);
  expect(finalPublic.ok()).toBe(true);
  expect((await finalPublic.json()).items.some((post: MindfulPost) => posts.some(own => own.id === post.id))).toBe(false);
  for (const [index, item] of entries.entries()) {
    await page.locator(index === 0 ? '#tab-repentance' : '#tab-good-deed').click();
    await expect(page.getByRole('textbox', { name: item.label, exact: true })).toHaveValue(posts[index].content);
  }
  expect(errors).toEqual([]);
});

test('[moderation48h] an author withdraws a pending post from My posts using local D1', async ({ page, baseURL }, info) => {
  const readLocal = await useLocalMindfulPostResponses(page, baseURL!);
  await page.setViewportSize({ width: 375, height: 844 });
  await loginAsMember(page, 'e2e-mindful-48h-retry-session-token');
  await openJournal(page);
  await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).fill('Đồng Tu Rút Bài');
  const content = reflection(`Rút bài chờ duyệt ${info.testId}`);
  await page.getByRole('textbox', { name: entries[0].label, exact: true }).fill(content);
  const { response, payload } = await share(page, 'repentance', readLocal);
  expect(response.ok(), JSON.stringify(payload)).toBe(true);
  expect(payload.post).toMatchObject({ status: 'hidden', reviewState: 'pending' });

  await touch(page.getByRole('button', { name: 'Cộng đồng', exact: true }));
  await touch(page.getByRole('button', { name: /Bài của tôi$/u }));
  const own = page.locator('.mindful-community article').filter({ hasText: content.slice(0, 120) });
  await touch(own.getByRole('button', { name: 'Rút bài', exact: true }));
  const dialog = page.getByRole('dialog', { name: 'Rút bài đang chờ duyệt?', exact: true });
  const withdrawn = page.waitForResponse(result => new URL(result.url()).pathname === `${endpoint}/${payload.post.id}`
    && result.request().method() === 'DELETE');
  await touch(dialog.getByRole('button', { name: 'Rút bài', exact: true }));
  expect((await withdrawn).ok()).toBe(true);
  await expect(own).toHaveCount(0);
  const mine = await page.request.get(`${endpoint}?mine=1&period=all`);
  expect(mine.ok()).toBe(true);
  expect((await mine.json()).items).not.toContainEqual(expect.objectContaining({ id: payload.post.id }));
});

test('[moderation48h] a bell opened after the initial read shows a new submission and reopens the pending queue', async ({ page, browser, baseURL }, info) => {
  const context = await browser.newContext({ baseURL });
  try {
    const sender = await context.newPage();
    await loginAsMember(sender);
    const origin = new URL(baseURL!).origin;
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
    const sessionResponse = await sender.request.get('/api/session');
    expect(sessionResponse.ok()).toBe(true);
    const session = await sessionResponse.json();
    expect(session).toMatchObject({ authenticated: true, user: { role: 'user' } });
    const nickname = 'Đồng Tu Mới Gửi Bài';
    const content = reflection(`Đợi quản trị viên duyệt ${info.testId}`);

    await loginAsAdmin(page);
    const readAdmin = await useLocalMindfulPostResponses(page, baseURL!);
    const initialRead = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/notifications');
    const pendingQueue = (response: import('@playwright/test').Response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/community/moderation' && url.searchParams.get('state') === 'pending';
    };
    const queueRead = page.waitForResponse(pendingQueue);
    await page.goto('/admin/community?moderation=mindful');
    const initial = await readAdmin(await initialRead);
    expect(initial.notifications.some((notice: { message: string }) => notice.message.includes(nickname))).toBe(false);
    expect((await queueRead).ok()).toBe(true);
    const moderation = page.getByRole('region', { name: 'Quán chiếu thiện ác', exact: true });
    await expect(moderation).toBeVisible();
    await moderation.getByRole('button', { name: /^Đã đăng/u }).click();
    await expect(moderation.getByRole('button', { name: /^Đã đăng/u })).toHaveAttribute('aria-pressed', 'true');

    const response = await sender.request.post(endpoint, {
      headers: { origin, 'x-csrf-token': session.csrfToken },
      data: { clientPostId: `admin-fresh-${info.testId}`, kind: 'repentance', nickname, content },
    });
    const payload = await response.json();
    expect(response.ok(), JSON.stringify(payload)).toBe(true);
    expect(payload.post.reviewState).toBe('pending');
    await touch(page.locator('.notification-bell-btn'));
    const notification = page.locator('.notification-item').filter({ hasText: nickname });
    await expect(notification).toBeVisible();
    await touch(notification);
    await expect(moderation.getByRole('button', { name: /^Chờ duyệt/u })).toHaveAttribute('aria-pressed', 'true');
    await expect(moderation.locator('.admin-moderation-list > *').filter({ hasText: content })).toBeVisible();
    const refreshed = page.waitForResponse(pendingQueue);
    await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
    expect((await refreshed).ok()).toBe(true);
    await page.getByRole('tab', { name: /Xếp hạng/u }).click();
    await expect(moderation).toHaveCount(0);
    await touch(page.locator('.notification-bell-btn'));
    await page.getByRole('tab', { name: /^Phê duyệt/u }).click();
    const reopenedQueue = page.waitForResponse(pendingQueue);
    await touch(notification);
    expect((await reopenedQueue).ok()).toBe(true);
    await expect(moderation.locator('.admin-moderation-list > *').filter({ hasText: content })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('[moderation48h] 403, 429 and 503 preserve one draft and client ID until a real local D1 retry succeeds', async ({ page, baseURL }) => {
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(baseURL!).hostname);
  const principal = 'e2e-mindful-48h-retry';
  const readLocal = await useLocalMindfulPostResponses(page, baseURL!);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await loginAsMember(page, `${principal}-session-token`);
  await openJournal(page);
  await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).fill('Đồng Tu Giữ Bản Nháp');
  const editor = page.getByRole('textbox', { name: entries[0].label, exact: true });
  const content = reflection('Bản nháp vẫn nguyên vẹn khi chưa gửi được');
  await editor.fill(content);
  let failure = 403;
  await page.route('**/api/practice/mindful-posts', route => {
    if (route.request().method() !== 'POST' || failure === 0) return route.fallback();
    return route.fulfill({ status: failure, json: { error: { code: 'fixture_refusal', message: '<unsafe-server-message>' } } });
  });
  const requests = trackRequests(page);
  const attempts: Request[] = [];
  for (const [status, message] of [
    [403, 'Tài khoản hiện không được phép gửi bài. Vui lòng kiểm tra trạng thái tài khoản. Nội dung trên máy vẫn được giữ nguyên.'],
    [429, 'Bạn đã đạt giới hạn chia sẻ trong ngày (tối đa 2 bài). Vui lòng thử lại vào ngày mai. Nội dung trên máy vẫn được giữ nguyên.'],
    [503, 'Tính năng chia sẻ hiện chưa sẵn sàng. Vui lòng thử lại sau. Nội dung trên máy vẫn được giữ nguyên.'],
  ] as const) {
    failure = status; requests.length = 0;
    const { response } = await share(page, 'repentance', readLocal);
    expect(response.status()).toBe(status);
    await expect(page.locator('.share-status[role="status"]')).toHaveText(message);
    await expect(reflectionSubmissionNotice(page)).toHaveCount(0);
    await expect(page.getByText('<unsafe-server-message>', { exact: true })).toHaveCount(0);
    await expect(editor).toHaveValue(content);
    expect(await page.evaluate(key => localStorage.getItem(key), `quangtu_principal_v1:${principal}:tt_personal_reflections_v1`)).toContain(content);
    expect(requests.map(request => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([`POST ${endpoint}`]);
    attempts.push(response.request());
  }
  failure = 0; requests.length = 0;
  const { response: accepted, payload } = await share(page, 'repentance', readLocal);
  expect(accepted.ok(), JSON.stringify(payload)).toBe(true);
  attempts.push(accepted.request());
  await pendingNotice(page, payload.post);
  expect(new Set(attempts.map(request => request.postDataJSON().clientPostId)).size).toBe(1);
  expect(attempts.every(request => request.postDataJSON().content === content && request.postDataJSON().kind === 'repentance')).toBe(true);
  expect(requests.map(request => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([`POST ${endpoint}`]);
  expect(errors).toEqual([]);
});

for (const width of [375, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`[moderation48h] review text, pending deadline and Back remain usable at ${width}px in ${theme} mode`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(theme => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, theme);
    await loginAsMember(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let post: MindfulPost;
    await page.route('**/api/practice/mindful-posts', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON();
      const createdAt = new Date().toISOString();
      post = { ...body, id: `appearance-${width}-${theme}`, status: 'hidden', reviewState: 'pending', reviewRevision: 1,
        createdAt, reviewDueAt: new Date(Date.parse(createdAt) + 48 * 60 * 60_000).toISOString(), publishedAt: null,
        reviewReason: null, policyCode: null, isOwn: true, reactionCount: 0, viewerReacted: false };
      await route.fulfill({ json: { post, accountLocked: false, accountLockReason: null } });
    });
    await openJournal(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).fill('Đồng Tu Kiểm Tra Giao Diện');
    const editor = page.getByRole('textbox', { name: entries[0].label, exact: true });
    const content = reflection('Đoạn chia sẻ đủ dài để kiểm tra đọc rõ và xuống dòng trên điện thoại');
    await editor.fill(content);
    await share(page, 'repentance');
    const notice = await pendingNotice(page, post!);
    await notice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`pending-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
    await touch(page.getByRole('button', { name: 'Quay lại', exact: true }));
    await expect(page.locator('.tt-mode-card--reflection')).toBeVisible();
    await touch(page.locator('.tt-mode-card--reflection'));
    await enterJournal(page);
    await expect(editor).toHaveValue(content);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
