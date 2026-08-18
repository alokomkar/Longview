import { expect, test } from '@playwright/test';

const releaseUrl =
  'http://127.0.0.1:4174/docs/design/longview-release-three-daily-schedule.html';

test('prepares, reviews and explicitly approves one bounded day', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.getByRole('button', { name: 'Prepare today' }).click();
  await expect(page.getByRole('progressbar', { name: 'Generating a safe order…' })).toBeVisible();
  await page.getByRole('button', { name: 'Show proposal' }).click();
  await expect(page.getByText('75 of 120 minutes · 45 minutes remain unallocated')).toBeVisible();
  await page.getByRole('button', { name: 'Approve this order' }).click();
  await expect(page.getByRole('progressbar', { name: 'Checking and saving together…' })).toBeVisible();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(page.getByText('Approval record: day-approval-123')).toBeVisible();
});

test('replacement and break keep reviewed work until confirmation succeeds', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.selectOption('#scenario', 'replacement');
  await page.selectOption('#screen', 'proposal');
  await expect(page.getByText('Revision 2 is still approved.')).toBeVisible();
  await page.selectOption('#screen', 'approved');
  await page.getByRole('button', { name: 'Take a break today' }).click();
  await expect(page.getByText('Future days are not approved here.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm break and carry tasks' }).click();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(page.getByText('No future day was overwritten.')).toBeVisible();
});

test('every terminal failure is explicit and horizontally responsive', async ({ page }) => {
  await page.goto(releaseUrl);
  for (const scenario of ['cancel', 'timeout', 'offline', 'malformed', 'stale', 'futureConflict', 'noEligible']) {
    await page.selectOption('#scenario', scenario);
    await page.selectOption('#screen', 'failure');
    await expect(page.getByText('Nothing changed.')).toBeVisible();
  }
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
