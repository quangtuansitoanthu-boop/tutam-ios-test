import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('refines HomeDailyReminders with lunar pill, iOS count badge, header add action, and divider rows', () => {
  const reminders = readFileSync('src/lib/components/home/HomeDailyReminders.svelte', 'utf8');
  expect(reminders).toContain('thaptrai-lunar-pill');
  expect(reminders).toMatch(/\.thaptrai-card\s*\{[^}]*border-left:\s*3\.5px solid var\(--gold\)/s);
  expect(reminders).not.toContain('#dc2626');
  expect(reminders).toMatch(/\.personal-count-pill\s*\{[^}]*background:\s*#ff3b30;[^}]*color:\s*#fff;/s);
  expect(reminders).toMatch(/:global\(\[data-theme='dark'\]\) \.personal-count-pill[^{}]*\{[^}]*background:\s*#ff453a;/s);
  expect(reminders).toMatch(/\.personal-add-more-btn\s*\{[^}]*min-height:\s*44px/s);
  expect(reminders).not.toMatch(/\.personal-add-more-btn\s*\{[^}]*border:\s*1px dashed/s);
  expect(reminders).toMatch(/\.personal-list-item\s*\{[^}]*border-bottom:\s*1px solid/s);
  expect(reminders).toContain('getPersonalEventTypeIcon(item.type)');
  expect(reminders).not.toContain('personal-item-type-tag');
  expect(reminders).not.toContain('personal-delete-btn');
  expect(reminders).toMatch(/\.personal-add-more-btn\s*\{[^}]*background:\s*var\(--gold\)/s);
  expect(reminders).toContain('Ngày Lễ của');
  expect(reminders).not.toContain('Ngày Lễ & Kỷ Niệm');
  expect(reminders).toMatch(/\.personal-item-note\s*\{[^}]*color:\s*var\(--text2\)/s);
});
