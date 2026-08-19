import { expect, test } from '@playwright/test';

const releaseUrl =
  'http://127.0.0.1:4174/docs/design/longview-release-four-plan-record.html';

test('keeps execution evidence and source proof with the Plan', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.getByRole('button', { name: 'Execution history' }).click();
  await expect(page.getByText('Completed · Define the first proof of progress')).toBeVisible();
  await expect(page.getByText('Added Wednesday after explicit review · approval-123')).toBeVisible();
});

test('reviews and saves one immutable decision', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.selectOption('#screen', 'decisionDraft');
  await page.getByRole('button', { name: 'Review decision' }).click();
  await expect(page.getByText('Nothing has been saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByRole('progressbar', { name: 'Saving one immutable decision…' })).toBeVisible();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(page.getByText('Decision record · decision-0818-01')).toBeVisible();
});

test('cancels a reviewed decision without adding a record', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.selectOption('#scenario', 'cancel');
  await page.selectOption('#screen', 'decisionReview');
  await page.getByRole('button', { name: 'Cancel without saving' }).click();
  await expect(page.getByText('Review cancelled.')).toBeVisible();
  await expect(page.getByText('No Plan record was added.')).toBeVisible();
});

test('retains Clara guidance only after a second explicit review', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.getByRole('button', { name: 'Ask Clara about this Plan' }).click();
  await expect(page.getByRole('progressbar', { name: 'Preparing read-only guidance…' })).toBeVisible();
  await page.getByRole('button', { name: 'Show response' }).click();
  await expect(page.getByText('Nothing has been retained or changed.')).toBeVisible();
  await page.getByRole('button', { name: 'Review saving this guidance' }).click();
  await page.getByRole('button', { name: 'Save to this Plan' }).click();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(page.getByText('guidance-0818-01 · 5 source facts')).toBeVisible();
});

test('shows every failure without horizontal overflow', async ({ page }) => {
  await page.goto(releaseUrl);
  for (const scenario of ['cancel', 'timeout', 'malformed', 'offline', 'concurrent', 'partial', 'readError', 'planMissing']) {
    await page.selectOption('#scenario', scenario);
    await page.selectOption('#screen', 'failure');
    await expect(page.getByText('Nothing new was added.')).toBeVisible();
  }
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
