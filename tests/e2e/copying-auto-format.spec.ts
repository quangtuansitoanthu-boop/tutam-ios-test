import { expect, test, type Locator, type Page } from '@playwright/test';
import { beginScriptureCopying, deferStartupNotification } from './runtime-helpers';

type BookId = 'dia-tang' | 'duoc-su';
type Draft = { block: number; texts: string[]; [key: string]: unknown };
const editorFor = (page: Page) => page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });

test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({ page }) => {
  await deferStartupNotification(page);
  page.on('dialog', dialog => dialog.accept());
});

async function openBook(page: Page, id: BookId = 'dia-tang') {
  await page.goto('/tu-tap/chep-kinh');
  await expect(page.getByTestId('start-copying')).toBeEnabled();
  if (id === 'duoc-su') {
    await page.locator('.books').getByRole('button', { name: /KINH DƯỢC SƯ/u }).click();
    await expect(page.getByTestId('copying-preparation')).toBeVisible();
    await page.getByTestId('confirm-copying-guide').click();
  } else await beginScriptureCopying(page);
  await expect(editorFor(page)).toBeVisible();
}

async function withOptions(page: Page, action: (options: Locator) => Promise<void>) {
  const options = page.getByRole('dialog', { name: 'Cài đặt chép kinh', exact: true });
  const alreadyOpen = await options.isVisible();
  if (!alreadyOpen) await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await expect(options).toBeVisible();
  try { await action(options); }
  finally {
    if (!alreadyOpen) {
      await options.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
      await expect(options).toHaveCount(0);
    }
  }
}

async function selectPassage(page: Page, block: number) {
  await withOptions(page, async options => {
    const select = options.locator('#mobile-copy-block');
    await expect(select).toBeVisible();
    await expect(select).toBeEnabled();
    await select.selectOption(String(block));
    await expect(select).toHaveValue(String(block));
    await expect(select.locator('option:checked')).toContainText(new RegExp(`^${block + 1}\\s*/`));
  });
}

async function continuousWriting(page: Page) {
  const tools = page.locator('.editor-tools-trigger');
  if (await tools.isVisible() && await tools.getAttribute('aria-expanded') !== 'true') await tools.click();
  const continuous = page.getByRole('button', { name: 'Cuộn liên tục', exact: true });
  await expect(continuous).toBeVisible();
  if (await continuous.getAttribute('aria-pressed') !== 'true') await continuous.click();
}

async function draft(page: Page, id: BookId) {
  return page.evaluate(id => new Promise<Draft | undefined>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('drafts'), store = transaction.objectStore('drafts');
      const keys = store.getAllKeys(), values = store.getAll();
      transaction.oncomplete = () => {
        const index = keys.result.findIndex(key => String(key).startsWith(`tt_copy_v1:guest:${id}:`)
          && String(key).endsWith(':1') && !String(key).includes(':run:'));
        resolve(index < 0 ? undefined : values.result[index]); db.close();
      };
      transaction.onerror = () => { reject(transaction.error); db.close(); };
    };
  }), id);
}

async function expectRaw(page: Page, id: BookId, block: number, text: string) {
  await expect(editorFor(page)).toHaveText(text);
  await expect.poll(async () => (await draft(page, id))?.texts[block]).toBe(text);
  await expect.poll(async () => (await draft(page, id))?.block).toBe(block);
}

async function expectLine(page: Page, text: string, align: 'center' | 'justify', bold: boolean) {
  const line = editorFor(page).locator(':scope > div').filter({ hasText: text }).first();
  await expect(line).toContainText(text);
  await expect(line).toHaveCSS('text-align', align);
  if (bold) await expect(line.locator('strong').filter({ hasText: text })).toHaveCSS('font-weight', '700');
  else {
    await expect(line.locator('strong')).toHaveCount(0);
    await expect(line).toHaveCSS('font-weight', '400');
  }
}

async function expectItalicNote(page: Page, note: string) {
  const emphasis = editorFor(page).locator('em').filter({ hasText: note });
  await expect(emphasis).toHaveText(note);
  await expect(emphasis).toHaveCSS('font-style', 'italic');
  expect(await emphasis.evaluate(node => [node.textContent?.startsWith('('), node.textContent?.endsWith(')')])).toEqual([true, true]);
}

// Simulates browser composition events in the real editable. This is not a native keyboard test.
async function composeAtCaret(editor: Locator, text: string) {
  await editor.focus();
  await editor.evaluate((node, text) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !node.contains(selection.anchorNode)) throw new Error('IME caret is outside the editor');
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const inserted = document.createTextNode(text);
    range.insertNode(inserted); range.setStartAfter(inserted); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new CompositionEvent('compositionupdate', { data: text, bubbles: true }));
    node.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
    node.dispatchEvent(new CompositionEvent('compositionend', { data: text, bubbles: true }));
    node.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true }));
  }, text);
}

