import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const mode of [
  { name: 'phone light', width: 375, height: 812, dark: false },
  { name: 'wide dark', width: 1440, height: 1000, dark: true },
]) {
test(`closed practice controls cannot intercept taps, keyboard focus or accessibility (${mode.name})`, async ({ page }, info) => {
  await page.setViewportSize({ width: mode.width, height: mode.height });
  await page.emulateMedia({ colorScheme: mode.dark ? 'dark' : 'light' });
  await page.addInitScript(dark => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
  }, mode.dark);
  const origin = new URL(info.project.use.baseURL!).origin;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname.startsWith('/api/') ? route.abort('blockedbyclient') : route.continue();
  });
  await page.goto('/tu-tap?article=tt_1780910773084');
  await settleClient(page);
  await page.locator('.tt-preview__toc-list > button').first().click();
  await page.locator('.tt-reader-practice-btn').click();
  await page.locator('.practice-confirm__primary').click();
  const fab = page.locator('.tt-practice__fab');
  const panel = page.locator('#practice-floating-panel');
  const toggle = fab.locator('.ttr-toggle-btn');
  const count = fab.locator('.ttr-count-num');
  const plus = fab.getByRole('button', { name: '+1', exact: true });
  await expect(count).toHaveText('0');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const openBounds = (await plus.boundingBox())!;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveCSS('opacity', '0');
  const closed = await panel.evaluate(element => {
    const button = element.querySelector('button[aria-label="+1"]');
    const rect = button?.getBoundingClientRect();
    const x = rect && rect.width > 0 && rect.height > 0 ? rect.x + rect.width / 2 : null;
    const y = rect && rect.width > 0 && rect.height > 0 ? rect.y + rect.height / 2 : null;
    return {
      x, y,
      hitsHiddenPlus: x !== null && y !== null && Boolean(document.elementFromPoint(x, y)?.closest('button[aria-label="+1"]')),
      opacity: getComputedStyle(element).opacity,
      pointerEvents: getComputedStyle(element).pointerEvents,
    };
  });
  await info.attach('closed-panel-hit-state', { contentType: 'application/json', body: JSON.stringify(closed) });
  await page.screenshot({ path: info.outputPath('closed-practice-controls.png') });
  // Đọc tâm control SAU khi đóng: panel co lại làm tâm cũ dịch sang chỗ khác.
  await page.mouse.click(closed.x ?? openBounds.x + openBounds.width / 2, closed.y ?? openBounds.y + openBounds.height / 2);
  await expect(count).toHaveText('0');
  expect(closed.hitsHiddenPlus).toBe(false);
  await expect(fab.getByRole('button', { name: '+1', exact: true })).toHaveCount(0);
  await expect(fab.getByRole('button', { name: '-1', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button')).toHaveCount(0);
  await toggle.focus();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(false);
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await plus.click();
  await expect(count).toHaveText('1');
  await fab.getByRole('button', { name: '-1', exact: true }).click();
  await expect(count).toHaveText('0');
  await plus.focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(panel.getByRole('button')).toHaveCount(0);
  await expect(count).toHaveText('0');
});
}

