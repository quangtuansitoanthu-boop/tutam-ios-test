export const VEGAN_WEEK_PATH = '/api/vegan-week';
export const VEGAN_GROUPS = ['steamed', 'noodles', 'rice', 'breakfast', 'porridge', 'sides'] as const;
export type VeganGroup = typeof VEGAN_GROUPS[number];
export const VEGAN_REGIONS = ['north', 'central', 'south', 'multiple'] as const;
export type VeganRegion = typeof VEGAN_REGIONS[number];
export const VEGAN_MEAL_REGIONS = ['', 'north', 'central', 'south'] as const;
export type VeganMealRegion = typeof VEGAN_MEAL_REGIONS[number];

export function matchesVeganRegion(region: VeganRegion | undefined, filter: string): boolean {
  return filter === '' || region === filter || region === 'multiple';
}
export const VEGAN_PACKAGE_MAX_BYTES = 512 * 1024;
export const REGIONAL_VEGAN_FIRST_WEEK = '2026-11-09';
export const ROTATING_VEGAN_VERSION = 5;
export const VEGAN_ROTATION_REVISION = 1;
export const VEGAN_RECIPE_REVISION = 1;

export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string;
  note?: string;
}

export interface OfflineRecipe {
  id: string;
  name: string;
  group: VeganGroup;
  region?: VeganRegion;
  servings: number;
  minutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
}

export function sameVeganDish(a: OfflineRecipe, b: OfflineRecipe): boolean {
  return a.id === b.id && a.name === b.name && a.group === b.group && a.servings === b.servings;
}

export interface VeganWeek {
  version: 1 | 2 | typeof ROTATING_VEGAN_VERSION;
  week: string;
  recipes: OfflineRecipe[];
  days: string[][];
  metric?: true;
  rotationRevision?: number;
  recipeRevision?: number;
  measured?: OfflineRecipe[][][];
}

export function hasMeasuredVeganWeek(week: string): boolean {
  return ['2026-11-09', '2026-11-16', '2026-11-23'].includes(week);
}

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function vietnamWeek(now = new Date()) {
  const local = new Date(now.getTime() + 7 * 3_600_000);
  const weekday = local.getUTCDay();
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ((weekday + 6) % 7) * DAY_MS);
  return {
    today: dateKey(local),
    current: dateKey(monday),
    next: dateKey(new Date(monday.getTime() + 7 * DAY_MS)),
    preload: weekday === 0 && local.getUTCHours() >= 18,
    day: (weekday + 6) % 7,
  };
}

