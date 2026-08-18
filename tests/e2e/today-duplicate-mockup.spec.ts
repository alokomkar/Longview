import { expect, test } from '@playwright/test';

test('duplicate completion exposes the original proof without a second write claim', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#completion-done');
  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Completion already recorded' }).click();

  await expect(page.getByRole('heading', { name: 'Progress already saved' })).toBeVisible();
  await expect(page.getByText('That progress was already saved')).toBeVisible();
  await expect(page.getByText('No second completion was added and your Plan was not changed.')).toBeVisible();
  await expect(page.getByText('2026-08-02_startup-validation')).toBeVisible();
  await expect(page.getByText('One record')).toBeVisible();
});
