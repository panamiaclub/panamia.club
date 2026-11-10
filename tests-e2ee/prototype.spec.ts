import {
  test,
  expect,
  devices,
  type Browser,
  type Page,
} from '@playwright/test';

async function click(page: Page, id: string) {
  const button = page.locator(`#${id}`);
  await button.click();
  await expect(button).toBeEnabled();
  await expect(page.locator('#status')).toContainText(`Completed: ${id}.`);
  await expect(page.locator('#error')).toBeEmpty();
}

async function device(
  browser: Browser,
  actor: string,
  phone = test.info().project.name === 'webkit-phone'
) {
  const context = await browser.newContext(
    phone ? { ...devices['iPhone 13'] } : { ...devices['Desktop Chrome'] }
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() !== 'GET')
      errors.push(`Unexpected network write: ${request.url()}`);
  });
  await page.goto('/');
  await page.locator('#actor').fill(actor);
  await click(page, 'open');
  return { context, page, errors };
}

async function trust(page: Page, other: Page) {
  await page
    .locator('#peer')
    .fill(await other.locator('#contact').inputValue());
  await click(page, 'inspect');
  await expect(page.locator('#fingerprint')).toContainText('fingerprint');
  await click(page, 'trust');
}

async function send(from: Page, to: Page, content: string) {
  await from.locator('#message').fill(content);
  await click(from, 'send');
  const envelope = await from.locator('#outgoing').inputValue();
  expect(envelope).not.toContain(content);
  await to.locator('#incoming').fill(envelope);
  await click(to, 'receive');
  await expect(to.locator('#history')).toContainText(content);
  return envelope;
}

