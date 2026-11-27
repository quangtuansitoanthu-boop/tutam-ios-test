import type { CopyBook, CopyBookId } from '$lib/domain/practice/scripture-copying';
import type { CopyEdition } from './scripture-copying-book-runs';

const legacyDiaTangVersion = 'nfc-v1-9200da84a127a286b52e';
/** Keep unrelated sutras and legacy text out of the selected current book chunk. */
export async function loadCopyBook(id: CopyBookId, version?: string): Promise<CopyBook | undefined> {
  const sources = {
    'dia-tang': () => import('$lib/data/scripture-copying/dia-tang.json'),
    'phap-hoa': () => import('$lib/data/scripture-copying/phap-hoa.json'),
    'lang-nghiem': () => import('$lib/data/scripture-copying/lang-nghiem.json'),
  };
  const book = id === 'dia-tang' && version === legacyDiaTangVersion
    ? (await import('$lib/data/scripture-copying/dia-tang-legacy.json')).default
    : (await sources[id]()).default;
  return version === undefined || book.version === version ? book : undefined;
}
/** Selection needs old keys only; fetch the legacy source only if it is selected. */
export function copyBookEditionKeys(current: CopyBook): CopyEdition[] {
  return current.id === 'dia-tang' ? [current, { id: current.id, version: legacyDiaTangVersion,
    chapters: current.chapters.map(({ number }) => ({ number })) }] : [current];
}
