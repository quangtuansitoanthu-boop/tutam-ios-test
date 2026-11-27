import { expect, test } from '@playwright/test';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { DIVINATION_HISTORY_KEY } from '../../src/lib/browser/storage-contract';
import { settleClient } from './runtime-helpers';

for (const { width, theme } of [
  { width: 320, theme: 'dark' },
  { width: 375, theme: 'light' },
  { width: 1440, theme: 'light' },
] as const) {
  test(`keeps homepage divination links balanced at ${width}px in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((mode) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', mode === 'dark' ? '1' : '0');
      if ('Notification' in window) {
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
      }
    }, theme);
    await page.goto('/');
    await settleClient(page);

    const section = page.getByRole('region', { name: 'Cảm ứng tâm linh' });
    const links = section.getByRole('link');
    await expect(links).toHaveCount(4);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await section.evaluate((element) => element.previousElementSibling?.querySelector('h2')?.textContent))
      .toBe('Nuôi dưỡng tâm an');
    const [first, second] = await links.evaluateAll((elements) => elements.map((element) => {
      const { x, y, width, height, right } = element.getBoundingClientRect();
      const title = element.querySelector('strong')!;
      const lineLayout = [...element.querySelectorAll('strong > span')].map((line) => [
        line.textContent,
        getComputedStyle(line).display,
      ]);
      return {
        x, y, width, height, right, lineLayout,
        titleScrollOverflow: title.scrollWidth > title.clientWidth,
        overflow: element.scrollWidth > element.clientWidth,
      };
    }));
    expect(first.width).toBeCloseTo(second.width, 1);
    expect(first.height).toBeCloseTo(second.height, 1);
    expect(first.y).toBeCloseTo(second.y, 1);
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.right).toBeLessThan(second.x);
    expect(second.right).toBeLessThanOrEqual(width);
    for (const card of [first, second]) {
      expect(card.height).toBeGreaterThanOrEqual(44);
      expect(card.overflow).toBe(false);
      expect(card.titleScrollOverflow).toBe(false);
    }
    if (width < 540) {
      expect(first.lineLayout).toEqual([['Quan Âm', 'inline'], ['Linh Xăm', 'inline']]);
      expect(second.lineLayout).toEqual([['Mộc Luân', 'inline'], ['Chiêm Sát', 'inline']]);
      await expect(section.locator('small')).toHaveText(['100 quẻ', '189 tướng', '3 đường sóng', '120+ giấc mơ'], { useInnerText: true });
    }

    if (width === 375) {
      for (const { name, route } of [
        { name: /^Quan Âm Linh Xăm/u, route: '/tu-tap/quan-am-linh-xam' },
        { name: /^Mộc Luân Chiêm Sát/u, route: '/tu-tap/moc-luan-chiem-sat' },
        { name: /^Nhịp Sinh Học/u, route: '/tu-tap/nhip-sinh-hoc' },
        { name: /^Giải Mộng/u, route: '/tu-tap/giai-mong' },
      ]) {
        const link = section.getByRole('link', { name });
        await expect(link).toHaveAttribute('href', route);
        await link.focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(route);
        await page.getByRole('button', { name: 'Quay lại Trang chủ', exact: true }).click();
        await expect(page).toHaveURL('/');
        await expect(section).toBeVisible();
      }
    }
  });
}

for (const { width, theme } of [
  { width: 375, theme: 'dark' },
  { width: 1440, theme: 'light' },
] as const) {
  test(`keeps the title and guide within the header at ${width}px in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((mode) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', mode === 'dark' ? '1' : '0');
    }, theme);
    for (const slug of ['quan-am-linh-xam', 'moc-luan-chiem-sat']) {
      await page.goto(`/tu-tap/${slug}`);
      await settleClient(page);
      const title = page.locator('h1.div-subbar-title');
      const guide = page.getByRole('button', { name: 'Hướng dẫn', exact: true });
      await expect(title).toBeVisible();
      await expect(guide).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const titleBox = await title.boundingBox();
      const guideBox = await guide.boundingBox();
      expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(guideBox!.x);
      expect(guideBox!.x + guideBox!.width).toBeLessThanOrEqual(width);
      expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
  });
}

