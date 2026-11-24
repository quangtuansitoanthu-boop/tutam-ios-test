import { withoutCopyNotes } from './scripture-copying';
import type { CopySourceLine } from './copying-formatting';
import type { TypedRun } from './copying-typed-format';

/** Convert canonical scripture sentences into styled runs for the ghost tracing underlay. */
export function formatGhostRuns(source: CopySourceLine[]): TypedRun[] {
  const runs: TypedRun[] = [];
  source.forEach((sentence, index) => {
    const line = sentence.paragraph ?? index;
    const previous = runs[runs.length - 1];
    if (previous && previous.line !== line && !previous.text.endsWith('\n') && !sentence.parts[0]?.text.startsWith('\n')) {
      runs.push({ ...previous, text: '\n' });
    }
    for (const part of sentence.parts) {
      if (!part.text) continue;
      const last = runs[runs.length - 1];
      if (last && last.bold === part.bold && last.line === line && last.align === sentence.align) {
        last.text += part.text;
      } else {
        runs.push({
          text: part.text,
          bold: part.bold,
          align: sentence.align,
          line,
        });
      }
    }
  });
  const sourceText = runs.map(run => run.text).join('');
  const masked = withoutCopyNotes(sourceText, '\0');
  if (masked === sourceText) return runs;
  // Trim spacing introduced around a removed note while retaining paragraph breaks.
  const omitted = new Set<number>();
  // A line occupied entirely by guidance must not leave a second separator.
  for (const match of masked.matchAll(/(^|\r?\n)[ \t\0]*\0[ \t\0]*(?=\r?\n|$)/gu)) {
    const paragraphEnd = match.index + match[0].length;
    const separator = masked.slice(paragraphEnd, paragraphEnd + 2).startsWith('\r\n') ? 2 : 1;
    const end = Math.min(masked.length, paragraphEnd + separator);
    const start = paragraphEnd === masked.length ? match.index : match.index + match[1].length;
    for (let index = start; index < end; index++) omitted.add(index);
  }
  for (const match of masked.matchAll(/\0+(?:[ \t]*\0+)*/gu)) {
    let start = match.index;
    let end = start + match[0].length;
    if (start === 0 || /\s/u.test(masked[start - 1])) {
      while (/[ \t]/u.test(masked[end] ?? '')) end++;
    }
    if (end === masked.length || /[.,!?;:…\r\n。！？]/u.test(masked[end])) {
      while (start > 0 && /[ \t]/u.test(masked[start - 1])) start--;
    }
    for (let index = start; index < end; index++) omitted.add(index);
  }
  let offset = 0;
  return runs.flatMap(run => {
    const text = run.text.split('').filter((_, index) => !omitted.has(offset + index)).join('');
    offset += run.text.length;
    return text ? [{ ...run, text }] : [];
  });
}

/** Share raw draft glyph metrics with the ghost; this never grants tracing eligibility. */
export function alignGhostRuns(runs: TypedRun[], typed: string): TypedRun[] | null {
  const key = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi');
  const canonical = runs.map(run => run.text).join('');
  const masked = withoutCopyNotes(typed, '\0');
  const hasNotes = masked !== typed;
  const compact = (value: string) => value.replace(/\s+/gu, ' ').trim();
  const prefix = key(typed);
  if (!canonical) return typed ? null : runs;
  const sourceEnd = (text: string, normalizedLength: number) => {
    if (!normalizedLength) return 0;
    let end = 0;
    for (const character of text) {
      end += character.length;
      if (key(text.slice(0, end)).length >= normalizedLength) {
        while (end < text.length && /\p{M}/u.test(text[end])) end++;
        return end;
      }
    }
    return text.length;
  };
  let canonicalEnd = sourceEnd(canonical, prefix.length);
  if (hasNotes && !canonical.startsWith(typed)) {
    const typedBody = compact(key(masked.replaceAll('\0', '')));
    const referenceBody = compact(key(canonical));
    if (referenceBody.startsWith(typedBody)) {
      canonicalEnd = 0;
      while (compact(key(canonical.slice(0, canonicalEnd))).length < typedBody.length) canonicalEnd++;
      if (/\s$/u.test(typed) && /\s/u.test(canonical[canonicalEnd] ?? '')) canonicalEnd++;
      const remaining = clipGhostRuns(runs, canonicalEnd);
      const first = runs[0];
      return [{ ...first, text: typed }, ...remaining];
    }
  }
  let offset = 0, consumed = 0;
  const aligned = runs.map(run => {
    const count = Math.max(0, Math.min(run.text.length, canonicalEnd - offset));
    const next = sourceEnd(typed, key(canonical.slice(0, offset + count)).length);
    const text = count ? typed.slice(consumed, next) + run.text.slice(count) : run.text;
    offset += run.text.length;
    if (count) consumed = next;
    return { ...run, text };
  });
  // A restored draft may extend beyond the reference. Its extra text remains
  // visible and selectable rather than being truncated by display formatting.
  if (consumed < typed.length) aligned[aligned.length - 1].text += typed.slice(consumed);
  return aligned;
}

