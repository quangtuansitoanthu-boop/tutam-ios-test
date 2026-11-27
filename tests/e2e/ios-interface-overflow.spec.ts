import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';
import { inspectHorizontalOverflow } from './ios-overflow-helpers';

test.use({ browserName: 'webkit', isMobile: true, hasTouch: true, contextOptions:{reducedMotion:'reduce'} });
const variants = [
  { width:320, height:812, locale:'vi', dark:false, scale:1.2 },
  { width:320, height:812, locale:'en', dark:true, scale:1.2 },
  { width:375, height:812, locale:'en', dark:true, scale:1.2 },
  { width:390, height:844, locale:'vi', dark:true, scale:1 },
  { width:430, height:932, locale:'en', dark:false, scale:1 },
  { width:844, height:390, locale:'vi', dark:false, scale:1.2 },
];
const routes = ['/', '/kinh-sach', '/phap-thoai', '/tu-tap', '/huong-dan', '/trich-dan-cua-toi', '/tien-do-tu-tap',
  '/chinh-sach-bao-mat', '/privacy-policy', '/ca-nhan', ...['account','settings','author','testimonials','feedback','guide','study-guide'].map(tab => '/ca-nhan?tab='+tab),
  '/tu-tap/chep-kinh','/tu-tap/chep-danh-hieu','/tu-tap/an-chay', ...['rosary','meditation','le-phat','thanh-tinh','giu-gioi','bat-quan-trai'].map(action=>'/tu-tap?action='+action)];