test('lands the numbered stick before xin keo and settles the drawn coins on the correct faces', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    if ('Notification' in window) {
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    }
  });
  await page.goto('/tu-tap/quan-am-linh-xam');
  await settleClient(page);
  await page.evaluate(() => { Math.random = () => 0.26; });
  const shake = page.getByRole('button', { name: 'Thành tâm lắc ống tre' });
  const tube = page.locator('[data-qa-artwork="tube"] canvas');
  const initial = await tube.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await expect(shake).toBeEnabled();
  await shake.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Thẻ xăm số 27 đã rơi ra.', { exact: true })).toBeVisible();
  expect(await tube.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(initial);

  const first = page.getByRole('button', { name: /^Tung đồng tiền.*Lần 1/u });
  const second = page.getByRole('button', { name: /^Tung đồng tiền.*Lần 2/u });
  const coins = page.locator('[data-qa-artwork="coins"]');
  const faces = page.locator('.qa-coin-labels');
  await expect(first).toBeFocused();
  await expect(coins.locator('canvas')).toBeVisible();
  const idleCoins = await coins.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pen = canvas.getContext('2d')!;
    const density = canvas.width / 350;
    const alpha = (x: number) => pen.getImageData(Math.round(x * density), Math.round(144 * density), 1, 1).data[3];
    return { holes: [alpha(102), alpha(248)], faces: [alpha(84), alpha(230)] };
  });
  expect(idleCoins.holes).toEqual([0, 0]);
  expect(idleCoins.faces.every((alpha) => alpha === 255)).toBe(true);
  await page.evaluate(() => { Math.random = () => 0.89; });
  await first.click();
  await expect(faces).toBeHidden();
  await expect(second).toBeEnabled();
  await expect(faces.getByText('Mặt ngửa', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/Kết quả Lần 1/u)).toContainText('Tiếu keo');

  await page.evaluate(() => { Math.random = () => 0.1; });
  await second.click();
  await expect(page.getByRole('button', { name: /^Tung đồng tiền.*Lần 3/u })).toBeEnabled();
  await expect(faces.getByText('Mặt sấp', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/Kết quả Lần 2/u)).toContainText('Âm keo');
});

