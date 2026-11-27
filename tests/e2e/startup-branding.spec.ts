import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 820, height: 1180 }, { width: 1180, height: 820 },
];

const appBundle = '**/_app/immutable/entry/*.js';

async function holdResponse(page: Page, url: string) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(url, async route => { await gate; await route.continue(); });
  return release;
}

const useWebViewStartup = (page: Page) => page.addInitScript(() => Object.assign(window, {
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

for (const viewport of viewports) {
  test(`startup artwork fits ${viewport.width}x${viewport.height} and dismisses when ready`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await useWebViewStartup(page);
    const release = await holdResponse(page, appBundle);
    await page.goto('/', { waitUntil: 'commit' });
    const startup = page.locator('#app-startup');
    try {
      await expect(startup).toBeVisible();
      await expect(startup.locator('[data-startup-loading]')).toHaveText('Đang tải ứng dụng...');
      await expect(startup.locator('.startup-spinner')).toBeVisible();

      const artwork = startup.locator('[data-startup-bg]');
      const title = startup.locator('[data-startup-title]');
      await expect.poll(() => artwork.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(artwork).toHaveAttribute('src', '/images/calendar/cu-si/01.webp');
      await expect.poll(() => title.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(title).toHaveAttribute('src', '/images/calendar/cu-si-title.webp');
      await expect(title).toHaveCSS('object-fit', await artwork.evaluate(el => getComputedStyle(el).objectFit));
      await testInfo.attach('startup-before-ready.png', { contentType: 'image/png', body: await startup.screenshot() });

      expect(await startup.locator('.startup-loading').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      })).toBe(true);

      await testInfo.attach('startup-before-ready', {
        contentType: 'application/json',
        body: JSON.stringify(await startup.evaluate(element => {
          const loading = element.querySelector<HTMLElement>('.startup-loading')!;
          const image = element.querySelector<HTMLImageElement>('[data-startup-bg]')!;
          const rect = (node: Element) => {
            const bounds = node.getBoundingClientRect();
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
          };
          return {
            viewport: { width: innerWidth, height: innerHeight },
            startup: { bounds: rect(element), opacity: getComputedStyle(element).opacity },
            loading: { bounds: rect(loading), backgroundColor: getComputedStyle(loading).backgroundColor },
            image: { bounds: rect(image), source: image.currentSrc, objectFit: getComputedStyle(image).objectFit, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight },
          };
        }), null, 2),
      });
    } finally { release(); }
    await expect(page.locator('.home-greeting-header')).toBeVisible();
    await expect(startup).toHaveCount(0);
    const readyImage = await page.screenshot({ path: testInfo.outputPath(`startup-ready-${viewport.width}.png`), animations: 'disabled' });
    await testInfo.attach('ready UI after startup dismissal', { body: readyImage, contentType: 'image/png' });
  });
}

for (const [scenario, name] of [
  ['fast', 'fast startup keeps its artwork and loading text visible for the minimum display time'],
  ['slow boot', 'slow startup dismisses after readiness without repeating the minimum display time'],
  ['slow title', 'delayed title gets the full reading time even after the app is ready'],
] as const) {
  test(name, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-25T04:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-25T04:01:00Z'));
    await useWebViewStartup(page);
    const release = await holdResponse(page, scenario === 'slow title' ? '**/images/calendar/cu-si-title.webp' : appBundle);
    const startup = page.locator('#app-startup');
    const title = startup.locator('[data-startup-title]');
    try {
      await page.goto('/', { waitUntil: 'commit' });
      await expect(startup).toBeVisible();
      await startup.locator('[data-startup-bg]').evaluate((image: HTMLImageElement) => image.decode());
      if (scenario === 'slow title') {
        await expect(page.locator('.qt-master-layout')).toHaveAttribute('data-mounted', '1');
        await page.clock.runFor(3400);
        expect(await title.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(0);
        await expect(startup).not.toHaveAttribute('data-shown-at', /.+/);
        await expect(startup).toHaveCSS('opacity', '1');
      } else if (scenario === 'slow boot') {
        await title.evaluate((image: HTMLImageElement) => image.decode());
        await page.clock.runFor(3400);
        await expect(startup).toHaveCSS('opacity', '1');
      }
    } finally { release(); }
    await expect(page.locator('.qt-master-layout')).toHaveAttribute('data-mounted', '1');
    if (scenario !== 'slow boot') {
      await title.evaluate((image: HTMLImageElement) => image.decode());
      await page.clock.runFor(48);
      const elapsed = await startup.evaluate(element => performance.now() - Number((element as HTMLElement).dataset.shownAt));
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(2999);
      await page.clock.runFor(2999 - elapsed);
      await expect(startup).not.toHaveClass(/startup-ready/);
      await expect(startup).toHaveCSS('opacity', '1');
      await expect(startup.locator('[data-startup-bg]')).toBeVisible();
      await expect(title).toBeVisible();
      await expect(startup.locator('[data-startup-loading]')).toHaveText('Đang tải ứng dụng...');
      await expect(startup.locator('.startup-spinner')).toBeVisible();
      await page.clock.runFor(101);
    } else {
      // Two animation frames let the newly mounted app paint before dismissal.
      await page.clock.runFor(80);
    }
    await expect(startup).toHaveClass(/startup-ready/);
    await page.clock.runFor(scenario === 'slow boot' ? 300 : 250);
    await expect(startup).toHaveCount(0);
    await expect(page.locator('.home-greeting-header')).toBeVisible();
  });
}

test('normal browser visits are not covered by the native startup screen', async ({ page }) => {
  const release = await holdResponse(page, appBundle);
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('script[data-startup-artwork]')).toBeAttached();
    await expect(page.locator('#app-startup')).toBeHidden();
  } finally { release(); }
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
