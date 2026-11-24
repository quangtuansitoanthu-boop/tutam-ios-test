import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

const cases = [
  { name: 'guest', authenticated: false, days: 0, badges: [], title: '' },
  { name: 'zero days', authenticated: true, days: 0, badges: [], title: '' },
  { name: 'first day', authenticated: true, days: 1, badges: [], title: 'Mới phát tâm', position: '93.1% 35.7%', colorFilter: 'sepia(1) saturate(1.8)' },
  { name: 'seven days', authenticated: true, days: 7, badges: ['streak-7'], title: 'Sơ Tâm Kiên Cố', position: '2.4% 2.3%' },
  { name: 'thirty days', authenticated: true, days: 30, badges: ['streak-7', 'streak-30'], title: 'Nguyệt Luân Tịnh Hạnh', position: '33.9% 2.3%', colorFilter: 'grayscale(1) contrast(0.24) brightness(1.6)' },
  { name: 'ninety days', authenticated: true, days: 90, badges: ['streak-90'], title: 'Tam Nguyệt An Cư', position: '65.5% 2.3%', colorFilter: 'hue-rotate(32deg) saturate(1.2)' },
  { name: '180 days', authenticated: true, days: 180, badges: ['streak-180'], title: 'Bán Niên Tinh Tiến', position: '97.2% 2.3%', colorFilter: 'grayscale(1) sepia(1) saturate(4) hue-rotate(313deg) brightness(0.84)' },
  { name: '300 days', authenticated: true, days: 300, badges: ['streak-300'], title: 'Đạo Tâm Bất Thoái', position: '2.4% 49.1%' },
  { name: '365 days', authenticated: true, days: 365, badges: ['streak-365'], title: 'Nhất Niên Viên Mãn', position: '33.9% 49.1%' },
  { name: '800 days', authenticated: true, days: 800, badges: ['streak-800'], title: 'Thâm Nhập Kinh Tạng', position: '65.5% 49.1%', colorFilter: 'grayscale(1) contrast(0.58) sepia(0.7) brightness(1.28)' },
  { name: '1000 days', authenticated: true, days: 1000, badges: ['streak-1000'], title: 'Thiên Nhật Kim Cang', position: '97.2% 49.1%' },
  { name: '3000 days', authenticated: true, days: 3000, badges: ['streak-3000'], title: 'Vạn Đức Bồ Đề', position: '2.4% 95.5%', colorFilter: 'grayscale(1) sepia(1) saturate(3.2) hue-rotate(185deg) brightness(1.38)' },
  { name: '10000 days', authenticated: true, days: 10000, badges: ['streak-10000'], title: 'Vạn Nhật Liên Tâm', position: '33.9% 95.5%', colorFilter: 'saturate(0.78) brightness(1.22)' },
  { name: 'last tier', authenticated: true, days: 20000, badges: ['streak-20000'], title: 'Hằng Tâm Diệu Hạnh', position: '65.5% 95.5%' },
] as const;

