import { expect, test, type Page } from '@playwright/test';
import { deferStartupNotification, settleClient } from './runtime-helpers';
import { STORE_URLS } from '../../src/lib/contracts/native-app-update';

async function nativeFixture(page: Page, launch?: string, platform: 'android' | 'ios' = 'android', online = false) {
  await page.addInitScript(({ launch, platform, online }) => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', '0');
    const runtime = window as any;
    runtime.CapacitorCustomPlatform = { name: platform };
    runtime.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => platform, Plugins: {},
      PluginHeaders: [
        { name: 'App', methods: [{ name: 'getLaunchUrl', rtype: 'promise' }, { name: 'getState', rtype: 'promise' }, { name: 'getInfo', rtype: 'promise' }, { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] },
        { name: 'AppSystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }, { name: 'addListener' }, { name: 'removeListener' }] },
        { name: 'LocalNotifications', methods: ['checkPermissions', 'checkExactNotificationSetting', 'changeExactNotificationSetting'].map(name => ({ name, rtype: 'promise' })) }
      ],
      nativeCallback: (plugin: string, method: string, options: any, callback: any) => {
        if (plugin === 'App' && method === 'addListener' && options.eventName === 'appUrlOpen') runtime.qaUrlOpen = callback;
        return 'qa-' + plugin + '-' + options.eventName;
      },
      nativePromise: async (plugin: string, method: string) => {
        if (plugin === 'App' && method === 'getInfo') return { version: '1.2.28', build: '32' };
        if (plugin === 'App' && method === 'getLaunchUrl') {
          sessionStorage.setItem('qaLaunchGetterCount', String(Number(sessionStorage.getItem('qaLaunchGetterCount') || 0) + 1));
          return launch ? { url: launch } : {};
        }
        if (method === 'checkPermissions') return { display: 'prompt' };
        if (method === 'checkExactNotificationSetting') return { exact_alarm: 'denied' };
        if (method === 'changeExactNotificationSetting') runtime.qaUnexpectedAlarmRequests = (runtime.qaUnexpectedAlarmRequests || 0) + 1;
        return {};
      }
    };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  }, { launch, platform, online });
  await page.route('**/api/**', route => route.abort());
}

const warm = (page: Page, path: string) => page.evaluate(path => {
  (window as any).qaUrlOpen({ url: 'vn.quangtu.tutam://' + path });
}, path);

const notificationPrompt = (page: Page) => page.getByRole('dialog', { name: 'Thông báo tu tập', exact: true });

for (const path of ['/chinh-sach-bao-mat', '/privacy-policy']) {
  test(`native privacy has one Back and exits a first entry with retained forward history at ${path}`, async ({ page }) => {
    await nativeFixture(page, undefined, 'ios');
    await deferStartupNotification(page);
    await page.goto(path);
    await settleClient(page);
    await expect(page.locator('#app-startup')).toHaveCount(0);
    await expect(page.locator('.qts-nav .nav-back-circle-btn')).toBeVisible();
    await expect(page.locator('.privacy-container .back-btn')).toHaveCount(0);
    await page.locator('.qts-nav .nav-logo').click();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.locator('.qts-nav .nav-back-circle-btn').click();
    await expect(page).toHaveURL(/\/ca-nhan$/);
  });
}

async function deferStartupNotifications(page: Page) {
  await notificationPrompt(page).getByRole('button', { name: 'Để sau', exact: true }).click();
  await expect(notificationPrompt(page)).toHaveCount(0);
}

