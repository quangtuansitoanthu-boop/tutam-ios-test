import { createInterfaceTranslator } from './interface';
import { createInterfaceTranslator as createCopyingTranslator } from './copying-interface';
import { getPreceptPracticeCopy } from './precept-practice-ui';
import { getLocaleContext } from '$lib/stores/locale.svelte';
import { NAME_COPYING_COPY } from '$lib/domain/practice/name-copying-copy';
import type { RoutineMode } from '$lib/domain/practice/routine-activities';

export const routineActivityNames = {
  repentance: 'Phát nguyện Sám hối',
  meditation: 'Thiền định',
  rosary: 'Lần tràng hạt',
  prostration: 'Lễ Phật & Sám Hối',
  'scripture-copying': 'Chép kinh',
  'name-copying': NAME_COPYING_COPY.title,
  precepts: getPreceptPracticeCopy(false).catalogTitle,
  'eight-precepts': getPreceptPracticeCopy(false).catalogEight,
  abstinence: getPreceptPracticeCopy(false).abstinenceTitle,
  sutra: 'Tụng, đọc kinh',
  mantra: 'Trì chú',
  ritual: 'Nghi thức khác',
  dedication: 'HỒI HƯỚNG',
} satisfies Record<RoutineMode, string>;

export function createRoutineActivityTranslator() {
  const locale = getLocaleContext();
  const ui = createInterfaceTranslator();
  const copying = createCopyingTranslator();
  return (mode: RoutineMode): string => {
    const en = locale.current === 'en';
    const precepts = getPreceptPracticeCopy(en);
    switch (mode) {
      case 'repentance': return en ? 'Repentance vow' : routineActivityNames.repentance;
      case 'dedication': return en ? 'DEDICATION' : routineActivityNames.dedication;
      case 'name-copying': return copying(routineActivityNames[mode]);
      case 'precepts': return precepts.catalogTitle;
      case 'eight-precepts': return precepts.catalogEight;
      case 'abstinence': return precepts.abstinenceTitle;
      default: return ui(routineActivityNames[mode]);
    }
  };
}
