import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/mock/admin-directory');
  await expect(page.locator('[data-directory-mock-ready]')).toHaveAttribute(
    'data-directory-mock-ready',
    'true'
  );
  await expect(
    page.getByRole('heading', { name: 'A pulse on local.' })
  ).toBeVisible();
});

test('confirms deactivation, updates counts, and allows reactivation', async ({
  page,
}) => {
  await expect(page.getByTestId('count-all')).toHaveText('12');
  await expect(page.getByTestId('count-new')).toHaveText('5');
  await page
    .getByRole('button', {
      name: 'Deactivate Little River Coffee',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('count-active')).toHaveText('10');
  await page
    .getByRole('button', {
      name: 'Deactivate Little River Coffee',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Deactivate profile', exact: true })
    .click();
  await expect(page.getByTestId('count-active')).toHaveText('9');
  await expect(page.getByTestId('count-inactive')).toHaveText('3');
  await expect(page.getByTestId('count-all')).toHaveText('12');
  await page.getByRole('button', { name: /^Inactive 3$/ }).click();
  await expect(page.getByRole('row')).toHaveCount(4);
  await page
    .getByRole('button', {
      name: 'Reactivate Little River Coffee',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Reactivate profile', exact: true })
    .click();
  await expect(page.getByTestId('count-active')).toHaveText('10');
  await expect(page.getByRole('row')).toHaveCount(3);
});

test('CSV exports all businesses and current statuses regardless of filters', async ({
  page,
}) => {
  await page
    .getByRole('button', {
      name: 'Deactivate Little River Coffee',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Deactivate profile', exact: true })
    .click();
  await page.getByRole('textbox', { name: 'Search businesses' }).fill('Mango');
  await expect(page.getByRole('row')).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download businesses CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    'directory-businesses-MOCK-2026-11-25.csv'
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, 'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(13);
  expect(csv).toContain('"Little River Coffee"');
  expect(csv.split('\r\n')[1]).toMatch(/"Inactive"$/);
  expect(csv).toContain('"Sol, Salt & Co."');
});

test('mobile search, empty state, and reset work without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^New in 30 days 5$/ }).click();
  await expect(page.getByRole('row')).toHaveCount(6);
  await page
    .getByRole('textbox', { name: 'Search businesses' })
    .fill('no such business');
  await expect(
    page.getByText('No businesses match your filters')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('row')).toHaveCount(13);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.getByRole('button', { name: 'Reset mock' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Sample data and filters reset.' })
  ).toBeVisible();
});
