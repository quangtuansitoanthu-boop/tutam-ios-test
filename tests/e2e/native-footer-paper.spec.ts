import { expect, test, type Locator, type Page } from '@playwright/test';
import { deferStartupNotification, settleClient as settleWebClient } from './runtime-helpers';

test.beforeEach(async ({ page }) => { await deferStartupNotification(page); });

async function verifyReadingToolbar(page: Page, reader: Locator, background: string): Promise<void> {
  await reader.getByRole('button', { name: 'Đóng công cụ', exact: true }).click();
  const toggle = reader.getByRole('button', { name: 'Công cụ', exact: true });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveCSS('background-color', background);
  await page.setViewportSize({ width: 1024, height: 814 });
  const toolbar = reader.locator('.reader-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveCSS('background-color', background);
  await page.setViewportSize({ width: 375, height: 814 });
}

// Apply the native CSS fixture after the web document's bootstrap has settled.
async function settleClient(page: Page): Promise<void> {
  await settleWebClient(page);
  await page.locator('html').evaluate(element => { element.dataset.nativeApp = 'true'; });
}

async function useBundledBooks(page: Page): Promise<void> {
  // These two books are shipped with the app and are absent from the local web database.
  await page.addInitScript(() => {
    Object.assign(window, {
      CapacitorCustomPlatform: { name: 'android' },
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} },
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    localStorage.setItem('tutam_locale', 'vi');
  });
  await page.route('**/api/**', route => route.abort());
}

for (const [paper, theme, background, ink] of [
  ['white', '1', 'rgb(255, 255, 255)', 'rgb(28, 26, 21)'],
  ['cream', '1', 'rgb(250, 246, 238)', 'rgb(58, 46, 26)'],
  ['gray', '1', 'rgb(232, 232, 232)', 'rgb(42, 42, 42)'],
  ['dark', '0', 'rgb(21, 18, 13)', 'rgb(237, 232, 223)'],
  ['purple', '1', 'rgb(238, 230, 250)', 'rgb(89, 65, 116)'],
]) {
  test(`tab bar follows ${paper} paper against the opposite app theme and restores on exit`, async ({ page, browser, baseURL }) => {
    await page.setViewportSize({ width: 375, height: 814 });
    await page.addInitScript(value => { if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', value); }, theme);
    await page.goto('/tu-tap');
    await settleClient(page);
    const footer = page.locator('.qts-bottom-nav');
    await expect(footer).toBeVisible();
    const before = await footer.evaluate(element => {
      const style = getComputedStyle(element);
      const active = element.querySelector('[aria-current="page"]')!;
      return { background: style.backgroundColor, active: getComputedStyle(active).color };
    });
    // Isolate the real shell stylesheet against the same surface lifecycle as PracticeSession.
    await page.evaluate(paper => {
      const surface = document.createElement('section');
      surface.className = 'tt-practice'; surface.dataset.bg = paper;
      surface.dataset.footerPaperFixture = ''; document.body.append(surface);
    }, paper);
    await expect(footer).toHaveCSS('background-color', background);
    await expect(footer.locator('.qts-bottom-nav__item').first()).toHaveCSS('color', ink);
    await expect(footer.locator('[aria-current="page"]')).toHaveCSS('color', ink);
    const active = footer.locator('[aria-current="page"]');
    const palette = await active.evaluate((active, dark) => {
      const style = getComputedStyle(active);
      const probe = document.createElement('span');
      probe.style.color = style.getPropertyValue(dark ? '--tab-color-dark' : '--tab-color');
      probe.style.backgroundColor = style.getPropertyValue(dark ? '--tab-bg-dark' : '--tab-bg');
      active.append(probe);
      const expected = getComputedStyle(probe);
      const result = { icon: expected.color, pill: expected.backgroundColor };
      probe.remove(); return result;
    }, paper === 'dark');
    const icon = active.locator('.qts-bottom-nav__icon');
    await expect(icon).toHaveCSS('color', palette.icon);
    await expect(icon).toHaveCSS('background-color', palette.pill);
    await page.locator('[data-footer-paper-fixture]').evaluate(element => element.remove());
    await expect(footer).toHaveCSS('background-color', before.background);
    await expect(footer.locator('[aria-current="page"]')).toHaveCSS('color', before.active);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === '1' ? 'dark' : 'light');
    // A desktop needs a desktop screen too; widening a phone viewport intentionally keeps its navigation.
    const desktop = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
    try {
      const desktopPage = await desktop.newPage();
      await desktopPage.goto('/tu-tap');
      await settleWebClient(desktopPage);
      await expect(desktopPage.locator('html')).not.toHaveAttribute('data-native-app', 'true');
      await expect(desktopPage.locator('html')).not.toHaveAttribute('data-narrow-screen', 'true');
      await expect(desktopPage.locator('.qts-bottom-nav')).toBeHidden();
    } finally { await desktop.close(); }
  });
}


for (const [theme, swatch, paper, background, ink] of [
  ['1', 0, 'white', 'rgb(255, 255, 255)', 'rgb(28, 26, 21)'],
  ['1', 1, 'cream', 'rgb(250, 246, 238)', 'rgb(58, 46, 26)'],
  ['1', 2, 'gray', 'rgb(232, 232, 232)', 'rgb(42, 42, 42)'],
  ['0', 3, 'dark', 'rgb(21, 18, 13)', 'rgb(237, 232, 223)'],
  ['1', 4, 'purple', 'rgb(238, 230, 250)', 'rgb(89, 65, 116)'],
] as const) {
  test(`actual practice header and toolbar follow ${paper} alongside footer`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 814 });
    await page.addInitScript(value => {
      if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', value); localStorage.setItem('tutam_locale', 'vi');
    }, theme);
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/tu-tap?article=tt_1780910773084');
    await settleClient(page);
    await page.locator('.tt-preview__toc-list > button').first().click();
    await page.locator('.tt-reader-practice-btn').click();
    await page.locator('.practice-confirm__primary').click();
    const session = page.locator('.tt-practice');
    const settings = session.getByRole('button', { name: 'Tùy chỉnh', exact: true });
    await settings.click();
    const dialog = page.getByRole('dialog').filter({ has: page.locator('.ttp-sheet-settings') });
    const selected = dialog.locator('.ttp-bg-swatch').nth(swatch + 1);
    await selected.click();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(session).toHaveAttribute('data-bg', paper);
    for (const selector of ['.ttp-header', '.ttp-reader-bar']) {
      await expect(session.locator(selector)).toHaveCSS('background-color', background);
    }
    await expect(session.locator('.ttp-header-title')).toHaveCSS('color', ink);
    await expect(settings).toBeVisible();
    // The mobile settings action uses the paper's on-gold foreground.
    const settingsInk = paper === 'cream' || paper === 'dark' ? 'rgb(36, 24, 12)' : 'rgb(255, 255, 255)';
    await expect(settings).toHaveCSS('color', settingsInk);
    await expect(page.locator('.qts-bottom-nav')).toHaveCSS('background-color', background);
    await expect(page.locator('html')).toHaveAttribute('data-theme', paper === 'dark' ? 'dark' : 'light');
    await page.setViewportSize({ width: 1024, height: 814 });
    const desktopLabel = session.locator('.ttp-rbar-label').first();
    const desktopSpeed = session.locator('.ttp-reader-bar select').first();
    await expect(desktopLabel).toBeVisible();
    await expect(desktopLabel).toHaveCSS('color', ink);
    await expect(desktopSpeed).toBeVisible();
    await expect(desktopSpeed).toHaveCSS('color', ink);
  });
}


