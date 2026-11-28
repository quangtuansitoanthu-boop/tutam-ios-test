import { copySourceText, type CopySourceLine } from './copying-formatting';
import { copyingSourceWordLines } from './copying-follow';
import type { CopyBook } from './scripture-copying';

type Alignment = CopySourceLine['align'];
export type CopyReferenceLayouts = ReadonlyArray<ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>>;
export interface CopyReferenceRange {
  readonly chapter: number;
  readonly block: number;
  /** Offset UTF-16 của copySourceText, không phải vị trí trong bản người dùng gõ. */
  readonly start: number;
  readonly end: number;
}
export interface CopyReferenceSection {
  readonly id: string;
  readonly bookId: string;
  readonly sourceVersion: string;
  readonly title: string;
  readonly chapter: number;
  readonly kind: 'opening' | 'chapter' | 'closing';
  readonly ranges: readonly CopyReferenceRange[];
}
export interface CopyReferencePart {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly chapter: number;
  readonly block: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  /** Khoảng cách hiển thị giữa hai block cùng đoạn văn, không thuộc payload. */
  readonly separator?: true;
}
export interface CopyReferenceLine {
  readonly chapter: number;
  readonly sourceParagraph: number;
  readonly align: Alignment;
  readonly parts: readonly CopyReferencePart[];
}
export interface CopyReferenceProjection { readonly lines: readonly CopyReferenceLine[] }
export interface CopyReferenceActiveSource {
  readonly chapter: number;
  readonly block: number;
  readonly sourceText: string;
  readonly sentences: readonly CopySourceLine[];
}
export interface AnnotatedCopyReferencePart extends CopyReferencePart { readonly word?: number }
export interface AnnotatedCopyReferenceProjection {
  readonly lines: ReadonlyArray<{
    readonly chapter: number;
    readonly sourceParagraph: number;
    readonly align: Alignment;
    readonly groups: ReadonlyArray<{ readonly sentence?: number; readonly parts: readonly AnnotatedCopyReferencePart[] }>;
  }>;
}

const legacyVersion = 'nfc-v1-9200da84a127a286b52e';
const currentVersion = 'word-rev2-400aa28e606f74278649';
const aligns: Alignment[] = ['left', 'center', 'right', 'justify'];
const invalid = () => new Error('invalid_copy_reference_source');

function validateBook(book: CopyBook): void {
  if (!book.id || !book.version || !book.chapters.length || (book.id === 'dia-tang' && book.chapters.length !== 13) || book.chapters.some((chapter, index) =>
    chapter.number !== index + 1 || !chapter.blocks.length || chapter.blocks.some(block => typeof block !== 'string'))) throw invalid();
}

function splitRanges(ranges: readonly CopyReferenceRange[], block: number, offset: number) {
  return [
    ranges.filter(range => range.block <= block).map(range => range.block === block ? { ...range, end: offset } : range),
    ranges.filter(range => range.block >= block).map(range => range.block === block ? { ...range, start: offset } : range),
  ];
}

