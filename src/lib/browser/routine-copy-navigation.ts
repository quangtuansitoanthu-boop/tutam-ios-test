import { cloneDailyRoutine, type DailyRoutine } from '$lib/domain/practice/personal-practice';
import { ROUTINE_COPY_ROUTES, routineStepActivity } from '$lib/domain/practice/routine-activities';
import { createBrowserId } from './random-id';

interface Checkpoint {
  routine: DailyRoutine;
  index: number;
  startedAt: number;
  incomplete: boolean;
  principal: string | null;
}

let pending: { checkpoint: Checkpoint; path: string; token: string } | undefined;

/** Chỉ giữ bước đang thực hành khi sang trang chép. Dữ liệu bản chép thuộc trang đó. */
export function prepareRoutineCopy(mode: keyof typeof ROUTINE_COPY_ROUTES, checkpoint: Checkpoint): string {
  const path = ROUTINE_COPY_ROUTES[mode];
  const token = createBrowserId();
  pending = { checkpoint: { ...checkpoint, routine: cloneDailyRoutine(checkpoint.routine) }, path, token };
  return `${path}?routineStep=${encodeURIComponent(token)}`;
}

export function routineCopyChoice(url: URL, principal: string | null): string | undefined {
  if (!pending || url.pathname !== pending.path || url.searchParams.get('routineStep') !== pending.token
    || pending.checkpoint.principal !== principal) return;
  const { routine, index } = pending.checkpoint;
  return routineStepActivity(routine.steps[index]).articleId;
}

export function takeRoutineCopyReturn(from: URL, principal: string | null): Checkpoint | undefined {
  if (!pending || from.pathname !== pending.path || from.searchParams.get('routineStep') !== pending.token) return;
  const { checkpoint } = pending;
  pending = undefined;
  if (checkpoint.principal === principal) return checkpoint;
}
