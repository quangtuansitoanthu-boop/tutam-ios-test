import { ROSARY_PHRASES, type RosaryPhrase } from './guided-sessions';

export const NAME_COPYING_ROUND_SIZE = 108;
export const NAME_COPYING_MANTRA_LEGACY_LABELS = ['Om Mani Pad Me Hum', 'Om Mani PAD ME HUM'];
type RosaryName = Extract<RosaryPhrase, `Nam mô ${string}`>;
export type NameCopyingPhrase = RosaryName | 'Ôm Ma Ni Pát Mê Hùm';
export const NAME_COPYING_PHRASES: NameCopyingPhrase[] = [
  ...ROSARY_PHRASES.filter((phrase): phrase is RosaryName => phrase.startsWith('Nam mô ')),
  'Ôm Ma Ni Pát Mê Hùm'
];

export function nameCopyingChoiceId(phrase: NameCopyingPhrase): string {
  return phrase.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-');
}

export function matchesNameCopyingPhrase(line: string, phrase: NameCopyingPhrase): boolean {
  const normalize = (text: string) => text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleUpperCase('vi-VN');
  return normalize(line) === normalize(phrase);
}

function foldVietnameseWord(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/gu, 'd').toLowerCase();
}

function hasVietnameseDiacritic(word: string): boolean {
  const nfd = word.normalize('NFD');
  return /\p{M}/u.test(nfd) || /[đĐ]/u.test(word);
}

/**
 * Reconciles user-typed name copying text against the canonical phrase.
 * Completed words (followed by whitespace, or on explicit commit) whose base letters
 * match the target word snap to canonical uppercase Vietnamese. While still typing the
 * last word without trailing space, plain ASCII stays untouched so Telex/VNI tone keys
 * can complete naturally; once a Vietnamese diacritic is typed (even the wrong tone),
 * a matching final word snaps immediately.
 */
export function reconcileNameCopyingInput(
  phrase: NameCopyingPhrase,
  incoming: string,
  commit = false
): string {
  const upper = incoming.normalize('NFC').toLocaleUpperCase('vi-VN');
  if (!upper.trim()) return upper;

  const targetWords = phrase.normalize('NFC').trim().split(/\s+/u).map((w) => w.toLocaleUpperCase('vi-VN'));
  const hasTrailingSpace = /\s$/u.test(upper);
  const trimmedStart = upper.trimStart();
  const leadingSpace = upper.slice(0, upper.length - trimmedStart.length);
  const tokens = trimmedStart.trimEnd().split(/(\s+)/u);

  let wordIdx = 0;
  const wordCount = Math.ceil(tokens.length / 2);

  const rebuilt = tokens.map((token, tokenIdx) => {
    if (tokenIdx % 2 === 1) return token; // whitespace separator
    const idx = wordIdx++;
    const targetWord = targetWords[idx];
    if (!targetWord) return token;
    const isLastTypedWord = idx === wordCount - 1;
    const isCompletedWord = !isLastTypedWord || hasTrailingSpace || commit;
    if (foldVietnameseWord(token) !== foldVietnameseWord(targetWord)) return token;
    if (isCompletedWord || (isLastTypedWord && idx === targetWords.length - 1 && hasVietnameseDiacritic(token))) {
      return targetWord;
    }
    return token;
  });

  const joined = leadingSpace + rebuilt.join('');
  // Trim trailing space once the complete phrase is matched so validation triggers cleanly.
  if (hasTrailingSpace) {
    if (wordCount === targetWords.length && matchesNameCopyingPhrase(joined, phrase)) {
      return targetWords.join(' ');
    }
    return `${joined} `;
  }
  return joined;
}

export function isNameCopyingNextKey(key: string, keyCode?: number): boolean {
  return key === 'Enter' || key === 'Tab' || keyCode === 13 || keyCode === 9;
}

export interface ShouldAdvanceKeyParams {
  key: string;
  keyCode?: number;
  isComposing?: boolean;
  currentLine?: string;
  target?: NameCopyingPhrase;
  lastAdvanceTime: number;
  now?: number;
  cooldownMs?: number;
}

export function shouldAdvanceNameCopyingKey({
  key,
  keyCode,
  isComposing = false,
  lastAdvanceTime,
  now = Date.now(),
  cooldownMs = 400
}: ShouldAdvanceKeyParams): boolean {
  if (!isNameCopyingNextKey(key, keyCode)) return false;
  if (isComposing) return false;
  if (now - lastAdvanceTime < cooldownMs) return false;
  return true;
}
