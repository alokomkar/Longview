import { expect, test } from '@playwright/test';

const acceptanceUrl =
  'http://127.0.0.1:4174/docs/design/longview-hackathon-acceptance-demo.html';

test.beforeEach(async ({ page }) => {
  await page.goto(acceptanceUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('all 56 acceptance cases load an interactive product state', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await expect(page.getByText('0 / 56 reviewed')).toBeVisible();
  await expect(page.locator('.case')).toHaveCount(56);

  for (let index = 0; index < 56; index += 1) {
    await page.locator(`[data-index="${index}"]`).click();
    await expect(page.locator('#prototype')).toHaveAttribute('src', /acceptance=/);
    await expect(page.frameLocator('#prototype').locator('body')).not.toBeEmpty();
  }

  expect(pageErrors).toEqual([]);
});

test('review state persists and risk filters isolate missing P0 cases', async ({ page }) => {
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.getByText('1 / 56 reviewed')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 / 56 reviewed')).toBeVisible();

  await page.getByRole('button', { name: 'Missing', exact: true }).click();
  await page.getByRole('button', { name: 'P0', exact: true }).click();
  await page.getByLabel('Search acceptance cases').fill('stale approval');
  await expect(page.locator('.case')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Stale approval blocked/ })).toBeVisible();
});

test('critical recovery states and mobile layout remain usable', async ({ page }) => {
  await page.getByRole('button', { name: /No working day selected/ }).click();
  await expect(
    page.frameLocator('#prototype').getByText('Longview needs at least one working day')
  ).toBeVisible();

  await page.getByRole('button', { name: /Plan Details/ }).click();
  await expect(page.frameLocator('#prototype').getByText('Why it matters')).toBeVisible();
  await expect(page.frameLocator('#prototype').getByText(/Mon, Tue, Thu/)).toBeVisible();

  await page.getByRole('button', { name: /Stale approval blocked/ }).click();
  await expect(page.frameLocator('#prototype').getByText('This preview is out of date')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
