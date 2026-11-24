import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mantraFilename = /chu-lang-nghiem(?:-dieu-am-tinh-tuan-20261023)?\.mp3/u;

for (const native of [false, true]) {
test(`Thanh tinh tam plays the compressed ADD recording (${native ? 'native' : 'web'})`, async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on('request', request => { if (mantraFilename.test(request.url())) mediaRequests.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src);
        if (src?.includes('chu-lang-nghiem')) {
          (window as any).__mantraAudio = this;
          (window as any).__mantraInitialSrc = src;
        }
      }
    };
  });
  await page.route('**/api/**', route => route.abort('failed'));
  if (native) {
    // Android may return the entire asset. The iOS asset handler supports Range.
    const recording = readFileSync('assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3');
    await page.route('**/assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3*', route => route.fulfill({
      status: 200, contentType: 'audio/mpeg', body: recording,
    }));
  }
  await page.goto('/tu-tap');
  await page.locator('.tt-mode-card--thanh-tinh').click();
  await expect(page.locator('.thanh-tinh-overlay')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__mantraAudio)).toBeUndefined();
  expect(mediaRequests).toEqual([]);
  await page.locator('.btn-onboarding-join').click();
  expect(mediaRequests).toEqual([]);
  // Chờ route hydrate xong trước khi giả lập native; core khởi tạo lại các hàm này khi module nạp.
  if (native) {
    await page.evaluate(() => { (window as any).Capacitor.isNativePlatform = () => true; (window as any).Capacitor.getPlatform = () => 'android'; });
    expect(await page.evaluate(() => (window as any).Capacitor.isNativePlatform())).toBe(true);
  }
  await page.locator('.tt-tab-btn').filter({ hasText: 'Nghe Chú' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__mantraInitialSrc)).toMatch(mantraFilename);
  const initialSrc: string = await page.evaluate(() => (window as any).__mantraInitialSrc);
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { __mantraAudio: HTMLAudioElement }).__mantraAudio;
    return { decoded: audio.duration > 1014, source: audio.currentSrc, error: audio.error?.message ?? null };
  })).toEqual({ decoded: true, source: expect.any(String), error: null });
  expect(await page.evaluate(() => (window as any).__mantraAudio.duration)).toBeLessThan(1015);
  expect(await page.evaluate(() => (window as any).__mantraAudio.duration)).toBeLessThan(1025);
  if (native && !initialSrc.endsWith('/chu-lang-nghiem.mp3')) await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentSrc)).toMatch(/^blob:/);
  else await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentSrc)).toMatch(mantraFilename);
  const play = page.locator('.btn-play-pause-main');
  await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentTime)).toBeGreaterThan(0);
  await play.click();
  await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.paused)).toBe(true);
  await page.locator('.progress-slider').evaluate((el: HTMLInputElement) => {
    el.value = '1010';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await play.click();
  await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentTime)).toBeGreaterThanOrEqual(1010);
  expect(await page.evaluate(() => (window as any).__mantraAudio.error)).toBeNull();
});
}

test('Nghe Chú lets a single tap retry after playback fails', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const play = HTMLMediaElement.prototype.play;
    let blocked = true;
    const capture = { attempts: 0, recording: null as HTMLAudioElement | null, allow: () => { blocked = false; } };
    Object.assign(window, { mantraPlaybackTest: capture });
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLAudioElement && this.src.includes('chu-lang-nghiem')) {
        capture.recording = this;
        capture.attempts++;
        if (blocked) return Promise.reject(new DOMException('Play needs another tap', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.route(/https:\/\/(?:media\.)?quangtu\.vn\//u, route => route.abort('failed'));
  await page.goto('/tu-tap');
  await page.locator('.tt-mode-card--thanh-tinh').click();
  await page.locator('.btn-onboarding-join').click();
  await page.locator('.tt-tab-btn').filter({ hasText: 'Nghe Chú' }).click();
  type PlaybackProbe = { mantraPlaybackTest: { attempts: number; recording: HTMLAudioElement; allow: () => void } };
  await expect.poll(() => page.evaluate(() => (window as unknown as PlaybackProbe).mantraPlaybackTest.attempts)).toBeGreaterThan(0);
  await expect(page.locator('.player-controls-box').getByRole('alert')).toBeVisible({ timeout: 2000 });
  await page.evaluate(() => (window as unknown as PlaybackProbe).mantraPlaybackTest.allow());
  await page.locator('.btn-play-pause-main').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as PlaybackProbe).mantraPlaybackTest.recording.currentTime)).toBeGreaterThan(0);
});