test('independent browser devices exchange MLS text/media, survive reload and recover without cloning keys', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  try {
    await trust(alice.page, bob.page);
    await trust(bob.page, alice.page);
    await click(alice.page, 'create');
    await click(alice.page, 'invite');
    await bob.page
      .locator('#welcome')
      .fill(await alice.page.locator('#welcome').inputValue());
    await click(bob.page, 'join');
    await send(alice.page, bob.page, 'Only the browser peers should read this');
    await bob.page.reload();
    await bob.page.locator('#actor').fill('bob');
    await click(bob.page, 'open');
    await expect(bob.page.locator('#history')).toContainText(
      'Only the browser peers should read this'
    );
    await send(bob.page, alice.page, 'Ratchet survived a reload');
    await click(bob.page, 'stored');
    await expect(bob.page.locator('#storage')).not.toContainText(
      'Ratchet survived a reload'
    );
    await expect(bob.page.locator('#storage')).toContainText('ciphertext');

    await alice.page.locator('#file').setInputFiles({
      name: 'private-fixture.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('The attachment must also stay private'),
    });
    await send(alice.page, bob.page, 'An encrypted attachment');
    expect(await alice.page.locator('#outgoing').inputValue()).not.toContain(
      'private-fixture.txt'
    );
    const downloading = bob.page.waitForEvent('download');
    await click(bob.page, 'download');
    const downloaded = await downloading;
    expect(downloaded.suggestedFilename()).toBe('private-fixture.txt');
    const stream = await downloaded.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe(
      'The attachment must also stay private'
    );

    await click(bob.page, 'key');
    const recoveryKey = await bob.page.locator('#recovery').inputValue();
    await click(bob.page, 'backup');
    const backup = await bob.page.locator('#archive').inputValue();
    expect(backup).not.toContain('Only the browser peers should read this');
    expect(backup).not.toContain(recoveryKey);
    const oldDevice = JSON.parse(
      await bob.page.locator('#device').innerText()
    ).device;
    await click(bob.page, 'forget');
    const replacement = JSON.parse(
      await bob.page.locator('#device').innerText()
    ).device;
    expect(replacement).not.toBe(oldDevice);
    await expect(bob.page.locator('#history')).not.toContainText(
      'Only the browser peers should read this'
    );
    await bob.page.locator('#recovery').fill(recoveryKey);
    await bob.page.locator('#archive').fill(backup);
    await click(bob.page, 'restore');
    await expect(bob.page.locator('#history')).toContainText(
      'Only the browser peers should read this'
    );
    await expect(bob.page.locator('#room')).toContainText('"room": null');
    expect(alice.errors).toEqual([]);
    expect(bob.errors).toEqual([]);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test('three independent devices enforce join-time history and removal', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  const carol = await device(browser, 'carol');
  try {
    await trust(alice.page, bob.page);
    await trust(bob.page, alice.page);
    await click(alice.page, 'create');
    await click(alice.page, 'invite');
    await bob.page
      .locator('#welcome')
      .fill(await alice.page.locator('#welcome').inputValue());
    await click(bob.page, 'join');
    const old = await send(alice.page, bob.page, 'Before Carol joined');
    await trust(alice.page, carol.page);
    await trust(bob.page, carol.page);
    await trust(carol.page, alice.page);
    await trust(carol.page, bob.page);
    await alice.page
      .locator('#peer')
      .fill(await carol.page.locator('#contact').inputValue());
    await click(alice.page, 'invite');
    await bob.page
      .locator('#commit')
      .fill(await alice.page.locator('#commit').inputValue());
    await click(bob.page, 'apply');
    await carol.page
      .locator('#welcome')
      .fill(await alice.page.locator('#welcome').inputValue());
    await click(carol.page, 'join');
    await carol.page.locator('#incoming').fill(old);
    await carol.page.locator('#receive').click();
    await expect(carol.page.locator('#error')).not.toBeEmpty();
    const fresh = await send(alice.page, carol.page, 'After Carol joined');
    await bob.page.locator('#incoming').fill(fresh);
    await click(bob.page, 'receive');
    await expect(carol.page.locator('#history')).not.toContainText(
      'Before Carol joined'
    );
    const bobDevice = JSON.parse(
      await bob.page.locator('#device').innerText()
    ).device;
    await alice.page.locator('#member').selectOption(bobDevice);
    await click(alice.page, 'remove');
    const removal = await alice.page.locator('#commit').inputValue();
    await carol.page.locator('#commit').fill(removal);
    await click(carol.page, 'apply');
    await bob.page.locator('#commit').fill(removal);
    await click(bob.page, 'apply');
    const afterRemoval = await send(
      alice.page,
      carol.page,
      'After Bob was removed'
    );
    await bob.page.locator('#incoming').fill(afterRemoval);
    await bob.page.locator('#receive').click();
    await expect(bob.page.locator('#error')).not.toBeEmpty();
    await expect(bob.page.locator('#history')).not.toContainText(
      'After Bob was removed'
    );
    expect([...alice.errors, ...bob.errors, ...carol.errors]).toEqual([]);
  } finally {
    await alice.context.close();
    await bob.context.close();
    await carol.context.close();
  }
});

test('same-profile tabs serialize ratchet updates and keep the wrapping key non-extractable', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  try {
    await click(alice.page, 'create');
    const second = await alice.context.newPage();
    await second.goto('/');
    await click(second, 'open');
    await Promise.all([
      alice.page.locator('#message').fill('First concurrent tab'),
      second.locator('#message').fill('Second concurrent tab'),
    ]);
    await Promise.all([click(alice.page, 'send'), click(second, 'send')]);
    await click(alice.page, 'open');
    await expect(alice.page.locator('#history')).toContainText(
      'First concurrent tab'
    );
    await expect(alice.page.locator('#history')).toContainText(
      'Second concurrent tab'
    );
    const extractable = await alice.page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('pana-e2ee-prototype-v1', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      try {
        const key = await new Promise<CryptoKey>((resolve, reject) => {
          const request = db
            .transaction('records')
            .objectStore('records')
            .get('key:alice');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        return key.extractable;
      } finally {
        db.close();
      }
    });
    expect(extractable).toBe(false);
    expect(alice.errors).toEqual([]);
  } finally {
    await alice.context.close();
  }
});

test('desktop Chromium and phone WebKit devices interoperate', async ({
  browser,
  browserName,
  playwright,
}) => {
  test.skip(browserName !== 'chromium', 'Run this cross-engine scenario once.');
  const safari = await playwright.webkit.launch();
  const alice = await device(browser, 'alice');
  const bob = await device(safari, 'bob', true);
  try {
    await trust(alice.page, bob.page);
    await trust(bob.page, alice.page);
    await click(alice.page, 'create');
    await click(alice.page, 'invite');
    await bob.page
      .locator('#welcome')
      .fill(await alice.page.locator('#welcome').inputValue());
    await click(bob.page, 'join');
    await send(alice.page, bob.page, 'Desktop to phone engine');
    await send(bob.page, alice.page, 'Phone engine to desktop');
    expect([...alice.errors, ...bob.errors]).toEqual([]);
  } finally {
    await alice.context.close();
    await bob.context.close();
    await safari.close();
  }
});
