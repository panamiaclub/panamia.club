import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { BUSINESSES, SNAPSHOT_TIME } from '../../app/mock/admin-directory/data';
import { businessCsv } from '../../lib/admin/directory';

async function fixtures(
  page: Page,
  options: { admin?: boolean; many?: boolean; readFails?: boolean } = {}
) {
  let businesses = options.many
    ? Array.from({ length: 28 }, (_, i) => ({
        ...BUSINESSES[0],
        id: `page-${i}`,
        name: `Business ${String(i + 1).padStart(2, '0')}`,
      }))
    : BUSINESSES.map((business) => ({ ...business }));
  let readFails = options.readFails ?? false;
  let writeFails = false;
  let exportFails = false;
  const writes: unknown[] = [];
  let rosterReads = 0;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/get-session') {
      return route.fulfill({
        json: {
          session: {
            id: 'staff-session',
            token: 'staff-token',
            userId: 'staff',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          user: {
            id: 'staff',
            name: 'Staff User',
            email: 'staff@test.invalid',
            emailVerified: true,
            isAdmin: options.admin !== false,
          },
        },
      });
    }
    if (path === '/api/admin/directory') {
      rosterReads++;
      return route.fulfill(
        readFails
          ? { status: 500, json: { error: 'Database unavailable' } }
          : { json: { businesses, asOf: SNAPSHOT_TIME } }
      );
    }
    if (path === '/api/admin/listings') {
      return route.fulfill({ json: { pending: [], decided: [] } });
    }
    if (path === '/api/admin/directory/export') {
      return route.fulfill(
        exportFails
          ? { status: 500, json: { error: 'Export unavailable' } }
          : {
              contentType: 'text/csv; charset=utf-8',
              headers: {
                'Content-Disposition':
                  'attachment; filename="directory-businesses-2026-11-25.csv"',
              },
              body: `\uFEFF${businessCsv(businesses)}`,
            }
      );
    }
    if (/^\/api\/admin\/directory\/[^/]+\/status$/.test(path)) {
      const body = route.request().postDataJSON() as {
        active: boolean;
        expectedActive: boolean;
      };
      writes.push(body);
      if (writeFails)
        return route.fulfill({
          status: 503,
          json: { error: 'Visibility service unavailable.' },
        });
      const id = path.split('/')[4];
      businesses = businesses.map((business) =>
        business.id === id ? { ...business, active: body.active } : business
      );
      return route.fulfill({ json: { success: true, active: body.active } });
    }
    return route.fulfill({ json: {} });
  });
  return {
    writes,
    rosterReads: () => rosterReads,
    failWrites: (value: boolean) => {
      writeFails = value;
    },
    failExport: (value: boolean) => {
      exportFails = value;
    },
    failReads: (value: boolean) => {
      readFails = value;
    },
  };
}

async function open(page: Page) {
  await page.goto('/admin/listings');
  await expect(page.locator('[data-directory-ready]')).toHaveAttribute(
    'data-directory-ready',
    'true'
  );
}

test('live dashboard writes status only on confirmation and retains the review queue', async ({
  page,
}) => {
  const state = await fixtures(page);
  await open(page);
  await expect(page.getByTestId('count-all')).toHaveText('12');
  await expect(page.getByTestId('count-new')).toHaveText('5');
  await expect(page.getByText('Interactive design mock')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Application review' })
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Deactivate Little River Coffee',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.writes).toHaveLength(0);
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
  expect(state.writes).toEqual([{ active: false, expectedActive: true }]);
  await page.reload();
  await expect(page.getByTestId('count-inactive')).toHaveText('3');
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
});

test('failed writes show an error without changing status; retry can succeed', async ({
  page,
}) => {
  const state = await fixtures(page);
  state.failWrites(true);
  await open(page);
  await page
    .getByRole('button', {
      name: 'Deactivate Little River Coffee',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Deactivate profile', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Visibility service unavailable.'
  );
  await expect(page.getByTestId('count-active')).toHaveText('10');
  await expect(
    page.getByRole('button', {
      name: 'Deactivate Little River Coffee',
      exact: true,
    })
  ).toBeEnabled();
  state.failWrites(false);
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
});

test('CSV download ignores table filters and reports export failures', async ({
  page,
}) => {
  const state = await fixtures(page);
  await open(page);
  await expect(page.getByTestId('count-all')).toHaveText('12');
  await page.getByRole('textbox', { name: 'Search businesses' }).fill('Mango');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download businesses CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    'directory-businesses-2026-11-25.csv'
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!, 'utf8')).trim().split('\r\n')).toHaveLength(13);
  state.failExport(true);
  await page.getByRole('button', { name: 'Download businesses CSV' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not export directory businesses.'
  );
});

test('failed loads show unavailable metrics, can retry, and do not export an empty success', async ({
  page,
}) => {
  const state = await fixtures(page, { readFails: true });
  await open(page);
  await expect(page.getByRole('alert')).toContainText(
    'Could not load directory businesses.'
  );
  await expect(page.getByTestId('count-all')).toHaveText('-');
  await expect(
    page.getByRole('button', { name: 'Download businesses CSV' })
  ).toBeDisabled();
  state.failReads(false);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('count-all')).toHaveText('12');
});

test('large rosters paginate and search resets pagination without changing metrics', async ({
  page,
}) => {
  await fixtures(page, { many: true });
  await open(page);
  const table = page.getByRole('table', {
    name: 'Directory businesses, newest first',
  });
  await expect(table.getByRole('row')).toHaveCount(26);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(4);
  await page
    .getByRole('textbox', { name: 'Search businesses' })
    .fill('Business 01');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(page.getByTestId('count-all')).toHaveText('28');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test('non-admin users do not load business data or see export controls', async ({
  page,
}) => {
  const state = await fixtures(page, { admin: false });
  await page.goto('/admin/listings');
  await expect(
    page.getByRole('heading', { name: 'UNAUTHORIZED', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download businesses CSV' })
  ).toHaveCount(0);
  expect(state.rosterReads()).toBe(0);
});
