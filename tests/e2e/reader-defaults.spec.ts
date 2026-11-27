import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient, choosePdfOnline } from './runtime-helpers';

test.beforeEach(async ({ page }) => { await loginAsMember(page); });

test('an explicit light preference keeps warm paper even with a dark OS preference', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('tutam_dark_mode')) localStorage.setItem('tutam_dark_mode', '0');
    if (!localStorage.getItem('tutam_app_light_palette')) localStorage.setItem('tutam_app_light_palette', 'cream');
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-cream/);
  await expect(page.locator('.reader-modal')).toHaveCSS('background-color', 'rgb(244, 236, 216)');
  await page.getByRole('button', { name: 'Nền giấy Trắng', exact: true }).click();
  await page.reload();
  await settleClient(page);
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-white/);

  await page.goto('/?article=e2e-pdf');
  await settleClient(page);
  await choosePdfOnline(page);
  const paper = page.getByRole('combobox', { name: 'Nền giấy', exact: true });
  await expect(paper).toHaveValue('white');
  await expect(page.locator('.pdf-shell')).toHaveAttribute('data-paper', 'white');
  await paper.selectOption('cream');
  await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'cream');
  await page.reload();
  await settleClient(page);
  await choosePdfOnline(page);
  await expect(paper).toHaveValue('cream');
});

test('all six PDF backgrounds use the app theme and persist after closing the reader', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?article=e2e-pdf');
  await choosePdfOnline(page);
  const tools = page.getByRole('button', { name: 'Công cụ', exact: true });
  await tools.click();
  const paper = page.getByRole('combobox', { name: 'Nền giấy', exact: true });
  await expect(paper.locator('option')).toHaveCount(6);
  await expect(page.locator('.pdf-page canvas').first()).toBeVisible();
  // The fixture paints its own cream page. Checking CSS alone would miss that
  // tint being multiplied into every selected app paper.
  expect(await page.locator('.pdf-page canvas[data-rendered]').first().evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data).slice(0, 3);
  })).toEqual([255, 255, 255]);
  for (const choice of ['white', 'cream', 'gray', 'dark', 'purple', 'auto']) {
    await paper.selectOption(choice);
    const resolved = choice === 'auto' ? 'cream' : choice;
    await expect(page.locator('html')).toHaveAttribute('data-app-palette', resolved);
    await expect(page.locator('.pdf-shell')).toHaveAttribute('data-paper', resolved);
    const colors = await page.locator('.pdf-page').first().evaluate(element => ({
      paper: getComputedStyle(element).backgroundColor,
      reader: getComputedStyle(element.closest('.reader-modal')!).backgroundColor,
      app: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    }));
    expect(await page.evaluate(({ color, variable }) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.fillStyle = color; const first = context.fillStyle;
      context.fillStyle = variable; return context.fillStyle === first;
    }, { color: colors.paper, variable: colors.app })).toBe(true);
    expect(colors.reader).toBe(colors.paper);
    await page.getByRole('button', { name: 'Đóng công cụ', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`pdf-paper-${choice}.png`), animations: 'disabled' });
    await tools.click();
  }
  await paper.selectOption('purple');
  await page.getByRole('button', { name: 'Đóng công cụ', exact: true }).click();
  const reader = page.locator('.reader-modal');
  // Restored progress can hide the header; reverse-scroll before using Back.
  await reader.locator('.pdf-viewer').evaluate(element => {
    element.scrollTop = Math.max(0, element.scrollTop - 80);
  });
  await expect(reader).not.toHaveClass(/zen-mode/);
  await reader.locator('.reader-back').click();
  await expect(page.locator('.reader-modal')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'purple');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-palette', 'purple');
  await page.goto('/?article=e2e-pdf');
  await choosePdfOnline(page);
  await tools.click();
  await expect(paper).toHaveValue('purple');
});

