import { test, expect, type Browser } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  test.skip(
    !test.info().project.name.startsWith('openmls-'),
    'The product Messages UI requires the pinned engine.'
  );
  await request.post('/__e2ee/reset');
});

async function setup(browser: Browser, actor: string, peer: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/api/social/gifs?*', (route) =>
    route.fulfill({ json: { enabled: false, results: [] } })
  );
  await page.route('**/api/social/gifs', (route) =>
    route.fulfill({ json: { enabled: false, results: [] } })
  );
  await page.goto(`/product.html?actor=${actor}&peer=${peer}&view=messages`);
  const ui = page.locator('#product-ui');
  await ui.getByRole('button', { name: 'Set up this device' }).click();
  const key = ui.getByLabel('Personal recovery key', { exact: true });
  await expect(key).not.toHaveValue('');
  await ui
    .getByRole('checkbox', { name: 'I saved this key somewhere safe' })
    .check();
  await ui
    .getByRole('button', { name: 'Enable encrypted DMs for this profile' })
    .click();
  return { context, page, ui };
}

test('existing Messages components enroll devices, verify identities and never send private text/photos through public uploads', async ({
  browser,
  request,
}) => {
  const alice = await setup(browser, 'alice', 'bob');
  const bob = await setup(browser, 'bob', 'alice');
  try {
    const bobKey = await bob.page.evaluate(
      async () =>
        (await window.panaProduct.client.status()).identity!.rootPublicKey
    );
    const aliceKey = await alice.page.evaluate(
      async () =>
        (await window.panaProduct.client.status()).identity!.rootPublicKey
    );
    await expect(bob.page.getByRole('alertdialog')).toBeVisible({
      timeout: 15_000,
    });
    await expect(bob.page.getByRole('alertdialog')).toContainText(aliceKey);
    await bob.page
      .getByRole('button', { name: 'I verified these exact keys' })
      .click();
    await expect(alice.page.getByRole('alertdialog')).toBeVisible({
      timeout: 15_000,
    });
    await expect(alice.page.getByRole('alertdialog')).toContainText(bobKey);
    await alice.page
      .getByRole('button', { name: 'I verified these exact keys' })
      .click();
    const text =
      '<img src=x onerror="window.panaUnexpectedScript=true"> This stays text on the device.';
    await alice.ui.getByLabel('Message bob', { exact: true }).fill(text);
    await alice.ui
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(bob.ui.getByText(text, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await bob.page.evaluate(() => 'panaUnexpectedScript' in window)
    ).toBe(false);
    await bob.ui
      .getByText('Legacy history (not end-to-end encrypted)', { exact: true })
      .click();
    await expect(
      bob.ui.getByText('Synthetic legacy history is server-readable.', {
        exact: true,
      })
    ).toBeVisible();
    await alice.ui.getByLabel('Choose a photo').setInputFiles({
      name: 'private-original-filename.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
    await expect(
      alice.ui.getByRole('button', { name: 'Send message', exact: true })
    ).toBeEnabled();
    await alice.ui
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    const attachment = bob.ui.getByRole('button', {
      name: /Open encrypted attachment: private-original-filename\.jpg/,
    });
    await expect(attachment).toBeVisible({ timeout: 15_000 });
    await attachment.click();
    await expect(
      bob.ui.getByRole('img', {
        name: 'private-original-filename.jpg',
        exact: true,
      })
    ).toHaveAttribute('src', /^blob:/);
    const audit = await (await request.get('/__e2ee/audit')).json();
    expect(JSON.stringify(audit)).not.toContain(text);
    expect(JSON.stringify(audit)).not.toContain('private-original-filename');
    expect(
      audit.some(
        (entry: { path: string }) =>
          entry.path === '/api/social/media' ||
          entry.path === '/api/social/gifs/mirror'
      )
    ).toBe(false);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
