import { formatVietnamDateKey } from './divination';

const DAY_MS = 86_400_000;

export const BIORHYTHM_CYCLES = [
  { id: 'physical', period: 23, dash: '' },
  { id: 'emotional', period: 28, dash: '6 4' },
  { id: 'intellectual', period: 33, dash: '2 4' },
  { id: 'intuitive', period: 38, dash: '9 3 2 3' },
  { id: 'aesthetic', period: 43, dash: '4 3' },
  { id: 'spiritual', period: 53, dash: '8 3' },
] as const;

export type BiorhythmCycleId = (typeof BIORHYTHM_CYCLES)[number]['id'];
export interface BiorhythmAge { years: number; months: number; days: number; totalDays: number }
export interface BiorhythmCycle {
  id: BiorhythmCycleId;
  period: number;
  dash: string;
  value: number;
  rising: boolean;
  day: number;
  round: number;
  daysToPeak: number;
  daysToTransition: number;
}
export interface BiorhythmSnapshot {
  date: string;
  daysAlive: number;
  age: BiorhythmAge;
  cycles: BiorhythmCycle[];
  harmony: number;
  action: number;
  study: number;
  wisdom: number;
}
export interface BiorhythmTransition { date: string; cycles: BiorhythmCycleId[] }

export const biorhythmToday = formatVietnamDateKey;

export function parseBiorhythmDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

export function addBiorhythmDays(iso: string, days: number): string {
  const timestamp = parseBiorhythmDate(iso);
  if (timestamp === null || !Number.isInteger(days)) return '';
  const next = new Date(timestamp + days * DAY_MS);
  if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return '';
  return next.toISOString().slice(0, 10);
}

function anniversary(birth: string, months: number): number {
  const [year, month, day] = birth.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1 + months, 1);
  const targetMonth = date.getUTCMonth();
  date.setUTCMonth(targetMonth + 1, 0);
  date.setUTCDate(Math.min(day, date.getUTCDate()));
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export function calculateBiorhythmAge(birth: string, target: string): BiorhythmAge | null {
  const from = parseBiorhythmDate(birth);
  const until = parseBiorhythmDate(target);
  if (from === null || until === null || until < from) return null;
  const [by, bm] = birth.split('-').map(Number);
  const [ty, tm] = target.split('-').map(Number);
  let months = (ty - by) * 12 + tm - bm;
  if (anniversary(birth, months) > until) months -= 1;
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: Math.floor((until - anniversary(birth, months)) / DAY_MS),
    totalDays: Math.floor((until - from) / DAY_MS),
  };
}

export function biorhythmValue(daysAlive: number, period: number): number {
  return 50 * (1 + Math.sin(2 * Math.PI * daysAlive / period));
}

function cycleSnapshot(days: number, cycle: (typeof BIORHYTHM_CYCLES)[number]): BiorhythmCycle {
  const position = days % cycle.period;
  const peak = Math.round(cycle.period / 4 - 1e-10);
  const value = biorhythmValue(days, cycle.period);
  const next = biorhythmValue(days + 1, cycle.period);
  // Chu kỳ có đỉnh giữa hai ngày ghi nhận cả hai mẫu ngày cao nhất.
  const atPeak = value >= biorhythmValue(days - 1, cycle.period) - 1e-10 && value >= next - 1e-10;
  const halfPeriod = cycle.period / 2;
  const nextTransition = Math.ceil(days / halfPeriod) * halfPeriod;
  return {
    ...cycle,
    value,
    rising: next >= value,
    day: position + 1,
    round: Math.floor(days / cycle.period) + 1,
    daysToPeak: atPeak ? 0 : (peak - position + cycle.period) % cycle.period,
    daysToTransition: Math.floor(nextTransition - days),
  };
}

