import { expect, it } from 'vitest';
import { getPersonalEventsForDate, findNextPersonalEvent, formatPersonalEventDateText, type PersonalLunarEvent } from '../../src/lib/browser/personal-lunar-events';
import { solarToLunar } from '../../src/lib/components/lunar/lunar-calendar';
const event: PersonalLunarEvent = { id: 'solar', title: 'Anniversary', lunarDay: 11, lunarMonth: 9, calendarMode: 'solar', solarDay: 20, solarMonth: 10, frequency: 'yearly', type: 'gia-dinh', createdAt: '2026-10-22' };
it('matches solar anniversaries by their original day across years, not the old converted lunar date', () => {
  for (const year of [2026, 2027, 2028]) {
    expect(getPersonalEventsForDate(new Date(year, 9, 20), [event])).toEqual([event]);
    expect(getPersonalEventsForDate(new Date(year, 9, 21), [event])).toEqual([]);
  }
  expect(formatPersonalEventDateText(event)).toContain('20/10 Dương lịch');
});
it('does not move February 29 to another date in non-leap years', () => {
  const leap = { ...event, solarDay: 29, solarMonth: 2 };
  expect(getPersonalEventsForDate(new Date(2027, 1, 28), [leap])).toEqual([]);
  expect(getPersonalEventsForDate(new Date(2028, 1, 29), [leap])).toEqual([leap]);
});
it('calculates the next anniversary using actual calendar days', () => {
  expect(findNextPersonalEvent(new Date(2027, 9, 18), [event])).toMatchObject({ event, daysLeft: 2 });
});

it('keeps yearly lunar anniversaries in the ordinary month while monthly rules include the leap month', () => {
  const yearly = { ...event, id: 'lunar-year', calendarMode: 'lunar' as const, lunarDay: 1, lunarMonth: 2 };
  const monthly = { ...yearly, id: 'lunar-month', frequency: 'monthly' as const, lunarMonth: 0 };
  const ordinary = new Date(2023, 1, 20), leap = new Date(2023, 2, 22);
  expect(solarToLunar(ordinary.getDate(), ordinary.getMonth() + 1, ordinary.getFullYear())).toMatchObject({ day: 1, month: 2, leap: false });
  expect(solarToLunar(leap.getDate(), leap.getMonth() + 1, leap.getFullYear())).toMatchObject({ day: 1, month: 2, leap: true });
  expect(getPersonalEventsForDate(ordinary, [yearly, monthly])).toEqual([yearly, monthly]);
  expect(getPersonalEventsForDate(leap, [yearly, monthly])).toEqual([monthly]);
});

it('observes lunar day 30 on the last day of a short month, retaining the stored day', () => {
  const yearly = { ...event, id: 'day30', calendarMode: 'lunar' as const, lunarDay: 30, lunarMonth: 12 };
  const beforeTet = new Date(2026, 1, 16);
  expect(solarToLunar(16, 2, 2026)).toMatchObject({ day: 29, month: 12 });
  expect(getPersonalEventsForDate(beforeTet, [yearly])).toEqual([yearly]);
  expect(getPersonalEventsForDate(new Date(2026, 1, 15), [yearly])).toEqual([]);
  expect(yearly.lunarDay).toBe(30);
});