test('vegan tabs stay below the practice header when scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.setFixedTime(new Date('2026-11-15T11:30:00Z'));
  await page.addInitScript(() => {
    const host = window as unknown as Record<string, unknown>;
    host.CapacitorCustomPlatform = { name: 'ios' };
    host.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  });
  await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
  await settleClient(page);
  const calendarLink = page.locator('a.tt-mode-card--vegan');
  await expect(calendarLink).toContainText('Lịch ăn chay đủ dinh dưỡng');
  await calendarLink.click();
  const header = page.locator('nav.qts-nav');
  const tabs = page.locator('.vegan nav');
  const title = page.locator('.vegan h1');
  await expect(title).toHaveText('Lịch ăn chay đủ dinh dưỡng');
  const back = header.getByRole('button', { name: 'Quay lại', exact: true });
  await expect(page.locator('.vegan .heading a')).toHaveCount(0);
  await expect(page.locator('.vegan .meal')).not.toHaveCount(0);
  await expect(back).toHaveCSS('border-top-style', 'solid');
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const headerBox = (await header.boundingBox())!;
  const headerBottom = headerBox.y + headerBox.height;
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom - 1);
  const scrollMetrics = () => page.evaluate(() => ({
    height: innerHeight,
    contentHeight: document.documentElement.scrollHeight,
    extent: document.documentElement.scrollHeight - innerHeight,
  }));
  const collapsed = await scrollMetrics();
  // The compact daily menu can fit this phone; open real ingredients to exercise sticky scrolling.
  const ingredients = page.locator('.vegan details.meal-disclosure');
  await ingredients.locator('summary').click();
  await expect(ingredients).toHaveAttribute('open', '');
  const expanded = await scrollMetrics();
  await test.info().attach('vegan-scroll-layout', {
    body: JSON.stringify({ collapsed, expanded }), contentType: 'application/json',
  });
  expect(expanded.extent).toBeGreaterThan(200);
  await page.evaluate(() => window.scrollBy(0, 480));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await expect.poll(async () => (await tabs.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom - 1);
  await expect.poll(() => tabs.getByRole('button').evaluateAll(buttons => buttons.every(button => {
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }))).toBe(true);
  await tabs.getByRole('button').nth(1).click();
  await expect(tabs.getByRole('button').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('vegan search stays aligned when typing and returning to practice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-15T06:40:00Z'));
  await page.addInitScript(() => {
    const host = window as unknown as Record<string, unknown>;
    host.CapacitorCustomPlatform = { name: 'ios' };
    host.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_ui_font_scale', '0.9');
  });
  await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
  await settleClient(page);
  await page.locator('a.tt-mode-card--vegan').click();
  await expect(page.locator('.vegan .meal').first()).toBeVisible();
  await page.getByRole('button', { name: 'Menu món', exact: true }).click();
  const search = page.getByRole('searchbox');
  await expect(search).toBeVisible();
  const menuCount = await page.locator('.vegan .dish').count();
  await expect(search).toHaveCSS('font-size', '16px');
  for (const filter of await page.locator('.vegan .filters select').all()) {
    await expect(filter).toHaveCSS('font-size', '16px');
  }
  const checkViewport = () => page.evaluate(() => ({
    scale: window.visualViewport?.scale,
    offsetLeft: window.visualViewport?.offsetLeft,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  await search.tap();
  await page.keyboard.insertText('nấm');
  await expect(search).toHaveValue('nấm');
  await expect.poll(() => page.locator('.vegan .dish').count()).toBeLessThan(menuCount);
  await expect(page.locator('.vegan .dish').first()).toBeVisible();
  expect(await checkViewport()).toEqual({ scale: 1, offsetLeft: 0, overflow: false });
  await page.locator('nav.qts-nav').getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page).toHaveURL(/\/tu-tap\/?$/);
  await expect(search).toHaveCount(0);
  expect(await checkViewport()).toEqual({ scale: 1, offsetLeft: 0, overflow: false });
});

for (const variant of variants) test(`iOS interface overflow ${variant.width} ${variant.locale} ${variant.dark?'dark':'light'} font ${variant.scale}`, async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({width:variant.width,height:variant.height});
  await page.addInitScript(value=>{
    localStorage.setItem('tutam_locale',value.locale);
    localStorage.setItem('tutam_dark_mode',value.dark?'1':'0');
    localStorage.setItem('tutam_ui_font_scale',String(value.scale));
  },variant);
  const report: Array<{route:string; position:string; geometry:Awaited<ReturnType<typeof inspectHorizontalOverflow>>}> = [];
  const visited:string[]=[];
  const check = async (route:string) => {
    for(const position of ['top','middle','bottom']) {
      await page.evaluate(position=>window.scrollTo(0,position==='top'?0:document.documentElement.scrollHeight*(position==='middle'?0.5:1)),position);
      const geometry=await inspectHorizontalOverflow(page);
      if(geometry.documentWidth>geometry.viewport+2 || geometry.findings.length) {
        report.push({route,position,geometry});
        await page.screenshot({path:info.outputPath(`overflow-${report.length}.png`),animations:'disabled'});
      }
    }
    await writeFile(info.outputPath('overflow-report.json'),JSON.stringify(report,null,2));
    visited.push(route);
    await writeFile(info.outputPath('coverage.json'),JSON.stringify({variant,visited,inspections:visited.length*3},null,2));
  };
  page.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
  await loginAsMember(page);
  for(const route of routes) {
    console.log('Inspecting',route);
    await page.goto(route,{waitUntil:'domcontentloaded',timeout:15000});
    if(route.includes('privacy')||route.includes('chinh-sach')) {
      await page.locator('#btn-'+variant.locale).click();
    }
    else { await page.waitForSelector('[data-mounted="1"]',{timeout:10000}); await settleClient(page);
      await expect(page.locator('html')).toHaveAttribute('lang',variant.locale); }
    if (route === '/') {
      const session = await page.evaluate(async () => (await (await fetch('/api/session')).json()).authenticated);
      expect(session).toBe(true);
    }
    await check(route);
    if(route==='/ca-nhan?tab=settings') {
      const summaries=page.locator('.settings-hub details > summary');
      for(let index=0;index<await summaries.count();index++) {
        await summaries.nth(index).click(); await check(route+'#section-'+index);
      }
    }
  }
  await page.goto('/ca-nhan?tab=account'); await settleClient(page);
  // Intercept only when exercising logout; enabling routing before the first
  // WebKit navigation disables its asset cache throughout the cold page load.
  // Keep the shared seed session alive for the next isolated browser context.
  await page.route('**/api/auth/logout',async route=>{
    await page.context().clearCookies({name:'quangtu_session'});
    await route.fulfill({json:{ok:true}});
  });
  await page.locator('.cn-btn-logout').click();
  await page.locator('[role="alertdialog"] .cn-modal-actions button').last().click();
  await page.waitForURL(url=>url.pathname==='/',{waitUntil:'networkidle'});
  expect((await page.evaluate(async()=> (await (await fetch('/api/session')).json()).authenticated))).toBe(false);
  await check('after-logout');
  await loginAsMember(page);
  expect((await page.evaluate(async()=> (await (await fetch('/api/session')).json()).authenticated))).toBe(true);
  for(const route of ['/','/ca-nhan?tab=account','/ca-nhan?tab=settings','/kinh-sach','/tu-tap','/phap-thoai']) {
    await page.goto(route,{waitUntil:'domcontentloaded',timeout:15000}); await settleClient(page);
    if(route.includes('tab=account')) await expect(page.locator('.cn-btn-logout')).toBeVisible();
    await check('after-relogin '+route);
  }
  await writeFile(info.outputPath('overflow-report.json'),JSON.stringify(report,null,2));
  await page.screenshot({path:info.outputPath('interface-final.png'),animations:'disabled'});
  expect(report,'unexpected document or visible text overflow; see overflow-report.json').toEqual([]);
});
