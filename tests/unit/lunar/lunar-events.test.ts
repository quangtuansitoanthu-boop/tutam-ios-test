import { describe, expect, it } from 'vitest';

import { ABSTINENCE_DAYS_EN, getLunarEvent, getLunarEventForLunarDay, localizeLunarEvent } from '../../../src/lib/components/lunar/lunar-events';

describe('lunar events', () => {
  it('combines Thập Trai, vía and Thọ Khang data without a browser global', () => {
    const event = getLunarEvent(new Date(2026, 1, 17));

    expect(event).toMatchObject({
      isEvent: true,
      isThapTrai: true,
      lunarDay: 1,
      lunarMonth: 1,
      viaName: 'Vía đức Phật Di Lặc',
    });
    expect(event.kiengDam?.reason).toContain('Tết Nguyên Đán');
  });

  it('returns no event for an ordinary lunar day', () => {
    const event = getLunarEvent(new Date(2026, 1, 18));

    expect(event).toMatchObject({
      isEvent: false,
      isThapTrai: false,
      lunarDay: 2,
      lunarMonth: 1,
      viaName: null,
      kiengDam: null,
    });
  });

  it('does not borrow day 29 or 30 abstinence copy for ordinary English days', () => {
    for (const month of [1, 3, 8, 12]) for (const day of [2, 4, 10]) {
      const vi = getLunarEventForLunarDay({ year: 2026, month, day, leap: false }, 30, 'vi');
      const en = getLunarEventForLunarDay({ year: 2026, month, day, leap: false }, 30, 'en');
      expect(Boolean(en.kiengDam), `${month}/${day}`).toBe(Boolean(vi.kiengDam));
      expect(en.isEvent).toBe(vi.isEvent);
    }
  });

  it('uses day 30 copy only on the last day of a short month in both English paths', () => {
    const lunar = { year: 2026, month: 3, day: 29, leap: false };
    const longVi = getLunarEventForLunarDay(lunar, 30, 'vi');
    expect(localizeLunarEvent(longVi, 'en')?.kiengDam).toEqual(ABSTINENCE_DAYS_EN['3-29']);
    const shortVi = getLunarEventForLunarDay(lunar, 29, 'vi');
    const shortEn = getLunarEventForLunarDay(lunar, 29, 'en');
    expect(shortEn.kiengDam).toEqual(ABSTINENCE_DAYS_EN['3-30']);
    expect(localizeLunarEvent(shortVi, 'en')?.kiengDam).toEqual(shortEn.kiengDam);
  });

  it('keeps English and Vietnamese event flags identical across all lunar dates', () => {
    for (const monthLength of [29, 30]) for (let month = 1; month <= 12; month++) for (let day = 1; day <= monthLength; day++) {
      const lunar = { year: 2026, month, day, leap: false };
      const vi = getLunarEventForLunarDay(lunar, monthLength, 'vi');
      const en = getLunarEventForLunarDay(lunar, monthLength, 'en');
      expect(en.isEvent, `${month}/${day}/${monthLength}`).toBe(vi.isEvent);
      expect(Boolean(en.kiengDam)).toBe(Boolean(vi.kiengDam));
    }
  });
});