test('Android shows the Store update before asking for notification permission', async ({ page }) => {
  await nativeFixture(page, undefined, 'android', true);
  let versionRequests = 0;
  await page.route('**/api/app-version', route => {
    versionRequests++;
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: { nativeUpdates: { android: { version: '1.2.29', build: '33', storeUrl: STORE_URLS.android } } },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const update = page.locator('[data-native-update-prompt]');
  const permission = page.locator('.notification-modal-card');
  await expect(update).toBeVisible();
  await expect(permission).toHaveCount(0);
  await update.press('Escape');
  await expect(update).toHaveCount(0);
  await expect(permission).toBeVisible();
  expect(versionRequests).toBe(1);
});

for (const theme of ['light', 'dark'] as const) {
  test(`touch footer keeps its inactive appearance before one-tap navigation in ${theme} mode`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL, viewport: { width: 375, height: 844 }, screen: { width: 375, height: 844 },
      isMobile: true, hasTouch: true,
    });
    try {
      const page = await context.newPage();
      await nativeFixture(page, undefined, 'ios');
      await page.addInitScript(theme => localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0'), theme);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await settleClient(page);
      await expect(page.locator('#app-startup')).toHaveCount(0);
      await deferStartupNotifications(page);
      expect(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches)).toBe(true);
      const tab = page.locator('.qts-bottom-nav__item[href="/tu-tap"]');
      const icon = tab.locator('.qts-bottom-nav__icon');
      await expect(tab).toBeVisible();
      const before = await icon.evaluate(element => ({
        opacity: getComputedStyle(element).opacity,
        background: getComputedStyle(element).backgroundColor,
      }));
      const box = await tab.boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('Visible footer tab has no bounds');
      // Exercise synthetic hover as well as the actual touch; it must not consume navigation.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await expect(icon).toHaveCSS('opacity', before.opacity);
      await expect(icon).toHaveCSS('background-color', before.background);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page).toHaveURL(/\/tu-tap$/);
      await expect(page.locator('.qts-bottom-nav__item[aria-current="page"]')).toHaveAttribute('href', '/tu-tap');
    } finally { await context.close(); }
  });
}

test('content shortcuts route cold and warm launches to their matching sections', async ({ page }) => {
  await nativeFixture(page, 'vn.quangtu.tutam:///kinh-sach');
  await page.goto('/');
  await expect(page).toHaveURL('/kinh-sach');
  await warm(page, '/tu-tap');
  await expect(page).toHaveURL('/tu-tap');
  await warm(page, '/phap-thoai');
  await expect(page).toHaveURL('/phap-thoai');
});

test('iPhone Widget shortcut focuses its guide topic on cold launch and repeated use', async ({ page }) => {
  const path = '/huong-dan?phan=ung-dung#widget-man-hinh-chinh';
  await nativeFixture(page, 'vn.quangtu.tutam://' + path, 'ios');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(path);
  await expect(page.locator('#app-startup')).toHaveCount(0);
  await deferStartupNotifications(page);
  const topic = page.locator('#widget-man-hinh-chinh');
  await expect(topic).toBeFocused();

  const section = page.locator('#dung-web');
  await section.locator(':scope > summary').click();
  await expect(section).not.toHaveAttribute('open', '');
  await warm(page, path);
  await expect(topic).toBeFocused();

  await warm(page, '/huong-dan?phan=ung-dung');
  await expect(page).toHaveURL('/huong-dan?phan=ung-dung');
  await topic.evaluate(element => element.blur());
  await expect(topic).not.toBeFocused();
  await warm(page, path);
  await expect(topic).toBeFocused();
});

test('retained native launch URL does not replay after a full document navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await nativeFixture(page, 'vn.quangtu.tutam:///tu-tap?action=rosary');
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true });
  await expect(start).toBeVisible();
  await page.getByRole('button', { name: 'Chưa vội', exact: true }).click();
  await expect(start).toHaveCount(0);
  // A real new document preserves the WebView browsing session, as in the native failure.
  await page.goto('/ca-nhan');
  await settleClient(page);
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem('qaLaunchGetterCount')))).toBe(2);
  await expect(page.getByRole('button', { name: /Cài đặt ứng dụng/ })).toBeVisible();
  await expect(page).toHaveURL(/\/ca-nhan$/);
  await expect(start).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).qaUnexpectedAlarmRequests || 0)).toBe(0);
  await warm(page, '/tu-tap?action=rosary');
  await expect(start).toBeVisible();
});

