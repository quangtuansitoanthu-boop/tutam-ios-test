import { describe, expect, it } from 'vitest';
import {
  addBiorhythmDays,
  biorhythmToday,
  biorhythmTransitions,
  biorhythmValue,
  calculateBiorhythm,
  calculateBiorhythmAge,
  formatBiorhythmDisplayDate,
  formatBiorhythmTypingText,
  parseBiorhythmDate,
  parseBiorhythmInputDate,
} from '$lib/domain/practice/biorhythm';

describe('biorhythm calendar arithmetic', () => {
  it('rejects nonexistent days and preserves calendar years before 100', () => {
    expect(parseBiorhythmDate('2025-02-31')).toBeNull();
    expect(parseBiorhythmDate('2025-02-29')).toBeNull();
    expect(parseBiorhythmDate('2024-02-29')).not.toBeNull();
    expect(parseBiorhythmDate('0000-01-01')).toBeNull();
    expect(addBiorhythmDays('0099-12-31', 1)).toBe('0100-01-01');
  });

  it('clamps month anniversaries and never produces negative age components', () => {
    expect(calculateBiorhythmAge('2025-01-31', '2025-03-01')).toEqual({ years: 0, months: 1, days: 1, totalDays: 29 });
    expect(calculateBiorhythmAge('2024-02-29', '2025-02-28')).toEqual({ years: 1, months: 0, days: 0, totalDays: 365 });
    expect(calculateBiorhythmAge('2024-02-29', '2025-03-29')).toMatchObject({ years: 1, months: 1, days: 0 });
    expect(calculateBiorhythmAge('2026-11-27', '2026-11-26')).toBeNull();
  });

  it('uses the Vietnamese day boundary without daylight-saving offsets', () => {
    expect(biorhythmToday(new Date('2026-11-26T17:00:00Z'))).toBe('2026-11-27');
    expect(calculateBiorhythmAge('2026-03-07', '2026-03-09')?.totalDays).toBe(2);
    expect(addBiorhythmDays('2024-02-28', 2)).toBe('2024-03-01');
  });
});

describe('biorhythm model', () => {
  it('keeps birth values at 50 and computes all six cycles and composites before rounding', () => {
    const birth = calculateBiorhythm('2000-01-01', '2000-01-01')!;
    expect(birth.cycles).toHaveLength(6);
    expect(birth.cycles.every(cycle => cycle.value === 50 && cycle.day === 1 && cycle.round === 1)).toBe(true);
    const later = calculateBiorhythm('2000-01-01', '2000-01-07')!;
    expect(later.cycles[0].value).toBeCloseTo(99.883438, 5);
    expect(later.action).toBeCloseTo((later.cycles[0].value + later.cycles[1].value) / 2);
    expect(later.harmony).toBeCloseTo(later.cycles.slice(0, 3).reduce((sum, cycle) => sum + cycle.value, 0) / 3);
    expect(later.cycles[0].daysToPeak).toBe(0);
    expect(calculateBiorhythm('2000-01-01', '2000-01-09')?.cycles[3].daysToPeak).toBe(1);
    expect(calculateBiorhythm('2000-01-01', '2000-01-10')?.cycles[3].daysToPeak).toBe(0);
    expect(calculateBiorhythm('2000-01-01', '2000-01-11')?.cycles[3].daysToPeak).toBe(0);
    expect(biorhythmValue(23, 23)).toBeCloseTo(50);
  });

  it('reports actual 50 crossings on their containing calendar day within the next fourteen days', () => {
    const transitions = biorhythmTransitions('2000-01-01', '2000-01-01');
    expect(transitions.find(event => event.date === '2000-01-12')?.cycles).toContain('physical');
    expect(transitions.find(event => event.date === '2000-01-15')?.cycles).toContain('emotional');
    expect(transitions.every(event => event.date > '2000-01-01' && event.date <= '2000-01-15')).toBe(true);
    expect(biorhythmTransitions('invalid', '2000-01-01')).toEqual([]);
  });
});

describe('Vietnamese birth date formatting and parsing', () => {
  it('formats canonical ISO dates in DD/MM/YYYY Vietnamese order', () => {
    expect(formatBiorhythmDisplayDate('1992-08-15')).toBe('15/08/1992');
    expect(formatBiorhythmDisplayDate('2000-01-05')).toBe('05/01/2000');
    expect(formatBiorhythmDisplayDate('')).toBe('');
    expect(formatBiorhythmDisplayDate('invalid')).toBe('');
  });

  it('parses manual Vietnamese dates, compact 8-digit dates, and ISO dates', () => {
    expect(parseBiorhythmInputDate('')).toEqual({ status: 'empty' });
    expect(parseBiorhythmInputDate('15/08/1992')).toEqual({ status: 'valid', iso: '1992-08-15' });
    expect(parseBiorhythmInputDate('5/8/1992')).toEqual({ status: 'valid', iso: '1992-08-05' });
    expect(parseBiorhythmInputDate('15-08-1992')).toEqual({ status: 'valid', iso: '1992-08-15' });
    expect(parseBiorhythmInputDate('15081992')).toEqual({ status: 'valid', iso: '1992-08-15' });
    expect(parseBiorhythmInputDate('1992-08-15')).toEqual({ status: 'valid', iso: '1992-08-15' });
    expect(parseBiorhythmInputDate('15/08/19')).toEqual({ status: 'incomplete' });
    expect(parseBiorhythmInputDate('1508')).toEqual({ status: 'incomplete' });
    expect(parseBiorhythmInputDate('31/02/2000')).toEqual({ status: 'invalid' });
    expect(parseBiorhythmInputDate('15/13/2000')).toEqual({ status: 'invalid' });
    expect(parseBiorhythmInputDate('abc')).toEqual({ status: 'invalid' });
  });

  it('auto-inserts Vietnamese slashes only when typing forward', () => {
    expect(formatBiorhythmTypingText('15', false)).toBe('15/');
    expect(formatBiorhythmTypingText('15/08', false)).toBe('15/08/');
    expect(formatBiorhythmTypingText('15', true)).toBe('15');
    expect(formatBiorhythmTypingText('5/', false)).toBe('5/');
  });
});
