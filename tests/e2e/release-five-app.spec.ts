import { expect, test, type Page, type Route } from '@playwright/test';

type ResearchMode = 'success' | 'malformed' | 'timeout' | 'unavailable' | 'offline' | 'delayed';

const planTitle = 'Release trustworthy research memory';
const researchTitle = 'Visible first value improves activation';
const recordingPause = async (page: Page, milliseconds = 1_500) => {
  if (process.env.LONGVIEW_RECORDING) await page.waitForTimeout(milliseconds);
};

async function createPlan(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue anonymously' }).click();
  await page.getByRole('button', { name: 'Continue setup' }).click();
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'Create first Plan' }).click();
  await page.getByLabel('Plan title').fill(planTitle);
  await page.getByLabel('Desired outcome').fill('Release a reviewed Plan Brief that restores across browser sessions.');
  await page.getByLabel('Why this matters').fill('Evidence should improve the Plan without silently replacing approved context.');
  await page.getByLabel('Target date').fill('2026-09-30');
  await page.getByLabel('Hours for this Plan each week').fill('6');
  await page.getByRole('button', { name: 'Review Plan' }).click();
  await page.getByRole('button', { name: 'Create Plan' }).click();
  await page.getByRole('button', { name: 'Return to Today' }).click();
  await openPlan(page);
}

async function openPlan(page: Page) {
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'View Plan details' }).click();
  await expect(page.getByRole('heading', { name: 'Turn reviewed evidence into a Plan Brief.' })).toBeVisible();
}

async function answerResearch(route: Route, mode: ResearchMode) {
  if (mode === 'timeout') return route.fulfill({ status: 504, body: '' });
  if (mode === 'unavailable') return route.fulfill({ status: 503, body: '' });
  if (mode === 'offline') return route.abort('internetdisconnected');
  const request = route.request().postDataJSON();
  if (mode === 'delayed') await new Promise(resolve => setTimeout(resolve, 700));
  const card = {
    schemaVersion: 1,
    researchId: `research-${request.requestId.slice(0, 24)}`,
    requestId: request.requestId,
    sourcePlanId: request.plan.id,
    headline: researchTitle,
    finding: 'Users continue setup after seeing one meaningful outcome backed by an attributed source.',
    source: mode === 'malformed'
      ? { kind: 'web', title: 'Broken source', locator: 'missing-scheme', domain: null, publishedAt: null, retrievedAt: new Date().toISOString() }
      : { kind: 'web', title: 'Activation research', locator: 'https://example.com/research', domain: 'example.com', publishedAt: null, retrievedAt: new Date().toISOString(), searchQueries: ['activation research'] }
  };
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, requestId: request.requestId, sourcePlanId: request.plan.id, cards: [card] })
  });
}

test('anonymous owner reviews evidence, versions a brief, restores it, and protects a stale tab', async ({ page, context }) => {
  let mode: ResearchMode = 'success';
  await page.route('http://127.0.0.1:9999/v1/clara/research', route => answerResearch(route, mode));
  await recordingPause(page, 8_000);
  await createPlan(page);

  await page.getByRole('button', { name: 'Find new research' }).click();
  await expect(page.getByRole('heading', { name: researchTitle })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Activation research' })).toHaveAttribute('href', 'https://example.com/research');
  await expect(page.getByText('Google Search suggestions: activation research')).toBeVisible();
  await recordingPause(page);
  for (const [action, confirmation, state] of [
    ['Not now', 'Confirm not now', /Not now · revision 1/],
    ['Reject', 'Confirm rejected', /Rejected · revision 2/],
    ['Accept', 'Confirm accepted', /Accepted · revision 3/]
  ] as const) {
    await page.getByRole('button', { name: action, exact: true }).click();
    await page.getByRole('button', { name: confirmation }).click();
    await expect(page.getByText(state)).toBeVisible();
    await recordingPause(page);
  }

  await page.getByRole('button', { name: /Prepare Plan Brief from 1 accepted card/ }).click();
  await page.getByLabel('Focus').fill('Prove repeatable first value');
  await page.getByRole('button', { name: 'Review Plan Brief' }).click();
  await page.getByRole('button', { name: 'Save version 1' }).click();
  await expect(page.getByText('Plan Brief saved.')).toBeVisible();
  await recordingPause(page, 2_000);
  await page.getByRole('tab', { name: 'Version history' }).click();
  await expect(page.getByText('Version 1 · current')).toBeVisible();

  await page.reload();
  await openPlan(page);
  await page.getByRole('tab', { name: 'Current Plan Brief' }).click();
  await expect(page.getByRole('heading', { name: 'Prove repeatable first value' })).toBeVisible();
  await recordingPause(page);

  const second = await context.newPage();
  await second.goto('/');
  await openPlan(second);
  await second.getByRole('tab', { name: 'Current Plan Brief' }).click();
  await second.getByRole('button', { name: 'Prepare a new version' }).click();
  await second.getByLabel('Focus').fill('Second tab owns version two');
  await second.getByRole('button', { name: 'Review Plan Brief' }).click();

  await page.getByRole('button', { name: 'Prepare a new version' }).click();
  await page.getByLabel('Focus').fill('Stale first tab proposal');
  await page.getByRole('button', { name: 'Review Plan Brief' }).click();
  await second.getByRole('button', { name: 'Save version 2' }).click();
  await expect(second.getByText('Plan Brief saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Save version 2' }).click();
  await expect(page.getByText('A newer Plan Brief already exists.')).toBeVisible();
  await page.getByRole('button', { name: 'View current version' }).click();
  await expect(page.getByRole('heading', { name: 'Second tab owns version two' })).toBeVisible();
  await recordingPause(page, 2_000);

  mode = 'malformed';
  await page.getByRole('button', { name: 'Find new research' }).click();
  await expect(page.getByText('This research could not be used.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  mode = 'timeout';
  await page.getByRole('button', { name: 'Find new research' }).click();
  await expect(page.getByText('Research took too long.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  mode = 'unavailable';
  await page.getByRole('button', { name: 'Find new research' }).click();
  await expect(page.getByText('Research is unavailable.')).toBeVisible();
  await recordingPause(page, 2_000);

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
});

test('cancel and offline failures do not write research or a brief', async ({ page, context }) => {
  let mode: ResearchMode = 'delayed';
  await page.route('http://127.0.0.1:9999/v1/clara/research', route => answerResearch(route, mode));
  await createPlan(page);
  await page.getByRole('button', { name: 'Find new research' }).click();
  await expect(page.getByRole('progressbar', { name: 'Finding attributed research' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel research' }).click();
  await expect(page.getByText(researchTitle)).not.toBeVisible();

  await context.setOffline(true);
  mode = 'offline';
  await page.getByRole('button', { name: 'Find new research' }).click();
  await expect(page.getByText('You’re offline.')).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('tab', { name: 'Current Plan Brief' }).click();
  await expect(page.getByText('No Plan Brief version has been approved yet.')).toBeVisible();
});