/** Clip ghost runs to an active page range without altering line groupings or alignments. */
export function clipGhostRuns(runs: TypedRun[], start = 0, end = Infinity): TypedRun[] {
  let offset = 0;
  return runs.flatMap(run => {
    const left = Math.max(start, offset), right = Math.min(end, offset + run.text.length);
    const clipped = right > left ? [{ ...run, text: run.text.slice(left - offset, right - offset) }] : [];
    offset += run.text.length;
    return clipped;
  });
}

export interface GhostTraceInput {
  key?: string;
  inputType?: string;
  isBackspace?: boolean;
}

const normalizeChar = (s: string) =>
  s.normalize('NFD')
   .replace(/\p{M}/gu, '')
   .toLowerCase()
   .replace(/đ/g, 'd');

/**
 * Calculates the next typed text slice when tracing ghost text.
 * Only advances along the canonical scripture when the user types the matching character.
 */
export function nextGhostTraceText(
  canonical: string,
  current: string,
  input: GhostTraceInput
): string {
  if (input.isBackspace) {
    if (!current) return '';
    return current.slice(0, current.length - 1);
  }

  const currentLength = current.length;
  if (currentLength >= canonical.length) return canonical;

  const typedKey = input.key ?? '';
  if (!typedKey || typedKey === '\n' || input.inputType === 'insertParagraph' || input.inputType === 'insertLineBreak') {
    if (typedKey === '\n' || input.inputType === 'insertParagraph' || input.inputType === 'insertLineBreak') {
      const remaining = canonical.slice(currentLength);
      // Advance past optional trailing punctuation/spaces leading into the line break
      // so pressing Enter at the end of a sentence (e.g. "Phật.\n") moves cleanly to the next line.
      const lineBreakMatch = remaining.match(/^([ \t\p{P}]*\r?\n+[ \t]*)/u);
      if (lineBreakMatch && lineBreakMatch[0]) {
        return canonical.slice(0, currentLength + lineBreakMatch[0].length);
      }
      const match = remaining.match(/^(\r?\n|\s)+/u);
      if (match && match[0]) {
        return canonical.slice(0, currentLength + match[0].length);
      }
    }
    return current;
  }

  const remaining = canonical.slice(currentLength);
  const nextChar = remaining[0];

  // If user typed space or punctuation, advance cleanly
  const isPunctOrSpace = /^[\s\p{P}]/u;
  if (isPunctOrSpace.test(typedKey)) {
    if (typedKey === ' ' || typedKey === '\t') {
      // Pressing Space at punctuation + whitespace/newline (e.g. ", " or ".\n") advances
      // past both so the next word starts cleanly without sticking to punctuation.
      const spaceAdvance = remaining.match(/^([\p{P}]+[ \t]*\r?\n+[ \t]*|[\p{P}]+[ \t]+|[ \t]*\r?\n+[ \t]*|[ \t]+)/u);
      if (spaceAdvance && spaceAdvance[0]) {
        return canonical.slice(0, currentLength + spaceAdvance[0].length);
      }
      if (isPunctOrSpace.test(nextChar)) {
        return canonical.slice(0, currentLength + 1);
      }
      return current;
    }
    if (isPunctOrSpace.test(nextChar)) {
      return canonical.slice(0, currentLength + 1);
    }
    return current;
  }

  // User typed a non-space/non-punctuation character (e.g. letter)
  // Check if immediate next character matches
  if (normalizeChar(nextChar) === normalizeChar(typedKey)) {
    return canonical.slice(0, currentLength + 1);
  }

  // If next character is punctuation or whitespace, skip over it if the following letter matches
  const skipMatch = remaining.match(/^([\s\p{P}]+)(.)/u);
  if (skipMatch) {
    const skipped = skipMatch[1];
    const targetChar = skipMatch[2];
    if (normalizeChar(targetChar) === normalizeChar(typedKey)) {
      return canonical.slice(0, currentLength + skipped.length + 1);
    }
  }

  return current;
}

