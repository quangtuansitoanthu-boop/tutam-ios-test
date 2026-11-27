import { expect, test } from '@playwright/test';
import { deferStartupNotification, openReaderTools, settleClient } from './runtime-helpers';

test.beforeEach(async ({ page }) => deferStartupNotification(page));

for (const platform of ['android', 'ios']) for (const width of [375, 1440]) {
  test(`reader paper reaches the ${platform} bridge at ${width}px and restores the app surface`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 850 : 1000 });
    await page.addInitScript(platform => {
      localStorage.setItem('tutam_locale', 'vi');
      if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', '0');
      const runtime = window as any;
      runtime.barCalls = [];
      runtime.CapacitorCustomPlatform = { name: platform };
      runtime.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => platform,
        Plugins: {},
        PluginHeaders: [
          { name: 'AppSystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }] },
          { name: 'StatusBar', methods: ['setStyle', 'setBackgroundColor'].map(name => ({ name, rtype: 'promise' })) }
        ],
        nativePromise: async (plugin: string, method: string, options: unknown) => {
          if (plugin === 'AppSystemBars' && method === 'setStyle') runtime.barCalls.push(options);
          return {};
        }
      };
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }, platform);
    const requests: string[] = [];
    await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/?article=tt_1781528855960&chap=1');
    await settleClient(page);
    const reader = page.locator('.reader-modal');
    await expect(reader).toBeVisible();
    if (width === 375) await expect(reader.getByRole('button', { name: 'Công cụ', exact: true })).toBeVisible();
    const baselineRequests = requests.length;
    await openReaderTools(page);
    for (const [paper, color, dark] of [
      ['white', '#ffffff', false], ['cream', '#f4ecd8', false],
      ['gray', '#e8e8e8', false]
    ] as const) {
      await page.locator(`.background-options .swatch.${paper}`).click();
      await expect(reader).toHaveClass(new RegExp(`bg-${paper}`));
      await expect(page.locator('html')).toHaveAttribute('data-app-palette', paper);
      await expect.poll(() => page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key))))
        .toEqual([paper, paper, paper, paper]);
      await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
        .toEqual({ dark, backgroundColor: color });
    }
    const closeTools = page.getByRole('button', { name: 'Đóng công cụ', exact: true });
    if (await closeTools.isVisible()) await closeTools.click();
    await reader.locator('.reader-back').click();
    await expect(reader.locator('.toc')).toBeVisible();
    await reader.locator('.reader-back').click();
    await expect(reader).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)?.backgroundColor))
      .toBe('#e8e8e8');
    await page.goto('/tu-tap?article=tt_1780910773084');
    const preview = page.locator('.tt-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-read-bg', 'gray');
    await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
      .toEqual({ dark: false, backgroundColor: '#e8e8e8' });
    // Await the mounted mobile sheet trigger before reading its state; an
    // immediate isVisible() probe can race the new chapter's toolbar mount.
    async function choosePreviewPaper(paper: 'gray' | 'dark' | 'auto') {
      await preview.locator('.tt-preview__toc-list > button').first().click();
      await expect(preview.locator('.tt-reader-back-btn')).toBeVisible();
      const toggle = preview.getByRole('button', { name: 'Công cụ', exact: true });
      if (width === 375) {
        await expect(toggle).toBeVisible();
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      }
      const swatch = preview.locator(`.background-options .swatch.${paper}`);
      await expect(swatch).toBeVisible();
      await swatch.click();
      await expect(preview).toHaveAttribute('data-read-bg', paper === 'auto' ? 'cream' : paper);
      if (width === 375) {
        const close = preview.getByRole('button', { name: 'Đóng công cụ', exact: true });
        await expect(close).toBeVisible();
        await close.click();
        await expect(preview.locator('.reader-tools-backdrop')).toHaveCount(0);
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      }
      await preview.locator('.tt-reader-back-btn').click();
    }
    await choosePreviewPaper('gray');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'gray');
    await page.locator('.qts-nav .nav-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(preview).toHaveAttribute('data-read-bg', 'dark');
    await expect(preview).toHaveCSS('background-color', 'rgb(21, 18, 13)');
    await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
      .toEqual({ dark: true, backgroundColor: '#15120d' });
    await choosePreviewPaper('gray');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'gray');
    await choosePreviewPaper('dark');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'dark');
    await choosePreviewPaper('auto');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'cream');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(preview).toHaveAttribute('data-read-bg', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'dark');
    await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
      .toEqual({ dark: true, backgroundColor: '#15120d' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(preview).toHaveAttribute('data-read-bg', 'cream');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'cream');
    await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
      .toEqual({ dark: false, backgroundColor: '#f4ecd8' });
    expect(await page.evaluate(() => localStorage.getItem('tutam_dark_mode'))).toBe('auto');
    await expect.poll(() => page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key))))
      .toEqual(['cream', 'cream', 'cream', 'cream']);
    expect(requests).toHaveLength(baselineRequests);
    await page.locator('.qts-nav .nav-back-circle-btn').click();
    await expect(preview).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
      .toEqual({ dark: false, backgroundColor: '#faf6ee' });
  });
}

