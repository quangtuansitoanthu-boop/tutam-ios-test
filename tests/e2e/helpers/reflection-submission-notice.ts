import { expect, type Page } from '@playwright/test';

const message = 'Đã gửi bài, vui lòng chờ quản trị viên duyệt trong 48 giờ !';

export function reflectionSubmissionNotice(page: Page) {
  return page.getByRole('dialog', { name: 'Thông báo', exact: true }).filter({ hasText: message });
}

export async function closeReflectionSubmissionNotice(page: Page) {
  const dialog = reflectionSubmissionNotice(page);
  await expect(dialog).toHaveAccessibleDescription(message);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