for (const width of [375, 1440]) {
  test(`PDF resume keeps the saved page when a previous pixel offset belongs to another page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.route('**/api/reading/progress/pdf/e2e-pdf', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      // This page/offset pair was captured from the desktop reader. A narrow
      // viewport must resume page two instead of reusing page three's pixels.
      await route.fulfill({ json: { progress: {
        contentKind: 'pdf', contentId: 'e2e-pdf', revision: 1, epoch: 1,
        deviceId: 'e2e-resume', deviceSequence: 1, position: { page: 2, scrollTop: 1178 },
        total: 3, percent: 66.7, contentVersion: null,
        clientUpdatedAt: new Date().toISOString(), serverUpdatedAt: new Date().toISOString(),
      } } });
    });
    await page.goto('/?article=e2e-pdf');
    await choosePdfOnline(page);
    await expect(page.getByText('📖 Tiếp tục từ vị trí đã đọc', { exact: true })).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('.pdf-page-status > span')).toHaveText('Trang 2 / 3');
  });
}

test('an explicitly saved dark site preference is preserved', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-dark/);
});

test('without a saved theme, the reader follows a dark system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-dark/);
});

for (const appTheme of ['0', '1']) {
  test(`reader imported ink and highlighted emphasis stay readable on every paper with app theme ${appTheme}`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value), appTheme);
    await page.goto('/?article=e2e-public');
    await settleClient(page);
    const reader = page.locator('.reader-modal');
    await expect(reader.locator('.reader-content')).toBeVisible();
    const papers = appTheme === '1' ? ['Tối', 'Be nhạt'] : ['Trắng', 'Be nhạt', 'Xám'];
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 375) await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
      for (const paper of papers) {
      await page.getByRole('button', { name: `Nền giấy ${paper}`, exact: true }).click();
      await expect(reader.locator('.reader-scroll')).toHaveCSS('color', await reader.evaluate(modal => getComputedStyle(modal).color));
      // Fixture text exercises the real reader CSS without changing stored content.
      const ratios = await reader.evaluate(modal => {
        const content = modal.querySelector('.reader-content')!;
        if (!content.querySelector('[data-contrast-probes]')) {
          const samples = document.createElement('div');
          samples.dataset.contrastProbes = '';
          samples.innerHTML = '<em data-contrast-probe="guidance">(3 lần)</em>'
            + '<p style="background-color:rgb(255,255,255);color:rgb(51,51,51)"><span data-contrast-probe="imported-paper">Kinh văn</span></p>'
            + '<span style="color:#ffffff" data-contrast-probe="imported-white">Lời giảng</span>'
            + '<div class="tt-converted-book"><p class="book-paragraph"><strong data-contrast-probe="converted-bold">Khuyên người niệm Phật</strong></p><aside class="footnote"><p class="note-label" data-contrast-probe="note-label">Chú thích</p><p><strong data-contrast-probe="note-bold">Lời giải</strong></p></aside><div class="boxed"><em data-contrast-probe="boxed-guidance">(Lời hướng dẫn)</em></div></div>'
            + '<mark data-reading-annotation="contrast-yellow" data-color="yellow"><strong data-contrast-probe="highlight-bold">Đoạn đã đánh dấu</strong> <em data-contrast-probe="highlight-italic">(3 lần)</em></mark>';
          // Các cặp màu nhập thực tế trong sách đóng offline phải theo nền giấy.
          for (const [index, style] of [
            'color:#ff0000', 'background-color:hsl(0,0%,100%)',
            'background-color:hsl(0,0%,100%);color:rgb(33,37,41)',
            'color:hsl(240,75%,60%)', 'color:#0000DE', 'color:rgb(255,0,0)',
            'background-color:rgb(255,255,255);color:rgb(51,51,51);font-size:15px',
            'color:rgb(33,37,41)', 'background-color:rgb(255,255,255);color:rgb(51,51,51)',
            'color:#dfb75c', 'text-align:center;color:#b45309;line-height:1.4',
          ].entries()) {
            const sample = document.createElement('span');
            sample.dataset.contrastProbe = `corpus-style-${index}`;
            sample.setAttribute('style', style);
            sample.textContent = 'Nội dung sách';
            samples.append(sample);
          }
          const nested = document.createElement('span');
          nested.dataset.contrastProbe = 'highlight-imported-style';
          nested.style.color = '#ffffff';
          nested.textContent = 'Chữ có màu trong đánh dấu';
          samples.querySelector('mark')!.append(nested);
          content.append(samples);
        }
        const pixel = document.createElement('canvas').getContext('2d')!;
        const channels = (value: string) => {
          pixel.clearRect(0, 0, 1, 1);
          pixel.fillStyle = value;
          pixel.fillRect(0, 0, 1, 1);
          return Array.from(pixel.getImageData(0, 0, 1, 1).data);
        };
        const luminance = (rgb: number[]) => rgb.map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        return [...content.querySelectorAll<HTMLElement>('[data-contrast-probe]')].map(sample => {
          const ancestors: Element[] = [];
          for (let node: Element | null = sample; node; node = node.parentElement) ancestors.unshift(node);
          let paper = [255, 255, 255];
          for (const node of ancestors) {
            const rgba = channels(getComputedStyle(node).backgroundColor);
            const alpha = rgba[3] / 255;
            paper = paper.map((channel, index) => rgba[index] * alpha + channel * (1 - alpha));
          }
          const ink = luminance(channels(getComputedStyle(sample).color).slice(0, 3));
          const background = luminance(paper);
          return { name: sample.dataset.contrastProbe, ratio: (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05) };
        });
      });
      await testInfo.attach(`contrast-${width}-${paper}`, { body: JSON.stringify(ratios), contentType: 'application/json' });
      for (const sample of ratios) expect.soft(sample.ratio, `${sample.name} on ${paper}, ${width}px`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
}
