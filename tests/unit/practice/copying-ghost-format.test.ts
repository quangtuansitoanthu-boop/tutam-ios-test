import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { copyingSentences } from '../../../src/lib/domain/practice/copying-follow';
import { alignGhostRuns, formatGhostRuns, clipGhostRuns, nextGhostTraceText } from '../../../src/lib/domain/practice/copying-ghost-format';
import { copySourceLayoutLines } from '../../../src/lib/domain/practice/copying-formatting';
import currentDiaTang from '../../../src/lib/data/scripture-copying/dia-tang.json';

describe('formatGhostRuns', () => {
  it('marks the current second Địa Tạng heading while leaving its bold mixed-case verses unchanged', () => {
    const blocks = currentDiaTang.chapters[0].blocks;
    const source = copyingSentences(blocks, 0, copySourceLayoutLines(blocks[0], currentDiaTang.layouts[0][0]));
    const original = JSON.stringify(source), runs = formatGhostRuns(source);
    expect(runs.filter(run => run.line === 2).map(run => run.text).join('')).toBe(' TỊNH TAM NGHIỆP CHÂN NGÔN\n');
    expect(runs.filter(run => run.line === 2).every(run => run.uppercase === true)).toBe(true);
    expect(runs.filter(run => run.line === 1).map(run => run.text).join('')).toBe(' Tu rị tu rị, ma ha tu rị tu tu rị, ta bà ha.\n');
    expect(runs.filter(run => run.line === 1 || run.line === 3).every(run => !Object.hasOwn(run, 'uppercase'))).toBe(true);
    expect(JSON.stringify(source)).toBe(original);
  });

  it.each(['NFC', 'NFD'] as const)('keeps heading presentation metadata across alignment and clipping of raw %s text', normalization => {
    const source = copyingSentences(['{align:center|**TỊNH TAM**}\n{align:justify|Lời nguyện tiếp theo.}'], 0);
    const runs = formatGhostRuns(source), original = JSON.stringify(runs);
    const typed = 'tịnh ta'.normalize(normalization), aligned = alignGhostRuns(runs, typed)!;
    expect(aligned.map(run => run.text).join('').slice(0, typed.length)).toBe(typed);
    expect(aligned.filter(run => run.line === 0).every(run => run.uppercase === true)).toBe(true);
    const clipped = clipGhostRuns(aligned, 0, typed.length);
    expect(clipped.map(run => run.text).join('')).toBe(typed);
    expect(clipped.every(run => run.uppercase === true)).toBe(true);
    expect(aligned.filter(run => run.line === 1).every(run => !Object.hasOwn(run, 'uppercase'))).toBe(true);
    expect(JSON.stringify(runs)).toBe(original);
  });

  it('does not uppercase one sentence of a mixed paragraph or numeric guidance', () => {
    const source = copyingSentences(['{align:center|A DI ĐÀ. Lời nguyện tiếp theo.}\n123 (3 lần)'], 0);
    const runs = formatGhostRuns(source);
    expect(runs.map(run => run.text).join('')).toBe('A DI ĐÀ. Lời nguyện tiếp theo.\n123');
    expect(runs.every(run => !Object.hasOwn(run, 'uppercase'))).toBe(true);
  });

  it.each(['X', 'LỜI NGUYỆN\nCon thàmh tâm'])('lays out an imperfect raw prefix %j with the reference tail without changing either input', typed => {
    const reference = formatGhostRuns(copyingSentences(['{align:center|**LỜI NGUYỆN**}\n{align:justify|Con thành tâm đảnh lễ chư Phật.}'], 0));
    const original = JSON.stringify(reference);
    const canonical = reference.map(run => run.text).join('');
    const display = alignGhostRuns(reference, typed);
    expect(display).not.toBeNull();
    expect(display!.map(run => run.text).join('')).toBe(typed + canonical.slice(typed.length));
    expect(display![0]).toMatchObject({ bold: true, align: 'center', line: 0 });
    expect(display!.at(-1)).toMatchObject({ bold: false, align: 'justify', line: 1 });
    expect(JSON.stringify(reference)).toBe(original);
  });
  it('converts copyingSentences into ghost runs preserving bold, align and paragraph line numbers', () => {
    const sentences = copyingSentences([
      '{align:center|**Nam mô Phật.**}\n{align:justify|Nguyện tâm thanh tịnh! Lời kinh vô lượng.}',
    ], 0);

    const runs = formatGhostRuns(sentences);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs[0]).toEqual({
      text: 'Nam mô Phật.',
      bold: true,
      align: 'center',
      line: 0,
    });

    const fullText = runs.map(r => r.text).join('');
    expect(fullText).toContain('Nam mô Phật.');
    expect(fullText).toContain('Nguyện tâm thanh tịnh! Lời kinh vô lượng.');
  });

  it('omits nested reference notes and keeps the ghost tail after an optional typed note', () => {
    const reference = formatGhostRuns(copyingSentences(['Nam mô (3 lần (đọc chậm)) Phật.'], 0));
    expect(reference.map(run => run.text).join('')).toBe('Nam mô Phật.');
    const typed = 'Nam mô (3 lần) ';
    expect(formatGhostRuns(copyingSentences(['Nam mô Phật (3 lần).'], 0)).map(run => run.text).join('')).toBe('Nam mô Phật.');
    const aligned = alignGhostRuns(reference, typed)!;
    expect(aligned.map(run => run.text).join('')).toBe(typed + 'Phật.');
    expect(alignGhostRuns(aligned, typed)?.map(run => run.text).join('')).toBe(typed + 'Phật.');
  });

  it('omits a standalone instruction without leaving a blank paragraph', () => {
    const heading = 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH';
    const source = copyingSentences([heading + '\n(Nên thắp hương)\nCon thành tâm đảnh lễ.'], 0);
    expect(formatGhostRuns(source).map(run => run.text).join('')).toBe(heading + '\nCon thành tâm đảnh lễ.');
  });

  it('handles empty sentences gracefully', () => {
    expect(formatGhostRuns([])).toEqual([]);
  });

  it('keeps a separator between styled paragraphs so tracing never joins their words', () => {
    const sentences = copyingSentences(['{align:center|**NAM MÔ**}\n{align:justify|A DI ĐÀ. Lời nguyện tiếp theo.}'], 0);
    const runs = formatGhostRuns(sentences);
    const canonical = runs.map(run => run.text).join('');
    expect(canonical).toBe('NAM MÔ\nA DI ĐÀ. Lời nguyện tiếp theo.');
    expect(runs.find(run => run.text.includes('A DI ĐÀ'))).toMatchObject({ align: 'justify', bold: false });
    expect(nextGhostTraceText(canonical, 'NAM MÔ', { key: 'a' })).toBe('NAM MÔ\nA');
    expect(clipGhostRuns(runs, 7).map(run => run.text).join('')).toBe('A DI ĐÀ. Lời nguyện tiếp theo.');
  });

  it('clips ghost runs accurately for pagination without altering formatting', () => {
    const sentences = copyingSentences([
      '{align:justify|Đoạn văn thứ nhất dài vừa đủ để kiểm tra chia trang.}',
    ], 0);
    const fullRuns = formatGhostRuns(sentences);
    const totalLength = fullRuns.reduce((sum, r) => sum + r.text.length, 0);

    const page1 = clipGhostRuns(fullRuns, 0, 10);
    const page2 = clipGhostRuns(fullRuns, 10, totalLength);

    expect(page1.map(r => r.text).join('')).toBe(fullRuns.map(r => r.text).join('').slice(0, 10));
    expect(page2.map(r => r.text).join('')).toBe(fullRuns.map(r => r.text).join('').slice(10));
  });

  it.each(['NFC', 'NFD'] as const)('keeps the second-page ghost at the raw draft offset for %s Vietnamese text', normalization => {
    const source = readFileSync('src/routes/tu-tap/chep-kinh/+page.svelte', 'utf8');
    const body = source.match(/const ghostRuns = \$derived\.by\(\(\) => \{([\s\S]*?)\n  \}\);/u)?.[1];
    expect(body).toBeTruthy();
    // Chạy chính phép chọn trang của route; không dựng mô hình đã sửa riêng trong test.
    const selectPage = new Function('fullGhostRuns', 'text', 'editorPages', 'editorPage', 'ghostEnabled', 'continuousScroll', 'clipGhostRuns', 'alignGhostRuns', body!);
    const fullRuns = formatGhostRuns(copyingSentences([
      '{align:center|**LỜI NGUYỆN**}\n{align:justify|Con thành tâm đảnh lễ chư Phật.}',
    ], 0));
    const heading = 'lời nguyện\n'.normalize(normalization);
    const text = (heading + 'Con thành tâm').normalize(normalization);
    const starts = [0, heading.length];
    const originalRuns = JSON.stringify(fullRuns);
    const page = selectPage(fullRuns, text, starts, 1, true, false, clipGhostRuns, alignGhostRuns);
    const typedPage = text.slice(starts[1]);
    expect(alignGhostRuns(page, typedPage)).not.toBeNull();
    expect(page.map((run: { text: string }) => run.text).join('')).toBe(typedPage + ' đảnh lễ chư Phật.');
    expect(page[0]).toMatchObject({ bold: false, align: 'justify', line: 1 });
    expect(JSON.stringify(fullRuns)).toBe(originalRuns);
  });
});

