import { expect, test } from '@playwright/test';
import { translations } from '../../src/lib/i18n/translations';

test('pausing during preparation keeps the preparation countdown frozen', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('failed'));
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.goto('/tu-tap');
  await page.locator('.tt-mode-card--thien').click();
  const start = page.locator('.meditation-chooser').getByRole('button', { name: 'Bắt đầu thiền', exact: true });
  await expect(start).toBeVisible();
  await page.clock.install();
  await start.click();

  const screen = page.locator('.meditation-screen');
  const time = screen.locator('.meditation-screen__time');
  const pause = screen.getByRole('button', { name: 'Tạm dừng', exact: true });
  const resume = screen.getByRole('button', { name: 'Tiếp tục', exact: true });
  await expect(screen.locator('.meditation-screen__badge--prep')).toBeVisible();
  await page.clock.fastForward(10_000);
  await pause.click();
  await expect(screen.locator('.meditation-screen__badge--paused')).toBeVisible();
  await expect(time).toHaveText(/^00:[12]\d$/u);
  const pausedPreparation = await time.innerText();
  await page.clock.fastForward(45_000);
  await expect(time).toHaveText(pausedPreparation);

  await resume.click();
  await expect(screen.locator('.meditation-screen__badge--prep')).toBeVisible();
  await page.clock.fastForward(25_000);
  await expect(screen.locator('.meditation-screen__badge--active')).toBeVisible();
  await pause.click();
  await expect(time).toHaveText(/^14:\d\d$/u);
});

test('meditation focus keeps the clock running through exit and completion', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('failed'));
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: undefined });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tu-tap?mode=meditation');
  await page.clock.install();
  const chooser = page.locator('.meditation-chooser');
  await chooser.getByRole('checkbox', { name: /Hiện hoa sen và nhịp thở/ }).uncheck();
  await chooser.getByRole('button', { name: 'Bắt đầu thiền', exact: true }).click();
  const screen = page.locator('.meditation-screen');
  const focus = screen.getByRole('button', { name: 'Tập trung', exact: true });
  const stage = screen.locator('.meditation-focus__stage');
  const exit = screen.getByRole('button', { name: 'Thoát tập trung', exact: true });
  const controls = screen.locator('.meditation-screen__controls');
  const cue = stage.locator('.meditation-focus__cue');
  await focus.click();
  await expect(exit).toBeFocused();
  expect((await exit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(controls).toBeHidden();
  await expect(stage).toContainText('🪷');
  await expect(cue).toHaveText('Hít vào…');
  await page.clock.fastForward(31_000);
  await expect(cue).toHaveText('Hít vào…');
  await page.clock.fastForward(5_000);
  await expect(cue).toHaveText('Thở ra…');
  await exit.click();
  await expect(focus).toBeFocused();
  await expect(controls.locator('.meditation-screen__visual')).toHaveCount(0);
  await expect(screen.locator('.meditation-screen__badge--active')).toBeVisible();
  await focus.click();
  await expect(cue).toHaveText('Thở ra…');
  await page.keyboard.press('Escape');
  await expect(focus).toBeFocused();
  await expect(screen.locator('.meditation-screen__badge--active')).toBeVisible();
  await focus.click();
  await stage.click();
  await expect(controls).toBeVisible();
  await focus.click();
  await page.clock.fastForward(15 * 60_000);
  await expect(stage).toHaveCount(0);
  await expect(screen.locator('.meditation-screen__badge--completed')).toBeVisible();
});