test('warm native article intent opens an existing practice catalog and respects an active rosary', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await nativeFixture(page);
  await page.goto('/tu-tap');
  await settleClient(page);
  await expect.poll(() => page.evaluate(() => typeof (window as any).qaUrlOpen)).toBe('function');
  await warm(page, '/tu-tap?article=tt_1780910773084');
  const preview = page.locator('.tt-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('KINH ĐỊA TẠNG');
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/article=/);
  await warm(page, '/tu-tap?article=tt_1780910773084&chap=3');
  await expect(preview.locator('.reader-content')).not.toBeEmpty();
  await expect(preview.locator('.tt-reader-chapter-title')).toContainText('PHẨM 3:');
  await warm(page, '/tu-tap?article=tt_1780910773084&chap=0');
  await expect(preview.locator('.tt-reader-chapter-title')).toContainText('LỜI NGUYỆN');
  await warm(page, '/tu-tap?article=tt_1780910773084&chap=3');
  await expect(preview.locator('.tt-reader-chapter-title')).toContainText('PHẨM 3:');
  await warm(page, '/tu-tap?article=tt_1780910773084');
  await expect(preview.locator('.reader-content')).toHaveCount(0);
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await warm(page, '/tu-tap?action=rosary');
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  const rosary = page.locator('.tt-rosary');
  await rosary.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(rosary.locator('.tt-rosary__cycle')).toContainText('1/108');
  await warm(page, '/tu-tap?article=tt_1780910773084');
  await expect(rosary).toBeVisible();
  await expect(rosary.locator('.tt-rosary__cycle')).toContainText('1/108');
  await expect(preview).toHaveCount(0);
});

test('native landscape footer spans the viewport when screen.width remains portrait-sized', async ({ page }, info) => {
  await nativeFixture(page);
  await page.addInitScript(() => Object.defineProperty(screen, 'width', { configurable: true, get: () => 402 }));
  await page.setViewportSize({ width: 874, height: 402 });
  await page.goto('/ca-nhan');
  await settleClient(page);
  const nav = page.getByRole('navigation', { name: 'Điều hướng nhanh', exact: true });
  await expect(nav).toBeVisible();
  const geometry = await nav.evaluate(n => ({ width: n.getBoundingClientRect().width, viewport: innerWidth, narrow: document.documentElement.dataset.narrowScreen }));
  expect(geometry.narrow).toBeUndefined();
  expect(Math.abs(geometry.width - geometry.viewport)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('native-landscape-footer.png') });
});


test('mobile static startup has no unhandled navigation error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await nativeFixture(page);
  await page.goto('/');
  await settleClient(page);
  await expect(page.getByRole('navigation', { name: 'Điều hướng nhanh', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});


test('anonymous local practice does not show an authentication failure or send writes', async ({ page }) => {
  const key = 'quangtu_principal_v1:anonymous:quangtu_practice_session_outbox_v1';
  await nativeFixture(page);
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify([{
    id: 'start:qa-local', kind: 'start', clientSessionId: 'qa-local', queuedAt: new Date().toISOString(),
    payload: { clientSessionId: 'qa-local', activityType: 'meditation', targetDurationSeconds: 60,
      targetCount: null, sourceKind: null, sourceId: null, startedAt: new Date().toISOString(), idempotencyKey: 'qa-local' }
  }])), key);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/practice/')) writes.push(request.url()); });
  await page.goto('/tu-tap');
  await settleClient(page);
  await expect(page.locator('[data-practice-sync-status]')).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]')[0]?.clientSessionId, key)).toBe('qa-local');
  expect(writes).toEqual([]);
});


for (const [chapter, title] of [[0, 'LỜI NGUYỆN'], [3, 'PHẨM 3:']] as const) {
  test(`cold native article link opens exact chapter ${chapter}`, async ({ page }) => {
    await nativeFixture(page);
    await page.goto(`/tu-tap?article=tt_1780910773084&chap=${chapter}`);
    await settleClient(page);
    await expect(page.locator('.tt-preview .tt-reader-chapter-title')).toContainText(title);
    await expect(page.locator('.tt-preview .reader-content')).not.toBeEmpty();
  });
}


