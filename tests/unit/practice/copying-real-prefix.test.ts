import { expect, it } from 'vitest';
import diaTang from '../../../src/lib/data/scripture-copying/dia-tang.json';
import phapHoa from '../../../src/lib/data/scripture-copying/phap-hoa.json';
import langNghiem from '../../../src/lib/data/scripture-copying/lang-nghiem.json';
import diaTangLegacy from '../../../src/lib/data/scripture-copying/dia-tang-legacy.json';
import { compareCopy, normalizeCopyText } from '../../../src/lib/domain/practice/scripture-copying';

it('does not report Nguyện xin or other correct words as extra in a partially copied prayer', () => {
  const source = diaTang.chapters[0].blocks[0];
  const words = normalizeCopyText(source).split(' ');
  for (let length = 1; length <= words.length; length++) {
    expect(compareCopy(source, words.slice(0, length).join('\n'), false).issues, `prefix ${length}`).toEqual([]);
  }
});

it('checks every bundled edition without rejecting long passages or flagging their unwritten ending', () => {
  for (const book of [diaTang, diaTangLegacy, phapHoa, langNghiem]) {
    for (const chapter of book.chapters) {
      for (const source of chapter.blocks) {
        const typed = normalizeCopyText(source);
        const words = typed.split(' ');
        expect(compareCopy(source, typed, true)).toEqual({ complete: true, issues: [] });
        if (words.length < 3) continue;
        const prefix = words.slice(0, -2);
        expect(compareCopy(source, prefix.join(' '))).toEqual({ complete: false, issues: [] });
        const index = Math.floor(prefix.length / 2);
        const original = prefix[index];
        prefix[index] = 'zzkiemtra';
        const altered = prefix.join(' ');
        const result = compareCopy(source, altered);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].kind).toBe('wrong');
        expect(result.issues[0].expected.toLowerCase()).toBe(original);
        expect(altered.slice(result.issues[0].start, result.issues[0].end)).toBe('zzkiemtra');
      }
    }
  }
});

