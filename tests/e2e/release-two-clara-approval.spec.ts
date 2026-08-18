import { expect, test } from '@playwright/test';

const releaseUrl =
  'http://127.0.0.1:4174/docs/design/longview-release-two-clara-approval.html';

async function openReview(page: import('@playwright/test').Page) {
  await page.goto(releaseUrl);
  await page.getByRole('button', { name: 'Ask Clara about this step' }).click();
  await expect(page.getByRole('progressbar', { name: 'Waiting for Clara' })).toBeVisible();
  await page.getByRole('button', { name: 'Show response' }).click();
  await page.getByRole('button', { name: 'Review schedule change' }).click();
}

test('approval shows exact values, progress, version and audit proof', async ({ page }) => {
  await openReview(page);
  await expect(page.getByText('Monday, Friday · 4 hours/week · version 2')).toBeVisible();
  await expect(page.getByText('Monday, Wednesday, Friday · 4 hours/week')).toBeVisible();
  await expect(page.getByText(/Today may select this Plan on Wednesday/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve schedule change' }).click();
  await expect(page.getByRole('progressbar', { name: 'Saving approved change' })).toBeVisible();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(page.getByText('Schedule version: 2 → 3')).toBeVisible();
  await expect(page.getByText('Approval record: approval-123')).toBeVisible();
});

test('rejection, stale conflict and network recovery never imply a write', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: 'Reject and keep current schedule' }).click();
  await expect(page.getByText('No Plan or audit record was changed.')).toBeVisible();

  await page.selectOption('#scenario', 'conflict');
  await page.selectOption('#screen', 'result');
  await expect(page.getByText('Nothing was overwritten.')).toBeVisible();

  await page.selectOption('#scenario', 'network');
  await expect(page.getByRole('button', { name: 'Try approval again' })).toBeVisible();
  await expect(page.getByText('The existing Plan is unchanged.')).toBeVisible();
});

test('timeout, malformed and duplicate states remain explicit on mobile', async ({ page }) => {
  await page.goto(releaseUrl);
  for (const scenario of ['timeout', 'malformed', 'duplicate']) {
    await page.selectOption('#scenario', scenario);
    await page.selectOption('#screen', scenario === 'duplicate' ? 'result' : 'recommendation');
    await expect(page.locator('.viewport')).not.toBeEmpty();
  }
  await expect(page.getByText('No duplicate write or audit event was created.')).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
