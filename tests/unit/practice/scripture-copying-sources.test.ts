import { expect, it } from 'vitest';
import { getCopyBook, getCopyBookEditions } from '../../../src/lib/domain/practice/scripture-copying-sources';
import current from '../../../src/lib/data/scripture-copying/dia-tang.json';
import legacy from '../../../src/lib/data/scripture-copying/dia-tang-legacy.json';

it('resolves explicit immutable editions and keeps all navigation metadata unchanged', () => {
  expect(getCopyBook('dia-tang')).toBe(current);
  expect(getCopyBook('dia-tang', legacy.version)).toBe(legacy);
  expect(getCopyBook('dia-tang', 'unknown')).toBeUndefined();
  expect(getCopyBookEditions('dia-tang')).toEqual([current, legacy]);
  expect(current.version).not.toBe(legacy.version);
  expect([current.id, current.title, current.articleId]).toEqual([legacy.id, legacy.title, legacy.articleId]);
  expect(current.chapters.map(({ number, title }) => ({ number, title }))).toEqual(legacy.chapters.map(({ number, title }) => ({ number, title })));
  expect(current.chapters).toHaveLength(13);
  expect(current.chapters[0].blocks.join(' ')).toContain('TỊNH KHẨU NGHIỆP CHƠN NGÔN');
  expect(current.chapters.at(-1)!.blocks.join(' ')).toContain('HỒI HƯỚNG');
  expect(getCopyBookEditions('phap-hoa')).toHaveLength(1);
  expect(getCopyBookEditions('lang-nghiem')).toHaveLength(1);
});

it('loads only a selected sutra and resolves an explicit legacy version without changing current metadata', async () => {
  const { loadCopyBook, copyBookEditionKeys } = await import('../../../src/lib/browser/scripture-copying-sources');
  expect(await loadCopyBook('dia-tang')).toEqual(current);
  expect(await loadCopyBook('dia-tang', legacy.version)).toEqual(legacy);
  expect(await loadCopyBook('dia-tang', 'unknown')).toBeUndefined();
  const keys = copyBookEditionKeys(current);
  expect(keys.map(book => book.version)).toEqual([current.version, legacy.version]);
  expect(keys[1].chapters).toEqual(legacy.chapters.map(({ number }) => ({ number })));
});

it('removes the five source word hyphens without invalidating an already typed current-edition draft', async () => {
  const { compareCopy, normalizeCopyText } = await import('../../../src/lib/domain/practice/scripture-copying');
  const source = current.chapters[0].blocks[19];
  expect(source).toContain('Nam mô Bổn Sư Thích Ca Mâu Ni Phật.');
  const earlierDraft = source.replace('Nam mô Bổn Sư Thích Ca Mâu Ni Phật.', 'Nam-mô Bổn-Sư Thích-Ca Mâu-Ni-Phật.');
  expect(normalizeCopyText(earlierDraft)).toBe(normalizeCopyText(source));
  expect(compareCopy(source, earlierDraft, true)).toEqual({ complete: true, issues: [] });
  expect(current.version).toBe('word-rev2-400aa28e606f74278649');
  for (const chapter of current.chapters) for (const block of chapter.blocks) expect(block).not.toMatch(/\p{L}-\p{L}/u);
});