for (const locale of ['vi', 'en'] as const) {
  test(`meditation ends with three bells and the ${locale} blessing`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: locale === 'vi' ? 375 : 1440, height: 900 });
    await page.route('**/api/**', route => route.abort('failed'));
    await page.addInitScript((language) => {
      localStorage.setItem('tutam_locale', language);
      localStorage.setItem('tutam_dark_mode', language === 'en' ? '1' : '0');
      const spoken: string[] = [];
      const bells: number[] = [];
      const music: HTMLMediaElement[] = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.src.includes('nhac-thien-01.m4a')) music.push(this);
        return play.call(this);
      };
      Object.assign(window, { __meditationMusic: music });
      Object.assign(window, { __meditationSpoken: spoken, __meditationBells: bells });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class {
        constructor(public text: string) {}
      }, configurable: true });
      Object.defineProperty(window, 'speechSynthesis', { value: {
        cancel() {},
        getVoices: () => [{ lang: language === 'en' ? 'en-US' : 'vi-VN', name: 'Test voice' }],
        speak(utterance: SpeechSynthesisUtterance) {
          if (!utterance.text) return;
          spoken.push(utterance.text);
          setTimeout(() => {
            utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
            utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
          }, 0);
        },
      }, configurable: true });
      const createOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const oscillator = createOscillator.call(this);
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (when = 0) => { bells.push(when); start(when); };
        return oscillator;
      };
    }, locale);
    await page.goto('/tu-tap?mode=meditation', { waitUntil: 'domcontentloaded' });
    const text = translations[locale].practice;
    const chooser = page.locator('.meditation-chooser');
    await expect(chooser).toBeVisible();
    // The approved chooser exposes music as a tab of selectable tiles, not a native select.
    await expect(chooser.getByRole('button', { name: locale === 'vi' ? '15 phút' : '15 mins', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    const musicTabLabel = locale === 'vi' ? 'Nhạc thiền' : 'Music';
    const musicTab = chooser.getByRole('tab', { name: musicTabLabel, exact: true });
    await musicTab.click();
    await expect(musicTab).toHaveAttribute('aria-selected', 'true');
    const musicPanel = chooser.getByRole('tabpanel', { name: musicTabLabel, exact: true });
    const firstTrack = musicPanel.getByRole('button', {
      name: locale === 'vi' ? 'Nhạc Thiền 1 — Tĩnh lặng' : 'Meditation Music 1 — Stillness', exact: true,
    });
    await firstTrack.click();
    await expect(firstTrack).toHaveAttribute('aria-pressed', 'true');
    const clockStart = new Date('2026-10-25T00:00:00Z');
    // Giữ mốc bắt đầu cũ, dành khoảng đệm giả lập để pauseAt không rơi vào quá khứ giữa hai lệnh CI.
    await page.clock.install({ time: new Date(clockStart.getTime() - 60_000) });
    await page.clock.pauseAt(clockStart);
    await chooser.getByRole('button', { name: text.startMeditation, exact: true }).click();
    const screen = page.locator('.meditation-screen');
    await expect(screen).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __meditationMusic: HTMLMediaElement[] }).__meditationMusic
        .some(audio => !audio.paused && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA),
    )).toBe(true);
    await page.clock.fastForward(30_000);
    await page.evaluate(() => {
      (window as typeof window & { __meditationBells: number[] }).__meditationBells.length = 0;
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(10 * 60_000);
    await expect(screen.locator('.meditation-screen__time')).toHaveText('05:00');
    expect(await page.evaluate(() => (window as typeof window & { __meditationMusic: HTMLMediaElement[] }).__meditationMusic.some(audio => !audio.paused))).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(5 * 60_000);
    await expect(screen.locator('.meditation-screen__time')).toHaveText('00:00');
    await expect(screen.locator('.meditation-screen__badge--completed')).toHaveText(`🌸 ${text.sessionCompleted}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('completed.png') });
    const bells = await page.evaluate(() => (window as typeof window & { __meditationBells: number[] }).__meditationBells);
    expect(bells).toHaveLength(6);
    expect(bells[2] - bells[0]).toBeCloseTo(2.5);
    expect(bells[4] - bells[2]).toBeCloseTo(2.5);
    await page.clock.fastForward(8_000);
    await page.clock.runFor(100);
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __meditationSpoken: string[] }).__meditationSpoken.join(' '),
    )).toBe(text.completionAnnouncement);
    await screen.getByRole('button', { name: text.finish, exact: true }).click();
    await expect(screen).toHaveCount(0);
  });
}