export interface ReconcileGhostInputOptions {
  incoming?: string;
  inputType?: string;
  isBackspace?: boolean;
}

export interface ReconcileGhostResult {
  text: string;
  mismatch: boolean;
  expectedWord?: string;
}

export function nextExpectedGhostWord(canonical: string, currentLength: number): string {
  const remaining = canonical.slice(currentLength).replace(/^[\s\p{P}]+/u, '');
  if (!remaining) return '';
  const match = remaining.match(/^[^\s\p{P}]+/u);
  return match ? match[0] : remaining[0] ?? '';
}

/**
 * Reconciles single-char or multi-char IME input against canonical ghost scripture.
 * Matches base letters accent- and case-insensitively, snapping output to canonical casing/accents.
 */
export function reconcileGhostInput(
  canonical: string,
  current: string,
  options: ReconcileGhostInputOptions,
): ReconcileGhostResult {
  if (options.isBackspace || options.inputType === 'deleteContentBackward') {
    return {
      text: current ? current.slice(0, current.length - 1) : '',
      mismatch: false,
    };
  }

  if (current.length >= canonical.length) {
    return { text: canonical, mismatch: false };
  }

  if (options.inputType === 'insertParagraph' || options.inputType === 'insertLineBreak') {
    const next = nextGhostTraceText(canonical, current, { inputType: options.inputType });
    return { text: next, mismatch: false };
  }

  const incoming = (options.incoming ?? '').normalize('NFC');
  if (!incoming) {
    return { text: current, mismatch: false };
  }

  let cursor = current;
  let advancedLetter = false;
  const isPunctOrSpace = /^[\s\p{P}]$/u;

  for (const ch of Array.from(incoming)) {
    if (cursor.length >= canonical.length) break;
    if (/^\p{M}$/u.test(ch)) continue;
    if (isPunctOrSpace.test(ch)) {
      const next = nextGhostTraceText(canonical, cursor, { key: ch, inputType: options.inputType });
      cursor = next;
      continue;
    }
    const next = nextGhostTraceText(canonical, cursor, { key: ch, inputType: options.inputType });
    if (next === cursor) {
      return {
        text: current,
        mismatch: true,
        expectedWord: nextExpectedGhostWord(canonical, current.length),
      };
    }
    cursor = next;
    advancedLetter = true;
  }

  if (!advancedLetter && cursor === current && incoming.trim().length > 0) {
    return {
      text: current,
      mismatch: true,
      expectedWord: nextExpectedGhostWord(canonical, current.length),
    };
  }

  return { text: cursor, mismatch: false };
}

/**
 * Canonicalizes an existing draft prefix against canonical scripture if base letters match.
 */
export function canonicalizeGhostPrefix(
  canonical: string,
  draft: string,
): { text: string; matched: boolean } {
  if (!draft) return { text: '', matched: true };
  if (canonical.startsWith(draft)) return { text: draft, matched: true };
  const result = reconcileGhostInput(canonical, '', { incoming: draft });
  if (result.mismatch) {
    return { text: draft, matched: false };
  }
  return { text: result.text, matched: true };
}
