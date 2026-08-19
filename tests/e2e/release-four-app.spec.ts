import { expect, test } from '@playwright/test';

test('anonymous user creates a Plan and restores its durable decision and Clara guidance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue anonymously' }).click();
  await page.getByRole('button', { name: 'Continue setup' }).click();
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'Create first Plan' }).click();
  await page.getByLabel('Plan title').fill('Release the first useful Longview');
  await page.getByLabel('Desired outcome').fill('Put a durable planning record in a real user’s hands.');
  await page.getByLabel('Why this matters').fill('User evidence is more valuable than another week of prototype work.');
  await page.getByLabel('Target date').fill('2026-09-30');
  await page.getByLabel('Hours for this Plan each week').fill('6');
  await page.getByRole('button', { name: 'Review Plan' }).click();
  await page.getByRole('button', { name: 'Create Plan' }).click();
  await page.getByRole('button', { name: 'Return to Today' }).click();
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'View Plan details' }).click();

  await expect(page.getByRole('heading', { name: 'What happened, and why.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add decision' }).click();
  await page.getByLabel('Decision').fill('Keep Release 4 append-only for the first production cohort.');
  await page.getByLabel('Why this choice?').fill('Immutable evidence is easier to trust and recover than silently edited history.');
  await page.getByRole('button', { name: 'Review decision' }).click();
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByText('Decision saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Ask Clara about this Plan' }).click();
  await expect(page.getByText(/Read-only recommendation/)).toBeVisible();
  await page.getByRole('button', { name: 'Save to this Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Keep this recommendation with the Plan?' })).toBeVisible();
  await page.getByRole('button', { name: 'Save to this Plan' }).click();
  await page.getByRole('tab', { name: 'Saved guidance' }).click();
  await expect(page.getByText(/Define one observable proof/)).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'View Plan details' }).click();
  await page.getByRole('tab', { name: 'Decisions' }).click();
  await expect(page.getByText('Keep Release 4 append-only for the first production cohort.')).toBeVisible();
  await page.getByRole('tab', { name: 'Saved guidance' }).click();
  await expect(page.getByText(/Define one observable proof/)).toBeVisible();

  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
});
