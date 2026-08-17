import { expect, test } from '@playwright/test';

const prototypeUrl =
  'http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#portfolio';

test('creating another Plan starts with a blank draft', async ({ page }) => {
  await page.goto(prototypeUrl);
  await page.getByRole('button', { name: 'Create another Plan' }).click();

  await expect(page.locator('#planTitle')).toHaveValue('');
  await expect(page.locator('#planWhy')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'What do you want to make progress on?' })).toBeVisible();
});
