import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';

const planTitle = 'Ship one useful Longview release';
const recordingPause = async (page: Page, milliseconds = 1_500) => {
  if (process.env.LONGVIEW_RECORDING) await page.waitForTimeout(milliseconds);
};

async function createCompletedStep(page: Page) {
  await page.route('http://127.0.0.1:9999/v1/clara/approved-days/*', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  if (process.env.LONGVIEW_RECORDING_WAIT) {
    await expect(page.getByRole('button', { name: 'Continue anonymously' })).toBeVisible();
    while (!existsSync('/tmp/longview-release-six-recording-go')) await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: 'Continue anonymously' }).click();
  await page.getByRole('button', { name: 'Continue setup' }).click();
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'Create first Plan' }).click();
  await page.getByLabel('Plan title').fill(planTitle);
  await page.getByLabel('Desired outcome').fill('Release one complete planning journey that a real user can finish.');
  await page.getByLabel('Why this matters').fill('A completed outcome is stronger evidence than another prototype.');
  await page.getByLabel('Target date').fill('2026-09-30');
  await page.getByLabel('Hours for this Plan each week').fill('6');
  await page.getByRole('button', { name: 'Review Plan' }).click();
  await page.getByRole('button', { name: 'Create Plan' }).click();
  await page.getByRole('button', { name: 'Return to Today' }).click();
  await page.getByRole('button', { name: 'Mark step complete' }).click();
  await page.getByRole('button', { name: 'Confirm completion' }).click();
  await expect(page.getByText('Today’s step is complete.')).toBeVisible();
}

async function openPlan(page: Page) {
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: /View Plan details|View achievement/ }).click();
  await expect(page.getByRole('heading', { name: planTitle })).toBeVisible();
}

async function reachConsent(page: Page) {
  await page.getByRole('button', { name: 'Finish Plan' }).click();
  await page.getByLabel('Measurable outcome').fill('Released one complete planning journey to a real user.');
  await page.getByLabel('Evidence label').fill('Production acceptance session');
  await page.getByLabel('Secure link · optional').fill('https://example.com/acceptance');
  await page.getByRole('button', { name: 'Continue to reflection' }).click();
  await page.getByLabel('What worked').fill('Small, reviewable releases reached users sooner.');
  await page.getByLabel('What changed').fill('The final journey now records proof.');
  await page.getByRole('button', { name: 'Choose what Clara may reuse' }).click();
}

test('anonymous owner finishes, restores, and revokes exact reuse permission', async ({ page }) => {
  await createCompletedStep(page);
  const navigationMs = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return entry ? entry.domContentLoadedEventEnd - entry.startTime : 0;
  });
  expect(navigationMs).toBeLessThan(3_000);
  await openPlan(page);
  await expect(page.getByText('All required steps complete')).toBeVisible();
  const interactionStarted = Date.now();
  await reachConsent(page);
  expect(Date.now() - interactionStarted).toBeLessThan(5_000);
  await expect(page.getByText('Reuse is off.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Allow Clara to reuse What worked' }).check();
  await page.getByRole('button', { name: 'Review finish' }).click();
  await expect(page.getByText('Clara may reuse').locator('..').getByText('1 statements')).toBeVisible();
  await recordingPause(page);
  const transactionStarted = Date.now();
  await page.getByRole('button', { name: 'Finish and save' }).click();
  await expect(page.getByRole('heading', { name: 'Your completed journey.' })).toBeVisible();
  expect(Date.now() - transactionStarted).toBeLessThan(10_000);
  await expect(page.getByRole('heading', { name: 'Reuse is off.' })).not.toBeVisible();
  await recordingPause(page, 2_000);

  await page.reload();
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await expect(page.getByText('Completed Plans')).toBeVisible();
  await page.getByRole('button', { name: 'View achievement' }).click();
  await expect(page.getByRole('heading', { name: 'Your completed journey.' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop future reuse' }).click();
  await page.getByRole('button', { name: 'Confirm stop future reuse' }).click();
  await expect(page.getByRole('heading', { name: 'Reuse is off.' })).toBeVisible();
  await page.reload();
  await openPlan(page);
  await expect(page.getByRole('heading', { name: 'Reuse is off.' })).toBeVisible();

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
});

test('cancel and offline completion preserve an active Plan without partial writes', async ({ page, context }) => {
  await createCompletedStep(page);
  await openPlan(page);
  await page.getByRole('button', { name: 'Finish Plan' }).click();
  await page.getByLabel('Measurable outcome').fill('Keep this exact unsaved achievement draft.');
  await page.getByRole('button', { name: 'Cancel finishing' }).click();
  await page.getByRole('button', { name: 'Continue finishing' }).click();
  await expect(page.getByLabel('Measurable outcome')).toHaveValue('Keep this exact unsaved achievement draft.');
  await page.getByLabel('Evidence label').fill('Acceptance notes');
  await page.getByRole('button', { name: 'Continue to reflection' }).click();
  await page.getByRole('button', { name: 'Skip reflection' }).click();
  await page.getByRole('button', { name: 'Review finish' }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Finish and save' }).click();
  await expect(page.getByText('You’re offline.')).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await openPlan(page);
  await expect(page.getByRole('button', { name: 'Finish Plan' })).toBeVisible();
});