test('a warm chapter intent supersedes an unfinished cold article restoration', async ({ page }) => {
  await nativeFixture(page);
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const firstHeld = new Promise<void>(resolve => { releaseFirst = resolve; });
  const started = new Promise<void>(resolve => { firstStarted = resolve; });
  let requests = 0;
  const chapterPath = '/offline-data/chapters/tt_1780910773084.json';
  await page.route(`**${chapterPath}`, async route => {
    if (++requests === 1) {
      firstStarted();
      await firstHeld;
    }
    await route.continue();
  });
  try {
    await page.goto('/tu-tap?article=tt_1780910773084&chap=0');
    await started;
    await expect.poll(() => page.evaluate(() => typeof (window as any).qaUrlOpen)).toBe('function');
    await warm(page, '/tu-tap?article=tt_1780910773084&chap=3');
    const chapter = page.locator('.tt-preview .tt-reader-chapter-title');
    await expect(page).toHaveURL(/chap=3/);
    // Both intents share the existing equivalent metadata GET. The latest intent
    // must win after that response arrives, rather than bypassing its coalescing.
    const metadataResponse = page.waitForResponse(response => new URL(response.url()).pathname === chapterPath);
    releaseFirst();
    await (await metadataResponse).finished();
    await expect(chapter).toContainText('PHẨM 3:');
    await settleClient(page);
    await expect(chapter).toContainText('PHẨM 3:');
    await expect(page).toHaveURL(/chap=3/);
    expect(requests).toBe(1);
  } finally {
    releaseFirst();
  }
});


test('closing a cold home reader restores the guest banner without reloading or clearing user data', async ({ page }) => {
  await nativeFixture(page);
  await page.addInitScript(() => localStorage.setItem('qa-reader-data-sentinel', 'keep'));
  await page.goto('/?article=tt_1781528855960&chap=1');
  const reader = page.locator('.reader-modal');
  const banner = page.locator('.qt-home-login-notice [data-guest-notice-banner]');
  await expect(reader).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  // A reader kept open through the startup permission check suppresses that prompt.
  await expect(banner.or(notificationPrompt(page))).toBeVisible();
  if (await notificationPrompt(page).isVisible()) await deferStartupNotifications(page);
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => window.history.state.articleId)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('qa-reader-data-sentinel'))).toBe('keep');
});

test('warm home reader close and shallow book Back Forward keep the guest banner in sync', async ({ page }) => {
  await nativeFixture(page);
  await page.goto('/');
  await settleClient(page);
  const reader = page.locator('.reader-modal');
  const banner = page.locator('.qt-home-login-notice [data-guest-notice-banner]');
  await deferStartupNotifications(page);
  await expect(banner).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as any).qaUrlOpen)).toBe('function');
  await warm(page, '/?article=tt_1781528855960&chap=1');
  await expect(reader).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => window.history.state.articleId)).toBeNull();

  // The real home book card creates a shallow history entry, unlike a native goto.
  const portals = page.locator('.core-practice-portals');
  await portals.getByRole('button', { name: 'Kinh sách', exact: true }).click();
  const book = portals.locator('.portal-card').first();
  const href = await book.getAttribute('href');
  const bookId = new URL(href!, 'https://quangtu.vn').searchParams.get('book');
  expect(bookId).toBeTruthy();
  await book.click();
  await expect(reader).toBeVisible();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => window.history.state.articleId)).toBe(bookId);
  await page.goBack();
  await expect(reader).toHaveCount(0);
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => window.history.state.articleId)).toBeNull();
  await page.goForward();
  await expect(reader).toBeVisible();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => window.history.state.articleId)).toBe(bookId);
});


