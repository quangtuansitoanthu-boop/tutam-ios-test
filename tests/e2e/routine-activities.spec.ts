import { expect, test, type Page } from '@playwright/test';
import { deferStartupNotification, loginAsMember, settleClient, TEST_MEMBER_ID } from './runtime-helpers';

const settingsKey = 'quangtu_principal_v1:anonymous:tt_personal_settings_v1';
const modes = [
  'Thiền định', 'Lần tràng hạt', 'Lễ Phật & Sám Hối', 'Tụng, đọc kinh', 'Trì chú', 'Nghi thức khác',
  'Chép kinh', 'Chép danh hiệu Phật, Bồ Tát', 'Giữ giới thanh tịnh', 'Thọ Bát quan trai giới', 'Tiết dục bảo thân',
];

async function visitPractice(page: Page) {
  await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
  await settleClient(page);
}

async function openEditor(page: Page) {
  await page.getByRole('button', { name: 'Thời khóa tu tập', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Thời khóa tu tập', exact: true });
  await expect(editor).toBeVisible();
  return editor;
}

async function startSavedRoutine(page: Page, name: string) {
  await page.getByRole('button', { name: `Bắt đầu ${name}`, exact: true }).click();
  await page.getByRole('dialog', { name: 'Bắt đầu thời khoá tu tập?' }).getByRole('button', { name: 'Bắt đầu', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await deferStartupNotification(page);
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.route('**/api/**', route => route.fulfill({ status: 503 }));
});

test('routine copy selections open the chosen tools and keep the legacy step format', async ({ page }) => {
  await visitPractice(page);
  const editor = await openEditor(page);
  await editor.getByRole('button', { name: 'Tạo thời khóa mới', exact: true }).click();
  const draft = page.getByRole('dialog', { name: 'Tạo thời khóa mới', exact: true });
  const routineName = 'Hai bước biên chép';
  await draft.getByRole('textbox', { name: 'Tên thời khóa' }).fill(routineName);
  const add = async (name: string) => {
    await draft.getByRole('combobox', { name: 'Thêm bước' }).click();
    await page.getByRole('dialog', { name: 'Thêm bước' }).getByRole('button', { name, exact: true }).click();
  };
  await add('Chép kinh');
  await draft.getByRole('combobox', { name: 'Chọn bài kinh' }).click();
  await page.getByRole('dialog', { name: 'Chọn bài kinh' }).getByRole('button', { name: 'KINH DIỆU PHÁP LIÊN HOA' }).click();
  await add('Chép danh hiệu Phật, Bồ Tát');
  await draft.getByRole('combobox', { name: 'Chọn danh hiệu' }).click();
  await page.getByRole('dialog', { name: 'Chọn danh hiệu' }).getByRole('button', { name: /Quán Thế Âm/i }).click();
  await draft.getByRole('button', { name: 'Lưu thời khóa', exact: true }).click();
  const steps = await page.evaluate(({ key, name }) => JSON.parse(localStorage.getItem(key)!).routines.find((r: { name: string }) => r.name === name).steps, { key: settingsKey, name: routineName });
  expect(steps.map((step: { sourceId: string }) => step.sourceId)).toEqual(['routine-v1:scripture-copying', 'routine-v1:name-copying']);
  await startSavedRoutine(page, routineName);
  await expect(page).toHaveURL(/chep-kinh/);
  await expect(page.getByRole('button', { name: /KINH DIỆU PHÁP LIÊN HOA/i }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await page.getByRole('dialog', { name: 'Hành trì thời khóa' }).getByRole('button', { name: 'Hoàn tất bước', exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp tục ngay', exact: true }).click();
  await expect(page).toHaveURL(/chep-danh-hieu/);
  await expect(page.locator('#name-copying-title')).toHaveValue(/Quán Thế Âm/i);
});

for (const width of [375, 1100]) {
  test(`routine uses the catalog order and reads the complete repentance vow offline at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(dark => localStorage.setItem('tutam_dark_mode', dark ? '1' : '0'), width === 375);
    await visitPractice(page);
    const catalogNames = page.locator('.tt-practice-groups .tt-mode-title');
    await expect(catalogNames).toHaveText(modes);
    const editor = await openEditor(page);
    await editor.getByRole('button', { name: 'Tạo thời khóa mới', exact: true }).click();
    const draft = page.getByRole('dialog', { name: 'Tạo thời khóa mới', exact: true });
    const routineName = 'Phát nguyện và trì chú';
    await draft.getByRole('textbox', { name: 'Tên thời khóa' }).fill(routineName);
    const picker = page.getByRole('dialog', { name: 'Thêm bước', exact: true });
    const openPicker = () => draft.getByRole('combobox', { name: 'Thêm bước', exact: true }).click();
    await openPicker();
    await expect(picker.locator('.rosary-select__option:not(:disabled) > span:first-child')).toHaveText([
      'Phát nguyện Sám hối', ...modes, 'HỒI HƯỚNG',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await picker.getByRole('button', { name: 'Phát nguyện Sám hối', exact: true }).click();
    await expect(draft.locator('.step-card')).toHaveCount(1);
    await openPicker();
    await picker.getByRole('button', { name: 'Trì chú', exact: true }).click();
    await draft.getByRole('button', { name: 'Lưu thời khóa', exact: true }).click();
    await expect(draft.getByRole('status')).toHaveText('Hãy chọn nội dung cho từng bước.');
    await draft.getByRole('combobox', { name: 'Chọn bài chú', exact: true }).click();
    await page.getByRole('dialog', { name: 'Chọn bài chú' }).getByRole('button', { name: 'NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI', exact: true }).click();
    await draft.getByRole('button', { name: 'Lưu thời khóa', exact: true }).click();
    await expect(editor.getByRole('status')).toHaveText('Đã lưu thời khóa trên thiết bị.');
    const steps = await page.evaluate(({ key, name }) => JSON.parse(localStorage.getItem(key)!).routines.find((r: { name: string }) => r.name === name).steps, { key: settingsKey, name: routineName });
    expect(steps.map((step: { kind: string }) => step.kind)).toEqual(['dedication', 'dedication']);
    expect(steps[1].sourceId).toBe('routine-v1:mantra:tt_1781274943336');
    await startSavedRoutine(page, routineName);
    const transition = page.getByRole('dialog', { name: 'Hành trì thời khóa' });
    await expect(transition.locator('.routine-reading__verse .heading')).toHaveText([
      'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', 'SÁM OAN GIA TRÁI CHỦ',
    ]);
    await expect(transition.locator('.routine-reading__verse i').first()).toHaveText('(3 lần)');
    await transition.getByRole('button', { name: 'Đã đọc xong', exact: true }).click();
    await transition.getByRole('button', { name: 'Tiếp tục ngay', exact: true }).click();
    await expect(page.locator('.tt-practice')).toBeVisible();
    await expect(page).toHaveURL(/article=tt_1781274943336/u);
    await page.locator('.ttp-back').click();
    await page.getByRole('dialog', { name: 'Kết Thúc Công Phu?' }).getByRole('button', { name: 'Hồi hướng & Thoát' }).click();
    await expect(page.locator('.tt-practice')).toHaveCount(0);
  });
}

const otherSteps = [
  { mode: 'scripture-copying', label: 'Chép kinh', screen: '[data-testid="copying-page"]' },
  { mode: 'name-copying', label: 'Chép danh hiệu Phật, Bồ Tát', screen: '.name-copying' },
  { mode: 'precepts', label: 'Giữ giới thanh tịnh', screen: '[data-testid="precept-practice-screen"]' },
  { mode: 'eight-precepts', label: 'Thọ Bát quan trai giới', screen: '[data-testid="precept-practice-screen"]' },
  { mode: 'abstinence', label: 'Tiết dục bảo thân', screen: '.thanh-tinh-overlay' },
  { mode: 'sutra:tt_1780910773084', label: 'Tụng, đọc kinh', screen: '.tt-practice', article: 'tt_1780910773084' },
  { mode: 'ritual:tt_1781615695204', label: 'Nghi thức khác', screen: '.tt-practice', article: 'tt_1781615695204' },
];

test('routine opens the next practice after prostrations and both completion controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({
    nickname: '', routines: [{ id: 'seamless-routine', name: 'Thời khoá sáng', updatedAt: new Date().toISOString(), steps: [
      { id: 'bow', kind: 'prostration', phrase: 'Nam Mô A Di Đà Phật', count: 1 },
      { id: 'read', kind: 'dedication', sourceId: 'routine-v1:sutra:tt_1780910773084', text: 'Tụng kinh' },
      { id: 'chant', kind: 'dedication', sourceId: 'routine-v1:ritual:tt_1781615695204', text: 'Nghi thức' },
    ] }],
  })), settingsKey);
  await visitPractice(page);
  const editor = await openEditor(page);
  const play = editor.getByRole('button', { name: 'Bắt đầu Thời khoá sáng', exact: true });
  await expect(play).toHaveCSS('width', '52px');
  await expect(play).toHaveCSS('height', '52px');
  await play.click();
  const start = page.getByRole('dialog', { name: 'Bắt đầu thời khoá tu tập?' });
  await expect(start).toContainText('Thời khoá sáng · 3 bước');
  await start.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(play).toBeFocused();
  await expect(editor.getByRole('textbox', { name: 'Tên thời khóa' })).toHaveCount(0);
  await play.click();
  await start.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.locator('.lp-fullscreen-counter').click();
  const reader = page.locator('.tt-practice');
  await expect(reader).toBeVisible();
  await expect(page).toHaveURL(/article=tt_1780910773084/);
  await expect(page.locator('.tt-preview')).toHaveCount(0);
  await expect(reader.locator('.ttp-routine-context')).toHaveText('Thời khoá sáng · Bước 2/3');
  const toggle = reader.locator('.tt-practice__toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await reader.locator('.ttr-jump-btn').last().click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const finish = reader.getByRole('button', { name: 'Kết thúc', exact: true });
  await finish.click();
  const confirmation = page.getByRole('dialog', { name: 'Kết Thúc Công Phu?' });
  await confirmation.getByRole('button', { name: 'Tiếp tục tu' }).click();
  await expect(page).toHaveURL(/article=tt_1780910773084/);
  await finish.click();
  await confirmation.getByRole('button', { name: 'Hồi hướng & Thoát' }).click();
  await expect(page).toHaveURL(/article=tt_1781615695204/);
  await expect(reader).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.goBack();
  await expect(confirmation).toBeVisible();
  await expect(page).toHaveURL(/article=tt_1781615695204/);
  await confirmation.getByRole('button', { name: 'Tiếp tục tu' }).click();
  await reader.locator('.ttp-back').click();
  await confirmation.getByRole('button', { name: 'Hồi hướng & Thoát' }).click();
  await expect(reader).toHaveCount(0);
  await expect(page.locator('.tt-mode-card--rec')).toBeVisible();
});

test('confirming the end of a rosary session opens the next reading step', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({
    nickname: '', routines: [{ id: 'rosary-routine', name: 'Thời khoá sáng', updatedAt: new Date().toISOString(), steps: [
      { id: 'beads', kind: 'rosary', phrase: 'Nam Mô A Di Đà Phật', count: 108, automatic: false, bpm: 60 },
      { id: 'read', kind: 'dedication', sourceId: 'routine-v1:sutra:tt_1780910773084', text: 'Tụng kinh' },
    ] }],
  })), settingsKey);
  await visitPractice(page);
  await openEditor(page);
  await startSavedRoutine(page, 'Thời khoá sáng');

  const endSession = page.getByRole('button', { name: 'Kết thúc phiên', exact: true });
  const confirm = page.getByRole('dialog', { name: 'Kết thúc phiên lần hạt' });
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await endSession.click();
  await confirm.getByRole('button', { name: 'Tiếp tục niệm' }).click();
  await expect(page).toHaveURL(/mode=rosary/);
  await endSession.click();
  await confirm.getByRole('button', { name: 'Chốt sổ và thoát' }).click();

  await expect(page.locator('.tt-practice .ttp-routine-context')).toHaveText('Thời khoá sáng · Bước 2/2');
  await expect(page.locator('.tt-preview')).toHaveCount(0);
  await expect(page).not.toHaveURL(/mode=rosary/);
  const logs = await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]'));
  expect(logs).toEqual([expect.objectContaining({ count: 1 })]);
});

for (const kind of ['meditation', 'prostration'] as const) {
  for (const progressed of [false, true]) {
  test(`ending an under-target ${kind} step advances the paused routine with actual progress=${progressed}`, async ({ page }) => {
    if (kind === 'meditation') await page.clock.install();
    await page.addInitScript(({ key, kind }) => localStorage.setItem(key, JSON.stringify({
      nickname: '', routines: [{ id: 'early-routine', name: 'Kết thúc từng bước', updatedAt: new Date().toISOString(), steps: [
        kind === 'meditation' ? { id: 'early', kind, minutes: 15 } : { id: 'early', kind, count: 3, phrase: 'Nam Mô A Di Đà Phật' },
        { id: 'next', kind: 'dedication', text: 'BƯỚC TIẾP THEO' },
      ] }],
    })), { key: settingsKey, kind });
    await visitPractice(page);
    await openEditor(page);
    await startSavedRoutine(page, 'Kết thúc từng bước');
    if (kind === 'meditation' && progressed) await page.clock.fastForward(61_000);
    if (kind === 'prostration') {
      if (progressed) await page.locator('.lp-fullscreen-counter').click();
      await page.getByRole('button', { name: 'Quay về màn hình chuẩn bị', exact: true }).click();
    }
    const controls = page.locator('.routine-session:visible');
    await controls.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    if (kind === 'meditation') {
      await page.locator('.meditation-screen').getByRole('button', { name: 'Kết thúc sớm', exact: true }).click();
    } else {
      await page.keyboard.press('Escape');
      await page.locator('.lp__dialog-btn--ok').click();
    }
    if (kind === 'meditation') await page.clock.fastForward(6_000);
    const next = page.getByRole('dialog', { name: 'Hành trì thời khóa' });
    await expect(next).toContainText('BƯỚC TIẾP THEO', { timeout: 12_000 });
    await next.getByRole('button', { name: 'Đã đọc xong', exact: true }).click();
    await expect(next).toHaveCount(0);
    const saved = await page.evaluate(() => ({
      logs: JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]'),
      summaries: JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_routine_summaries_v1') || '[]'),
    }));
    expect(saved.logs).toEqual(progressed ? [expect.objectContaining({ count: 1 })] : []);
    expect(saved.summaries).toEqual([]);
  });
  }
}

for (const step of otherSteps) {
  test(`routine opens and returns from ${step.label}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let key = settingsKey;
    if (step.mode === 'scripture-copying') {
      key = settingsKey.replace(':anonymous:', `:${TEST_MEMBER_ID}:`);
      await loginAsMember(page);
    }
    await page.addInitScript(({ key, step }) => localStorage.setItem(key, JSON.stringify({
      routines: [{ id: 'routine-1', name: 'Kiểm tra hành trì', updatedAt: new Date().toISOString(), steps: [
        { id: 'step-1', kind: 'dedication', sourceId: 'routine-v1:' + step.mode, text: step.label },
      ] }], nickname: '',
    })), { key, step });
    await visitPractice(page);
    await openEditor(page);
    await startSavedRoutine(page, 'Kiểm tra hành trì');
    await expect(page.locator(step.screen).first()).toBeVisible();
    if (step.article) {
      await expect(page).toHaveURL(new RegExp('article=' + step.article, 'u'));
      await page.locator('.ttp-back').click();
      await page.getByRole('dialog', { name: 'Kết Thúc Công Phu?' }).getByRole('button', { name: 'Hồi hướng & Thoát' }).click();
      await expect(page.locator('.tt-practice')).toHaveCount(0);
      await expect(page.locator('.tt-mode-card--rec')).toBeVisible();
      return;
    }
    if (step.mode === 'name-copying') await page.locator('#name-line-0').fill('Nam Mô A');
    await page.goBack();
    const transition = page.getByRole('dialog', { name: 'Hành trì thời khóa' });
    await expect(transition.getByRole('heading', { name: step.label, exact: true })).toBeVisible();
    if (step.mode === 'name-copying') {
      await transition.getByRole('button', { name: 'Mở lại bước' }).click();
      await expect(page.locator('#name-line-0')).toHaveValue('NAM MÔ A');
      await page.locator('nav.qts-nav').getByRole('button', { name: 'Quay lại', exact: true }).click();
    }
    await transition.getByRole('button', { name: 'Hoàn tất bước', exact: true }).click();
    await expect(transition).toHaveCount(0);
  });
}