for (const platform of ['android', 'ios']) {
  test(`six app palettes persist, follow Auto and update the ${platform} bars without API calls`, async ({ page }, info) => {
    // Exercise both viewports and cold-start persistence across three navigations.
    test.slow();
    await page.addInitScript(platform => {
      localStorage.setItem('tutam_locale', 'vi');
      if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', '0');
      const runtime = window as any;
      runtime.barCalls = [];
      runtime.CapacitorCustomPlatform = { name: platform };
      runtime.Capacitor = {
        isNativePlatform: () => true, getPlatform: () => platform, Plugins: {},
        PluginHeaders: [
          { name: 'AppSystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }] },
          { name: 'StatusBar', methods: ['setStyle', 'setBackgroundColor'].map(name => ({ name, rtype: 'promise' })) },
        ],
        nativePromise: async (plugin: string, method: string, options: unknown) => {
          if (plugin === 'AppSystemBars' && method === 'setStyle') runtime.barCalls.push(options);
          return {};
        },
      };
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }, platform);
    const requests: string[] = [];
    await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/ca-nhan?tab=settings');
    await settleClient(page);
    await page.locator('#settings-display > summary').click();
    const group = page.getByRole('group', { name: 'Giao diện ứng dụng', exact: true });
    await expect(group.getByRole('button')).toHaveText(['Tự động', 'Trắng', 'Be nhạt', 'Xám', 'Tím nhạt', 'Tối'].map(label => new RegExp(label)));
    await expect(group.getByRole('button', { name: 'Trắng', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const baselineRequests = requests.length;
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const boxes = await group.getByRole('button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }));
      expect(boxes[0].y).toBe(boxes[1].y);
      expect(boxes[2].y).toBe(boxes[3].y);
      expect(boxes[4].y).toBe(boxes[5].y);
      expect(boxes[0].y).toBeLessThan(boxes[2].y);
      expect(boxes[2].y).toBeLessThan(boxes[4].y);
      expect(boxes[0].x).toBe(boxes[2].x);
      for (const box of boxes) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
      for (const [label, palette, color, ink] of [
        ['Trắng', 'white', 'rgb(255, 255, 255)', 'rgb(28, 26, 21)'], ['Be nhạt', 'cream', 'rgb(250, 246, 238)', 'rgb(58, 46, 26)'],
        ['Xám', 'gray', 'rgb(232, 232, 232)', 'rgb(42, 42, 42)'], ['Tím nhạt', 'purple', 'rgb(238, 230, 250)', 'rgb(89, 65, 116)'],
      ]) {
        await group.getByRole('button', { name: label, exact: true }).click();
        await expect(group.getByRole('button', { name: label, exact: true })).toHaveCSS('color', ink);
        await expect(group.getByRole('button', { name: label, exact: true }).locator('.cn-app-theme-check')).toHaveCSS('color', ink);
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await expect(page.locator('html')).toHaveAttribute('data-app-palette', palette);
        await expect.poll(() => page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key))))
          .toEqual([palette, palette, palette, palette]);
        expect(await page.evaluate(() => localStorage.getItem('tt_light_bg'))).toBe(palette);
        await expect(page.locator('html')).toHaveCSS('background-color', color);
        await expect(page.locator('.qts-bottom-nav')).toHaveCSS('background-color', color);
        await expect.poll(() => page.evaluate(() => {
          const call = (window as any).barCalls.at(-1);
          if (!call) return '';
          const probe = document.createElement('span'); probe.style.color = call.backgroundColor;
          document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color;
        })).toBe(color);
      }
      await page.screenshot({ path: info.outputPath(`app-palette-purple-${platform}-${width}.png`) });
    }
    expect(requests).toHaveLength(baselineRequests);
    await page.reload();
    await settleClient(page);
    await page.locator('#settings-display > summary').click();
    await expect(group.getByRole('button', { name: 'Tím nhạt', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'purple');
    expect(await page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key)))).toEqual(['purple', 'purple', 'purple', 'purple']);
    await group.getByRole('button', { name: 'Tối', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('tutam_dark_mode'))).toBe('1');
    expect(await page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key)))).toEqual(['dark', 'dark', 'dark', 'dark']);
    await page.reload();
    await settleClient(page);
    await page.locator('#settings-display > summary').click();
    await expect(group.getByRole('button', { name: 'Tối', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await group.getByRole('button', { name: 'Tự động', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'dark');
    await expect.poll(() => page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key))))
      .toEqual(['dark', 'dark', 'dark', 'dark']);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'cream');
    expect(await page.evaluate(() => localStorage.getItem('tutam_dark_mode'))).toBe('auto');
    await expect.poll(() => page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key))))
      .toEqual(['cream', 'cream', 'cream', 'cream']);
    await page.getByRole('button', { name: '🇬🇧 English', exact: true }).click();
    const english = page.getByRole('group', { name: 'App Theme', exact: true });
    await expect(english.getByRole('button')).toHaveText(['Auto', 'White', 'Cream', 'Gray', 'Light purple', 'Dark'].map(label => new RegExp(label)));
    await english.getByRole('button', { name: 'Light purple', exact: true }).click();
    await page.goto('/tu-tap/chep-kinh');
    await settleClient(page);
    await expect(page.locator('.qts-nav')).toHaveCSS('background-color', 'rgb(238, 230, 250)');
    await expect(page.locator('.qts-nav .nav-back-circle-btn')).toHaveCSS('color', 'rgb(89, 65, 116)');
    await expect(page.locator('.qts-nav .nav-theme-btn')).toHaveCSS('color', 'rgb(89, 65, 116)');
    expect(requests).toHaveLength(baselineRequests);
  });
}