for (const [paper, theme, background] of [
  ['white', '1', 'rgb(255, 255, 255)'],
  ['cream', '1', 'rgb(244, 236, 216)'],
  ['gray', '1', 'rgb(232, 232, 232)'],
  ['dark', '0', 'rgb(21, 18, 13)'],
  ['purple', '1', 'rgb(238, 230, 250)'],
] as const) {
  test(`scripture preview ${paper} paper owns header, toolbar and footer and synchronizes the app theme`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 814 });
    await page.addInitScript(value => {
      if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', value); localStorage.setItem('tutam_locale', 'vi');
    }, theme);
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/tu-tap?article=tt_1780910773084');
    await settleClient(page);
    await page.locator('.tt-preview__toc-list > button').first().click();
    const preview = page.locator('.tt-preview');
    const swatch = preview.locator(`.reader-toolbar .swatch.${paper}`);
    if (!await swatch.isVisible()) await preview.getByRole('button', { name: 'Công cụ', exact: true }).click();
    await swatch.click();
    await expect(swatch).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('data-read-bg', paper);
    await expect(preview.locator('.reader-scroll')).toHaveCSS('background-color', background);
    for (const selector of ['.tt-reader-top-bar', '.chapter-nav']) {
      await expect(preview.locator(selector)).toHaveCSS('background-color', background);
    }
    await verifyReadingToolbar(page, preview, background);
    await expect(page.locator('.qts-bottom-nav')).toHaveCSS('background-color', background);
    await expect(page.locator('html')).toHaveAttribute('data-theme', paper === 'dark' ? 'dark' : 'light');
    await preview.locator('.tt-reader-back-btn').click();
    await expect(preview).toHaveAttribute('data-read-bg', paper);
    await expect(page.getByRole('navigation', { name: 'Tu Tập Phật Pháp', exact: true })).toHaveCSS('background-color', background);
    if (paper === 'white' || paper === 'gray' || paper === 'purple') {
      await expect(preview.locator('.tt-preview__toc')).toHaveCSS('background-color', background);
    }
    await page.reload(); await settleClient(page);
    await expect(page.locator('.tt-preview')).toHaveAttribute('data-read-bg', paper);
  });
}


