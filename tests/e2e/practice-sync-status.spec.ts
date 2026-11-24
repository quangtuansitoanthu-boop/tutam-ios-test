import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

for (const width of [320, 375, 1440]) for (const dark of [false, true]) {
test(`keeps unreadable sync data without a banner ${width} dark=${dark}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const key = 'quangtu_principal_v1:anonymous:quangtu_practice_session_outbox_v1';
  await page.addInitScript(({ key, dark }) => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
    localStorage.setItem(key, '{broken');
  }, { key, dark });
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/practice/')) writes++; });
  await page.goto('/tu-tap');
  await settleClient(page);
  await expect(page.locator('[data-practice-sync-status]')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{broken');
  expect(writes).toBe(0);
});
}

for (const recovery of ['delay', 'online'] as const) test(`recovers a failed practice operation without a banner on ${recovery}`, async ({ page }) => {
  await page.clock.install();
  await loginAsMember(page);
  const key = 'quangtu_principal_v1:e2e-member:quangtu_practice_session_outbox_v1';
  await page.addInitScript(({ key }) => {
    localStorage.setItem('tutam_locale', 'vi');
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([{
      id: 'start:sync-status', kind: 'start', clientSessionId: 'sync-status', queuedAt: new Date().toISOString(),
      payload: { clientSessionId: 'sync-status', activityType: 'meditation', targetDurationSeconds: 60,
        targetCount: null, sourceKind: null, sourceId: null, startedAt: new Date().toISOString(), idempotencyKey: 'sync-status' },
    }]));
  }, { key });
  let failing = true;
  let writes = 0;
  await page.route('**/api/practice/sessions', route => {
    writes++;
    return route.fulfill({ status: failing ? 503 : 200, json: failing ? { error: 'unavailable' } : { ok: true } });
  });
  await page.goto('/');
  await settleClient(page);
  const notice = page.locator('[data-practice-sync-status]');
  await expect.poll(() => writes).toBe(1);
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, key)).toBe(1);
  failing = false;
  if (recovery === 'delay') await page.clock.fastForward(31_000);
  else await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, key)).toBe(0);
  await expect(notice).toHaveCount(0);
  await page.clock.fastForward(31_000);
  expect(writes).toBe(2);
});
