import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { prepareVeganWeek, publishVeganWeek } from '../../src/jobs/vegan-week';
import { isVeganWeek, matchesVeganRegion, veganMealPlan, VEGAN_GROUPS, VEGAN_MEAL_REGIONS, VEGAN_PACKAGE_MAX_BYTES, VEGAN_REGIONS } from '../../src/lib/contracts/vegan-week';

describe('automatic vegan week publisher', () => {
  it('ships the current cooking instructions and schedules in every bundled week', () => {
    for (const date of ['2026-11-09', '2026-11-16', '2026-11-23']) {
      const file = new URL('../../static/vegan/weeks/v5/' + date + '.json', import.meta.url);
      const week = prepareVeganWeek(date, 5);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(week);
      // Previously installed v5 clients interpret these tokens as a stale download.
      expect(week.recipes.flatMap(recipe => recipe.steps).some(step => /\{\d+\}/u.test(step))).toBe(false);
    }
  });

  it('explains how to make the chả before braising and the dough before steaming bánh bao', () => {
    for (const version of [1, 2, 4, 5] as const) {
      const { recipes } = prepareVeganWeek('2026-11-23', version);
      const cha = recipes.find(recipe => recipe.id === 'dish_234')!;
      expect(cha.ingredients.some(item => /^chả lụa chay/iu.test(item.name))).toBe(false);
      expect(cha.steps.join(' ')).toMatch(/tàu hũ ky.*lá chuối.*hấp.*nguội.*kho/iu);
      const bao = recipes.find(recipe => recipe.id === 'dish_210')!;
      expect(bao.steps.join(' ')).toMatch(/men.*ủ.*hấp/iu);
    }
  });

  it('serves three dishes per meal with no repeats in any rolling 21 days', () => {
    const weeks = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'];
    const packages = weeks.map(date => prepareVeganWeek(date, 5));
    const signatures = Array.from({ length: weeks.length * 7 }, () => new Set<string>());
    for (const region of VEGAN_MEAL_REGIONS) {
      const days = packages.flatMap(week => {
        expect(week.recipes).toHaveLength(250);
        expect(Buffer.byteLength(JSON.stringify(week))).toBeLessThanOrEqual(VEGAN_PACKAGE_MAX_BYTES);
        return veganMealPlan(week, region).map(day => {
          expect(day.map(meal => meal.length)).toEqual([3, 3, 3]);
          return day.flat();
        });
      });
      days.forEach((day, index) => signatures[index].add(day.map(item => item.id).sort().join(',')));
      for (let start = 0; start <= days.length - 21; start++) {
        const rotation = days.slice(start, start + 21).flat();
        expect(new Set(rotation.map(item => item.id)).size).toBe(189);
        expect(new Set(rotation.map(item => item.name)).size).toBe(189);
      }
    }
    expect(signatures.every(day => day.size === VEGAN_MEAL_REGIONS.length)).toBe(true);
  });
  it('offers shared dishes in every region and every group of the offline menu', () => {
    for (const version of [2, 4] as const) {
      const { recipes } = prepareVeganWeek('2026-11-23', version);
      expect(recipes.filter(item => matchesVeganRegion(item.region, ''))).toHaveLength(150);
      for (const group of VEGAN_GROUPS) {
        for (const region of VEGAN_REGIONS) {
          expect(recipes.some(item => item.group === group && matchesVeganRegion(item.region, region))).toBe(true);
        }
      }
    }
    expect(matchesVeganRegion('south', 'central')).toBe(false);
    expect(matchesVeganRegion('central', 'multiple')).toBe(false);
  });
  it('rotates 63 distinct dishes across seven days using the offline catalog', () => {
    for (const version of [1, 2, 4] as const) {
      const week = prepareVeganWeek('2026-11-23', version);
      const meals = veganMealPlan(week);
      expect(meals).toHaveLength(7);
      for (const day of meals) expect(day.map(meal => meal.length)).toEqual([3, 3, 3]);
      const ids = meals.flat(2).map(item => item.id);
      expect(new Set(ids).size).toBe(63);
      expect(ids).not.toContain('dish_201');
      expect(veganMealPlan(week)).toEqual(meals);
    }
  });

  it('keeps quick weekday options and desserts with each regional preference', () => {
    for (const date of ['2026-11-09', '2026-11-16', '2026-11-23']) {
      const week = prepareVeganWeek(date, 5);
      for (const region of ['', 'north', 'central', 'south'] as const) {
        const meals = veganMealPlan(week, region);
        expect(new Set(meals.flat(2).map(item => item.id)).size).toBe(63);
        for (const [breakfast] of meals.slice(0, 5)) {
          expect(breakfast.slice(0, 2).filter(item => item.minutes <= 20).length).toBeGreaterThanOrEqual(2);
          expect(breakfast.every(item => item.minutes <= 45)).toBe(true);
        }
        for (const [breakfast, lunch, dinner] of meals) {
          for (const side of [breakfast[2], lunch[2], dinner[2]]) {
            expect(side.group).toBe('sides');
            expect(['dish_103', 'dish_265', 'dish_266', 'dish_379', 'dish_381', 'dish_402']).not.toContain(side.id);
          }
        }
      }
      expect(week.recipes.find(recipe => recipe.id === 'dish_313')?.ingredients.map(item => item.name)).toContain('Mật mía');
    }
  });

  it('publishes a separate regional package with 150 distinct recipes and all four regions', async () => {
    const put = vi.fn().mockResolvedValue({});
    const week = '2026-11-23';
    await publishVeganWeek({ head: vi.fn().mockResolvedValue(null), put }, new Date('2026-11-16T08:00:00Z'), 2);
    const [key, payload] = put.mock.calls[0];
    expect(key).toBe('vegan/weeks/v2/' + week + '.json');
    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(VEGAN_PACKAGE_MAX_BYTES);
    const data = JSON.parse(payload);
    expect(isVeganWeek(data, week)).toBe(true);
    expect(data.recipes).toHaveLength(150);
    expect(new Set(data.recipes.map(recipe => recipe.region))).toEqual(new Set(VEGAN_REGIONS));
    expect(isVeganWeek({ ...data, version: 1 }, week)).toBe(false);
    delete data.recipes[0].region;
    expect(isVeganWeek(data, week)).toBe(false);
  });
  it('selects 21 distinct meals from the approved catalog and rotates them by week', () => {
    const first = prepareVeganWeek('2026-11-23');
    expect(first.recipes).toHaveLength(100);
    expect(new Set(first.days.flat()).size).toBe(21);
    expect(first.days).toEqual(prepareVeganWeek('2026-11-23').days);
    expect(first.days).not.toEqual(prepareVeganWeek('2026-11-30').days);
    expect(first.recipes.every(recipe => !('source' in recipe) && !('adaptation' in recipe))).toBe(true);
    expect(() => prepareVeganWeek('2026-11-24')).toThrow();
  });

  it('creates the upcoming package before Sunday and never overwrites an existing package', async () => {
    const head = vi.fn<() => Promise<object | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce({});
    const put = vi.fn().mockResolvedValue({});
    const bucket = { head, put };
    const monday = new Date('2026-11-16T08:00:00Z');
    const sunday = new Date('2026-11-22T08:00:00Z');
    expect(await publishVeganWeek(bucket, monday)).toEqual({ week: '2026-11-23', outcome: 'published' });
    expect(await publishVeganWeek(bucket, sunday)).toEqual({ week: '2026-11-23', outcome: 'exists' });
    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith('vegan/weeks/v1/2026-11-23.json', expect.any(String), expect.objectContaining({
      onlyIf: { etagDoesNotMatch: '*' },
    }));
  });
});