for (const [theme, paper, color] of [
  ['1', 'white', 'rgb(255, 255, 255)'],
  ['1', 'cream', 'rgb(244, 236, 216)'],
  ['1', 'gray', 'rgb(232, 232, 232)'],
  ['0', 'dark', 'rgb(21, 18, 13)'],
  ['1', 'purple', 'rgb(238, 230, 250)'],
] as const) {
  test(`normal book ${paper} paper persists and synchronizes the app theme ${theme}`, async ({ page }) => {
    await useBundledBooks(page);
    await page.setViewportSize({ width: 375, height: 814 });
    await page.addInitScript(value => { if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', value); }, theme);
    await page.goto('/?article=tt_1781528855960'); await settleClient(page);
    const reader = page.locator('.reader-modal');
    const toc = reader.locator('.toc-item');
    if (await toc.count()) await toc.first().click();
    const purple = reader.locator(`.reader-toolbar .swatch.${paper}`);
    if (!await purple.isVisible()) await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
    await purple.click();
    await expect(purple).toHaveAttribute('aria-pressed', 'true');
    await expect(reader).toHaveClass(new RegExp(`bg-${paper}`));
    await expect(reader).toHaveCSS('background-color', color);
    await expect(reader.locator('.reader-top-bar')).toHaveCSS('background-color', color);
    await verifyReadingToolbar(page, reader, color);
    await expect(page.locator('.qts-bottom-nav')).toHaveCSS('background-color', color);
    expect(await page.evaluate(() => [localStorage.getItem('tutam_read_bg'), localStorage.getItem('tutam_read_bg_dark')])).toEqual([paper, paper]);
    await page.reload(); await settleClient(page);
    await expect(page.locator('.reader-modal')).toHaveClass(new RegExp(`bg-${paper}`));
    await page.goto('/?article=tt_1781528773286'); await settleClient(page);
    await expect(reader.locator('.toc-item')).toHaveCount(58);
    await expect(reader.locator('.toc-search-input')).toHaveCSS('background-color', color);
    if (paper === 'white' || paper === 'gray') {
      const channels = await reader.locator('.toc').evaluate(el => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = getComputedStyle(el).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      });
      expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(1);
    }
  });
}


test('purple book paper also themes the table of contents and reader actions', async ({ page }) => {
  await useBundledBooks(page);
  await page.setViewportSize({ width: 375, height: 814 });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', '0');
  });
  await page.goto('/?article=tt_1781528773286');
  await settleClient(page);
  const reader = page.locator('.reader-modal');
  await expect(reader.locator('.toc-item')).toHaveCount(58);
  await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
  await reader.locator('.reader-toolbar .swatch.purple').click();
  await expect(reader).toHaveClass(/bg-purple/);
  const colors = await reader.evaluate(element => {
    const accent = document.createElement('span');
    accent.style.backgroundColor = 'var(--reading-paper-purple-ink)';
    element.append(accent);
    const purpleInk = getComputedStyle(accent).backgroundColor;
    accent.remove();
    return {
      purpleInk,
      chapterNumber: getComputedStyle(element.querySelector('.toc-number')!).backgroundColor,
      commentButton: getComputedStyle(element.querySelector('.comments__fab')!).backgroundColor,
    };
  });
  expect(colors.chapterNumber).toBe(colors.purpleInk);
  expect(colors.commentButton).toBe(colors.purpleInk);
  await expect(reader.locator('.toc-search-input')).toHaveCSS('background-color', 'rgb(238, 230, 250)');
  for (const selector of ['.toc', '.toc-header', '.reader-category', '.toc-count']) {
    const isPurple = await reader.locator(selector).evaluate(el => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = getComputedStyle(el).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data;
      return blue > red && red > green;
    });
    expect(isPurple, selector).toBe(true);
  }
});

