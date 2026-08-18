import { expect, test } from '@playwright/test';

test('offline completion remains visibly pending until verified sync', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#today');
  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Offline completion pending' }).click();

  await expect(page.getByText('Using your last verified day')).toBeVisible();
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('button', { name: 'Save on this device' })).toBeVisible();
  await page.getByRole('button', { name: 'Save on this device' }).click();

  await expect(page.getByRole('heading', { name: 'Saved on this device' })).toBeVisible();
  await expect(page.getByText('Waiting to sync', { exact: true })).toBeVisible();
  await expect(page.getByText('2026-08-02_startup-validation')).toBeVisible();
  await page.getByRole('button', { name: 'Simulate connection return' }).click();
  await expect(page.getByRole('progressbar', { name: 'Syncing completion' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today’s step is complete' })).toBeVisible();
});

test('offline sync exposes retry and duplicate convergence states', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/docs/design/longview-pwa-interactive-mockup.html#today');
  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Pending sync failed' }).click();
  await expect(page.getByRole('heading', { name: 'Still waiting to sync' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try sync again' })).toBeVisible();

  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('button', { name: 'Reconnect found completion' }).click();
  await expect(page.getByRole('heading', { name: 'Progress already saved' })).toBeVisible();
  await expect(page.getByText('No second completion was added and your Plan was not changed.')).toBeVisible();
  await expect(page.getByText('One record')).toBeVisible();
});