export function calculateBiorhythm(birth: string, target: string): BiorhythmSnapshot | null {
  const age = calculateBiorhythmAge(birth, target);
  if (!age) return null;
  const cycles = BIORHYTHM_CYCLES.map(cycle => cycleSnapshot(age.totalDays, cycle));
  const [physical, emotional, intellectual] = cycles.map(cycle => cycle.value);
  return {
    date: target,
    daysAlive: age.totalDays,
    age,
    cycles,
    harmony: (physical + emotional + intellectual) / 3,
    action: (physical + emotional) / 2,
    study: (physical + intellectual) / 2,
    wisdom: (emotional + intellectual) / 2,
  };
}

export function biorhythmTransitions(birth: string, from: string, length = 14): BiorhythmTransition[] {
  const start = calculateBiorhythmAge(birth, from);
  if (!start || !Number.isInteger(length) || length < 1) return [];
  const transitions = new Map<string, BiorhythmCycleId[]>();
  for (const cycle of BIORHYTHM_CYCLES.slice(0, 3)) {
    const halfPeriod = cycle.period / 2;
    const first = Math.ceil((start.totalDays + 1) / halfPeriod);
    const last = Math.ceil((start.totalDays + length + 1) / halfPeriod);
    for (let step = first; step <= last; step += 1) {
      const offset = Math.floor(step * halfPeriod) - start.totalDays;
      if (offset < 1 || offset > length) continue;
      const date = addBiorhythmDays(from, offset);
      if (!date) continue;
      const ids = transitions.get(date) ?? [];
      ids.push(cycle.id);
      transitions.set(date, ids);
    }
  }
  return [...transitions].sort(([a], [b]) => a.localeCompare(b)).map(([date, cycles]) => ({ date, cycles }));
}

export type BiorhythmInputParseResult =
  | { status: 'empty' }
  | { status: 'incomplete' }
  | { status: 'invalid' }
  | { status: 'valid'; iso: string };

/** Formats a canonical YYYY-MM-DD date into Vietnamese DD/MM/YYYY display text. */
export function formatBiorhythmDisplayDate(iso: string): string {
  if (parseBiorhythmDate(iso) === null) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Parses manual Vietnamese (DD/MM/YYYY, DDMMYYYY) or ISO (YYYY-MM-DD) birth date input. */
export function parseBiorhythmInputDate(raw: string): BiorhythmInputParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { status: 'empty' };

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
  if (isoMatch) {
    const iso = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    return parseBiorhythmDate(iso) !== null ? { status: 'valid', iso } : { status: 'invalid' };
  }

  const vnMatch = trimmed.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/u);
  if (vnMatch) {
    const iso = `${vnMatch[3]}-${vnMatch[2].padStart(2, '0')}-${vnMatch[1].padStart(2, '0')}`;
    return parseBiorhythmDate(iso) !== null ? { status: 'valid', iso } : { status: 'invalid' };
  }

  const compactMatch = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/u);
  if (compactMatch) {
    const iso = `${compactMatch[3]}-${compactMatch[2]}-${compactMatch[1]}`;
    return parseBiorhythmDate(iso) !== null ? { status: 'valid', iso } : { status: 'invalid' };
  }

  if (
    /^\d{1,2}(?:[\/\-.]\d{0,2}(?:[\/\-.]\d{0,4})?)?$/u.test(trimmed) ||
    /^\d{1,7}$/u.test(trimmed) ||
    /^\d{4}-\d{0,2}(?:-\d{0,2})?$/u.test(trimmed)
  ) {
    return { status: 'incomplete' };
  }

  return { status: 'invalid' };
}

/** Auto-inserts Vietnamese date slashes when typing forward from day/month pairs. */
export function formatBiorhythmTypingText(nextValue: string, isDelete: boolean): string {
  if (isDelete) return nextValue;
  if (/^\d{2}$/u.test(nextValue) || /^\d{2}\/\d{2}$/u.test(nextValue)) return `${nextValue}/`;
  return nextValue;
}
