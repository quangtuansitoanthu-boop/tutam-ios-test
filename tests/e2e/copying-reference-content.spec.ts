import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import diaTang from '../../src/lib/data/scripture-copying/dia-tang.json' with { type: 'json' };
import phapHoa from '../../src/lib/data/scripture-copying/phap-hoa.json' with { type: 'json' };
import langNghiem from '../../src/lib/data/scripture-copying/lang-nghiem.json' with { type: 'json' };
import duocSu from '../../src/lib/data/scripture-copying/duoc-su.json' with { type: 'json' };
import { copySourceText } from '../../src/lib/domain/practice/copying-formatting';
import { deferStartupNotification } from './runtime-helpers';

interface ReaderChapter { so_thu_tu: number; tieu_de: string; noi_dung: string }
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

async function drafts(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('drafts');
      const read = transaction.objectStore('drafts').getAll();
      transaction.oncomplete = () => { resolve(JSON.stringify(read.result)); db.close(); };
      transaction.onerror = () => { reject(transaction.error); db.close(); };
    };
  }));
}

test.beforeEach(async ({ page }) => {
  await deferStartupNotification(page);
});

for (const [book, count] of [[diaTang, 15], [phapHoa, 28], [langNghiem, 10], [duocSu, 1]] as const) {
  test(`${book.id}: complete reader TOC in Kinh mẫu preserves the existing editor and saved draft`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto('/tu-tap/chep-kinh');
    await expect(page.locator('.books button')).toHaveCount(4);
    await page.locator('.books button').filter({ hasText: new RegExp(book.title, 'i') }).click();
    await expect(page.getByTestId('copying-preparation')).toBeVisible();
    await page.getByTestId('confirm-copying-guide').click();
    const reference = page.locator('#copy-block');
    await expect(reference.locator('option')).toHaveCount(count);
    await expect(page.getByRole('button', { name: 'Chữ mờ', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu lên máy chủ', exact: true })).toBeVisible();

    const prefix = copySourceText(book.chapters[0].blocks[0]).slice(0, 45).trimEnd();
    await page.locator('#copy-text').pressSequentially(prefix);
    await expect.poll(async () => (JSON.parse(await drafts(page)) as Array<{ sutraId: string; chapter: number; texts: string[] }>)
      .find(row => row.sutraId === book.id && row.chapter === 1)?.texts[0]).toBe(prefix);
    const before = await drafts(page);
    const requests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method());
    });

    const chapters = (JSON.parse(readFileSync(new URL(`../../static/offline-data/chapters/${book.articleId}.json`, import.meta.url), 'utf8')) as ReaderChapter[])
      .sort((left, right) => left.so_thu_tu - right.so_thu_tu);
    expect(chapters).toHaveLength(count);
    for (const [index, chapter] of chapters.entries()) {
      await reference.selectOption(String(index));
      await expect(reference.locator('option:checked')).toContainText(chapter.tieu_de);
      const comparison = await page.evaluate(html => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        const parts: string[] = [];
        const blockTags = new Set(['P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR']);
        const walk = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent ?? ''); return; }
          if (node instanceof Element && ['SCRIPT', 'STYLE'].includes(node.tagName)) return;
          const block = node instanceof Element && blockTags.has(node.tagName);
          if (block) parts.push(' ');
          node.childNodes.forEach(walk);
          if (block) parts.push(' ');
        };
        walk(document.body);
        // Reader source may contain alignment/bold directives; they are formatting, not scripture words.
        const words = (text: string) => (text.replace(/\{align:(?:left|center|right|justify)\|/gu, '')
          .replace(/[{}]/gu, '').replace(/\*\*/gu, '').replace(/\(C\)/gu, '').normalize('NFC').toLocaleLowerCase('vi')
          .match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).join(' ');
        return {
          expected: words(parts.join('')),
          actual: words(window.document.getElementById('copy-source-text')?.innerText ?? ''),
        };
      }, chapter.noi_dung);
      expect({ section: chapter.tieu_de, words: sha(comparison.actual) })
        .toEqual({ section: chapter.tieu_de, words: sha(comparison.expected) });
    }
    expect(await drafts(page)).toBe(before);
    expect(requests).toEqual([]);
    await page.getByRole('button', { name: 'Chữ mờ', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Chữ mờ', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Enabling the existing ghost mode may canonicalize a matching prefix.
    // Browsing the reference itself must remain read-only in either mode.
    const afterGhost = await drafts(page);
    for (const index of [0, count - 1]) {
      await reference.selectOption(String(index));
      expect(await drafts(page)).toBe(afterGhost);
    }
    expect(requests).toEqual([]);
    expect(await page.locator('#copy-source-text').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Bookerly');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
