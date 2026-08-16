import { expect, test } from '@playwright/test';

test('mobile authentication screen is usable and explicit about account preservation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Make progress/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue anonymously' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByText(/never silently merges two accounts/i)).toBeVisible();
});

test('offline shell remains readable', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Make progress/ })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status')).toContainText('Offline');
  await context.setOffline(false);
});
