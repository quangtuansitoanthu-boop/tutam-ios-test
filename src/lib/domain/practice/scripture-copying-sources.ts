import diaTang from '../../data/scripture-copying/dia-tang.json';
import diaTangLegacy from '../../data/scripture-copying/dia-tang-legacy.json';
import phapHoa from '../../data/scripture-copying/phap-hoa.json';
import langNghiem from '../../data/scripture-copying/lang-nghiem.json';
import duocSu from '../../data/scripture-copying/duoc-su.json';
import type { CopyBook } from './scripture-copying';

const editions: CopyBook[] = [diaTang, diaTangLegacy, phapHoa, langNghiem, duocSu];
/** Current edition first; old drafts always resolve by their immutable version. */
export function getCopyBookEditions(id: string): CopyBook[] {
  return editions.filter((book, index) => book.id === id && editions.findIndex(other => other.id === id && other.version === book.version) === index);
}
export function getCopyBook(id: string, version?: string): CopyBook | undefined {
  return getCopyBookEditions(id).find(book => version === undefined || book.version === version);
}