export function weekDate(week: string, day: number): Date {
  return new Date(Date.parse(week) + day * DAY_MS);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function label(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function ingredient(value: unknown): value is RecipeIngredient {
  return record(value) && label(value.name) && typeof value.unit === 'string'
    && (value.note === undefined || label(value.note))
    && (value.quantity === null ? label(value.note) : typeof value.quantity === 'number' && Number.isFinite(value.quantity) && value.quantity > 0);
}

function recipe(value: unknown): value is OfflineRecipe {
  return record(value) && label(value.id) && label(value.name)
    && VEGAN_GROUPS.some(group => group === value.group)
    && (value.region === undefined || VEGAN_REGIONS.some(region => region === value.region))
    && typeof value.servings === 'number' && Number.isInteger(value.servings) && value.servings > 0
    && typeof value.minutes === 'number' && Number.isInteger(value.minutes) && value.minutes > 0
    && Array.isArray(value.ingredients) && value.ingredients.length > 0 && value.ingredients.every(ingredient)
    && Array.isArray(value.steps) && value.steps.length > 0 && value.steps.every(step =>
      label(step) && [...step.matchAll(/\{(\d+)\}/gu)].every(match => Number(match[1]) < (value.ingredients as unknown[]).length)
    );
}

export function isVeganWeek(value: unknown, week: string): value is VeganWeek {
  if (!DATE_PATTERN.test(week) || !record(value) || value.week !== week) return false;
  const count = value.version === 1 ? 100 : value.version === 2 ? 150 : value.version === ROTATING_VEGAN_VERSION ? 190 : 0;
  const rotating = value.version === ROTATING_VEGAN_VERSION;
  if (!count || !Array.isArray(value.recipes) || value.recipes.length !== count || !value.recipes.every(recipe)
    || (value.version !== 1 && value.recipes.some(item => !item.region))
    || !Array.isArray(value.days) || value.days.length !== 7) return false;
  const ids = new Set(value.recipes.map(item => item.id));
  if (rotating && value.metric !== true) return false;
  if (value.rotationRevision !== undefined && (!rotating || typeof value.rotationRevision !== 'number'
    || !Number.isInteger(value.rotationRevision) || value.rotationRevision < 1)) return false;
  if (value.recipeRevision !== undefined && (!rotating || typeof value.recipeRevision !== 'number'
    || !Number.isInteger(value.recipeRevision) || value.recipeRevision < 1)) return false;
  if (value.metric !== undefined && (value.metric !== true || value.version === 1
    || value.recipes.some(item => item.ingredients.some(i => i.quantity === null || (i.unit !== 'g' && i.unit !== 'ml'))))) return false;
  if (value.measured !== undefined && (value.version !== 2 || !hasMeasuredVeganWeek(week)
    || !Array.isArray(value.measured) || value.measured.length !== 7
    || !value.measured.every(day => Array.isArray(day) && day.length === 3 && day.every((meal, index) =>
      Array.isArray(meal) && meal.length === [2, 3, 2][index] && meal.every(item =>
        recipe(item) && item.servings === 1 && item.ingredients.every(i =>
          i.quantity !== null && (i.unit === 'g' || i.unit === 'ml'))))))) return false;
  const dishesPerDay = rotating ? 9 : 3;
  return ids.size === value.recipes.length && value.days.every(day =>
    Array.isArray(day) && day.length === dishesPerDay && new Set(day).size === dishesPerDay && day.every(id => ids.has(id))
  ) && (!rotating || new Set(value.days.flat()).size === 63);
}

function metricUnit(unit: string): string {
  if (unit === 'kg') return 'g';
  if (unit === 'l' || unit === 'muỗng canh' || unit === 'muỗng cà phê') return 'ml';
  return unit;
}

function metricMultiplier(unit: string): number {
  if (unit === 'kg' || unit === 'l') return 1000;
  if (unit === 'muỗng canh') return 15;
  if (unit === 'muỗng cà phê') return 5;
  return 1;
}

export function quantityText(quantity: number | null, unit: string, locale: string): string {
  if (quantity === null) return '';
  const amount = quantity * metricMultiplier(unit);
  return [new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount), metricUnit(unit)].filter(Boolean).join(' ');
}

// USDA SR Legacy portion weights. These are size references for cooks,
// not measured weights for the ingredients in a particular recipe.
const referencePortions: Record<string, number> = {
  'Cà rốt|củ': 61,
  'Cà rốt|củ nhỏ': 50,
  'Cà rốt|chén': 128,
  'Cà chua|quả': 123,
  'Cà chua|trái': 123,
  'Cà chua chín chắc|trái': 123,
  'Củ cải trắng|củ': 338,
  'Dưa leo|quả': 301,
  'Dưa leo|trái': 301,
  'Su su|quả': 203,
  'Su su|củ': 203,
  'Dứa|quả': 905,
  'Dứa|trái': 905,
  'Dứa chín|quả': 905,
  'Cà tím|quả': 548,
  'Nấm đông cô tươi|tai': 19,
  'Đậu bắp|quả': 95 / 8,
  'Cơm gạo lứt đã nấu|chén': 202,
  'Nước dừa tươi|quả dừa': 206,
};

export function ingredientMeasureHint(name: string, quantity: number | null, unit: string, locale: string): string {
  if (quantity === null) return '';
  const grams = referencePortions[name + '|' + unit];
  if (grams) return '≈ ' + quantityText(Math.round(quantity * grams), 'g', locale);
  if (unit === 'muỗng canh' || unit === 'muỗng cà phê') {
    return quantityText(quantity, '', locale) + ' ' + (locale === 'en'
      ? unit === 'muỗng canh' ? 'tbsp' : 'tsp'
      : unit);
  }
  return '';
}

export function veganRecipeScore(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}

const quickBreakfastMinutes = 20;
const savorySides = new Set(['dish_103', 'dish_265', 'dish_266']);
const isDessert = (recipe: OfflineRecipe) => recipe.group === 'sides' && !savorySides.has(recipe.id);
const isBreakfast = (recipe: OfflineRecipe) => recipe.group === 'breakfast' || recipe.group === 'porridge';
const isWeekdayBreakfast = (day: number, slot: number) => day % 7 < 5 && slot < 3;

export function rotatingVeganDays(catalog: OfflineRecipe[], week: string, region: VeganMealRegion = ''): string[][] {
  const cycleDays = 21;
  // The legacy large-batch xôi stays in Menu món, outside the meal rotation.
  const pool = catalog.filter(recipe => recipe.id !== 'dish_201')
    .sort((a, b) => veganRecipeScore(a.id) - veganRecipeScore(b.id) || a.id.localeCompare(b.id));
  if (pool.length !== cycleDays * 9) throw new Error('Invalid vegan rotation size');

  function take(groups: VeganGroup[], prefer?: (recipe: OfflineRecipe) => boolean) {
    return Array.from({ length: cycleDays }, () => {
      const firstChoice = prefer ? pool.findIndex(prefer) : -1;
      const preferred = firstChoice < 0 ? pool.findIndex(recipe => groups.includes(recipe.group)) : firstChoice;
      return pool.splice(Math.max(0, preferred), 1)[0];
    });
  }

  // Allocate the main dishes before sides so a side cannot exhaust a main group.
  const byPreparationTime = (a: OfflineRecipe, b: OfflineRecipe) => a.minutes - b.minutes
    || veganRecipeScore(a.id) - veganRecipeScore(b.id) || a.id.localeCompare(b.id);
  const combined = [...pool]
    .sort((a, b) => Number(isBreakfast(b)) - Number(isBreakfast(a)) || byPreparationTime(a, b))
    .slice(0, cycleDays * 2)
    .sort(byPreparationTime);
  for (const recipe of combined) pool.splice(pool.indexOf(recipe), 1);
  const quickDishes = combined.slice(0, 30);
  const weekendDishes = combined.slice(30);
  const breakfast = Array<OfflineRecipe>(cycleDays);
  const breakfastSecond = Array<OfflineRecipe>(cycleDays);
  const weekdayIndices = Array.from({ length: cycleDays }, (_, i) => i).filter(i => i % 7 < 5);
  const weekendIndices = Array.from({ length: cycleDays }, (_, i) => i).filter(i => i % 7 >= 5);
  weekdayIndices.forEach((day, idx) => {
    // Spread the shortest dishes across all three weeks instead of using
    // them up before the last Monday.
    breakfast[day] = quickDishes[idx];
    breakfastSecond[day] = quickDishes[quickDishes.length - 1 - idx];
  });
  weekendIndices.forEach((day, idx) => {
    breakfast[day] = weekendDishes[idx * 2];
    breakfastSecond[day] = weekendDishes[idx * 2 + 1];
  });
  const breakfastSideRaw = take(['steamed']);
  breakfastSideRaw.sort(byPreparationTime);
  const breakfastSide = Array<OfflineRecipe>(cycleDays);
  const quickBreakfastSides = breakfastSideRaw.slice(0, 15);
  const weekendBreakfastSides = breakfastSideRaw.slice(15);
  weekdayIndices.forEach((day, idx) => {
    breakfastSide[day] = quickBreakfastSides[idx];
  });
  weekendIndices.forEach((day, idx) => {
    breakfastSide[day] = weekendBreakfastSides[idx];
  });
  // Scratch-made bánh and giò can take over an hour. Offer quick noodle
  // and rice dishes in their place on weekdays, keeping every dish in the cycle.
  for (const day of weekdayIndices) {
    const slots = [breakfast, breakfastSecond, breakfastSide].sort((a, b) => a[day].minutes - b[day].minutes);
    for (const [index, slot] of slots.entries()) {
      const limit = index < 2 ? quickBreakfastMinutes : 45;
      if (slot[day].minutes <= limit) continue;
      const candidates = pool.filter(item => (item.group === 'noodles' || item.group === 'rice') && item.minutes <= limit);
      // Keep the fastest substitutes for days that still need a 20-minute option.
      candidates.sort(byPreparationTime);
      const replacement = candidates[candidates.length - 1];
      if (replacement) {
        pool[pool.indexOf(replacement)] = slot[day];
        slot[day] = replacement;
      }
    }
  }
  const lunch = take(['noodles']);
  const dinner = take(['rice']);
  const lunchSide = take(['sides'], isDessert);
  const dinnerSide = take(['sides', 'steamed'], isDessert);
  const lunchSecond = take(['rice', 'noodles']);
  const dinnerSecond = take(['rice', 'steamed', 'sides']);
  const slots = [breakfast, breakfastSecond, breakfastSide, lunch, lunchSecond, lunchSide, dinner, dinnerSecond, dinnerSide];
  const cycle = Array.from({ length: cycleDays }, (_, day) => slots.map(slot => slot[day]));
  if (region) {
    const regionalCount = Array<number>(cycleDays).fill(0);
    const byGroup = new Map<string, Array<{ day: number; slot: number; item: OfflineRecipe }>>();
    cycle.forEach((day, dayIndex) => day.forEach((item, slot) => {
      // Regional swaps can only trade weekday breakfasts of similar speed
      // and cannot replace a dessert with a savory side.
      const time = isWeekdayBreakfast(dayIndex, slot)
        ? item.minutes <= quickBreakfastMinutes ? 'quick' : 'long'
        : 'regular';
      const key = [item.group, time, isDessert(item)].join(':');
      const position = { day: dayIndex, slot, item };
      const group = byGroup.get(key);
      if (group) group.push(position);
      else byGroup.set(key, [position]);
    }));
    for (const positions of byGroup.values()) {
      const regional = positions.filter(({ item }) => item.region === region);
      const remaining = positions.filter(({ item }) => item.region !== region)
        .sort((a, b) => veganRecipeScore(region + ':' + a.item.id) - veganRecipeScore(region + ':' + b.item.id)
          || a.item.id.localeCompare(b.item.id));
      for (const { item } of regional) {
        positions.sort((a, b) => regionalCount[a.day] - regionalCount[b.day]
          || veganRecipeScore(region + ':' + item.id + ':' + a.day + ':' + a.slot)
          - veganRecipeScore(region + ':' + item.id + ':' + b.day + ':' + b.slot));
        const position = positions.shift()!;
        cycle[position.day][position.slot] = item;
        regionalCount[position.day]++;
      }
      positions.sort((a, b) => a.day - b.day || a.slot - b.slot);
      positions.forEach(({ day, slot }, index) => { cycle[day][slot] = remaining[index].item; });
    }
  }
  const firstDay = Math.round((Date.parse(week) - Date.parse(REGIONAL_VEGAN_FIRST_WEEK)) / DAY_MS);
  return Array.from({ length: 7 }, (_, index) => cycle[((firstDay + index) % cycleDays + cycleDays) % cycleDays].map(item => item.id));
}

export function veganMealPlan(week: VeganWeek, region: VeganMealRegion = ''): OfflineRecipe[][][] {
  if (week.version === ROTATING_VEGAN_VERSION) {
    const recipes = new Map(week.recipes.map(item => [item.id, item]));
    const days = region || (week.rotationRevision ?? 0) < VEGAN_ROTATION_REVISION
      ? rotatingVeganDays(week.recipes, week.week, region)
      : week.days;
    return days.map(day => [0, 3, 6].map(start =>
      day.slice(start, start + 3).map(id => recipes.get(id)!).filter(Boolean),
    ));
  }
  const weekIndex = Math.floor(Date.parse(week.week) / (7 * DAY_MS));
  const used = new Set<string>();
  const slots: VeganGroup[][] = [
    ['porridge', 'breakfast'], ['breakfast', 'porridge'], ['steamed', 'sides'],
    ['noodles'], ['sides'], ['steamed', 'sides', 'rice'],
    ['rice'], ['steamed', 'sides', 'rice'], ['sides', 'rice'],
  ];
  const catalog = week.recipes.filter(item => item.id !== 'dish_201');
  return week.days.map((_, index) => {
    const picks = slots.map((groups, slot) => {
      const available = catalog.filter(item => !used.has(item.id));
      const preferred = available.filter(item => groups.includes(item.group));
      const pool = preferred.length ? preferred : available;
      const item = pool[(weekIndex + index + slot) % pool.length];
      if (item) used.add(item.id);
      return item;
    });
    return [picks.slice(0, 3), picks.slice(3, 6), picks.slice(6, 9)].map(meal => meal.filter(Boolean));
  });
}

export function recipeStep(recipe: OfflineRecipe, step: string, servings: number, locale: string): string {
  return step.replace(/\{(\d+)\}/gu, (_, index: string) => {
    const { quantity, unit, note } = recipe.ingredients[Number(index)];
    return quantity === null ? note ?? '' : quantityText(quantity * servings / recipe.servings, unit, locale);
  });
}

export function shoppingItems(recipes: Pick<OfflineRecipe, 'ingredients' | 'servings'>[], servings: number) {
  const totals = new Map<string, RecipeIngredient>();
  for (const recipe of recipes) {
    for (const item of recipe.ingredients) {
      const unit = item.unit === 'kg' ? 'g' : item.unit === 'l' ? 'ml' : item.unit;
      const key = JSON.stringify([item.name.toLocaleLowerCase('vi').normalize('NFC'), unit, item.quantity === null ? item.note : null]);
      const previous = totals.get(key);
      const quantity = item.quantity === null ? null : (previous?.quantity ?? 0) + item.quantity * servings / recipe.servings * (unit === item.unit ? 1 : 1000);
      totals.set(key, { ...item, unit, quantity });
    }
  }
  return [...totals].map(([key, item]) => ({ ...item, key }));
}