async function selectionOffsets(editor: Locator) {
  return editor.evaluate(node => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !node.contains(selection.anchorNode)) return null;
    const range = selection.getRangeAt(0), prefix = range.cloneRange();
    prefix.selectNodeContents(node); prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    return [start, start + range.toString().length];
  });
}

for (const form of ['NFC', 'NFD'] as const) test(`original heading and parenthetical brackets retain automatic formatting and raw ${form} text`, async ({ page }) => {
  await openBook(page);
  const title = 'TỊNH KHẨU NGHIỆP CHƠN NGÔN'.normalize(form);
  const note = '(3 lần)'.normalize(form);
  const typed = 'TỊNH KHẨU NGHIỆP CHƠN NGÔN Tu rị tu rị, ma ha tu rị tu tu rị, ta bà ha (3 lần).'.normalize(form);
  await editorFor(page).pressSequentially(typed);
  await expectRaw(page, 'dia-tang', 0, typed);
  await expectLine(page, title, 'center', true);
  await expectItalicNote(page, note);
  await page.reload();
  await beginScriptureCopying(page);
  await expectRaw(page, 'dia-tang', 0, typed);
  await expectLine(page, title, 'center', true);
  await expectItalicNote(page, note);
});

test('Medicine Buddha changes from bold centered headings to plain centered verse without rewriting the prefix', async ({ page }) => {
  await openBook(page, 'duoc-su');
  await continuousWriting(page);
  const typed = 'KINH DƯỢC SƯ Trưởng lão Hòa thượng Thích Trí Quảng biên soạn NGUYỆN HƯƠNG Đốt nén tâm hương trước Phật đài, Ngũ phần dâng trọn Đức Như Lai.';
  await editorFor(page).pressSequentially(typed);
  await expectRaw(page, 'duoc-su', 0, typed);
  await expectLine(page, 'KINH DƯỢC SƯ', 'center', true);
  await expectLine(page, 'Trưởng lão Hòa thượng Thích Trí Quảng biên soạn', 'center', false);
  await expectLine(page, 'NGUYỆN HƯƠNG', 'center', true);
  await expectLine(page, 'Đốt nén tâm hương trước Phật đài,', 'center', false);
  await expectLine(page, 'Ngũ phần dâng trọn Đức Như Lai.', 'center', false);
});

test('Medicine Buddha prose and synthetic NFD IME notes keep justification, italic brackets and edit history', async ({ page }) => {
  await openBook(page, 'duoc-su');
  await selectPassage(page, 1);
  await continuousWriting(page);
  const editor = editorFor(page);
  const prefix = '* Chí tâm đảnh lễ: Nam mô Tận Hư Không Biến Pháp Giới Quá, Hiện, Vị Lai Thập Phương Chư Phật, Tôn Pháp, Hiền Thánh Tăng Thường Trụ Tam Bảo '.normalize('NFD');
  const note = '(1 lạy)'.normalize('NFD');
  // Native contenteditable retains a trailing typed space as NBSP before the following IME insertion.
  expect(prefix.charCodeAt(prefix.length - 1)).toBe(32);
  const persistedPrefix = prefix.slice(0, -1) + '\u00a0';
  await editor.pressSequentially(prefix);
  await composeAtCaret(editor, note);
  await expectRaw(page, 'duoc-su', 1, persistedPrefix + note);
  await expectLine(page, 'Chí tâm đảnh lễ'.normalize('NFD'), 'justify', false);
  await expectItalicNote(page, note);
  await editor.pressSequentially('.');
  await expectRaw(page, 'duoc-su', 1, persistedPrefix + note + '.');
  await editor.press('Backspace');
  await expectRaw(page, 'duoc-su', 1, persistedPrefix + note);
  await expectItalicNote(page, note);
  await editor.press('ControlOrMeta+Z');
  await expectRaw(page, 'duoc-su', 1, persistedPrefix + note + '.');
  await expectLine(page, 'Chí tâm đảnh lễ'.normalize('NFD'), 'justify', false);
  await editor.press('ControlOrMeta+Home');
  await editor.press('ArrowRight');
  expect([persistedPrefix.charCodeAt(0), persistedPrefix.charCodeAt(1)]).toEqual([42, 32]);
  await editor.press('Delete');
  await expectRaw(page, 'duoc-su', 1, persistedPrefix[0] + persistedPrefix.slice(2) + note + '.');
  await expectItalicNote(page, note);
  await expectLine(page, 'Chí tâm đảnh lễ'.normalize('NFD'), 'justify', false);
  await editor.press('ControlOrMeta+Z');
  await expectRaw(page, 'duoc-su', 1, persistedPrefix + note + '.');
});

