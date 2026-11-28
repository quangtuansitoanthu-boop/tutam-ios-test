import { hasOpenCopyNote, withoutCopyNotes } from './scripture-copying';
import type { CopySourceLine } from './copying-formatting';
import { copyingUppercaseParagraphs, type TypedRun } from './copying-typed-format';

/** Convert canonical scripture sentences into styled runs for the ghost tracing underlay. */
export function formatGhostRuns(source: CopySourceLine[]): TypedRun[] {
  const runs: TypedRun[] = [];
  const uppercase = copyingUppercaseParagraphs(source);
  source.forEach((sentence, index) => {
    const line = sentence.paragraph ?? index;
    const previous = runs[runs.length - 1];
    if (previous && previous.line !== line && !previous.text.endsWith('\n') && !sentence.parts[0]?.text.startsWith('\n')) {
      runs.push({ ...previous, text: '\n' });
    }
    for (const part of sentence.parts) {
      if (!part.text) continue;
      const last = runs[runs.length - 1];
      if (last && last.bold === part.bold && last.line === line && last.align === sentence.align && last.uppercase === (uppercase.has(line) ? true : undefined)) {
        last.text += part.text;
      } else {
        runs.push({
          text: part.text,
          bold: part.bold,
          align: sentence.align,
          line,
          ...(uppercase.has(line) ? { uppercase: true as const } : {}),
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

const traceWordKey = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/gu, 'd');

interface WordSpan { start: number; end: number; key: string }

function extractWordSpans(text: string): WordSpan[] {
  return [...text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map(match => ({
    start: match.index!,
    end: match.index! + match[0].length,
    key: traceWordKey(match[0]),
  }));
}

/** Match typed words against canonical word boundaries without drifting across lines or Telex lengths. */
function alignCanonicalWordEnd(canonical: string, typed: string): number | null {
  const cleanTyped = withoutCopyNotes(typed, ' ');
  const typedWords = extractWordSpans(cleanTyped);
  if (!typedWords.length) return null;
  const expected = extractWordSpans(canonical);
  if (!expected.length) return null;

  const endsWithSep = typedWords[typedWords.length - 1].end < typed.length;
  const completed = endsWithSep ? typedWords : typedWords.slice(0, -1);

  let lastExpIdx = -1;
  let matchedCount = 0;

  if (completed.length > 0) {
    const E = expected.length;
    const C = completed.length;
    const stride = C + 1;
    const dp = new Uint16Array((E + 1) * stride);
    for (let i = 0; i <= E; i++) dp[i * stride] = i;
    for (let j = 0; j <= C; j++) dp[j] = j;
    for (let i = 1; i <= E; i++) {
      for (let j = 1; j <= C; j++) {
        const match = expected[i - 1].key === completed[j - 1].key;
        dp[i * stride + j] = Math.min(
          dp[(i - 1) * stride + j] + 1,
          dp[i * stride + (j - 1)] + 1,
          dp[(i - 1) * stride + (j - 1)] + (match ? 0 : 1),
        );
      }
    }
    let bestI = 1;
    let bestCost = dp[stride + C];
    for (let i = 2; i <= E; i++) {
      const cost = dp[i * stride + C];
      if (cost < bestCost || (cost === bestCost && Math.abs(i - C) < Math.abs(bestI - C))) {
        bestCost = cost;
        bestI = i;
      }
    }
    let i = bestI;
    let j = C;
    while (i > 0 && j > 0) {
      const cost = dp[i * stride + j];
      if (expected[i - 1].key === completed[j - 1].key && cost === dp[(i - 1) * stride + (j - 1)]) {
        matchedCount++;
        i--;
        j--;
      } else if (cost === dp[(i - 1) * stride + (j - 1)] + 1) {
        i--;
        j--;
      } else if (cost === dp[(i - 1) * stride + j] + 1) {
        i--;
      } else {
        j--;
      }
    }
    lastExpIdx = bestI - 1;
  }

  if (endsWithSep) {
    if (matchedCount === 0) return null;
    const expEnd = expected[lastExpIdx].end;
    const typedTrail = cleanTyped.slice(typedWords[typedWords.length - 1].end);
    const nextStart = lastExpIdx + 1 < expected.length ? expected[lastExpIdx + 1].start : canonical.length;
    const gap = canonical.slice(expEnd, nextStart);
    if (/\r?\n$/u.test(typedTrail)) return nextStart;
    if (/\s$/u.test(typedTrail)) {
      const trailingGap = gap.match(/^[^\r\n]*?[ \t]+/u)?.[0] ?? gap;
      return expEnd + (/\r?\n/u.test(gap) ? gap.indexOf('\n') + 1 : trailingGap.length);
    }
    // User typed trailing punctuation without whitespace: consume matching punctuation in gap.
    const punctMatch = gap.match(/^[\p{P}]+/u)?.[0] ?? '';
    return expEnd + punctMatch.length;
  }

  const active = typedWords[typedWords.length - 1];
  const candidateIdx = lastExpIdx + 1;
  if (candidateIdx >= expected.length) return canonical.length;

  const aheadIdx = matchedCount > 0
    ? expected.findIndex((w, idx) => idx >= candidateIdx && idx < candidateIdx + 4 && w.key === active.key)
    : (active.key === expected[0].key ? 0 : -1);

  if (aheadIdx >= 0) return expected[aheadIdx].end;
  if (matchedCount === 0 && active.key[0] !== expected[0].key[0]) return null;

  const target = expected[candidateIdx];
  const targetLen = target.end - target.start;
  const typedLen = active.key.length;
  // Clamp active in-progress word (e.g. raw Telex "nghieepj" -> "NGHIỆP") so it never eats the next space/word.
  if (matchedCount === 0 && !target.key.startsWith(active.key) && active.key[0] !== target.key[0]) return null;
  const rawAdvance = Math.min(typed.slice(active.start, active.end).normalize('NFC').length, targetLen);
  const advance = Math.max(Math.min(typedLen, targetLen), rawAdvance);
  return target.start + Math.min(targetLen, advance);
}

/** Share raw draft glyph metrics with the ghost; this never grants tracing eligibility. */
export function alignGhostRuns(runs: TypedRun[], typed: string): TypedRun[] | null {
  const key = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi');
  const canonical = runs.map(run => run.text).join('');
  const masked = withoutCopyNotes(typed, '\0');
  const hasNotes = masked !== typed;
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
  let canonicalEnd = canonical.startsWith(typed)
    ? typed.length
    : (alignCanonicalWordEnd(canonical, typed) ?? sourceEnd(canonical, prefix.length));

  if (hasNotes && !canonical.startsWith(typed)) {
    const lineGroups = new Map<number, TypedRun[]>();
    let offset = 0;
    for (const run of runs) {
      if (offset >= canonicalEnd) break;
      const list = lineGroups.get(run.line) ?? [];
      list.push(run);
      lineGroups.set(run.line, list);
      offset += run.text.length;
    }
    const typedLines = typed.match(/[^\n]*\n|[^\n]+/gu) ?? [typed];
    const groups = [...lineGroups.values()];
    if (groups.length > 1 && typedLines.length === groups.length) {
      const remaining = clipGhostRuns(runs, canonicalEnd);
      const prefixRuns: TypedRun[] = typedLines.map((lineText, idx) => ({
        ...groups[idx][0],
        text: lineText,
      }));
      return [...prefixRuns, ...remaining];
    }
  }

  let offset = 0, consumed = 0;
  const aligned = runs.map(run => {
    const count = Math.max(0, Math.min(run.text.length, canonicalEnd - offset));
    const next = offset + count >= canonicalEnd
      ? typed.length
      : sourceEnd(typed, key(canonical.slice(0, offset + count)).length);
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
  preserveDraft?: boolean;
}

export interface ReconcileGhostResult {
  text: string;
  mismatch: boolean;
  expectedWord?: string;
}

export interface GhostTypingState {
  text: string;
  previousKey: string;
  modifiers: string[];
}

/** Trạng thái bàn phím chỉ tồn tại trong lượt gõ, không áp vào bản chép đã lưu. */
export function reconcileGhostTyping(
  canonical: string,
  current: string,
  options: ReconcileGhostInputOptions,
  previous?: GhostTypingState,
): ReconcileGhostResult & { state: GhostTypingState } {
  const incoming = options.incoming ?? '';
  const state: GhostTypingState = previous?.text === current
    ? previous : { text: current, previousKey: '', modifiers: [] };
  const word = current.match(/[\p{L}\p{M}]+$/u)?.[0] ?? '';
  const key = incoming.toLowerCase();
  let modifier = '';
  // Chữ hợp lệ kế tiếp trong cùng từ phải được chép, kể cả khi trùng phím dấu.
  const nextCharacterMatches = canonical.startsWith(current) && incoming.length === 1
    && normalizeChar(canonical[current.length] ?? '') === normalizeChar(incoming);
  if (state.previousKey && incoming.length === 1 && word && !nextCharacterMatches) {
    const decomposed = word.normalize('NFD');
    const last = Array.from(word.normalize('NFC')).at(-1) ?? '';
    const tones: Record<string, string> = { s: '\u0301', '1': '\u0301', f: '\u0300', '2': '\u0300', r: '\u0309', '3': '\u0309', x: '\u0303', '4': '\u0303', j: '\u0323', '5': '\u0323' };
    if (tones[key] && decomposed.includes(tones[key])) modifier = 'tone';
    else if ((key === 'd' && state.previousKey === 'd' && last.toLowerCase() === 'đ') || (key === '9' && /đ/iu.test(word))) modifier = 'stroke';
    else if ((/^[aeo]$/u.test(key) && state.previousKey === key && last.normalize('NFD').toLowerCase().startsWith(key) && last.normalize('NFD').includes('\u0302')) || (key === '6' && decomposed.includes('\u0302'))) modifier = 'circumflex';
    else if ((key === 'w' || key === '7') && decomposed.includes('\u031b')) modifier = 'horn';
    else if ((key === 'w' || key === '8') && decomposed.includes('\u0306')) modifier = 'breve';
  }
  if (modifier) {
    if (state.modifiers.includes(modifier)) return { text: current, mismatch: true, expectedWord: nextExpectedGhostWord(canonical, current.length), state };
    return { text: current, mismatch: false, state: { ...state, modifiers: [...state.modifiers, modifier] } };
  }
  if (current === canonical && incoming.trim()) return { text: current, mismatch: true, expectedWord: '', state };
  const result = reconcileGhostInput(canonical, current, options);
  if (result.mismatch) return { ...result, state };
  // Dán/IME nhiều ký tự, xóa, dấu câu và ranh giới từ đều kết thúc lượt phím bổ trợ.
  if (incoming.length !== 1 || !/^\p{L}$/u.test(incoming) || result.text === current) {
    return { ...result, state: { text: result.text, previousKey: '', modifiers: [] } };
  }
  const nextWord = result.text.match(/[\p{L}\p{M}]+$/u)?.[0] ?? '';
  const continued = word && nextWord.startsWith(word) && !/[\s\p{P}]/u.test(result.text.slice(current.length));
  const modifiers = continued ? [...state.modifiers] : [];
  const marks = incoming.normalize('NFD');
  if (/[\u0300\u0301\u0303\u0309\u0323]/u.test(marks)) modifiers.push('tone');
  if (marks.includes('\u0302')) modifiers.push('circumflex');
  if (marks.includes('\u031b')) modifiers.push('horn');
  if (marks.includes('\u0306')) modifiers.push('breve');
  if (/đ/iu.test(incoming)) modifiers.push('stroke');
  return { ...result, state: { text: result.text, previousKey: key, modifiers } };
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

  if (current && !canonical.startsWith(current)) {
    const tailEnd = alignCanonicalWordEnd(canonical, current);
    if (tailEnd === null) {
      return {
        text: current,
        mismatch: true,
        expectedWord: nextExpectedGhostWord(canonical, 0),
      };
    }
    const res = reconcileGhostInput(canonical, canonical.slice(0, tailEnd), options);
    if (res.mismatch) {
      return {
        text: current,
        mismatch: true,
        expectedWord: res.expectedWord,
      };
    }
    let appended = res.text.slice(tailEnd);
    if (/\s$/u.test(current)) appended = appended.replace(/^[ \t]+/u, '');
    if (/[)）]$/u.test(current) && options.incoming?.startsWith(' ') && !/^\s/u.test(appended)) appended = ' ' + appended;
    return { text: current + appended, mismatch: false };
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
    if (/^\p{M}$/u.test(ch)) continue;
    if (cursor.length >= canonical.length) {
      if (options.preserveDraft) return { text: current, mismatch: true };
      break;
    }
    if (isPunctOrSpace.test(ch)) {
      const next = nextGhostTraceText(canonical, cursor, { key: ch, inputType: options.inputType });
      if (options.preserveDraft && next === cursor) return { text: current, mismatch: true };
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
  if (!canonical || hasOpenCopyNote(draft)) return { text: draft, matched: false };
  if (/[(（]/u.test(draft)) {
    const noteFree = withoutCopyNotes(draft, '').replace(/[ \t]+/gu, ' ').trimStart();
    const noteResult = reconcileGhostInput(canonical, '', { incoming: noteFree, preserveDraft: true });
    return { text: draft, matched: !noteResult.mismatch };
  }
  const result = reconcileGhostInput(canonical, '', { incoming: draft, preserveDraft: true });
  if (result.mismatch) {
    return { text: draft, matched: false };
  }
  return { text: result.text, matched: true };
}
