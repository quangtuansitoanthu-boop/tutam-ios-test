import catalog from '../../docs/plans/vegan-sources/recipes-reviewed.json';
import extraRecipes from '../../docs/plans/vegan-sources/recipes-extra.json';
import metricRecipes from '../../docs/plans/vegan-sources/recipes-metric.json';
import rotationRecipes from '../../docs/plans/vegan-sources/recipes-rotation.json';
import regions from '../../docs/plans/vegan-sources/regions-existing.json';
import launchWeek from '../../docs/plans/vegan-sources/schedule-2026-11-09.json';
import secondWeek from '../../docs/plans/vegan-sources/schedule-2026-11-16.json';
import { isVeganWeek, REGIONAL_VEGAN_FIRST_WEEK, ROTATING_VEGAN_VERSION, VEGAN_RECIPE_REVISION, VEGAN_ROTATION_REVISION, VEGAN_PACKAGE_MAX_BYTES, rotatingVeganDays, veganRecipeScore, vietnamWeek, weekDate, type OfflineRecipe, type VeganWeek } from '../lib/contracts/vegan-week';

const firstAutomaticWeek = '2026-11-23';
const recipes = catalog.map(({ id, name, group, servings, minutes, ingredients, steps }) =>
  ({ id, name, group, servings, minutes, ingredients, steps })
);

const regionalRecipes = [
  ...recipes.map(recipe => ({ ...recipe, region: regions[recipe.id as keyof typeof regions]?.region })),
  ...extraRecipes.map(({ id, name, group, region, servings, minutes, ingredients, steps }) =>
    ({ id, name, group, region, servings, minutes, ingredients, steps })),
];

type PackageVersion = 1 | 2 | 4 | typeof ROTATING_VEGAN_VERSION;

const metricCatalog = metricRecipes.map(
  ({ id, name, group, region, servings, minutes, ingredients, steps }) => ({ id, name, group, region, servings, minutes, ingredients, steps }),
);
const rotationCatalog = [...metricCatalog, ...rotationRecipes.map(
  ({ id, name, group, region, servings, minutes, ingredients, steps }) => ({ id, name, group, region, servings, minutes, ingredients, steps }),
)];

export function prepareVeganWeek(week: string, version: PackageVersion = 1): VeganWeek {
  const monday = weekDate(week, 0);
  if (monday.getUTCDay() !== 1 || monday.toISOString().slice(0, 10) !== week || week < (version === 1 ? firstAutomaticWeek : REGIONAL_VEGAN_FIRST_WEEK)) {
    throw new Error('Invalid automatic vegan week');
  }

  if (version === ROTATING_VEGAN_VERSION) {
    const data: unknown = {
      version, week, recipes: rotationCatalog, days: rotatingVeganDays(rotationCatalog as OfflineRecipe[], week),
      metric: true, rotationRevision: VEGAN_ROTATION_REVISION, recipeRevision: VEGAN_RECIPE_REVISION,
    };
    if (!isVeganWeek(data, week)) throw new Error('Invalid rotating vegan week package');
    return data;
  }
  const available = version === 1 ? recipes : version === 2 ? regionalRecipes : metricCatalog;
  const mealGroups = [['breakfast', 'porridge'], ['noodles'], ['rice']];
  const selections = mealGroups.map(groups => available
    .filter(recipe => groups.includes(recipe.group))
    .sort((a, b) => veganRecipeScore(week + ':' + a.id) - veganRecipeScore(week + ':' + b.id) || a.id.localeCompare(b.id))
    .slice(0, 7));
  const existingSchedule = [launchWeek, secondWeek].find(schedule => schedule.week === week);
  const days = existingSchedule?.days ?? Array.from({ length: 7 }, (_, day) => selections.map(meal => meal[day]?.id));
  const data: unknown = { version: version === 4 ? 2 : version, week, recipes: available, days, ...(version === 4 && { metric: true }) };
  if (!isVeganWeek(data, week)) throw new Error('Invalid vegan week package');
  return data;
}

interface VeganWeekBucket {
  head(key: string): Promise<unknown>;
  put(key: string, value: string, options: {
    onlyIf: { etagDoesNotMatch: string };
    httpMetadata: { contentType: string; cacheControl: string };
  }): Promise<unknown>;
}

export async function publishVeganWeek(bucket: VeganWeekBucket, now: Date, version: PackageVersion = 1) {
  const { next } = vietnamWeek(now);
  const week = next < firstAutomaticWeek ? firstAutomaticWeek : next;
  const key = 'vegan/weeks/v' + version + '/' + week + '.json';
  if (await bucket.head(key)) return { week, outcome: 'exists' };
  const payload = JSON.stringify(prepareVeganWeek(week, version));
  if (new TextEncoder().encode(payload).length > VEGAN_PACKAGE_MAX_BYTES) throw new Error('Vegan week package exceeds download limit');
  const written = await bucket.put(key, payload, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=300' },
  });
  return { week, outcome: written ? 'published' : 'exists' };
}

export default {
  async scheduled(controller: { scheduledTime: number }, env: { MEDIA: VeganWeekBucket }) {
    const now = new Date(controller.scheduledTime);
    await Promise.all(([1, 2, 4, ROTATING_VEGAN_VERSION] as const).map(async version => {
      const result = await publishVeganWeek(env.MEDIA, now, version);
      console.log(JSON.stringify({ event: 'vegan-week', version, ...result }));
    }));
  },
};
