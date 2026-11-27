import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadVeganWeek, latestVeganWeek, needsVeganWeekUpdate, readVeganWeek, watchVeganWeekPreload } from '../../src/lib/browser/vegan-week';
import { isVeganWeek, REGIONAL_VEGAN_FIRST_WEEK, VEGAN_RECIPE_REVISION, veganMealPlan, type VeganWeek } from '../../src/lib/contracts/vegan-week';
import { prepareVeganWeek } from '../../src/jobs/vegan-week';

afterEach(() => vi.unstubAllGlobals());

function cache(pack?: VeganWeek) {
  const entries: Record<string, string> = pack ? { ['tutam:vegan-week:v1:' + pack.week]: JSON.stringify(pack) } : {};
  const setItem = vi.fn((key: string, value: string) => { entries[key] = value; });
  Object.defineProperties(entries, {
    getItem: { value: (key: string) => entries[key] ?? null },
    setItem: { value: setItem },
    removeItem: { value: (key: string) => { delete entries[key]; } },
  });
  vi.stubGlobal('localStorage', entries);
  return setItem;
}

describe('vegan week cache cleanup', () => {
  it('retains the published 190-dish v5 menu offline and expands it with the packaged catalog', async () => {
    const week = '2026-11-30';
    const current = prepareVeganWeek(week, 5);
    const recipes = current.recipes.slice(0, 190);
    const days = Array.from({ length: 7 }, (_, day) => recipes.slice(day * 9, day * 9 + 9).map(item => item.id));
    const legacy = { ...current, recipes, days, rotationRevision: 1, recipeRevision: 1 };
    cache(legacy);
    vi.stubGlobal('location', {});
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json(prepareVeganWeek(REGIONAL_VEGAN_FIRST_WEEK, 5)));
    vi.stubGlobal('fetch', fetch);
    expect(readVeganWeek(week)).toEqual(legacy);
    expect(veganMealPlan(legacy, 'south').map(day => day.flat().map(item => item.id))).toEqual(days);
    await expect(downloadVeganWeek(week)).resolves.toEqual(legacy);
    const upgraded = await downloadVeganWeek(week);
    expect(upgraded.recipes).toHaveLength(250);
    expect(veganMealPlan(upgraded, 'south')).toEqual(veganMealPlan(current, 'south'));
    expect(readVeganWeek(week)).toEqual(upgraded);
    expect(fetch.mock.calls.every(([url]) => String(url).startsWith('/vegan/weeks/'))).toBe(true);
  });
  it('accepts legacy menus and validates an optional recipe revision only on v5', () => {
    const week = '2026-11-23';
    const current = prepareVeganWeek(week, 5);
    expect(isVeganWeek({ ...current, recipeRevision: undefined }, week)).toBe(true);
    expect(isVeganWeek({ ...current, recipeRevision: VEGAN_RECIPE_REVISION + 1 }, week)).toBe(true);
    for (const recipeRevision of [0, -1, 1.5, '1', null]) {
      expect(isVeganWeek({ ...current, recipeRevision }, week)).toBe(false);
    }
    expect(isVeganWeek({ ...prepareVeganWeek(week, 2), recipeRevision: 1 }, week)).toBe(false);
  });

  it('upgrades a saved v5 rotation from the packaged file without contacting the media host', async () => {
    const week = '2026-11-16';
    const fresh = prepareVeganWeek(week, 5);
    const { rotationRevision, ...legacy } = fresh;
    const storage = new Map([['tutam:vegan-week:v1:' + week, JSON.stringify(legacy)]]);
    const fetch = vi.fn(async () => Response.json(fresh));
    vi.stubGlobal('location', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('fetch', fetch);

    expect(needsVeganWeekUpdate(week)).toBe(true);
    await expect(downloadVeganWeek(week)).resolves.toMatchObject({ rotationRevision });
    expect(needsVeganWeekUpdate(week)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/vegan/weeks/v5/' + week + '.json?recipes=' + VEGAN_RECIPE_REVISION, expect.anything());
  });

  it.each(['cache', 'remote'])('updates matching dishes in an older %s pack beyond the bundled dates', async (source) => {
    const week = '2026-12-14';
    const catalog = prepareVeganWeek(REGIONAL_VEGAN_FIRST_WEEK, 5);
    const current = prepareVeganWeek(week, 5);
    const recipes = current.recipes.map(recipe => ({ ...recipe, steps: ['Hướng dẫn cũ.'] }));
    recipes[1].name += ' (món khác)';
    recipes[2].group = recipes[2].group === 'rice' ? 'steamed' : 'rice';
    recipes[3].servings++;
    const unknown = recipes.slice(5).find(recipe => !current.days.flat().includes(recipe.id))!;
    unknown.id = 'future-dish';
    const old = { ...current, recipeRevision: undefined, recipes, days: [...current.days].reverse() };
    cache(source === 'cache' ? old : undefined);
    const fetch = vi.fn(async (url: string) => Response.json(url.startsWith('/') ? catalog : old));
    vi.stubGlobal('location', {});
    vi.stubGlobal('fetch', fetch);

    const [revised, same] = await Promise.all([downloadVeganWeek(week), downloadVeganWeek(week)]);
    expect(same).toBe(revised);
    expect(revised.recipeRevision).toBe(VEGAN_RECIPE_REVISION);
    expect(revised.days).toEqual(old.days);
    expect(revised.recipes[4]).toEqual(current.recipes[4]);
    expect(revised.recipes.slice(1, 4)).toEqual(old.recipes.slice(1, 4));
    expect(revised.recipes.find(recipe => recipe.id === 'future-dish')).toEqual(unknown);
    expect(needsVeganWeekUpdate(week)).toBe(false);
    expect(latestVeganWeek('2026-12-21')).toEqual(revised);
    await downloadVeganWeek(week);
    expect(fetch).toHaveBeenCalledTimes(source === 'cache' ? 1 : 2);
    expect(fetch).toHaveBeenLastCalledWith('/vegan/weeks/v5/' + REGIONAL_VEGAN_FIRST_WEEK + '.json?recipes=' + VEGAN_RECIPE_REVISION, expect.anything());
  });

  it('retains a saved menu when offline or out of quota and retries its recipe update', async () => {
    const week = '2026-12-14';
    const old = { ...prepareVeganWeek(week, 5), recipeRevision: undefined };
    const setItem = cache(old);
    const catalog = prepareVeganWeek(REGIONAL_VEGAN_FIRST_WEEK, 5);
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementation(async () => Response.json(catalog));
    vi.stubGlobal('location', {});
    vi.stubGlobal('fetch', fetch);
    await expect(downloadVeganWeek(week)).resolves.toEqual(old);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(downloadVeganWeek(week)).resolves.toMatchObject({ recipeRevision: VEGAN_RECIPE_REVISION });
    expect(readVeganWeek(week)).toEqual(old);
    await downloadVeganWeek(week);
    expect(needsVeganWeekUpdate(week)).toBe(false);
  });

  it('preserves newer recipe content when updating an independent bundled rotation', async () => {
    const week = '2026-11-16';
    const catalog = prepareVeganWeek(week, 5);
    const current = { ...catalog, recipeRevision: VEGAN_RECIPE_REVISION + 1, rotationRevision: undefined,
      recipes: catalog.recipes.map(recipe => ({ ...recipe, steps: ['Thêm {0} vào tô.'] })) };
    cache(current);
    const fetch = vi.fn(async () => Response.json(catalog));
    vi.stubGlobal('location', {});
    vi.stubGlobal('fetch', fetch);
    const revised = await downloadVeganWeek(week);
    expect(revised.recipes).toEqual(current.recipes);
    expect(revised.recipeRevision).toBe(current.recipeRevision);
    expect(revised.rotationRevision).toBe(catalog.rotationRevision);
    expect(needsVeganWeekUpdate(week)).toBe(false);
    await downloadVeganWeek(week);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the old week offline and replaces it after a valid regional download', async () => {
    const week = '2026-11-30';
    const entries: Record<string, string> = {
      ['tutam:vegan-week:v1:' + week]: JSON.stringify(prepareVeganWeek(week)),
    };
    Object.defineProperties(entries, {
      getItem: { value: (key: string) => entries[key] ?? null },
      setItem: { value: (key: string, value: string) => { entries[key] = value; } },
    });
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify(prepareVeganWeek(week, 5))));
    vi.stubGlobal('localStorage', entries);
    vi.stubGlobal('fetch', fetch);
    expect(needsVeganWeekUpdate(week)).toBe(true);
    await expect(downloadVeganWeek(week)).rejects.toThrow('offline');
    expect(readVeganWeek(week)?.recipes).toHaveLength(100);
    await downloadVeganWeek(week);
    expect(readVeganWeek(week)?.recipes).toHaveLength(250);
    expect(needsVeganWeekUpdate(week)).toBe(false);
    await downloadVeganWeek(week);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/v5/' + week), expect.anything());
  });
  it('keeps three usable weeks even when newer entries are damaged', () => {
    const prefix = 'tutam:vegan-week:v1:';
    const good = ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'];
    const storage: Record<string, string> = Object.fromEntries(
      good.map(week => [prefix + week, JSON.stringify(prepareVeganWeek(week))]),
    );
    storage[prefix + '2026-12-21'] = '{broken';
    storage[prefix + '2026-12-28'] = '{}';
    storage['unrelated-setting'] = 'keep';
    Object.defineProperties(storage, {
      getItem: { value: (key: string) => storage[key] ?? null },
      removeItem: { value: (key: string) => { delete storage[key]; } },
    });
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('document', { hidden: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });

    const stop = watchVeganWeekPreload();
    stop();
    expect(Object.keys(storage).sort()).toEqual([...good.slice(1).map(week => prefix + week), 'unrelated-setting'].sort());
    expect(readVeganWeek('2026-11-30')?.recipes).toHaveLength(100);
  });
});
