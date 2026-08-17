import { expect, test } from '@playwright/test';

const proposalUrl =
  'http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#schedule-proposal';

test('approved-day mockup keeps progress visible and shows durable proof', async ({ page }) => {
  await page.goto(proposalUrl);
  await expect(page.getByText('First', { exact: true })).toBeVisible();
  await expect(page.getByText('Then', { exact: true })).toBeVisible();
  await expect(page.getByText('7:00')).not.toBeVisible();
  await page.getByRole('button', { name: 'Approve this order' }).click();
  const progress = page.getByRole('progressbar', { name: 'Saving approved day' });
  await expect(progress).toBeVisible();
  await expect(page.getByText('The current approved day stays available')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revision 1' })).toBeVisible({ timeout: 4_000 });
  await expect(progress).not.toBeVisible();
  await expect(page.getByText(/Source run LV-20260817-014/)).toBeVisible();
});

test('approved-day mockup exposes preservation, conflict, and duplicate states', async ({ page }) => {
  await page.goto(proposalUrl);
  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Day approval failed', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today was not changed' })).toBeVisible();
  await expect(page.getByText('Your previously approved day is still available.')).toBeVisible();

  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Approved day changed', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This proposal is out of date' })).toBeVisible();

  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Day already approved', exact: true }).click();
  await expect(page.getByText('No duplicate day was created')).toBeVisible();
});