for (const { width, theme } of [
  { width: 375, theme: 'dark' },
  { width: 1440, theme: 'light' },
] as const) {
  test(`reads detailed results 26 and 143 from existing history at ${width}px in ${theme} mode`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost:8787').origin;
    await page.route(url => /^https?:$/u.test(url.protocol) && url.origin !== origin, route => route.abort());
    const historyKey = principalStorageKey(null, DIVINATION_HISTORY_KEY);
    const entry = {
      id: 'qa-legacy-26',
      kind: 'quan-am',
      dateKey: '2026-11-26',
      createdAt: '2026-11-26T08:00:00+07:00',
      resultNumber: 26,
      title: 'Quẻ số 26',
      topicId: 'career',
      topicLabel: 'Công danh & Sự nghiệp',
      summary: 'Trung Cát',
    };
    const mocEntry = {
      id: 'ml-legacy-143',
      kind: 'moc-luan',
      dateKey: '2026-11-26',
      createdAt: '2026-11-26T08:05:00+07:00',
      resultNumber: 143,
      title: 'Tướng chiêm sát số 143',
      topicLabel: 'Không ghi chú',
      summary: 'Quán tuy có tai nạn, nhưng do tinh tấn mà thoát khỏi.',
      rounds: [55, 45, 43],
    };
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(({ key, entries, theme }) => {
      localStorage.setItem(key, JSON.stringify(entries));
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
      if ('Notification' in window) {
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
      }
    }, { key: historyKey, entries: [entry, mocEntry], theme });
    await page.goto('/tu-tap/quan-am-linh-xam');
    await settleClient(page);
    await page.getByText(/Lịch sử Quan Âm Linh Xăm/u).click();
    await page.getByRole('button', { name: /^Quẻ số 26/u }).click();
    await expect(page.getByRole('heading', { name: /^QUẺ SỐ 26/u })).toBeVisible();
    const analysis = page.locator('.qa-res-sec').filter({
      has: page.getByRole('heading', { name: /Phân tích mở rộng/u }),
    });
    await expect(analysis).toContainText(/thư|lời hứa/u);
    expect(await analysis.locator('.qa-prose:not(.qa-prose--highlight)').count()).toBeGreaterThanOrEqual(3);
    const advice = page.locator('.qa-res-sec').filter({
      has: page.getByRole('heading', { name: /Hướng tu tâm/u }),
    });
    await advice.scrollIntoViewIfNeeded();
    await expect(advice).toBeVisible();
    expect((await advice.innerText()).length).toBeGreaterThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await advice.screenshot({ path: test.info().outputPath('quan-am-26-advice.png') });
    await page.goto('/tu-tap/moc-luan-chiem-sat');
    await settleClient(page);
    await page.getByText(/Lịch sử Mộc Luân Chiêm Sát/u).click();
    await page.getByRole('button', { name: /^Tướng chiêm sát số 143/u }).click();
    await expect(page.getByRole('heading', { name: 'TƯỚNG CHIÊM SÁT SỐ 143', exact: true })).toBeVisible();
    const lecture = page.locator('.ml-res-sec').filter({
      has: page.getByRole('heading', { name: /Tóm lược lời giảng/u }),
    });
    await expect(lecture).toContainText('tinh tấn');
    await expect(lecture).not.toContainText(/Tứ Đại|thầy thuốc/u);
    const meaning = page.locator('.ml-res-sec').filter({
      has: page.getByRole('heading', { name: /Phân tích chuyên sâu/u }),
    });
    await expect(meaning.locator(':scope > .ml-prose')).toHaveCount(3);
    await expect(meaning).toContainText('tai nạn');
    const completion = page.locator('.ml-completion-note');
    await completion.scrollIntoViewIfNeeded();
    await expect(completion).toContainText('Trở về với chánh niệm');
    await expect(completion).not.toContainText('thu dọn');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await meaning.screenshot({ path: test.info().outputPath('moc-luan-143-meaning.png') });
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), historyKey)).toEqual([entry, mocEntry]);
  });
}

