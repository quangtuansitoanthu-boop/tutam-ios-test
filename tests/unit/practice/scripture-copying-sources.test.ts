import { expect, it, vi } from 'vitest';
import { getCopyBook, getCopyBookEditions } from '../../../src/lib/domain/practice/scripture-copying-sources';
import { COPYING_BOOKS } from '../../../src/lib/domain/practice/scripture-copying';
import current from '../../../src/lib/data/scripture-copying/dia-tang.json';
import legacy from '../../../src/lib/data/scripture-copying/dia-tang-legacy.json';
import duocSu from '../../../src/lib/data/scripture-copying/duoc-su.json';

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

it('adds only the authorized Medicine Buddha book and resolves its own immutable edition', () => {
  expect(COPYING_BOOKS.map(book => book.id)).toEqual(['dia-tang', 'phap-hoa', 'lang-nghiem', 'duoc-su']);
  expect(COPYING_BOOKS.find(book => book.id === 'duoc-su')).toMatchObject({ count: 1, unit: 'quyển' });
  expect(getCopyBook('duoc-su', 'nfc-v1-7626225a5614e1f72158')).toBe(duocSu);
  expect(getCopyBookEditions('duoc-su')).toEqual([duocSu]);
  expect(duocSu).toMatchObject({ id: 'duoc-su', articleId: 'tt_kinh_duoc_su', title: 'KINH DƯỢC SƯ' });
  expect(duocSu.chapters.map(chapter => chapter.number)).toEqual([1]);
  expect(getCopyBook('duoc-su', legacy.version)).toBeUndefined();
  expect(getCopyBook('duoc-su', 'unknown')).toBeUndefined();
  expect(getCopyBook('tt_kinh_duoc_su')).toBeUndefined();
});

it('loads Medicine Buddha in isolation without loading another book or the legacy source', async () => {
  const unrelatedSources = [
    '../../../src/lib/data/scripture-copying/dia-tang.json',
    '../../../src/lib/data/scripture-copying/dia-tang-legacy.json',
    '../../../src/lib/data/scripture-copying/phap-hoa.json',
    '../../../src/lib/data/scripture-copying/lang-nghiem.json',
  ];
  const loadUnrelated = vi.fn(() => { throw new Error('unrelated_copy_source_loaded'); });
  const loadSelected = vi.fn(() => ({ default: duocSu }));
  vi.resetModules();
  vi.doMock('../../../src/lib/data/scripture-copying/duoc-su.json', loadSelected);
  for (const source of unrelatedSources) vi.doMock(source, loadUnrelated);
  try {
    const { loadCopyBook, copyBookEditionKeys } = await import('../../../src/lib/browser/scripture-copying-sources');
    expect(loadSelected).not.toHaveBeenCalled();
    const loaded = await loadCopyBook('duoc-su');
    expect(loadSelected).toHaveBeenCalledTimes(1);
    expect(loaded).toEqual(duocSu);
    expect(loaded).toEqual(getCopyBook('duoc-su', duocSu.version));
    expect(await loadCopyBook('duoc-su', duocSu.version)).toEqual(duocSu);
    expect(await loadCopyBook('duoc-su', legacy.version)).toBeUndefined();
    expect(await loadCopyBook('duoc-su', 'unknown')).toBeUndefined();
    expect(copyBookEditionKeys(loaded!)).toEqual([duocSu]);
    expect(loadUnrelated).not.toHaveBeenCalled();
  } finally {
    vi.doUnmock('../../../src/lib/data/scripture-copying/duoc-su.json');
    for (const source of unrelatedSources) vi.doUnmock(source);
    vi.resetModules();
  }
});
