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
  await expect(page.getByLabel('Current section: Plans')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Plans', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Create first Plan' }).click();
  await expect(page.getByText('Plans / Create Plan')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Plans' })).toBeVisible();
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

test('owner captures research, confirms Clara matching, writes a cited Wiki, and promotes a Plan Brief', async ({ page }) => {
  await page.route('http://127.0.0.1:9999/v1/clara/plan-matches', async route => {
    const request = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      schemaVersion: 1,
      requestId: request.requestId,
      requiresClarification: false,
      summary: 'This source most strongly supports the active release Plan.',
      candidates: [{ planId: request.plans[0].id, score: 91, confidence: 'high', rationale: 'Both focus on releasing one tested planning journey.' }]
    }) });
  });
  await createCompletedStep(page);
  await openPlan(page);

  await page.getByRole('button', { name: 'Add a source' }).click();
  await page.getByLabel('Source URL').fill('https://example.com/complete-research-workspace?utm_source=e2e');
  await page.getByLabel('Title').fill('Evidence for one useful release');
  await page.getByLabel('Useful excerpt').fill('A visible, tested release creates stronger evidence than an unfinished prototype.');
  await page.getByLabel('Topic or question').fill('First useful release');
  await page.getByLabel('Why it matters').fill('Use this evidence to keep the release focused.');
  await page.getByRole('button', { name: 'Ask Clara to suggest Plans' }).click();
  await expect(page.getByText('Review Clara’s suggestion.')).toBeVisible();
  await page.getByRole('button', { name: 'Review source and associations' }).click();
  await page.getByRole('button', { name: 'Save source' }).click();
  await expect(page.getByText('Source saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Move to Useful' }).click();
  await page.getByRole('button', { name: 'Confirm changes' }).click();
  await expect(page.getByText('Useful · saved by you')).toBeVisible();
  await page.getByRole('tab', { name: /Plan Wiki/ }).click();
  await page.getByRole('button', { name: 'Create Wiki page' }).click();
  await page.getByLabel('Page title').fill('Why one complete release comes first');
  await page.getByLabel('Your synthesis').fill('Ship and observe one complete journey before expanding the product surface.');
  await page.getByRole('button', { name: 'Review Wiki revision' }).click();
  await page.getByRole('button', { name: 'Save Wiki revision' }).click();
  await expect(page.getByText('Wiki revision saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Promote to Plan Brief' }).click();
  await page.getByRole('button', { name: 'Review Plan Brief proposal' }).click();
  await page.getByRole('button', { name: 'Save Plan Brief version 1' }).click();
  await expect(page.getByText('Plan Brief version saved.')).toBeVisible();
});
