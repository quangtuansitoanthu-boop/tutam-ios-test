import { describe, expect, it } from 'vitest';
import {
  canonicalizeGhostPrefix,
  nextGhostTraceText,
  reconcileGhostInput,
} from '../../../src/lib/domain/practice/copying-ghost-format';

describe('nextGhostTraceText accurate typing and ghost tracing', () => {
  const canonical = 'Nam Mô A Di Đà Phật.';

  it('advances when user types matching character', () => {
    // Typing 'N' or 'n' should match 'N'
    const step1 = nextGhostTraceText(canonical, '', { key: 'n' });
    expect(step1).toBe('N');

    // Typing 'a' matches 'a'
    const step2 = nextGhostTraceText(canonical, step1, { key: 'a' });
    expect(step2).toBe('Na');

    // Typing 'm' matches 'm'
    const step3 = nextGhostTraceText(canonical, step2, { key: 'm' });
    expect(step3).toBe('Nam');
  });

  it('does NOT advance when user types wrong character', () => {
    // Current is 'Nam' (next is space then 'M')
    // Typing 'x' (wrong) should NOT advance
    const wrong = nextGhostTraceText(canonical, '', { key: 'x' });
    expect(wrong).toBe('');

    const atNa = 'Na'; // next is 'm'
    const wrong2 = nextGhostTraceText(canonical, atNa, { key: 'z' });
    expect(wrong2).toBe('Na');
  });

  it('skips whitespace and punctuation when user types next valid letter', () => {
    const atNam = 'Nam'; // next is ' Mô...'
    // If user types 'm' or 'M'
    const next = nextGhostTraceText(canonical, atNam, { key: 'm' });
    expect(next).toBe('Nam M');
  });

  it('handles Vietnamese specific characters like đ/Đ and accents', () => {
    const textWithD = 'Đức Thế Tôn';
    // User types 'd' for 'Đ'
    const step1 = nextGhostTraceText(textWithD, '', { key: 'd' });
    expect(step1).toBe('Đ');

    // User types 'u' for 'ứ'
    const step2 = nextGhostTraceText(textWithD, 'Đ', { key: 'u' });
    expect(step2).toBe('Đứ');
  });

  it('deletes character on backspace', () => {
    const step = nextGhostTraceText(canonical, 'Nam', { isBackspace: true });
    expect(step).toBe('Na');

    const empty = nextGhostTraceText(canonical, '', { isBackspace: true });
    expect(empty).toBe('');
  });
});

