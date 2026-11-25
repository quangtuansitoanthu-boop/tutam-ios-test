import { expect, type Locator } from '@playwright/test';

export async function openJournalSection(journal: Locator, id: 'repentance' | 'good-deed', mobile: boolean) {
  if (mobile) {
    const tab = journal.locator(`[role="tab"][aria-controls="panel-${id}"]`);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  const section = journal.locator(`#panel-${id}`);
  await expect(section).toBeVisible();
  return section;
}
