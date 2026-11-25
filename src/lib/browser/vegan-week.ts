import { fetchPublicMedia } from './public-media-fallback';
import { isVeganWeek, sameVeganDish, LEGACY_ROTATING_RECIPE_COUNT, REGIONAL_VEGAN_FIRST_WEEK, ROTATING_VEGAN_VERSION, VEGAN_RECIPE_REVISION, VEGAN_ROTATION_REVISION, VEGAN_PACKAGE_MAX_BYTES, vietnamWeek, type VeganWeek } from '$lib/contracts/vegan-week';

const prefix = 'tutam:vegan-week:v1:';
const bundledRotationWeeks = new Set(['2026-11-09', '2026-11-16', '2026-11-23']);

function needsBundledRotation(week: string, saved: VeganWeek): boolean {
  return bundledRotationWeeks.has(week) && saved.version === ROTATING_VEGAN_VERSION
    && (saved.rotationRevision ?? 0) < VEGAN_ROTATION_REVISION;
}

function needsRecipeRevision(pack: VeganWeek): boolean {
  return pack.version === ROTATING_VEGAN_VERSION && (pack.recipeRevision ?? 0) < VEGAN_RECIPE_REVISION;
}

export function needsVeganWeekUpdate(week: string, saved = readVeganWeek(week)): boolean {
  if (!saved) return true;
  if (week >= REGIONAL_VEGAN_FIRST_WEEK && saved.version !== ROTATING_VEGAN_VERSION) return true;
  if (saved.version === ROTATING_VEGAN_VERSION) return needsRecipeRevision(saved) || needsBundledRotation(week, saved);
  if (saved.recipes?.some(r => r.steps?.some(s => /\{\d+\}/u.test(s)))) {
    return true;
  }
  return false;
}

const pending = new Map<string, Promise<VeganWeek>>();

function pruneVeganWeeks(incoming?: string): void {
  const weeks = Object.keys(localStorage)
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .sort()
    .reverse();
  // Reserve a slot for the validated download without counting a stale copy twice.
  let slots = incoming ? 2 : 3;
  for (const week of weeks) {
    if (week === incoming) continue;
    if (slots > 0 && readVeganWeek(week)) {
      slots--;
    } else {
      localStorage.removeItem(prefix + week);
    }
  }
}

export function readVeganWeek(week: string): VeganWeek | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(prefix + week) ?? 'null');
    return isVeganWeek(value, week) ? value : null;
  } catch {
    return null;
  }
}

async function readPack(response: Response, week: string, version: VeganWeek['version']): Promise<VeganWeek> {
  if (!response.ok) throw new Error('vegan-week-unavailable');
  const body = await response.text();
  if (new TextEncoder().encode(body).length > VEGAN_PACKAGE_MAX_BYTES) throw new Error('vegan-week-too-large');
  const pack: unknown = JSON.parse(body);
  if (!isVeganWeek(pack, week) || pack.version !== version) throw new Error('vegan-week-invalid');
  return pack;
}

async function bundledPack(week: string, version: VeganWeek['version'], signal: AbortSignal): Promise<VeganWeek | null> {
  if (typeof location === 'undefined') return null;
  try {
    const revision = version === ROTATING_VEGAN_VERSION ? '?recipes=' + VEGAN_RECIPE_REVISION : '';
    const response = await fetch('/vegan/weeks/v' + version + '/' + encodeURIComponent(week) + '.json' + revision, { signal });
    const pack = await readPack(response, week, version);
    return needsVeganWeekUpdate(week, pack) ? null : pack;
  } catch {
    return null;
  }
}

