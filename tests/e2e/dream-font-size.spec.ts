import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const { width, theme, locale } of [
  { width: 375, theme: 'light', locale: 'vi' },
  { width: 375, theme: 'dark', locale: 'en' },
  { width: 960, theme: 'light', locale: 'en' },
  { width: 960, theme: 'dark', locale: 'vi' },
] as const) {
  test(`changes only dream reading text within the approved bounds at ${width}px ${theme} ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ language, dark }) => {
      localStorage.setItem('tutam_locale', language);
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
      if ('Notification' in window) Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    }, { language: locale, dark: theme === 'dark' });
    await page.goto('/tu-tap/giai-mong');
    await settleClient(page);
    await page.locator('#dream-row-nguoi-mat').click();
    const article = page.locator('.dream-article');
    const controls = article.locator('.dream-reading-controls');
    const decrease = controls.getByRole('button', { name: locale === 'vi' ? 'Giảm cỡ chữ bài giải mộng' : 'Decrease dream article font size', exact: true });
    const increase = controls.getByRole('button', { name: locale === 'vi' ? 'Tăng cỡ chữ bài giải mộng' : 'Increase dream article font size', exact: true });
    const current = controls.locator('output');
    await expect(current).toHaveText('100%');
    await expect(decrease).toBeDisabled();
    await page.evaluate(() => document.documentElement.style.setProperty('--ui-font-scale', '1.2'));

    const readingMetrics = () => page.evaluate(() => {
      const size = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
      const hero = document.querySelector('.dream-sheet-hero')!.getBoundingClientRect();
      const toolbar = document.querySelector('.dream-reading-controls')!.getBoundingClientRect();
      const overview = document.querySelector('.dream-detail-section')!.getBoundingClientRect();
      return {
        body: size('.dream-detail-section:not(.dream-note-form) p'),
        title: size('.dream-sheet-title'),
        subcase: size('.dream-scenario-item h5'),
        scripture: size('.dream-sutra-ref small'),
        note: size('.dream-note-form textarea'),
        button: size('.dream-reading-buttons button'),
        pageHeading: size('.div-subbar-title'),
        globalScale: document.documentElement.style.getPropertyValue('--ui-font-scale'),
        toolbarBelowHero: toolbar.top >= hero.bottom,
        toolbarBeforeOverview: overview.top >= toolbar.bottom,
        targets: [...document.querySelectorAll('.dream-reading-buttons button')].map(button => {
          const bounds = button.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        }),
      };
    });
    const before = await readingMetrics();
    expect(before.body).toBeCloseTo(16.2, 1);
    expect(before.toolbarBelowHero).toBe(true);
    expect(before.toolbarBeforeOverview).toBe(true);
    for (const target of before.targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }

    for (let index = 0; index < 6; index += 1) await increase.click();
    await expect(current).toHaveText('160%');
    await expect(increase).toBeDisabled();
    const enlarged = await readingMetrics();
    for (const key of ['body', 'title', 'subcase', 'scripture'] as const) {
      expect(enlarged[key]).toBeCloseTo(before[key] * 1.6, 1);
    }
    for (const key of ['note', 'button', 'pageHeading'] as const) expect(enlarged[key]).toBe(before[key]);
    expect(enlarged.globalScale).toBe('1.2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375 && theme === 'dark') {
      await page.screenshot({ path: test.info().outputPath('dream-font-large-mobile-dark.png') });
    }
    for (let index = 0; index < 6; index += 1) await decrease.click();
    await expect(current).toHaveText('100%');
    await expect(decrease).toBeDisabled();
    expect((await readingMetrics()).body).toBe(before.body);
  });
}
