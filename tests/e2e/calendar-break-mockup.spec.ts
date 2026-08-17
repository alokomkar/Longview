import { expect, test } from '@playwright/test';

const breakUrl =
  'http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#break-confirm';

test('break preview carries each task to its next eligible day', async ({ page }) => {
  await page.goto(breakUrl);
  await expect(page.getByText('Monday · next eligible day for Build SaaS Startup')).toBeVisible();
  await expect(page.getByText('Wednesday · next eligible day for Learn AI / ML')).toBeVisible();
  await expect(page.getByText('Future days will not be approved or overwritten')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm break and carry tasks' }).click();
  await expect(page.getByRole('progressbar', { name: 'Saving day break' })).toBeVisible();
  await expect(page.getByText('Today’s approved order stays available')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sunday is marked as a break' })).toBeVisible({
    timeout: 4_000
  });
  await expect(page.getByText(/2 pending carryovers/)).toBeVisible();
  await page.getByRole('button', { name: 'Return to Today' }).click();
  await expect(page.getByRole('heading', { name: 'You’re taking a break today' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review Calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete' })).toHaveCount(0);
});

test('break failure states preserve today and future days', async ({ page }) => {
  await page.goto(breakUrl);

  for (const [edge, heading] of [
    ['Day break failed', 'Nothing moved'],
    ['Break preview is stale', 'This break preview is out of date'],
    ['Future day already approved', 'No future day was overwritten'],
    ['No eligible future day', 'Nothing moved']
  ] as const) {
    await page.getByRole('button', { name: 'Edge' }).click();
    await page.getByRole('button', { name: edge }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Day break already saved' }).click();
  await expect(page.getByText('No duplicate carryover was created')).toBeVisible();
});
