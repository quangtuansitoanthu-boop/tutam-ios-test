import { expect, it } from 'vitest';
import current from '../../../src/lib/data/scripture-copying/dia-tang.json';
import legacy from '../../../src/lib/data/scripture-copying/dia-tang-legacy.json';
import phapHoa from '../../../src/lib/data/scripture-copying/phap-hoa.json';
import langNghiem from '../../../src/lib/data/scripture-copying/lang-nghiem.json';
import layouts from '../../../src/lib/data/scripture-copying/layouts.json';
import { copySourceLayoutLines, copySourceText } from '../../../src/lib/domain/practice/copying-formatting';
import { copyingCursorPosition, copyingSentences } from '../../../src/lib/domain/practice/copying-follow';
import type { CopyBook } from '../../../src/lib/domain/practice/scripture-copying';
import {
  annotateCopyReferenceProjection, buildCopyReferenceSections, copyReferenceSourceOffset, findCopyReferenceSection, projectCopyReferenceSection,
  type CopyReferenceLayouts, type CopyReferencePart,
} from '../../../src/lib/domain/practice/copying-reference';

const editions: Array<[string, CopyBook, number]> = [
  ['current Dia Tang', current, 15], ['legacy Dia Tang', legacy, 15],
  ['Phap Hoa', phapHoa, 28], ['Lang Nghiem', langNghiem, 10],
];
const fallback = (book: CopyBook): CopyReferenceLayouts => layouts[book.id as keyof typeof layouts];
const sourceParts = (book: CopyBook) => buildCopyReferenceSections(book).flatMap(section =>
  projectCopyReferenceSection(book, section, fallback(book)).lines.flatMap(line => line.parts).filter(part => !part.separator));