for (const scenario of cases) {
  const { name, authenticated, days, badges, title } = scenario;
  test(`home greeting shows the 3D practice badge for ${name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
    if (authenticated) await loginAsMember(page);
    let progressReads = 0;
    await page.route('**/api/practice/progress', route => {
      expect(route.request().method()).toBe('GET');
      progressReads += 1;
      return route.fulfill({ json: {
        profile: { leaderboardOptIn: true, presenceOptIn: true, selectedBadge: days === 30 ? 'streak-7' : null, timeZone: 'Asia/Ho_Chi_Minh' },
        heatmap: [], streaks: { current: days, longest: days }, badges,
        totals: { acceptedCount: days, acceptedDurationSeconds: 0, sessions: days }, breakdown: [], today: '2026-11-16',
      } });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settleClient(page);
    const header = page.locator('.home-greeting-header');
    await expect(header.locator('.greeting-name')).toHaveText(authenticated ? 'Thành viên E2E' : 'Quý Phật Tử');
    if (authenticated) await expect.poll(() => progressReads).toBe(1);
    else expect(progressReads).toBe(0);

    const avatar = header.locator('.greeting-avatar');
    await expect(avatar).toHaveCSS('width', authenticated ? '52px' : '40px');
    if (authenticated) await expect(avatar).toHaveCSS('border-top-width', '2px');
    const badge = avatar.locator('.greeting-badge .practice-badge-icon');
    const rank = header.locator('.greeting-rank');
    if (!title) {
      await expect(rank).toHaveCount(0);
      await expect(badge).toHaveCount(0);
      return;
    }

    await expect(rank).toHaveText(title);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCSS('width', '28px');
    await expect(badge).toHaveCSS('filter', 'none');
    const artwork = days === 1 ? 'home-new-practitioner.webp' : 'home-milestones.webp';
    const image = await badge.evaluate(element => {
      const { filter, backgroundImage, backgroundPosition } = getComputedStyle(element, '::before');
      return { filter, backgroundImage, backgroundPosition };
    });
    expect(image.filter).toBe('colorFilter' in scenario ? scenario.colorFilter : 'none');
    expect(image.backgroundImage).toContain(artwork);
    if ('position' in scenario) {
      const position = image.backgroundPosition.split(' ')
        .map(value => `${Number.parseFloat(value).toFixed(1)}%`).join(' ');
      expect(position).toBe(scenario.position);
    }
    for (const { width, theme } of [{ width: 375, theme: 'light' }, { width: 375, theme: 'dark' }, { width: 900, theme: 'light' }]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await expect(avatar).toHaveCSS('width', '52px');
      const avatarBorderColor = await avatar.evaluate(element => getComputedStyle(element).borderTopColor);
      expect(await badge.evaluate(element => getComputedStyle(element).boxShadow)).toContain(avatarBorderColor);
      const geometry = await header.evaluate(element => {
        const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
        const [hello, name, rank] = ['.greeting-hello', '.greeting-name', '.greeting-rank'].map(rect);
        return {
          sameLine: hello.left < name.left && hello.top < name.bottom && name.top < hello.bottom,
          titleBelow: rank.top >= name.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry).toEqual({ sameLine: true, titleBelow: true, overflow: false });
      if (width === 375 && theme === 'light') {
        await header.locator('.greeting-user').screenshot({ path: testInfo.outputPath('home-badge-light.png') });
      } else if ((days === 1 || days === 7 || days === 30) && width === 375) {
        await header.screenshot({ path: testInfo.outputPath(`home-badge-${theme}.png`) });
      }
    }
    if (days === 7) {
      await header.locator('.greeting-btn').click();
      const account = page.locator('.cn-big-tab-card').filter({ has: page.getByRole('heading', { name: 'Tài khoản', exact: true }) });
      await account.click();
      await expect(page.locator('.cn-practice-rank')).toHaveText(title);
      const accountIcon = page.locator('.cn-avatar-award .practice-badge-icon');
      await expect(accountIcon).toHaveAttribute('data-milestone', 'streak-7');
      expect(await accountIcon.evaluate(element => {
        const { filter, backgroundImage, backgroundPosition } = getComputedStyle(element, '::before');
        return { filter, backgroundImage, backgroundPosition };
      })).toEqual(image);
      expect(progressReads).toBe(1);

      await page.setViewportSize({ width: 375, height: 844 });
      await page.goto('/tien-do-tu-tap', { waitUntil: 'domcontentloaded' });
      const badgesPanel = page.getByRole('region', { name: 'Huy hiệu thành tựu' });
      await expect(badgesPanel.locator('.practice-badge-icon')).toHaveCount(12);
      await expect(badgesPanel.locator('.badge-card--starter')).toContainText('✓ Đã mở khóa');
      const earned = badgesPanel.locator('.badge-card.current');
      await expect(earned).toContainText('Sơ Tâm Kiên Cố');
      await expect(earned).toContainText('Đang hiển thị trên ảnh đại diện');
      const earnedIcon = earned.locator('.practice-badge-icon');
      await expect(earnedIcon).toHaveCSS('width', '48px');
      expect(await earnedIcon.evaluate(element => getComputedStyle(element, '::before').backgroundImage)).toBe(image.backgroundImage);
      const locked = badgesPanel.locator('.badge-card.locked').filter({ hasText: 'Nguyệt Luân Tịnh Hạnh' });
      await expect(locked.locator('.badge-card__lock')).toBeVisible();
      await expect(badgesPanel.locator('button.badge-card')).toHaveCount(0);
    }
  });
}

test('progress shows the highest badge even with a lower legacy selected badge', async ({ page }) => {
  await loginAsMember(page);
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  let profileWrites = 0;
  await page.route('**/api/practice/progress', route => {
    if (route.request().method() === 'PATCH') profileWrites++;
    return route.fulfill({ json: {
      profile: { leaderboardOptIn: false, presenceOptIn: false, selectedBadge: 'streak-7', timeZone: 'Asia/Ho_Chi_Minh' },
      heatmap: [], streaks: { current: 30, longest: 30 }, badges: ['streak-7', 'streak-30'],
      totals: { acceptedCount: 30, acceptedDurationSeconds: 0, sessions: 30 }, breakdown: [], today: '2026-11-16',
    } });
  });
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tien-do-tu-tap');
  const identity = page.locator('.practice-community__identity');
  const icon = identity.locator('.practice-badge-icon');
  const title = identity.getByText('Nguyệt Luân Tịnh Hạnh', { exact: true });
  await expect(title).toBeVisible();
  await expect(icon).toHaveAttribute('data-milestone', 'streak-30');
  await page.setViewportSize({ width: 320, height: 844 });
  const avatar = identity.locator('.practice-community__avatar');
  expect(await avatar.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
  const panel = page.getByRole('region', { name: 'Huy hiệu thành tựu' });
  await expect(panel.locator('.badge-card.current')).toContainText('Nguyệt Luân Tịnh Hạnh');
  await expect(panel.locator('button.badge-card')).toHaveCount(0);
  expect(profileWrites).toBe(0);
});
