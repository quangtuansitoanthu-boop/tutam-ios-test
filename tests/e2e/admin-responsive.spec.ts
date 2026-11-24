import { expect, test, type Request } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

test('mobile admin tables keep labels separate from their values', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAsAdmin(page);
  for (const route of ['/admin/settings', '/admin/members']) {
    await page.goto(route);
    await settleClient(page);
    const cell = page.locator('.admin-inventory td[data-label]').first();
    const value = cell.locator(':scope > *').first();
    const cellBox = await cell.boundingBox();
    const valueBox = await value.boundingBox();
    expect(cellBox).not.toBeNull();
    expect(valueBox).not.toBeNull();
    expect(valueBox!.x - cellBox!.x).toBeGreaterThanOrEqual(72);
    expect(valueBox!.x + valueBox!.width).toBeLessThanOrEqual(375);
  }
});

test('traffic axes stay readable when the viewport shrinks', async ({ page }) => {
  await loginAsAdmin(page);
  const resizeRequests: string[] = [];
  const pending = new Set<Request>();
  let lastActivity = Date.now();
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return;
    resizeRequests.push(path);
    pending.add(request);
    lastActivity = Date.now();
  });
  const finished = (request: Request) => {
    if (pending.delete(request)) lastActivity = Date.now();
  };
  page.on('requestfinished', finished);
  page.on('requestfailed', finished);
  await page.goto('/admin/analytics');
  await settleClient(page);
  // Đo resize sau khi các request khởi tạo đã hoàn tất.
  await expect.poll(() => pending.size === 0 && Date.now() - lastActivity >= 200).toBe(true);
  resizeRequests.length = 0;
  for (const width of [375, 320, 1440, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const axis = page.locator('.traffic-chart__axis').first();
    await expect.poll(async () => (await axis.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(9);
    await expect.poll(() => page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(width);
    if (width <= 375) {
      const controls = page.locator('.admin-topbar__back, .admin-topbar button');
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
    }
  }
  expect(resizeRequests).toEqual([]);
});