test('the existing mixed opening and chapter block retains centered titles and justified prose while browsing either reference section', async ({ page }) => {
  await openBook(page);
  await selectPassage(page, 19);
  await continuousWriting(page);
  const typed = 'Đều phát Bồ đề tâm, Hết một báo thân này Sanh qua cõi Cực Lạc. Nam mô Bổn Sư Thích Ca Mâu Ni Phật. (3 lần) BÀI KỆ KHAI KINH Pháp vi diệu rất sâu vô lượng Trăm nghìn muôn ức kiếp khó gặp Nay con thấy nghe được thọ trì Nguyện hiểu nghĩa chân thật của Phật. Nam mô U minh Giáo chủ hoằng nguyện độ sanh Địa ngục vị không, thệ bất thành Phật, Chúng sanh độ tận, phương chứng Bồ đề Nam mô Đại Bi, Đại Nguyện, Đại Thánh, Đại Từ, Bổn Tôn Địa Tạng Bồ Tát Ma Ha Tát. (3 lần) KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN ---o0o--- THẦN THÔNG TRÊN CUNG TRỜI ĐAO LỢI Phẩm thứ nhất 1. PHẬT HIỆN THẦN THÔNG. Ta nghe như thế này:';
  // The old app on 4173 produced exactly these two NBSPs after typed notes:
  // .cache/copying-reference-baseline/old-app-nbsp.json. Keep the ASCII input and test that exact browser serialization.
  expect([typed.charCodeAt(106), typed.charCodeAt(464)]).toEqual([32, 32]);
  const persisted = typed.slice(0, 106) + '\u00a0' + typed.slice(107, 464) + '\u00a0' + typed.slice(465);
  await editorFor(page).pressSequentially(typed);
  await expectRaw(page, 'dia-tang', 19, persisted);
  await expectLine(page, 'BÀI KỆ KHAI KINH', 'center', true);
  await expectLine(page, 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN', 'center', true);
  // This immutable Word edition also marks this prose bold; changing reference sections must preserve that source styling.
  await expectLine(page, 'Ta nghe như thế này:', 'justify', true);
  await expect(page.locator('#copy-block')).toHaveValue('1');
  await expect(page.locator('#copy-source-text')).toContainText('Ta nghe như thế này:');
  const before = await draft(page, 'dia-tang');
  for (const entry of ['0', '1']) {
    await page.locator('#copy-block').selectOption(entry);
    await expectRaw(page, 'dia-tang', 19, persisted);
    expect(await draft(page, 'dia-tang')).toEqual(before);
    await expectLine(page, 'Ta nghe như thế này:', 'justify', true);
  }
});

test('ghost, scaled font reflow and fifteen-entry browsing preserve typed text, caret and formatting', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method()); });
  await openBook(page);
  await page.getByRole('button', { name: 'Thoát toàn màn hình', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  const editor = editorFor(page), typed = 'TỊNH KHẨU NGHIỆP';
  await editor.pressSequentially(typed);
  await expectRaw(page, 'dia-tang', 0, typed);
  const ghost = page.getByRole('button', { name: 'Chữ mờ', exact: true });
  await ghost.click();
  await expect(ghost).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeFocused();
  await editor.focus(); await editor.press('ControlOrMeta+Home'); await editor.press('ArrowRight'); await editor.press('ArrowRight');
  const caret = await selectionOffsets(editor);
  expect(caret).toEqual([2, 2]);
  const before = await draft(page, 'dia-tang');
  await expect(page.locator('#copy-block option')).toHaveCount(15);
  for (const entry of ['14', '0']) {
    await page.locator('#copy-block').selectOption(entry);
    await editor.focus();
    expect(await selectionOffsets(editor)).toEqual(caret);
    await expectRaw(page, 'dia-tang', 0, typed);
    await expectLine(page, typed, 'center', true);
  }
  for (const font of [{ id: 'reader', family: 'Bookerly', size: '20', pixels: 20 },
    { id: 'brignola', family: 'CopyBrignola', size: '28', pixels: 37.8 }]) {
    await page.setViewportSize({ width: 375, height: 1000 });
    await withOptions(page, async options => {
      const fontSelect = options.locator('#mobile-copy-font'), sizeSelect = options.locator('#mobile-editor-size');
      await expect(fontSelect).toBeVisible();
      await expect(sizeSelect).toBeVisible();
      await fontSelect.selectOption(font.id);
      await sizeSelect.selectOption(font.size);
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(editor).toHaveCSS('font-family', new RegExp(font.family));
    await expect.poll(() => editor.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(font.pixels, 1);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await editor.focus();
      expect(await selectionOffsets(editor)).toEqual(caret);
      await expectRaw(page, 'dia-tang', 0, typed);
      await expectLine(page, typed, 'center', true);
      expect(await draft(page, 'dia-tang')).toEqual(before);
    }
  }
  await ghost.click();
  await expect(ghost).toHaveAttribute('aria-pressed', 'false');
  await expect(editor).toBeFocused();
  await expectRaw(page, 'dia-tang', 0, typed);
  await expectLine(page, typed, 'center', true);
  expect(requests).toEqual([]);
});
