import { expect, test } from '@playwright/test';

const mockupUrl =
  'http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#calendar';

test('checkpointed run mockup starts, exposes progress, and cancels safely', async ({ page }) => {
  await page.goto(mockupUrl);
  await page.getByRole('button', { name: 'Prepare today' }).click();
  await expect(page.getByText('Background run · LV-20260817-014')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Checkpoint 2 of 4' })).toBeVisible();
  const progress = page.getByRole('progressbar', { name: 'Preparing today’s schedule' });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuetext', /Checkpoint 2 of 4/);
  await expect(page.getByText('Your approved day is unchanged')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(progress).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'No schedule was replaced' })).toBeVisible();
  await expect(page.getByText(/stopped before a proposal was published/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a new run' })).toBeVisible();
});
