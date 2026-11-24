import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`startup artwork fits ${viewport.width}x${viewport.height} and dismisses when ready`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => Object.assign(window, { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/_app/immutable/entry/*.js', async route => { await gate; await route.continue(); });
    await page.goto('/', { waitUntil: 'commit' });
    const startup = page.locator('#app-startup');
    try {
      await expect(startup).toBeVisible();
      await expect(startup.locator('strong')).toHaveText('Tu tập Phật pháp');
      const logo = startup.locator('img');
      await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(startup).toHaveCSS('background-image', /\/images\/calendar\/lotus-dawn\.webp/);
      expect(await startup.locator('.startup-brand').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      })).toBe(true);
      // Screenshot chờ fonts.ready, còn WebKit chờ entry module hoàn tất; ghi trạng thái thật trước khi nhả gate.
      await testInfo.attach('startup-before-ready', { contentType: 'application/json', body: JSON.stringify(await startup.evaluate(element => {
        const brand = element.querySelector<HTMLElement>('.startup-brand')!;
        const image = element.querySelector<HTMLImageElement>('img')!;
        const rect = (node: Element) => {
          const bounds = node.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          startup: { bounds: rect(element), backgroundImage: getComputedStyle(element).backgroundImage, opacity: getComputedStyle(element).opacity },
          brand: { bounds: rect(brand), fontFamily: getComputedStyle(brand).fontFamily },
          image: { bounds: rect(image), source: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight },
        };
      }), null, 2) });
    } finally { release(); }
    await expect(page.locator('.home-greeting-header')).toBeVisible();
    await expect(startup).toHaveCount(0);
    const readyImage = await page.screenshot({ path: testInfo.outputPath(`startup-ready-${viewport.width}.png`), animations: 'disabled' });
    await testInfo.attach('ready UI after startup dismissal', { body: readyImage, contentType: 'image/png' });
  });
}

test('normal browser visits are not covered by the native startup screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-greeting-header')).toBeVisible();
  await expect(page.locator('#app-startup')).toHaveCount(0);
});

test('Android with native startup never paints a second WebView startup cover', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { Capacitor: {
    isNativePlatform: () => true, getPlatform: () => 'android',
    isPluginAvailable: (name: string) => name === 'StartupScreen',
  } }));
  await page.route('**/_app/immutable/entry/*.js', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-native-startup', 'true');
  await expect(page.locator('#app-startup')).toHaveCount(0);
});

test('startup uses all ten local calendar pictures before repeating', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
  await page.route('**/_app/immutable/entry/*.js', route => route.abort());
  const pictures: string[] = [];
  for (let index = 0; index < 11; index++) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    pictures.push(await page.locator('#app-startup').evaluate(el => getComputedStyle(el).backgroundImage));
  }
  expect(new Set(pictures.slice(0, 10)).size).toBe(10);
  expect(pictures[10]).toBe(pictures[0]);
  for (let index = 1; index < pictures.length; index++) expect(pictures[index]).not.toBe(pictures[index - 1]);
});