describe('nextGhostTraceText', () => {
  const canonical = 'Con thành tâm đảnh lễ, cúi xin chư Phật.';

  it('advances one character from canonical text when typing a character', () => {
    expect(nextGhostTraceText(canonical, '', { key: 'c' })).toBe('C');
    expect(nextGhostTraceText(canonical, 'C', { key: 'o' })).toBe('Co');
    expect(nextGhostTraceText(canonical, 'Co', { key: 'n' })).toBe('Con');
    expect(nextGhostTraceText(canonical, 'Con', { key: ' ' })).toBe('Con ');
  });

  it('removes one character when isBackspace is true', () => {
    expect(nextGhostTraceText(canonical, 'Con', { isBackspace: true })).toBe('Co');
    expect(nextGhostTraceText(canonical, 'C', { isBackspace: true })).toBe('');
    expect(nextGhostTraceText(canonical, '', { isBackspace: true })).toBe('');
  });

  it('smartly skips punctuation/spaces when the user types the matching following letter', () => {
    const text = 'lễ, cúi xin';
    // User is at 'lễ'. Next in canonical is ', c'.
    // If user types 'c', it auto-consumes ', ' and includes 'c'.
    expect(nextGhostTraceText(text, 'lễ', { key: 'c' })).toBe('lễ, c');
  });

  it('advances past spaces and punctuation normally when user presses space or punctuation', () => {
    const text = 'lễ, cúi xin';
    expect(nextGhostTraceText(text, 'lễ', { key: ',' })).toBe('lễ,');
    expect(nextGhostTraceText(text, 'lễ,', { key: ' ' })).toBe('lễ, ');
    expect(nextGhostTraceText(text, 'lễ', { key: ' ' })).toBe('lễ, ');
  });

  it('does not exceed canonical text length', () => {
    expect(nextGhostTraceText('A', 'A', { key: 'x' })).toBe('A');
  });

  it('keeps remaining ghost words intact during longer Telex composition and word-skipped drafts', () => {
    const titleRuns = formatGhostRuns(copyingSentences(['{align:center|**TỊNH KHẨU NGHIỆP CHƠN NGÔN**}'], 0));
    const midWord = alignGhostRuns(titleRuns, 'TỊNH KHẨU nghieepj')!;
    expect(midWord.map(r => r.text).join('')).toBe('TỊNH KHẨU nghieepj CHƠN NGÔN');

    const ducRuns = formatGhostRuns(copyingSentences(['ĐỨC THẾ TÔN'], 0));
    const ducComposing = alignGhostRuns(ducRuns, 'dduwc')!;
    expect(ducComposing.map(r => r.text).join('')).toBe('dduwc THẾ TÔN');

    const multiRuns = formatGhostRuns(copyingSentences([
      '{align:center|**Nam mô A Di Đà Phật.**}\n{align:justify|Con thành tâm đảnh lễ.}',
    ], 0));
    const skippedWord = alignGhostRuns(multiRuns, 'Nam mô Di Đà ')!;
    expect(skippedWord.map(r => r.text).join('')).toBe('Nam mô Di Đà Phật.\nCon thành tâm đảnh lễ.');

    const multiParaNotes = alignGhostRuns(multiRuns, 'Nam mô A Di Đà Phật (3 lần).\nCon ')!;
    expect(multiParaNotes.map(r => r.text).join('')).toBe('Nam mô A Di Đà Phật (3 lần).\nCon thành tâm đảnh lễ.');
    expect(multiParaNotes[0]).toMatchObject({ bold: true, align: 'center', line: 0 });
    expect(multiParaNotes.at(-1)).toMatchObject({ bold: false, align: 'justify', line: 1 });
  });
});