test('a rejected native tool intent preserves the active practice URL and opens after normal exit', async ({ page }) => {
  await nativeFixture(page);
  await page.goto('/tu-tap');
  await settleClient(page);
  await expect.poll(() => page.evaluate(() => typeof (window as any).qaUrlOpen)).toBe('function');
  await warm(page, '/tu-tap?article=tt_1780910773084&chap=3');
  const preview = page.locator('.tt-preview');
  await expect(preview.locator('.tt-reader-chapter-title')).toContainText('PHẨM 3:');
  await preview.locator('.tt-reader-practice-btn').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  const practice = page.locator('.tt-practice');
  await expect(practice).toBeVisible();
  await expect(practice.locator('.ttp-art-title')).toContainText('PHẨM 3:');
  const practiceUrl = page.url();
  const badge = await practice.locator('.ttp-header-badge').textContent();
  const historyBefore = await page.evaluate(() => JSON.stringify(window.history.state));
  await expect.poll(() => page.evaluate(() => typeof (window as any).qaUrlOpen)).toBe('function');
  await warm(page, '/tu-tap?mode=rosary');
  await settleClient(page);
  await expect(page).toHaveURL(practiceUrl);
  await expect(practice).toBeVisible();
  await expect(practice.locator('.ttp-art-title')).toContainText('PHẨM 3:');
  expect(await practice.locator('.ttp-header-badge').textContent()).toBe(badge);
  expect(await page.evaluate(() => JSON.stringify(window.history.state))).toBe(historyBefore);
  await expect(page.locator('.tt-rosary')).toHaveCount(0);

  await practice.locator('.ttp-back').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hồi hướng & Thoát', exact: true }).click();
  await expect(practice).toHaveCount(0);
  await expect(preview).toBeVisible();
  await preview.locator('.tt-reader-back-btn').click();
  await expect(preview).toHaveCount(0);
  await expect(page).toHaveURL(/\/tu-tap$/);
  await expect(page.locator('.tt-mode-card--chuoi')).toBeVisible();
  await warm(page, '/tu-tap?mode=rosary');
  await expect(page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/action=rosary/);
});


test('fresh iOS guest home banner opens the real account provider controls', async ({ page }) => {
  await nativeFixture(page, undefined, 'ios');
  await page.addInitScript(() => {
    const runtime = window as any;
    runtime.qaHomeGuestStates = [];
    runtime.webkit = { messageHandlers: { tutamQAEvents: { postMessage: (body: string) => {
      const state = JSON.parse(body);
      if (state.type !== 'home-guest-notice-state') return;
      runtime.qaHomeGuestStates.push({
        isHome: state.isHome === true,
        authenticated: state.authenticated === true,
        isReadingArticle: state.isReadingArticle === true,
        hasArticleState: state.hasArticleState === true,
        articleStateActive: state.articleStateActive === true,
        hasArticleQuery: state.hasArticleQuery === true,
      });
    } } } };
  });
  await page.goto('/');
  const banner = page.locator('.qt-home-login-notice [data-guest-notice-banner]');
  const login = banner.getByRole('button', { name: 'Đăng nhập ngay', exact: true });
  await expect(notificationPrompt(page)).toBeVisible();
  await expect(banner).toHaveCount(0);
  await deferStartupNotifications(page);
  await expect(login).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).qaHomeGuestStates)).toContainEqual({
    isHome: true, authenticated: false, isReadingArticle: false,
    hasArticleState: false, articleStateActive: false, hasArticleQuery: false,
  });
  await login.click();
  await expect(page).toHaveURL(/\/ca-nhan\?tab=account$/);
  for (const provider of ['Google', 'Apple']) {
    const button = page.getByRole('button', { name: `Đăng nhập bằng ${provider}`, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  }
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Facebook', exact: true })).toHaveCount(0);
  const header = page.getByRole('navigation', { name: 'Tu Tập Phật Pháp', exact: true });
  await header.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true })).toHaveCount(0);
  const footer = page.getByRole('navigation', { name: 'Điều hướng nhanh', exact: true });
  await footer.getByRole('link', { name: 'Cá nhân', exact: true }).click();
  await expect(page.getByRole('button', { name: /Cài đặt ứng dụng/ })).toBeVisible();
});
