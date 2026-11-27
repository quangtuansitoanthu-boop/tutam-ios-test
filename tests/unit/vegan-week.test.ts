import { describe, expect, it } from 'vitest';
import { ingredientMeasureHint, isVeganWeek, quantityText, recipeStep, shoppingItems, vietnamWeek, type VeganWeek } from '../../src/lib/contracts/vegan-week';

describe('weekly offline vegan menus', () => {
  it('opens the next week download at Sunday 18:00 Vietnam time, including year rollover', () => {
    const before = vietnamWeek(new Date('2026-12-27T10:59:59Z'));
    const after = vietnamWeek(new Date('2026-12-27T11:00:00Z'));
    const january = vietnamWeek(new Date('2027-01-03T11:00:00Z'));
    expect(before.preload).toBe(false);
    expect(after).toMatchObject({ preload: true, current: '2026-12-21', next: '2026-12-28' });
    expect(january.next).toBe('2027-01-04');
    expect(vietnamWeek(new Date('2026-12-27T17:00:00Z'))).toMatchObject({ preload: false, current: after.next, day: 0 });
  });

  const week: VeganWeek = {
    version: 1,
    week: '2026-11-09',
    recipes: Array.from({ length: 100 }, (_, index) => ({
      id: String(index), name: 'Món ' + index, group: 'rice', servings: 2, minutes: 20,
      ingredients: [{ name: 'Gạo', quantity: 0.1, unit: 'kg' }, { name: 'Muối', quantity: null, unit: '', note: 'Vừa đủ' }],
      steps: ['Vo {0} gạo, nấu 20 phút. Nêm muối {1}.'],
    })),
    days: Array.from({ length: 7 }, () => ['0', '1', '2']),
  };

  it('rejects incomplete menus and references to missing recipes or ingredients', () => {
    expect(isVeganWeek(week, week.week)).toBe(true);
    expect(isVeganWeek(week, '2026-11-16')).toBe(false);
    expect(isVeganWeek({ ...week, recipes: week.recipes.slice(0, 99) }, week.week)).toBe(false);
    expect(isVeganWeek({ ...week, days: [['0', '1', 'bad'], ...week.days.slice(1)] }, week.week)).toBe(false);
    const invalid = { ...week.recipes[0], steps: ['{3}'] };
    expect(isVeganWeek({ ...week, recipes: [invalid, ...week.recipes.slice(1)] }, week.week)).toBe(false);
  });

  it('changes ingredient quantities without changing cooking time and merges compatible units', () => {
    const recipe = week.recipes[0];
    const other = { ...recipe, ingredients: [{ name: 'Gạo', quantity: 50, unit: 'g' }] };
    expect(recipeStep(recipe, recipe.steps[0], 3, 'vi')).toBe('Vo 150 g gạo, nấu 20 phút. Nêm muối Vừa đủ.');
    expect(shoppingItems([recipe, other], 3)).toMatchObject([
      { name: 'Gạo', unit: 'g' }, { name: 'Muối', quantity: null },
    ]);
    expect(shoppingItems([recipe, other], 3)[0].quantity).toBeCloseTo(225);
  });

  it('displays measured metric quantities for cooking volumes', () => {
    expect(quantityText(0.5, 'muỗng canh', 'vi')).toBe('7,5 ml');
    expect(quantityText(2, 'muỗng cà phê', 'vi')).toBe('10 ml');
    expect(quantityText(0.25, 'l', 'vi')).toBe('250 ml');
    expect(ingredientMeasureHint('Cà rốt', 2, 'củ', 'vi')).toBe('≈ 122 g');
    expect(ingredientMeasureHint('Nước tương', 0.5, 'muỗng canh', 'vi')).toBe('0,5 muỗng canh');
    expect(ingredientMeasureHint('Đậu hũ non', 1, 'hộp', 'vi')).toBe('');
  });
});