/** Các mục tham chiếu là view; chapter/block/version lưu trữ không đổi. */
export function buildCopyReferenceSections(book: CopyBook): CopyReferenceSection[] {
  validateBook(book);
  const sections: CopyReferenceSection[] = book.chapters.map(chapter => ({
    id: `${book.id}:${chapter.number}`, bookId: book.id, sourceVersion: book.version,
    title: chapter.title, chapter: chapter.number, kind: 'chapter',
    ranges: chapter.blocks.map((block, index) => ({ chapter: chapter.number, block: index, start: 0, end: copySourceText(block).length })),
  }));
  if (book.id !== 'dia-tang') return sections;
  const legacy = book.version === legacyVersion;
  if (!legacy && book.version !== currentVersion) throw invalid();
  const opening = { block: legacy ? 14 : 19, offset: legacy ? 417 : 464 };
  const closing = { block: 9, offset: legacy ? 490 : 463 };
  for (const [chapterIndex, cut, left, right] of [
    [0, opening, legacy ? '(3 Lần)' : '(3 lần)', legacy ? 'Phẩm Thứ Nhất' : 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN'],
    [12, closing, 'lui ra.', legacy ? 'KINH ĐIA TẠNG BỒ TÁT BỔN NGUYỆN' : 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN'],
  ] as const) {
    const raw = book.chapters[chapterIndex].blocks[cut.block];
    if (typeof raw !== 'string') throw invalid();
    const text = copySourceText(raw);
    if (cut.offset <= 0 || cut.offset >= text.length || !text.slice(0, cut.offset).trimEnd().endsWith(left)
      || !text.slice(cut.offset).trimStart().startsWith(right)) throw invalid();
  }
  const [openingRanges, firstRanges] = splitRanges(sections[0].ranges, opening.block, opening.offset);
  const [lastRanges, closingRanges] = splitRanges(sections[12].ranges, closing.block, closing.offset);
  sections[0] = { ...sections[0], ranges: firstRanges };
  sections[12] = { ...sections[12], ranges: lastRanges };
  return [
    { ...sections[0], id: `${book.id}:opening`, title: 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', kind: 'opening', ranges: openingRanges },
    ...sections,
    { ...sections[12], id: `${book.id}:closing`, title: 'PHÁT NGUYỆN & HỒI HƯỚNG', kind: 'closing', ranges: closingRanges },
  ];
}

/** Khi một block thuộc hai mục, giữ lựa chọn hiện tại nếu có. */
export function findCopyReferenceSection(sections: readonly CopyReferenceSection[], chapter: number, block: number, preferredSectionId?: string, sourceOffset?: number): CopyReferenceSection | undefined {
  const matches = sections.filter(section => section.ranges.some(range => range.chapter === chapter && range.block === block));
  return matches.find(section => section.id === preferredSectionId)
    ?? (Number.isInteger(sourceOffset) ? matches.find(section => section.ranges.some(range =>
      range.chapter === chapter && range.block === block && sourceOffset! >= range.start && sourceOffset! < range.end)) : undefined)
    ?? matches[0];
}

interface SourceRun {
  chapter: number; block: number; sourceStart: number; sourceEnd: number;
  sourceParagraph: number; text: string; align: Alignment; bold: boolean;
}

function layoutRuns(book: CopyBook, chapter: number, layouts: CopyReferenceLayouts): SourceRun[] {
  const runs: SourceRun[] = [];
  const blocks = book.chapters[chapter - 1].blocks;
  if (layouts[chapter - 1]?.length !== blocks.length) throw invalid();
  blocks.forEach((raw, block) => {
    const text = copySourceText(raw), entries = layouts[chapter - 1][block];
    let start = 0;
    for (const [end, alignment, bold, paragraph] of entries) {
      if (!Number.isInteger(end) || end < start || end > text.length || !aligns[alignment] || !Number.isInteger(paragraph)) throw invalid();
      if (end > start) runs.push({ chapter, block, sourceStart: start, sourceEnd: end,
        sourceParagraph: paragraph, text: text.slice(start, end), align: aligns[alignment], bold: !!bold });
      start = end;
    }
    if (start !== text.length) throw invalid();
  });
  return runs;
}

/** Đọc markup của chính edition; không mượn layout hiện tại cho bản legacy. */
function markupRuns(book: CopyBook, chapter: number): SourceRun[] {
  const runs: SourceRun[] = [];
  let align: Alignment = 'justify', bold = false, paragraph = 0, paragraphStart = 0, hasContent = false;
  const nextParagraph = () => {
    if (hasContent) { paragraph++; paragraphStart = runs.length; hasContent = false; }
  };
  book.chapters[chapter - 1].blocks.forEach((raw, block) => {
    let cursor = 0, offset = 0;
    const append = (text: string) => {
      if (!text) return;
      runs.push({ chapter, block, sourceStart: offset, sourceEnd: offset + text.length,
        sourceParagraph: paragraph, text, align, bold });
      offset += text.length;
      hasContent ||= Boolean(text.trim());
    };
    for (const match of raw.matchAll(/\{align:(left|center|right|justify)\||[{}]|\*\*|\n/gu)) {
      append(raw.slice(cursor, match.index));
      if (match[1]) {
        nextParagraph(); align = match[1] as Alignment;
        for (let index = paragraphStart; index < runs.length; index++) if (!runs[index].text.trim()) runs[index].align = align;
      } else if (match[0] === '**') bold = !bold;
      else if (match[0] === '}') { nextParagraph(); align = 'justify'; }
      else if (match[0] === '\n') { nextParagraph(); append('\n'); }
      cursor = match.index! + match[0].length;
    }
    append(raw.slice(cursor));
    if (offset !== copySourceText(raw).length) throw invalid();
  });
  return runs;
}

function italicParts(runs: SourceRun[]): Array<SourceRun & { italic: boolean }> {
  const parts: Array<SourceRun & { italic: boolean }> = [];
  let depth = 0;
  for (const run of runs) {
    let offset = run.sourceStart;
    for (const character of run.text) {
      const italic = depth > 0 || character === '(' || character === '（';
      if (character === '(' || character === '（') depth++;
      else if ((character === ')' || character === '）') && depth) depth--;
      const previous = parts[parts.length - 1];
      if (previous && previous.chapter === run.chapter && previous.block === run.block && previous.sourceParagraph === run.sourceParagraph
        && previous.sourceEnd === offset && previous.bold === run.bold && previous.align === run.align && previous.italic === italic) {
        previous.text += character; previous.sourceEnd += character.length;
      } else parts.push({ ...run, text: character, sourceStart: offset, sourceEnd: offset + character.length, italic });
      offset += character.length;
    }
  }
  return parts;
}

/** Chỉ chiếu chữ nguồn; không đọc hay cắt typed text. Không tạo sentence/word owner mới. */
export function projectCopyReferenceSection(book: CopyBook, section: CopyReferenceSection, fallbackLayouts?: CopyReferenceLayouts): CopyReferenceProjection {
  validateBook(book);
  if (section.bookId !== book.id || section.sourceVersion !== book.version || !book.chapters[section.chapter - 1]) throw invalid();
  const layouts = book.id === 'dia-tang' && book.version === legacyVersion ? undefined : book.layouts ?? fallbackLayouts;
  const parts = italicParts(layouts ? layoutRuns(book, section.chapter, layouts) : markupRuns(book, section.chapter));
  const lines: Array<{ chapter: number; sourceParagraph: number; align: Alignment; parts: CopyReferencePart[] }> = [];
  for (const range of section.ranges) {
    const raw = book.chapters[range.chapter - 1]?.blocks[range.block];
    if (range.chapter !== section.chapter || typeof raw !== 'string' || !Number.isInteger(range.start) || !Number.isInteger(range.end)
      || range.start < 0 || range.end <= range.start || range.end > copySourceText(raw).length) throw invalid();
    for (const part of parts.filter(part => part.block === range.block)) {
      const start = Math.max(range.start, part.sourceStart), end = Math.min(range.end, part.sourceEnd);
      if (end <= start) continue;
      let line = lines[lines.length - 1];
      if (!line || line.chapter !== part.chapter || line.sourceParagraph !== part.sourceParagraph) {
        line = { chapter: part.chapter, sourceParagraph: part.sourceParagraph, align: part.align, parts: [] }; lines.push(line);
      }
      const text = part.text.slice(start - part.sourceStart, end - part.sourceStart), previous = line.parts[line.parts.length - 1];
      if (previous && previous.block !== part.block && /\S$/u.test(previous.text) && /^\S/u.test(text)) {
        line.parts.push({ text: ' ', bold: part.bold, italic: part.italic, chapter: part.chapter,
          block: part.block, sourceStart: start, sourceEnd: start, separator: true });
      }
      line.parts.push({ text, bold: part.bold, italic: part.italic, chapter: part.chapter, block: part.block, sourceStart: start, sourceEnd: end });
    }
  }
  return { lines };
}

type Anchor = { start: number; end: number; sentence: number; word?: number };

function copyReferenceSourceAnchors(active: CopyReferenceActiveSource): Anchor[] | null {
  const anchors: Anchor[] = [];
  try {
    const wordLines = copyingSourceWordLines([...active.sentences]);
    let cursor = 0;
    for (let sentence = 0; sentence < active.sentences.length; sentence++) {
      const text = active.sentences[sentence].parts.map(part => part.text).join('');
      if (!text) continue;
      const start = active.sourceText.indexOf(text, cursor);
      if (start < 0 || active.sourceText.slice(cursor, start).trim()) return null;
      let offset = start;
      for (const part of wordLines[sentence]) {
        anchors.push({ start: offset, end: offset + part.text.length, sentence, ...(part.word === undefined ? {} : { word: part.word }) });
        offset += part.text.length;
      }
      cursor = offset;
    }
    return active.sourceText.slice(cursor).trim() ? null : anchors;
  } catch { return null; }
}

/** Vị trí nguồn của cursor/TTS hiện có; tuyệt đối không lấy offset từ typed text. */
export function copyReferenceSourceOffset(active: CopyReferenceActiveSource, position: { sentence: number; word?: number }): number | undefined {
  if (!Number.isInteger(active.chapter) || active.chapter < 1 || !Number.isInteger(active.block) || active.block < 0
    || !Number.isInteger(position.sentence) || position.sentence < 0
    || (position.word !== undefined && (!Number.isInteger(position.word) || position.word < 0))) return undefined;
  return copyReferenceSourceAnchors(active)?.find(anchor => anchor.sentence === position.sentence
    && (position.word === undefined || anchor.word === position.word))?.start;
}

/** Chỉ active block dùng anchors của owner câu/từ hiện có; phần còn lại giữ nguyên formatted runs. */
export function annotateCopyReferenceProjection(projection: CopyReferenceProjection, active: CopyReferenceActiveSource): AnnotatedCopyReferenceProjection {
  let anchors = copyReferenceSourceAnchors(active);
  if (anchors && projection.lines.some(line => line.parts.some(part =>
    !part.separator && part.chapter === active.chapter && part.block === active.block
    && part.text !== active.sourceText.slice(part.sourceStart, part.sourceEnd)))) anchors = null;
  return { lines: projection.lines.map(line => {
    const groups: Array<{ sentence?: number; parts: AnnotatedCopyReferencePart[] }> = [];
    const append = (part: CopyReferencePart, start: number, end: number, anchor?: Anchor) => {
      const fragment: AnnotatedCopyReferencePart = {
        ...part, text: part.text.slice(start - part.sourceStart, end - part.sourceStart), sourceStart: start, sourceEnd: end,
        ...(anchor?.word === undefined ? {} : { word: anchor.word }),
      };
      const previous = groups[groups.length - 1];
      if (previous && previous.sentence === anchor?.sentence) previous.parts.push(fragment);
      else groups.push({ ...(anchor ? { sentence: anchor.sentence } : {}), parts: [fragment] });
    };
    for (const part of line.parts) {
      if (!anchors || part.separator || part.chapter !== active.chapter || part.block !== active.block) {
        const previous = groups[groups.length - 1];
        if (previous && previous.sentence === undefined) previous.parts.push({ ...part });
        else groups.push({ parts: [{ ...part }] });
        continue;
      }
      let cursor = part.sourceStart;
      for (const anchor of anchors) {
        if (anchor.end <= cursor || anchor.start >= part.sourceEnd) continue;
        if (anchor.start > cursor) append(part, cursor, anchor.start);
        const end = Math.min(part.sourceEnd, anchor.end);
        append(part, Math.max(cursor, anchor.start), end, anchor);
        cursor = end;
      }
      if (cursor < part.sourceEnd) append(part, cursor, part.sourceEnd);
    }
    return { chapter: line.chapter, sourceParagraph: line.sourceParagraph, align: line.align, groups };
  }) };
}