function revisePack(pack: VeganWeek, catalog: VeganWeek): VeganWeek {
  // The bundled weeks share one catalog. Published schedules and new dish IDs
  // still belong to the requested week, even when its immutable R2 file is older.
  let revised = pack;
  if (needsRecipeRevision(pack)) {
    const byId = new Map(catalog.recipes.map(recipe => [recipe.id, recipe]));
    const recipes = pack.recipes.map(recipe => {
      const correction = byId.get(recipe.id);
      if (!correction || !sameVeganDish(correction, recipe)) return recipe;
      const { minutes, ingredients, steps } = correction;
      return { ...recipe, minutes, ingredients, steps };
    });
    if (recipes.length === LEGACY_ROTATING_RECIPE_COUNT && recipes.every(recipe => byId.has(recipe.id))) {
      const existing = new Set(recipes.map(recipe => recipe.id));
      recipes.push(...catalog.recipes.filter(recipe => !existing.has(recipe.id)));
    }
    revised = { ...pack, recipes, recipeRevision: VEGAN_RECIPE_REVISION };
  }
  if (needsBundledRotation(pack.week, pack) && catalog.week === pack.week) {
    const ids = new Set(revised.recipes.map(recipe => recipe.id));
    const days = catalog.days.every(day => day.every(id => ids.has(id))) ? catalog.days : pack.days;
    revised = { ...revised, days, rotationRevision: catalog.rotationRevision };
  }
  return revised;
}

export function downloadVeganWeek(week: string): Promise<VeganWeek> {
  const saved = readVeganWeek(week);
  if (saved && !needsVeganWeekUpdate(week, saved)) return Promise.resolve(saved);
  const existing = pending.get(week);
  if (existing) return existing;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const version = week >= REGIONAL_VEGAN_FIRST_WEEK ? ROTATING_VEGAN_VERSION : 1;
      const hasLocalFile = version !== ROTATING_VEGAN_VERSION || bundledRotationWeeks.has(week);
      const local = hasLocalFile ? await bundledPack(week, version, controller.signal) : null;
      let data = saved?.version === ROTATING_VEGAN_VERSION ? saved : local;
      if (!data) {
        const response = await fetchPublicMedia('https://media.quangtu.vn/vegan/weeks/v' + version + '/' + encodeURIComponent(week) + '.json', {
          credentials: 'omit',
          cache: 'no-store',
          signal: controller.signal,
        });
        data = await readPack(response, week, version);
      }
      if (data.version === ROTATING_VEGAN_VERSION && needsVeganWeekUpdate(week, data)) {
        const catalog = hasLocalFile ? local : await bundledPack(REGIONAL_VEGAN_FIRST_WEEK, version, controller.signal);
        if (catalog) data = revisePack(data, catalog);
      }
      if (data === saved) return data;
      try {
        if (!saved) pruneVeganWeeks(week);
        localStorage.setItem(prefix + week, JSON.stringify(data));
        if (saved) pruneVeganWeeks(week);
      } catch {
        // A larger revision can exceed the storage quota. The old entry stays
        // readable and the validated revision is available to this view.
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => pending.delete(week));
  pending.set(week, request);
  return request;
}
export function latestVeganWeek(before: string): VeganWeek | null {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort().reverse();
    for (const key of keys) {
      const week = key.slice(prefix.length);
      if (week < before) {
        const saved = readVeganWeek(week);
        if (saved) return saved;
      }
    }
  } catch {
    // Storage may be disabled.
  }
  return null;
}

/** While the app is in use, prepare the next menu for devices that already use this feature. */
export function watchVeganWeekPreload() {
  try {
    pruneVeganWeeks();
  } catch {
    // Storage may be disabled.
  }
  let timer: ReturnType<typeof setTimeout>;
  function refresh() {
    clearTimeout(timer);
    if (document.hidden) return;
    const now = new Date();
    const schedule = vietnamWeek(now);
    if (schedule.preload && navigator.onLine && needsVeganWeekUpdate(schedule.next)
      && (readVeganWeek(schedule.current) || latestVeganWeek(schedule.current))) {
      void downloadVeganWeek(schedule.next).catch(() => undefined);
    }
    const local = new Date(now.getTime() + 7 * 3_600_000);
    const boundary = new Date(local);
    const daysToSunday = (7 - local.getUTCDay()) % 7;
    boundary.setUTCDate(local.getUTCDate() + daysToSunday);
    boundary.setUTCHours(18, 0, 0, 0);
    if (boundary <= local) boundary.setUTCDate(boundary.getUTCDate() + 7);
    timer = setTimeout(refresh, boundary.getTime() - local.getTime() + 100);
  }
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
  refresh();
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('online', refresh);
  };
}
