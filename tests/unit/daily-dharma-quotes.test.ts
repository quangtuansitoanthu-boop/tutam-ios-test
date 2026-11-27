import { afterEach, expect, it, vi } from 'vitest';
import { DAILY_DHARMA_QUOTES, getTodayDharmaQuote } from '$lib/data/daily-dharma-quotes';

afterEach(() => vi.useRealTimers());
it('uses the Vietnam civil date at midnight regardless of the device timezone', () => {
  vi.useFakeTimers();
  const index = (day: number) => Math.floor((Date.UTC(2026, 10, day) - Date.UTC(2026, 0, 1)) / 86400000) % DAILY_DHARMA_QUOTES.length;
  vi.setSystemTime(new Date('2026-11-27T16:59:59Z'));
  expect(getTodayDharmaQuote()).toEqual(DAILY_DHARMA_QUOTES[index(27)]);
  vi.setSystemTime(new Date('2026-11-27T17:00:00Z'));
  expect(getTodayDharmaQuote()).toEqual(DAILY_DHARMA_QUOTES[index(28)]);
});

it('keeps explicit civil-date selection stable across daylight-saving transitions', () => {
  const civil = new Date(2026, 10, 27, 23, 59);
  const index = Math.floor((Date.UTC(2026, 10, 27) - Date.UTC(2026, 0, 1)) / 86400000) % DAILY_DHARMA_QUOTES.length;
  expect(getTodayDharmaQuote(civil)).toEqual(DAILY_DHARMA_QUOTES[index]);
});
