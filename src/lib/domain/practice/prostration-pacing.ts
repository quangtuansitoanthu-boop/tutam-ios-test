export const PROSTRATION_PACE_SECONDS = [0, 6, 8, 10, 12] as const;
export type ProstrationPaceSeconds = (typeof PROSTRATION_PACE_SECONDS)[number];

export function shouldStopAutoProstration(count: number, goal: number): boolean {
  return goal > 0 && count >= goal;
}

export function nextAutoProstrationTick(
  remainingSeconds: number,
  intervalSeconds: number
): { remaining: number; fire: boolean } {
  const safeInterval = Math.max(1, Math.floor(intervalSeconds));
  if (remainingSeconds <= 1) {
    return { remaining: safeInterval, fire: true };
  }
  return { remaining: remainingSeconds - 1, fire: false };
}
