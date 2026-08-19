import { expect, test } from '@playwright/test';

const releaseUrl =
  'http://127.0.0.1:4174/docs/design/longview-release-five-research-brief.html';

test('reviews attributed evidence with accept, reject, and not now', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.getByRole('button', { name: 'Review research' }).click();
  await expect(page.getByText('Customer interview notes · Partner 02').first()).toBeVisible();

  for (const [button, status] of [['Accept', 'Accepted'], ['Reject', 'Rejected'], ['Not now', 'Not now']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Saving one review decision…' })).toBeVisible();
    await page.getByRole('button', { name: 'Show result' }).click();
    await expect(page.locator('[data-card="primary"]')).toContainText(status);
  }
});

test('edits, reviews, and saves an attributed Plan Brief version', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.selectOption('#screen', 'proposalEdit');
  await page.getByLabel('Approach').fill('Keep one visible first-value checkpoint for three partners.');
  await page.getByRole('button', { name: 'Review Plan Brief' }).click();
  await expect(page.getByText('Keep one visible first-value checkpoint for three partners.')).toBeVisible();
  await expect(page.getByText('expected current version 2')).toBeVisible();
  await page.getByRole('button', { name: 'Save version 3' }).click();
  await expect(page.getByRole('progressbar', { name: 'Saving one Plan Brief version…' })).toBeVisible();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(page.getByText('Current · version 3')).toBeVisible();
  await page.getByRole('button', { name: 'Version history' }).click();
  await expect(page.getByText('Previous · 2 sources · 17th August 2026')).toBeVisible();
});

test('defers a proposal without changing the current brief', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.selectOption('#scenario', 'deferProposal');
  await page.selectOption('#screen', 'proposalEdit');
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Research and Plan Brief' })).toBeVisible();
  await expect(page.getByText('Plan Brief version 2')).toBeVisible();
});

test('protects a newer Plan Brief from a stale edit', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.selectOption('#scenario', 'briefStale');
  await page.selectOption('#screen', 'proposalReview');
  await page.getByRole('button', { name: 'Save version 3' }).click();
  await page.getByRole('button', { name: 'Show result' }).click();
  await expect(page.getByText('A newer Plan Brief already exists.')).toBeVisible();
  await expect(page.getByText('Your edits were not saved over it.')).toBeVisible();
});

test('shows idempotent and interrupted-result recovery', async ({ page }) => {
  await page.goto(releaseUrl);
  await page.selectOption('#scenario', 'reviewDuplicate');
  await page.selectOption('#screen', 'researchCards');
  await expect(page.getByText('Review already saved once.')).toBeVisible();

  await page.selectOption('#scenario', 'briefPartial');
  await page.selectOption('#screen', 'briefCurrent');
  await expect(page.getByText('Recovered after an interrupted response.')).toBeVisible();
});

test('shows all specified failure states without horizontal overflow', async ({ page }) => {
  await page.goto(releaseUrl);
  for (const scenario of ['cancelResearch', 'timeout', 'malformed', 'offlineResearch', 'missingAttribution', 'reviewOffline', 'reviewConcurrent', 'reviewPartial', 'briefOffline', 'briefStale', 'briefConcurrent', 'researchRead', 'briefRead']) {
    await page.selectOption('#scenario', scenario);
    await page.selectOption('#screen', 'failure');
    await expect(page.getByText('Your confirmed work is safe.')).toBeVisible();
  }
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