test('invalid legacy practice paper yields the authoritative global cream palette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 814 });
  await page.addInitScript(() => {
    localStorage.setItem('tt_practice_bg', 'legacy-invalid-paper'); localStorage.setItem('tutam_locale', 'vi');
    if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', '0'); if (localStorage.getItem('tutam_app_light_palette') === null) localStorage.setItem('tutam_app_light_palette', 'cream');
  });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap?article=tt_1780910773084'); await settleClient(page);
  await page.locator('.tt-preview__toc-list > button').first().click();
  await page.locator('.tt-reader-practice-btn').click();
  await page.locator('.practice-confirm__primary').click();
  const session = page.locator('.tt-practice');
  await expect(session).toHaveAttribute('data-bg', 'cream');
  await expect(session.locator('.ttp-bg-swatch').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(session.locator('.ttp-header')).toHaveCSS('background-color', 'rgb(250, 246, 238)');
  expect(await page.evaluate(() => localStorage.getItem('tt_practice_bg'))).toBe('cream');
});


for (const initialDark of [false, true]) {
  test(`reader Auto tracks the OS and updates app and paper together from ${initialDark ? 'dark' : 'light'}`, async ({ page }) => {
    await useBundledBooks(page);
    await page.setViewportSize({ width: 375, height: 814 });
    await page.emulateMedia({ colorScheme: initialDark ? 'dark' : 'light' });
    await page.addInitScript(() => {
      localStorage.setItem('tutam_locale', 'vi'); if (localStorage.getItem('tutam_dark_mode') === null) localStorage.setItem('tutam_dark_mode', '0');
      if (localStorage.getItem('tutam_app_light_palette') === null) localStorage.setItem('tutam_app_light_palette', 'purple');
    });
    await page.goto('/?article=tt_1781528855960'); await settleClient(page);
    const reader = page.locator('.reader-modal');
    const toc = reader.locator('.toc-item'); if (await toc.count()) await toc.first().click();
    const auto = reader.locator('.reader-toolbar .swatch.auto');
    if (!await auto.isVisible()) await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await expect(reader).toHaveClass(new RegExp(`bg-${initialDark ? 'dark' : 'cream'}`));
    await expect(page.locator('html')).toHaveAttribute('data-theme', initialDark ? 'dark' : 'light');
    expect(await page.evaluate(() => localStorage.getItem('tutam_dark_mode'))).toBe('auto');
    await page.emulateMedia({ colorScheme: initialDark ? 'light' : 'dark' });
    await expect(reader).toHaveClass(new RegExp(`bg-${initialDark ? 'cream' : 'dark'}`));
    await expect(page.locator('html')).toHaveAttribute('data-theme', initialDark ? 'light' : 'dark');
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('tutam_dark_mode'))).toBe('auto');
  });
}


test('native landscape reading controls retain 44px touch targets for all six papers', async ({ page }) => {
  await useBundledBooks(page);
  await page.setViewportSize({ width: 814, height: 411 });
  await page.goto('/?article=tt_1781528855960&chap=1'); await settleClient(page);
  const toolbar = page.locator('.reader-modal .reader-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('.swatch')).toHaveCount(6);
  await expect.poll(() => toolbar.locator('button, select').evaluateAll(elements => elements.every(element => {
    const rect = element.getBoundingClientRect();
    return rect.width === 0 || (rect.width >= 44 && rect.height >= 44);
  }))).toBe(true);
});

for (const [name, url, surface] of [
  ['book', '/?article=tt_1781528855960&chap=1', '.reader-modal'],
  ['scripture', '/tu-tap?article=tt_1780910773084', '.tt-preview'],
] as const) {
  test(`mobile ${name} tools stay tappable above the bottom navigation`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
    await page.route('**/api/**', route => route.abort());
    await page.goto(url);
    await settleClient(page);

    const reader = page.locator(surface);
    if (name === 'scripture') await reader.locator('.tt-preview__toc-list > button').first().click();
    const footer = page.locator('.qts-bottom-nav');
    await expect(footer).toBeVisible();

    const toggle = reader.getByRole('button', { name: 'Công cụ', exact: true });
    await toggle.click();
    const panel = reader.locator('.reader-tools-panel.open');
    await expect(panel).toBeVisible();
    await expect(footer).toBeHidden();
    await panel.locator('.reader-tools-content button:visible:enabled').last().click({ trial: true });

    await panel.getByRole('button', { name: 'Đóng công cụ', exact: true }).click();
    await expect(footer).toBeVisible();
    await expect(toggle).toBeFocused();
  });
}
