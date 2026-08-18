import { expect, test } from '@playwright/test';

const mockupUrl = 'http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#clara-home';

test('bounded Quick Actions hand off to Calendar without applying a change', async ({ page }) => {
  await page.goto(mockupUrl);
  await page.getByRole('button', { name: /Quick Actions/ }).click();
  await expect(page.getByText('Safe by default')).toBeVisible();
  await page.getByRole('button', { name: /Plan my day/ }).click();
  await expect(page.getByRole('heading', { name: 'Plan my day' })).toBeVisible();
  await page.getByRole('button', { name: /Build today’s schedule/ }).click();
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare today' })).toBeVisible();
  await expect(page.getByText('Today needs your approval')).toBeVisible();
});