test('a denied storage getter still permits live palette and native bar changes', async ({ page }) => {
    await page.addInitScript(platform => {
      localStorage.setItem('tutam_locale', 'vi');
      if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', '0');
      const runtime = window as any;
      runtime.barCalls = [];
      runtime.CapacitorCustomPlatform = { name: platform };
      runtime.Capacitor = {
        isNativePlatform: () => true, getPlatform: () => platform, Plugins: {},
        PluginHeaders: [
          { name: 'AppSystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }] },
          { name: 'StatusBar', methods: ['setStyle', 'setBackgroundColor'].map(name => ({ name, rtype: 'promise' })) },
        ],
        nativePromise: async (plugin: string, method: string, options: unknown) => {
          if (plugin === 'AppSystemBars' && method === 'setStyle') runtime.barCalls.push(options);
          return {};
        },
      };
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }, 'android');
  const requests: string[] = [];
  await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  const group = page.getByRole('group', { name: 'Giao diện ứng dụng', exact: true });
  await expect(group.getByRole('button', { name: 'Trắng', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const baselineRequests = requests.length;
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  // Isolate a mid-session persistence denial; startup has already completed.
  await page.evaluate(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage access denied by test', 'SecurityError'); },
    });
  });
  await group.getByRole('button', { name: 'Tím nhạt', exact: true }).click();
  await expect(group.getByRole('button', { name: 'Tím nhạt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'purple');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(238, 230, 250)');
  await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
    .toEqual({ dark: false, backgroundColor: '#eee6fa' });
  expect(requests).toHaveLength(baselineRequests);
  expect(pageErrors).toEqual([]);
});


test('Android Auto follows native configuration when WebView media queries lag', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', 'auto');
    const runtime = window as any;
    runtime.barCalls = [];
    runtime.appearanceListener = undefined;
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {},
      PluginHeaders: [{ name: 'AppSystemBars', methods: [
        { name: 'setStyle', rtype: 'promise' },
        { name: 'getAppearance', rtype: 'promise' },
        { name: 'addListener', rtype: 'callback' },
        { name: 'removeListener', rtype: 'promise' },
      ] }],
      nativePromise: async (plugin: string, method: string, options: unknown) => {
        if (plugin === 'AppSystemBars' && method === 'getAppearance') return { dark: true };
        if (plugin === 'AppSystemBars' && method === 'setStyle') runtime.barCalls.push(options);
        return {};
      },
      // Capacitor 7 addListener passes { eventName } and resolves a callback ID.
      nativeCallback: (plugin: string, method: string, options: { eventName?: string }, callback: (value: { dark: boolean }) => void) => {
        if (plugin === 'AppSystemBars' && method === 'addListener' && options.eventName === 'appearanceChanged') {
          runtime.appearanceListener = callback;
          return 'qa-native-appearance';
        }
        throw new Error(`Unexpected native callback: ${plugin}.${method}`);
      },
    };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  const requests: string[] = [];
  await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  const group = page.getByRole('group', { name: 'Giao diện ứng dụng', exact: true });
  await expect(group.getByRole('button', { name: 'Tự động', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false);
  const baselineRequests = requests.length;
  async function expectAppearance(paper: 'dark' | 'cream' | 'purple', color: string) {
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', paper);
    await expect.poll(() => page.evaluate(() => ['tutam_read_bg', 'tutam_read_bg_dark', 'tt_bg', 'tt_practice_bg'].map(key => localStorage.getItem(key))))
      .toEqual([paper, paper, paper, paper]);
    await expect.poll(() => page.evaluate(() => (window as any).barCalls.at(-1)))
      .toEqual({ dark: paper === 'dark', backgroundColor: color });
  }
  await expectAppearance('dark', '#15120d');
  await page.evaluate(() => (window as any).appearanceListener({ dark: false }));
  await expectAppearance('cream', '#faf6ee');
  // A later contradictory WebView media event must not replace valid native OS state.
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  await expectAppearance('cream', '#faf6ee');
  await group.getByRole('button', { name: 'Tím nhạt', exact: true }).click();
  await expectAppearance('purple', '#eee6fa');
  await page.evaluate(() => (window as any).appearanceListener({ dark: true }));
  await expectAppearance('purple', '#eee6fa');
  await expect(group.getByRole('button', { name: 'Tím nhạt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('tutam_dark_mode'))).toBe('0');
  expect(requests).toHaveLength(baselineRequests);
});
