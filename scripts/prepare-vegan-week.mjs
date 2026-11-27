import { readFile } from 'node:fs/promises';
import { isVeganWeek, weekDate } from '../src/lib/contracts/vegan-week.ts';

const [catalogPath, schedulePath] = process.argv.slice(2);
if (!catalogPath || !schedulePath) {
  process.stderr.write('Usage: node scripts/prepare-vegan-week.mjs <catalog.json> <schedule.json>\n');
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
}

const [catalog, schedule] = await Promise.all([readJson(catalogPath), readJson(schedulePath)]);
if (!Array.isArray(catalog) || catalog.length !== 100) {
  throw new Error('Catalog must contain exactly 100 individually sourced recipes.');
}

const names = new Set();
const groups = new Set();
const recipes = catalog.map(({ source, adaptation, ...recipe }) => {
  if (typeof source !== 'string' || new URL(source).protocol !== 'https:') {
    throw new Error('Missing HTTPS recipe source for ' + recipe.id);
  }
  if (typeof adaptation !== 'string' || !adaptation.trim()) {
    throw new Error('Missing editorial notes for ' + recipe.id);
  }
  const name = recipe.name.normalize('NFC').trim().toLocaleLowerCase('vi');
  if (names.has(name)) throw new Error('Duplicate recipe name: ' + recipe.name);
  names.add(name);
  groups.add(recipe.group);
  return recipe;
});

const { week, days } = schedule;
const date = weekDate(week, 0);
if (date.getUTCDay() !== 1 || date.toISOString().slice(0, 10) !== week) {
  throw new Error('Schedule week must be a real Monday in YYYY-MM-DD format.');
}
const payload = { version: 1, week, recipes, days };
if (groups.size !== 6 || !isVeganWeek(payload, week)) {
  throw new Error('Invalid schedule or recipes. Check all six categories, quantities, step references and three distinct recipe IDs per day for seven days.');
}

process.stdout.write(JSON.stringify(payload) + '\n');
