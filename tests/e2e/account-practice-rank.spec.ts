import { expect, test } from '@playwright/test';
import { loginAsMember } from './runtime-helpers';

const variations = [
  { days: 0, badges: [], selectedBadge: null, title: null, avatarBadge: null },
  { days: 1, badges: [], selectedBadge: null, title: 'Mới phát tâm', avatarBadge: null },
  { days: 7, badges: ['streak-7'], selectedBadge: null, title: 'Sơ Tâm Kiên Cố', avatarBadge: 'streak-7' },
  { days: 30, badges: ['streak-7', 'streak-30'], selectedBadge: null, title: 'Nguyệt Luân Tịnh Hạnh', avatarBadge: 'streak-30' },
  { days: 30, badges: ['streak-7', 'streak-30'], selectedBadge: 'streak-7', title: 'Nguyệt Luân Tịnh Hạnh', avatarBadge: 'streak-30' },
] as const;

for (const { days, badges, selectedBadge, title, avatarBadge } of variations) {
  test(`account shows practice rank for ${days} days (${selectedBadge ?? 'automatic'})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
    await loginAsMember(page);
    let progressReads = 0;
    await page.route('**/api/practice/progress', route => {
      progressReads += 1;
      return route.fulfill({ json: {
        profile: { leaderboardOptIn: true, presenceOptIn: true, selectedBadge, timeZone: 'Asia/Ho_Chi_Minh' },
        heatmap: [], streaks: { current: days, longest: days }, badges,
        totals: { acceptedCount: days, acceptedDurationSeconds: 0, sessions: days },
        breakdown: [], today: '2026-11-16',
      } });
    });
    await page.goto('/ca-nhan');
    const account = page.locator('.cn-big-tab-card').filter({ has: page.getByRole('heading', { name: 'Tài khoản', exact: true }) });
    await expect(account).toBeVisible();
    await expect.poll(() => progressReads).toBe(1);
    await account.click();
    await expect(page.getByText('e2e-member@example.com', { exact: false })).toBeVisible();
    await expect.poll(() => progressReads).toBe(1);

    const rank = page.locator('.cn-practice-rank');
    const rankLabel = page.locator('.cn-practice-rank-label');
    const award = page.locator('.cn-avatar-award');
    if (avatarBadge) {
      await expect(page.locator(`.cn-avatar-col.avatar-ring--${avatarBadge}`).locator('.cn-avatar-award')).toBeVisible();
    }
    if (title) {
      await expect(award).toHaveAccessibleName(title);
      await expect(award).toHaveText('');
      const icon = award.locator('.practice-badge-icon');
      await expect(icon).toBeVisible();
      if (avatarBadge) await expect(icon).toHaveAttribute('data-milestone', avatarBadge);
      else await expect(icon).toHaveClass(/practice-badge-icon--starter/);
      await expect(icon).toHaveCSS('width', '28px');
      const image = await icon.evaluate(element => getComputedStyle(element, '::before').backgroundImage);
      expect(image).toContain(avatarBadge ? 'home-milestones.webp' : 'home-new-practitioner.webp');
      await expect(rankLabel).toHaveText('Danh hiệu tu tập:');
      await expect(rank).toHaveText(title);
      for (const { width, theme } of [{ width: 375, theme: 'light' }, { width: 375, theme: 'dark' }, { width: 900, theme: 'light' }]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        const geometry = await rank.evaluate(element => {
          const label = element.previousElementSibling!;
          const email = element.parentElement!.previousElementSibling!;
          const rankBounds = element.getBoundingClientRect();
          const labelBounds = label.getBoundingClientRect();
          return {
            rankAfterLabel: rankBounds.top >= labelBounds.bottom || rankBounds.left >= labelBounds.right,
            labelBelowEmail: labelBounds.top >= email.getBoundingClientRect().bottom,
            pageOverflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(geometry).toEqual({ rankAfterLabel: true, labelBelowEmail: true, pageOverflow: false });
        if (days === 7 && width === 375) {
          await page.locator('.cn-profile-header').screenshot({ path: testInfo.outputPath(`rank-${theme}.png`) });
        }
      }
    } else {
      await expect(rankLabel).toHaveCount(0);
      await expect(rank).toHaveCount(0);
      await expect(award).toHaveCount(0);
    }
    await page.locator('.cn-subpage-back-btn').click();
    await account.click();
    await expect(page.getByText('e2e-member@example.com', { exact: false })).toBeVisible();
    if (title) await expect(rank).toHaveText(title);
    expect(progressReads).toBe(1);
  });
}