for (const savedBackground of ['dark', 'cream', 'gray', 'white', 'purple']) {
test(`scripture preview and navigation follow the same theme with saved ${savedBackground} paper`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((background) => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', '0');
    localStorage.setItem('tutam_app_light_palette', background === 'dark' ? 'cream' : background);
      localStorage.setItem('tt_bg', background);
  }, savedBackground);
  const lightBackground = savedBackground === 'dark' ? 'cream' : savedBackground;
  const lightColors: Record<string, string> = { cream: 'rgb(244, 236, 216)', gray: 'rgb(232, 232, 232)', white: 'rgb(255, 255, 255)', purple: 'rgb(238, 230, 250)' };
  const lightColor = lightColors[lightBackground];
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap?article=tt_1780910773084');
  await settleClient(page);
  const preview = page.locator('.tt-preview');
  await expect(preview).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-app-palette', lightBackground);
  await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
  await expect(preview).toHaveCSS('background-color', lightColor!);
  await page.screenshot({ path: testInfo.outputPath('practice-light.png'), animations: 'disabled' });

  await page.locator('.tt-theme-btn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(preview).toHaveAttribute('data-read-bg', 'dark');
  await expect(preview).toHaveCSS('background-color', 'rgb(21, 18, 13)');
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'dark');
    await expect.poll(() => page.evaluate(() => ['tt_bg', 'tutam_read_bg', 'tutam_read_bg_dark'].map(key => localStorage.getItem(key)))).toEqual(['dark', 'dark', 'dark']);
  await page.screenshot({ path: testInfo.outputPath('practice-dark.png'), animations: 'disabled' });

  await page.locator('.tt-theme-btn').click();
  await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
  await expect(preview).toHaveCSS('background-color', lightColor!);
  // Unified app/paper selection persists the active palette into every legacy paper key.
  expect(await page.evaluate(() => ['tt_bg', 'tutam_read_bg', 'tutam_read_bg_dark'].map(key => localStorage.getItem(key)))).toEqual([lightBackground, lightBackground, lightBackground]);
});
}

for (const savedBackground of ['dark', 'cream', 'gray', 'white', 'purple']) {
  test(`chapter paper follows theme after opening dark with saved ${savedBackground} paper`, async ({ page }, testInfo) => {
    const darkBackground = 'dark';
    const wide = savedBackground === 'gray' || savedBackground === 'white';
    await page.setViewportSize({ width: wide ? 1440 : 390, height: wide ? 1000 : 844 });
    await page.addInitScript(({ background }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', '1');
      localStorage.setItem('tutam_app_light_palette', background === 'dark' ? 'cream' : background);
      localStorage.setItem('tt_bg', background);
      localStorage.setItem('tutam_read_bg', background);
      // A conflicting old dark-paper choice must yield to the unified dark app palette.
      localStorage.setItem('tutam_read_bg_dark', 'cream');
    }, { background: savedBackground });
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/tu-tap?article=tt_1780910773084');
  await settleClient(page);
    const preview = page.locator('.tt-preview');
    const toggle = page.locator('.tt-theme-btn');
    await expect(preview).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(preview).toHaveAttribute('data-read-bg', 'dark');

    // Keep the same preview mounted: dark mount, light TOC, then chapter.
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('.tt-preview__toc-list > button').first().click();
    await expect(page.locator('.tt-preview .reader-content')).not.toBeEmpty();
    const lightBackground = savedBackground === 'dark' ? 'cream' : savedBackground;
    const lightColors: Record<string, string> = { cream: 'rgb(244, 236, 216)', gray: 'rgb(232, 232, 232)', white: 'rgb(255, 255, 255)', purple: 'rgb(238, 230, 250)' };
    await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
    await expect(preview).toHaveCSS('background-color', lightColors[lightBackground]!);

    await page.locator('.tt-reader-back-btn').click();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.tt-preview__toc-list > button').first().click();
    await expect(page.locator('.tt-preview .reader-content')).not.toBeEmpty();
    await expect(preview).toHaveAttribute('data-read-bg', darkBackground);
    await expect(preview).toHaveCSS('background-color', 'rgb(21, 18, 13)');
    await page.locator('.tt-reader-back-btn').click();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('.tt-preview__toc-list > button').first().click();
    await expect(page.locator('.tt-preview .reader-content')).not.toBeEmpty();
    await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
    await expect(preview).toHaveCSS('background-color', lightColors[lightBackground]!);
    expect(await page.evaluate(() => ({
      paper: localStorage.getItem('tt_bg'),
      lightPaper: localStorage.getItem('tutam_read_bg'),
      darkPaper: localStorage.getItem('tutam_read_bg_dark')
    }))).toEqual({ paper: lightBackground, lightPaper: lightBackground, darkPaper: lightBackground });
    await page.screenshot({ path: testInfo.outputPath('chapter-light-restored.png'), animations: 'disabled' });
  });
}