describe('reconcileGhostInput & canonicalizeGhostPrefix (IME & accent auto-snap)', () => {
  const titleCanonical = 'TỊNH KHẨU NGHIỆP\nNam Mô A Di Đà Phật.';

  it('auto-snaps lowercase & wrong/missing accents to canonical uppercase with exact Vietnamese accents', () => {
    const r1 = reconcileGhostInput(titleCanonical, '', { incoming: 'tinh' });
    expect(r1).toEqual({ text: 'TỊNH', mismatch: false });

    const r2 = reconcileGhostInput(titleCanonical, r1.text, { incoming: 'khấu' });
    expect(r2).toEqual({ text: 'TỊNH KHẨU', mismatch: false });

    const r3 = reconcileGhostInput(titleCanonical, r2.text, { incoming: 'nghiep' });
    expect(r3).toEqual({ text: 'TỊNH KHẨU NGHIỆP', mismatch: false });
  });

  it('skips newline after title and snaps sentence casing', () => {
    const afterTitle = 'TỊNH KHẨU NGHIỆP';
    const r = reconcileGhostInput(titleCanonical, afterTitle, { incoming: 'nam mo a di da phat' });
    expect(r).toEqual({ text: 'TỊNH KHẨU NGHIỆP\nNam Mô A Di Đà Phật', mismatch: false });
  });

  it('handles đ/Đ even when user types plain d without stroke', () => {
    const r = reconcileGhostInput('Đức Thế Tôn', '', { incoming: 'duc' });
    expect(r).toEqual({ text: 'Đức', mismatch: false });
  });

  it('returns mismatch=true and expectedWord without advancing when base letter is wrong', () => {
    const r = reconcileGhostInput(titleCanonical, 'TỊNH ', { incoming: 'xyz' });
    expect(r.mismatch).toBe(true);
    expect(r.text).toBe('TỊNH ');
    expect(r.expectedWord).toBe('KHẨU');
  });

  it('canonicalizes an existing lowercase/unaccented draft prefix when ghost mode is toggled on', () => {
    const res = canonicalizeGhostPrefix(titleCanonical, 'tinh khau');
    expect(res).toEqual({ text: 'TỊNH KHẨU', matched: true });

    const mismatchRes = canonicalizeGhostPrefix(titleCanonical, 'sai hoàn toàn');
    expect(mismatchRes).toEqual({ text: 'sai hoàn toàn', matched: false });
  });

  it('reconciles NFD Vietnamese input (iOS/macOS) without false mismatch from combining marks', () => {
    const nfdWord = 'tịnh'.normalize('NFD');
    const r1 = reconcileGhostInput(titleCanonical, '', { incoming: nfdWord });
    expect(r1).toEqual({ text: 'TỊNH', mismatch: false });

    const nfdNext = 'khẩu'.normalize('NFD');
    const r2 = reconcileGhostInput(titleCanonical, r1.text, { incoming: ' ' + nfdNext });
    expect(r2).toEqual({ text: 'TỊNH KHẨU', mismatch: false });

    expect(canonicalizeGhostPrefix(titleCanonical, 'tịnh khẩu'.normalize('NFD'))).toEqual({
      text: 'TỊNH KHẨU',
      matched: true,
    });
  });

  it.each(['Con lễ Phật. Dòng riêng', 'con le phat...'])('keeps a saved draft beyond the end of the model when enabling tracing: %s', draft => {
    expect(canonicalizeGhostPrefix('Con lễ Phật.', draft)).toEqual({ text: draft, matched: false });
  });

  it('advances past trailing punctuation and newline when pressing Enter so lines never stick together', () => {
    const multiLine = 'Nam Mô A Di Đà Phật.\nCon thành tâm đảnh lễ.';
    const beforePeriod = 'Nam Mô A Di Đà Phật';

    const byEnter = reconcileGhostInput(multiLine, beforePeriod, { inputType: 'insertParagraph' });
    expect(byEnter).toEqual({ text: 'Nam Mô A Di Đà Phật.\n', mismatch: false });

    const byNewlineChar = reconcileGhostInput(multiLine, beforePeriod, { incoming: '\n' });
    expect(byNewlineChar).toEqual({ text: 'Nam Mô A Di Đà Phật.\n', mismatch: false });

    const byWordPlusNewline = reconcileGhostInput(multiLine, 'Nam Mô A Di Đà ', { incoming: 'phật\n' });
    expect(byWordPlusNewline).toEqual({ text: 'Nam Mô A Di Đà Phật.\n', mismatch: false });
  });

  it('advances past punctuation and following space/newline when pressing Space, while keeping explicit punctuation step-by-step', () => {
    const prose = 'Con thành tâm đảnh lễ, cúi xin.\nNguyện cầu.';
    // Explicit comma advances only the comma, then space advances the space
    expect(nextGhostTraceText(prose, 'Con thành tâm đảnh lễ', { key: ',' })).toBe('Con thành tâm đảnh lễ,');
    expect(nextGhostTraceText(prose, 'Con thành tâm đảnh lễ,', { key: ' ' })).toBe('Con thành tâm đảnh lễ, ');

    // Pressing space at comma+space advances past both so next IME word never sticks to comma
    expect(nextGhostTraceText(prose, 'Con thành tâm đảnh lễ', { key: ' ' })).toBe('Con thành tâm đảnh lễ, ');

    // Pressing space at period+newline advances to the next line
    expect(nextGhostTraceText(prose, 'Con thành tâm đảnh lễ, cúi xin', { key: ' ' })).toBe('Con thành tâm đảnh lễ, cúi xin.\n');
  });

  it('preserves canonical source alignment (center/justify) and crisp ghost-vs-ink contrast', async () => {
    const { readFileSync } = await import('node:fs');
    const editorSrc = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8');
    const tokensSrc = readFileSync('src/lib/styles/tokens.css', 'utf8');

    // Must not force all ghost/traced lines to text-align:left (which breaks justify prose)
    expect(editorSrc).not.toMatch(/\.rich-copy-ghost\s*:global\(\[data-copy-line\]\)\s*\{\s*text-align:\s*left\s*\}/);
    // Ghost opacity must be faint enough (<= 0.35) so typed ink stands out clearly
    const opacityMatch = tokensSrc.match(/--copy-ghost-opacity:\s*([0-9.]+)/);
    expect(opacityMatch).not.toBeNull();
    expect(Number(opacityMatch![1])).toBeLessThanOrEqual(0.35);
  });

  it('continues matching canonical words after optional parenthetical notes or minor earlier divergence', () => {
    const scripture = 'Nam mô A Di Đà Phật.\nCon thành tâm.';
    expect(canonicalizeGhostPrefix(scripture, 'Nam mô (3 lần) A Di Đà')).toEqual({
      text: 'Nam mô (3 lần) A Di Đà',
      matched: true,
    });

    const afterNote = reconcileGhostInput(scripture, 'Nam mô (3 lần) ', { incoming: 'a di da phat' });
    expect(afterNote).toEqual({ text: 'Nam mô (3 lần) A Di Đà Phật', mismatch: false });

    const afterSkipped = reconcileGhostInput(scripture, 'Nam mô Di Đà ', { incoming: 'phat' });
    expect(afterSkipped).toEqual({ text: 'Nam mô Di Đà Phật', mismatch: false });
  });
});