it.each(editions)('exposes the complete canonical reference menu for %s', (_name, book, count) => {
  const sections = buildCopyReferenceSections(book);
  expect(sections).toHaveLength(count);
  expect(new Set(sections.map(section => section.id)).size).toBe(count);
  expect(sections.every(section => section.bookId === book.id && section.sourceVersion === book.version)).toBe(true);
  expect(sections.filter(section => section.kind === 'chapter').map(section => section.title)).toEqual(book.chapters.map(chapter => chapter.title));
  if (book.id === 'dia-tang') {
    expect(sections[0]).toMatchObject({ id: 'dia-tang:opening', title: 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', chapter: 1 });
    expect(sections.at(-1)).toMatchObject({ id: 'dia-tang:closing', title: 'PHÁT NGUYỆN & HỒI HƯỚNG', chapter: 13 });
  }
});

it.each(editions)('covers every visible source character exactly once in all sections of %s', (_name, book) => {
  const parts = sourceParts(book);
  book.chapters.forEach(chapter => chapter.blocks.forEach((block, index) => {
    const visible = copySourceText(block);
    const selected = parts.filter(part => part.chapter === chapter.number && part.block === index);
    let offset = 0;
    for (const part of selected) {
      expect(part.sourceStart).toBe(offset);
      expect(part.sourceEnd).toBeGreaterThan(part.sourceStart);
      expect(part.text).toBe(visible.slice(part.sourceStart, part.sourceEnd));
      offset = part.sourceEnd;
    }
    expect(offset).toBe(visible.length);
    expect(selected.map(part => part.text).join('')).toBe(visible);
  }));
});

it.each([
  ['current', current, 19, 464, 463],
  ['legacy', legacy, 14, 417, 490],
] as const)('splits only source ranges at the exact opening and closing boundary of the %s edition', (_name, book, openingBlock, openingCut, closingCut) => {
  const sections = buildCopyReferenceSections(book);
  const openingEnd = sections[0].ranges.at(-1)!;
  const firstStart = sections[1].ranges[0];
  expect(openingEnd).toMatchObject({ chapter: 1, block: openingBlock, end: openingCut });
  expect(firstStart).toMatchObject({ chapter: 1, block: openingBlock, start: openingCut });
  expect(sections[13].ranges.at(-1)).toMatchObject({ chapter: 13, block: 9, end: closingCut });
  expect(sections[14].ranges[0]).toMatchObject({ chapter: 13, block: 9, start: closingCut });
  expect(findCopyReferenceSection(sections, 1, openingBlock)?.id).toBe('dia-tang:opening');
  expect(findCopyReferenceSection(sections, 1, openingBlock, 'dia-tang:1')?.id).toBe('dia-tang:1');
  expect(findCopyReferenceSection(sections, 13, 9, 'dia-tang:closing')?.id).toBe('dia-tang:closing');
  expect(findCopyReferenceSection(sections, 99, 0)).toBeUndefined();
});

it('retains centered headings, justified prose, bold and italic parentheses in the current source', () => {
  const opening = projectCopyReferenceSection(current, buildCopyReferenceSections(current)[0]);
  expect(opening.lines.some(line => line.align === 'center' && line.parts.some(part => part.bold && part.text.includes('TỊNH KHẨU NGHIỆP')))).toBe(true);
  expect(opening.lines.some(line => line.align === 'justify')).toBe(true);
  expect(opening.lines.flatMap(line => line.parts).some(part => part.italic && part.text.includes('(3 lần)'))).toBe(true);
  const body = projectCopyReferenceSection(current, buildCopyReferenceSections(current)[1]);
  expect(body.lines[0].align).toBe('center');
  expect(body.lines[0].parts.every(part => part.bold)).toBe(true);
  expect(body.lines.flatMap(line => line.parts).filter(part => !part.separator)[0].sourceStart).toBe(464);
});

it('formats the legacy edition from its own markup even when supplied with the incompatible current layouts', () => {
  const result = projectCopyReferenceSection(legacy, buildCopyReferenceSections(legacy)[0], current.layouts);
  const heading = result.lines.find(line => line.parts.some(part => part.text.includes('LỜI NGUYỆN TRƯỚC KHI TỤNG KINH')))!;
  expect(heading.align).toBe('center');
  expect(heading.parts.find(part => part.text.includes('LỜI NGUYỆN'))?.bold).toBe(true);
  expect(result.lines.some(line => line.align === 'justify')).toBe(true);
  expect(result.lines.flatMap(line => line.parts).some(part => part.italic && part.text.includes('('))).toBe(true);
});

function genericBook(blocks: string[], layout?: number[][][][]): CopyBook {
  return { id: 'duoc-su', title: 'KINH DƯỢC SƯ', articleId: 'tt_kinh_duoc_su', version: 'fixture-v1',
    chapters: [{ number: 1, title: 'KINH DƯỢC SƯ', blocks }], ...(layout ? { layouts: layout } : {}) };
}

it('naturally exposes one full section for another loaded single-chapter book', () => {
  const book = genericBook(['Toàn văn mẫu.']);
  const sections = buildCopyReferenceSections(book);
  expect(sections).toHaveLength(1);
  expect(sections[0]).toMatchObject({ id: 'duoc-su:1', title: 'KINH DƯỢC SƯ', chapter: 1, kind: 'chapter' });
  expect(sourcePartsForGeneric(book).map(part => part.text).join('')).toBe('Toàn văn mẫu.');
});

const sourcePartsForGeneric = (book: CopyBook): CopyReferencePart[] => projectCopyReferenceSection(book, buildCopyReferenceSections(book)[0])
  .lines.flatMap(line => line.parts).filter(part => !part.separator);

it('carries centered bold markup and parenthetical italics across an internal block boundary', () => {
  const book = genericBook(['{align:center|**Nam (3', 'lần) mô Phật.**}\n{align:justify|Lời hướng dẫn.}']);
  const result = projectCopyReferenceSection(book, buildCopyReferenceSections(book)[0]);
  const centered = result.lines.find(line => line.parts.some(part => part.text.includes('Nam')))!;
  expect(centered.align).toBe('center');
  expect(centered.parts.every(part => part.bold)).toBe(true);
  expect(centered.parts.map(part => part.text).join('')).toBe('Nam (3 lần) mô Phật.');
  expect(centered.parts.filter(part => part.italic).map(part => part.text).join('')).toBe('(3 lần)');
  expect(centered.parts.find(part => part.separator)).toMatchObject({ sourceStart: 0, sourceEnd: 0, italic: true });
  const prose = result.lines.find(line => line.parts.some(part => part.text.includes('Lời hướng dẫn.')))!;
  expect(prose.align).toBe('justify');
  expect(prose.parts.some(part => part.bold)).toBe(false);
});

it('merges layout paragraphs across internal blocks while keeping source offsets and using only a view separator', () => {
  const blocks = ['Xin nguyện', 'an lành.'];
  const book = genericBook(blocks, [[[[blocks[0].length, 1, 1, 7]], [[blocks[1].length, 1, 0, 7]]]]);
  const result = projectCopyReferenceSection(book, buildCopyReferenceSections(book)[0]);
  expect(result.lines).toHaveLength(1);
  expect(result.lines[0]).toMatchObject({ chapter: 1, sourceParagraph: 7, align: 'center' });
  expect(result.lines[0].parts.map(part => part.text).join('')).toBe('Xin nguyện an lành.');
  expect(result.lines[0].parts.filter(part => !part.separator).map(part => part.text).join('')).toBe(blocks.join(''));
  expect(result.lines[0].parts.filter(part => !part.separator).map(part => part.bold)).toEqual([true, false]);
});

it('rejects an unknown or shifted Dia Tang edition instead of applying offsets to different source text', () => {
  expect(() => buildCopyReferenceSections({ ...current, version: 'unknown' })).toThrow('invalid_copy_reference_source');
  const shifted = structuredClone(current);
  shifted.chapters[0].blocks[19] = 'x' + shifted.chapters[0].blocks[19];
  expect(() => buildCopyReferenceSections(shifted)).toThrow('invalid_copy_reference_source');
});

it('rejects truncated layouts and a section from another edition rather than omitting source characters', () => {
  const book = genericBook(['Đủ chữ.'], [[[[2, 3, 0, 0]]]]);
  expect(() => projectCopyReferenceSection(book, buildCopyReferenceSections(book)[0])).toThrow('invalid_copy_reference_source');
  expect(() => projectCopyReferenceSection(current, buildCopyReferenceSections(legacy)[0])).toThrow('invalid_copy_reference_source');
});

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

it.each(editions)('leaves every version, source block and layout unchanged for %s', (_name, source) => {
  const book = freeze(structuredClone(source)), before = JSON.stringify(book), shared = freeze(structuredClone(fallback(book)));
  const beforeLayout = JSON.stringify(shared);
  for (const section of buildCopyReferenceSections(book)) projectCopyReferenceSection(book, section, shared);
  expect(JSON.stringify(book)).toBe(before);
  expect(JSON.stringify(shared)).toBe(beforeLayout);
});

it('annotates the last active word with existing local indexes without adding word anchors to another block', () => {
  const blocks = ['Nam mô Phật.', 'Nguyện an lành.'];
  const book = genericBook(blocks, [[[[blocks[0].length, 3, 0, 0]], [[blocks[1].length, 3, 0, 1]]]]);
  const projection = projectCopyReferenceSection(book, buildCopyReferenceSections(book)[0]);
  const sentences = copyingSentences(blocks, 0, copySourceLayoutLines(blocks[0], book.layouts![0][0]));
  const annotated = annotateCopyReferenceProjection(projection, { chapter: 1, block: 0, sourceText: blocks[0], sentences });
  const first = annotated.lines[0].groups;
  expect(first[0].sentence).toBe(0);
  expect(first.flatMap(group => group.parts).find(part => part.word === 2)).toMatchObject({ text: 'Phật', chapter: 1, block: 0, sourceStart: 7, sourceEnd: 11 });
  expect(annotated.lines[1].groups.every(group => group.sentence === undefined && group.parts.every(part => part.word === undefined))).toBe(true);
  expect(annotated.lines.map(line => line.groups.flatMap(group => group.parts).map(part => part.text).join('')))
    .toEqual(projection.lines.map(line => line.parts.map(part => part.text).join('')));
});

it('uses full-block sentence offsets for both clipped sections of the shared current boundary block', () => {
  const sections = buildCopyReferenceSections(current), block = 19, sourceText = copySourceText(current.chapters[0].blocks[block]);
  const sentences = copyingSentences(current.chapters[0].blocks, block, copySourceLayoutLines(current.chapters[0].blocks[block], current.layouts[0][block]));
  for (const section of [sections[0], sections[1]]) {
    const projection = projectCopyReferenceSection(current, section);
    const annotated = annotateCopyReferenceProjection(projection, { chapter: 1, block, sourceText, sentences });
    expect(annotated.lines.map(line => line.groups.flatMap(group => group.parts).map(part => part.text).join('')))
      .toEqual(projection.lines.map(line => line.parts.map(part => part.text).join('')));
    const active = annotated.lines.flatMap(line => line.groups.flatMap(group => group.parts.filter(part => part.block === block && !part.separator)));
    expect(active.every(part => section.kind === 'opening' ? part.sourceEnd <= 464 : part.sourceStart >= 464)).toBe(true);
    const other = annotated.lines.flatMap(line => line.groups.flatMap(group => group.parts.filter(part => part.block !== block)));
    expect(other.every(part => part.word === undefined)).toBe(true);
    if (section.kind === 'chapter') {
      const firstActive = annotated.lines.flatMap(line => line.groups).find(group => group.sentence !== undefined)!;
      expect(firstActive.sentence).toBeGreaterThan(0);
    }
  }
});

it('keeps text and formatting without annotations when an active sentence cannot be anchored', () => {
  const book = genericBook(['Lời kinh hiện có.']);
  const projection = projectCopyReferenceSection(book, buildCopyReferenceSections(book)[0]);
  const annotated = annotateCopyReferenceProjection(projection, { chapter: 1, block: 0, sourceText: book.chapters[0].blocks[0],
    sentences: [{ align: 'justify', parts: [{ text: 'Không có trong nguồn.', bold: false }] }] });
  expect(annotated.lines.every(line => line.groups.every(group => group.sentence === undefined && group.parts.every(part => part.word === undefined)))).toBe(true);
  expect(annotated.lines.flatMap(line => line.groups.flatMap(group => group.parts))).toEqual(projection.lines.flatMap(line => line.parts));
});

it('does not mutate frozen source sentences, projection parts or layout metadata while annotating', () => {
  const book = genericBook(['Nam mô Phật.']);
  const projection = freeze(projectCopyReferenceSection(book, buildCopyReferenceSections(book)[0]));
  const active = freeze({ chapter: 1, block: 0, sourceText: book.chapters[0].blocks[0], sentences: copyingSentences(book.chapters[0].blocks, 0) });
  const before = JSON.stringify({ projection, active });
  annotateCopyReferenceProjection(projection, active);
  copyReferenceSourceOffset(active, { sentence: 0, word: 0 });
  expect(JSON.stringify({ projection, active })).toBe(before);
});

const boundaries: Array<[string, CopyBook, number, number, number, string, string]> = [
  ['current opening', current, 1, 19, 464, 'dia-tang:opening', 'dia-tang:1'],
  ['current closing', current, 13, 9, 463, 'dia-tang:13', 'dia-tang:closing'],
  ['legacy opening', legacy, 1, 14, 417, 'dia-tang:opening', 'dia-tang:1'],
  ['legacy closing', legacy, 13, 9, 490, 'dia-tang:13', 'dia-tang:closing'],
];

it.each(boundaries)('follows source offsets before, at and after the %s cut while respecting a manual view', (_name, book, chapter, block, cut, left, right) => {
  const sections = buildCopyReferenceSections(book);
  expect(findCopyReferenceSection(sections, chapter, block)?.id).toBe(left);
  expect(findCopyReferenceSection(sections, chapter, block, undefined, cut - 1)?.id).toBe(left);
  expect(findCopyReferenceSection(sections, chapter, block, undefined, cut)?.id).toBe(right);
  expect(findCopyReferenceSection(sections, chapter, block, undefined, cut + 1)?.id).toBe(right);
  expect(findCopyReferenceSection(sections, chapter, block, left, cut + 1)?.id).toBe(left);
  expect(findCopyReferenceSection(sections, chapter, block, right, cut - 1)?.id).toBe(right);
  expect(findCopyReferenceSection(sections, chapter, block, undefined, NaN)?.id).toBe(left);
  expect(findCopyReferenceSection(sections, chapter, block, undefined, 1_000_000)?.id).toBe(left);
  expect(findCopyReferenceSection(sections, 99, block, undefined, cut)).toBeUndefined();
});

it.each(boundaries)('retains the active typing and TTS word when crossing the %s cut inside the same stored block', (_name, book, chapter, block, cut, _left, right) => {
  const raw = book.chapters[chapter - 1].blocks[block], sourceText = copySourceText(raw);
  const layout = (book.layouts ?? fallback(book))[chapter - 1][block];
  const sentences = copyingSentences(book.chapters[chapter - 1].blocks, block, copySourceLayoutLines(raw, layout));
  const firstWord = /[\p{L}\p{M}\p{N}]+/u.exec(sourceText.slice(cut))!;
  const start = cut + firstWord.index;
  const active = { chapter, block, sourceText, sentences };
  const position = copyingCursorPosition(sentences, sourceText.slice(0, start + firstWord[0].length));
  const offset = copyReferenceSourceOffset(active, position);
  expect(offset).toBe(start);
  const sections = buildCopyReferenceSections(book);
  const selected = findCopyReferenceSection(sections, chapter, block, undefined, offset)!;
  expect(selected.id).toBe(right);
  const annotated = annotateCopyReferenceProjection(projectCopyReferenceSection(book, selected, fallback(book)), active);
  expect(annotated.lines.flatMap(line => line.groups.filter(group => group.sentence === position.sentence)
    .flatMap(group => group.parts.filter(part => part.word === position.word))))
    .toContainEqual(expect.objectContaining({ text: firstWord[0], chapter, block, sourceStart: start }));
  const sentenceOffset = copyReferenceSourceOffset(active, { sentence: position.sentence });
  expect(sentenceOffset).toBeGreaterThanOrEqual(cut);
  expect(sentenceOffset).toBeLessThanOrEqual(start);
  expect(findCopyReferenceSection(sections, chapter, block, undefined, sentenceOffset)?.id).toBe(right);
});

it('does not infer a source position from malformed, missing or out-of-bounds sentence and word anchors', () => {
  const sourceText = 'Nam mô Phật.';
  const active = { chapter: 1, block: 0, sourceText, sentences: copyingSentences([sourceText], 0) };
  for (const position of [{ sentence: -1 }, { sentence: 99 }, { sentence: NaN }, { sentence: 0.5 },
    { sentence: 0, word: -1 }, { sentence: 0, word: 99 }, { sentence: 0, word: 0.5 }]) {
    expect(copyReferenceSourceOffset(active, position)).toBeUndefined();
  }
  expect(copyReferenceSourceOffset({ ...active, sourceText: 'Nội dung không khớp.' }, { sentence: 0, word: 0 })).toBeUndefined();
  expect(copyReferenceSourceOffset({ ...active, chapter: 0 }, { sentence: 0 })).toBeUndefined();
  expect(copyReferenceSourceOffset({ ...active, block: -1 }, { sentence: 0 })).toBeUndefined();
  expect(copyReferenceSourceOffset({ ...active, sentences: [] }, { sentence: 0 })).toBeUndefined();
});
