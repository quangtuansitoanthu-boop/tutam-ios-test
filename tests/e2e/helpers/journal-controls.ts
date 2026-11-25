import { expect, type Locator, type Page } from '@playwright/test';

export async function deferJournalNotifications(page: Page, locale: 'vi' | 'en' = 'vi') {
  const prompt = page.getByRole('dialog', { name: locale === 'en' ? 'Practice notifications' : 'Thông báo tu tập', exact: true });
  await page.addLocatorHandler(prompt, () => prompt.getByRole('button', { name: locale === 'en' ? 'Maybe later' : 'Để sau', exact: true }).click());
}

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
