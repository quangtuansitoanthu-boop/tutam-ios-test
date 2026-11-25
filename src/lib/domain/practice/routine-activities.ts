import { COPYING_BOOKS } from './scripture-copying';
import { NAME_COPYING_PHRASES, nameCopyingChoiceId } from './name-copying';
import type { RoutineStep } from './personal-practice';
import type { PracticeCategory } from './state';

export const ROUTINE_ACTIVITY_GROUPS = [
  { label: 'Công phu thường nhật', modes: ['meditation', 'rosary', 'prostration'] },
  { label: 'Kho kinh điển & Nghi thức', modes: ['sutra', 'mantra', 'ritual'] },
  { label: 'Biên chép công đức', modes: ['scripture-copying', 'name-copying'] },
  { label: 'Thanh tịnh & Giới luật', modes: ['precepts', 'eight-precepts', 'abstinence'] },
] as const;

export const ROUTINE_READING_CATEGORIES = {
  sutra: 'KINH PHẬT',
  mantra: 'TRÌ CHÚ',
  ritual: 'NGHI THỨC KHÁC',
} as const satisfies Record<string, PracticeCategory>;

export const ROUTINE_COPY_ROUTES = {
  'scripture-copying': '/tu-tap/chep-kinh',
  'name-copying': '/tu-tap/chep-danh-hieu',
} as const;

export type RoutineMode = typeof ROUTINE_ACTIVITY_GROUPS[number]['modes'][number] | 'repentance' | 'dedication';
export type RoutineReadingMode = keyof typeof ROUTINE_READING_CATEGORIES;
type ToolMode = Exclude<RoutineMode, RoutineStep['kind']>;
type TextStep = Extract<RoutineStep, { kind: 'dedication' }>;

const prefix = 'routine-v1:';
const toolModes = new Set<string>([
  'repentance', ...Object.keys(ROUTINE_COPY_ROUTES), ...Object.keys(ROUTINE_READING_CATEGORIES),
  'precepts', 'eight-precepts', 'abstinence',
]);

export function routineStepActivity(step: RoutineStep): { mode: RoutineMode; articleId?: string } {
  if (step.kind !== 'dedication' || !step.sourceId?.startsWith(prefix)) return { mode: step.kind };
  const [mode, articleId, extra] = step.sourceId.slice(prefix.length).split(':');
  if (extra !== undefined || !toolModes.has(mode)) return { mode: 'dedication' };
  if (articleId === undefined && mode === 'scripture-copying') {
    const book = COPYING_BOOKS.find(item => item.title.toLocaleUpperCase('vi') === step.text);
    return { mode, ...(book && { articleId: book.id }) };
  }
  if (articleId === undefined && mode === 'name-copying') {
    const phrase = NAME_COPYING_PHRASES.find(item => item === step.text);
    return { mode, ...(phrase && { articleId: nameCopyingChoiceId(phrase) }) };
  }
  if (isRoutineReadingMode(mode as RoutineMode)) {
    if (articleId && !/^[\w-]+$/u.test(articleId)) return { mode: 'dedication' };
    return { mode: mode as RoutineReadingMode, articleId: articleId || undefined };
  }
  return articleId === undefined ? { mode: mode as ToolMode } : { mode: 'dedication' };
}

export function isRoutineReadingMode(mode: RoutineMode): mode is RoutineReadingMode {
  return Object.prototype.hasOwnProperty.call(ROUTINE_READING_CATEGORIES, mode);
}

export function isRoutineTextStep(mode: RoutineMode): boolean {
  return mode === 'repentance' || mode === 'dedication';
}

/** Giữ định dạng thực hành v1: máy chủ giữ sourceId, app cũ vẫn đọc được phần chữ. */
export function routineToolStep(id: string, mode: ToolMode, text: string, articleId?: string): TextStep {
  return { id, kind: 'dedication', sourceId: prefix + mode + (articleId ? ':' + articleId : ''), text };
}

export type RoutineLineKind = 'empty' | 'heading' | 'verse' | 'prose';

/** Phân loại từng dòng trong văn bản thời khóa để căn giữa khổ kệ/tiêu đề và căn đều văn xuôi. */
export function classifyRoutineLine(line: string): RoutineLineKind {
  const trimmed = line.trim();
  if (!trimmed) return 'empty';
  if (trimmed === trimmed.toLocaleUpperCase('vi') && /[\p{L}]/u.test(trimmed)) {
    return 'heading';
  }
  const withoutParens = trimmed.replace(/\([^)]*\)/gu, '').trim();
  const hasMultipleSentences = /[.!?]\s+[\p{L}]/u.test(withoutParens);
  const looksLikeInstruction = /^(hướng dẫn|lưu ý|ghi chú|note|guide)\s*:/iu.test(trimmed);
  if (withoutParens.length <= 68 && !hasMultipleSentences && !looksLikeInstruction) {
    return 'verse';
  }
  return 'prose';
}