test('opens both divination flows from Tu tập and enforces their ritual rules', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:8787');
  test.skip(!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Uses the local runtime only.');

  await page.route(url => /^https?:$/u.test(url.protocol) && url.origin !== origin.origin, route => route.abort());
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    if ('Notification' in window) {
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    }
  });

  await page.goto('/tu-tap');
  await settleClient(page);
  await expect(page.getByRole('heading', { name: 'Cảm ứng tâm linh' })).toBeVisible();
  await page.getByRole('link', { name: /^Quan Âm Linh Xăm/u }).click();
  await expect(page).toHaveURL(/\/tu-tap\/quan-am-linh-xam$/u);

  await expect(page.getByRole('combobox', { name: /việc cần thỉnh ý/iu })).toHaveValue('');
  // Cùng một mặt đồng tiền ở cả ba lượt để không có Thánh keo.
  await page.evaluate(() => { Math.random = () => 0.1; });
  await page.getByRole('button', { name: 'Thành tâm lắc ống tre' }).click();
  for (const round of [1, 2, 3]) {
    await page.getByRole('button', { name: new RegExp(`^Tung đồng tiền.*Lần ${round}`, 'u') }).click();
  }
  await expect(page.getByText(/\(0\/3\)/u)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gieo lại', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /xem.*tham khảo/iu }).click();
  await expect(page.getByRole('heading', { name: /^QUẺ SỐ 11\b/u })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu nhật ký', exact: true })).toBeHidden();
  const historyKey = principalStorageKey(null, DIVINATION_HISTORY_KEY);
  const history = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), historyKey);
  expect(history).toEqual([]);
  await page.getByRole('button', { name: 'Quay lại Tu Tập' }).click();
  await expect(page).toHaveURL(/\/tu-tap\/quan-am-linh-xam$/u);
  await expect(page.getByRole('button', { name: 'Thành tâm lắc ống tre' })).toBeVisible();
  await page.getByRole('combobox', { name: /việc cần thỉnh ý/iu }).selectOption('travel');
  await page.getByRole('button', { name: 'Thành tâm lắc ống tre' }).click();
  await expect(page.getByRole('button', { name: /^Tung đồng tiền.*Lần 1/u })).toBeVisible();
  await page.evaluate(() => {
    let faces = 0;
    Math.random = () => (++faces % 2 === 1 ? 0.1 : 0.9);
  });
  for (const round of [1, 2, 3]) {
    await page.getByRole('button', { name: new RegExp(`^Tung đồng tiền.*Lần ${round}`, 'u') }).click();
  }
  await expect(page.getByRole('heading', { name: /^QUẺ SỐ 11\b/u })).toBeVisible();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), historyKey))
    .toMatchObject([{ kind: 'quan-am', topicId: 'travel', resultNumber: 11 }]);

  await page.goto('/tu-tap');
  await settleClient(page);
  await page.getByRole('link', { name: /^Mộc Luân Chiêm Sát/u }).click();
  await expect(page).toHaveURL(/\/tu-tap\/moc-luan-chiem-sat$/u);
  const confirmation = page.getByRole('checkbox', { name: /Tôi xác nhận/u });
  const enterRoll = page.getByRole('button', { name: /Xác nhận xong.*Vào gieo Mộc Luân/u });
  await expect(page.getByRole('heading', { name: /QUÁN TƯỞNG CÚNG DƯỜNG/u })).toBeVisible();
  const offering = page.getByText(/^Hôm nay con xin đem tất cả/u);
  await expect(offering).toBeVisible();
  await expect(page.getByText('Mở đọc đầy đủ văn quán tưởng cúng dường mười phương')).toHaveCount(0);
  await expect(page.getByText('Nhất tâm xưng niệm đủ 1.000 câu trước khi đọc lời thỉnh nguyện.')).toBeVisible();
  await expect(enterRoll).toBeDisabled();
  await confirmation.check();
  await enterRoll.click();
  await expect(page.getByText(/Giữ các luân bằng hai tay/u)).toBeVisible();
  // Mặt thứ tư của cả sáu luân đều trống.
  await page.evaluate(() => { Math.random = () => 0.99; });
  for (const round of [1, 2, 3]) {
    await page.getByRole('button', { name: new RegExp(`^Gieo 6 Mộc Luân.*Lần ${round}`, 'u') }).click();
  }
  await expect(page.getByRole('alert').filter({ hasText: /Tướng Vô sở hữu/u })).toBeVisible();
  await page.getByRole('button', { name: /^(Gieo lại|(?:Quay|Trở) (?:lại|về) nghi thức)$/iu }).click();
  await expect(offering).toBeVisible();
  await expect(confirmation).not.toBeChecked();
  await expect(enterRoll).toBeDisabled();
  await confirmation.check();
  await enterRoll.click();
  // Mặt đầu của sáu luân cộng 51 điểm mỗi lượt, tổng là 153.
  await page.evaluate(() => { Math.random = () => 0.1; });
  for (const round of [1, 2, 3]) {
    await page.getByRole('button', { name: new RegExp(`^Gieo 6 Mộc Luân.*Lần ${round}`, 'u') }).click();
  }
  await expect(page.getByRole('heading', { name: 'TƯỚNG CHIÊM SÁT SỐ 153', exact: true })).toBeVisible();
  await expect(page.getByText('NGUYÊN VĂN KINH CHIÊM SÁT', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu nhật ký', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu vào nhật ký trên thiết bị' })).toBeVisible();

  await page.reload();
  await settleClient(page);
  await page.getByText(/Lịch sử Mộc Luân Chiêm Sát/u).click();
  await expect(page.getByText(/Gỡ ứng dụng hoặc xóa dữ liệu ứng dụng/u)).toBeVisible();
  await page.getByRole('button', { name: /^Số 153/u }).click();
  await expect(page.getByRole('heading', { name: 'TƯỚNG CHIÊM SÁT SỐ 153', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Gieo lượt mới' }).click();
  await expect(confirmation).not.toBeChecked();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await settleClient(page);
  await page.getByText(/Lịch sử Mộc Luân Chiêm Sát/u).click();
  await expect(page.getByText('Chưa có lượt gieo nào được lưu trên thiết bị này.')).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại Tu Tập', exact: true }).click();
  await expect(page).toHaveURL('/tu-tap');
});
