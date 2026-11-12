import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { z } from 'zod';
import { DIRECT_THREAD_REFUSED } from '../lib/dm-refusal';
import { ENCRYPTED_GROUP_CHAT_REQUIRED } from '../lib/chat';
import {
  readStagingState,
  type StagingState,
} from '../scripts/e2ee-staging-config';
import {
  connectStaging,
  resetCheckAccounts,
  stagingSignInUrl,
} from './fixtures';

async function signedIn(
  browser: Browser,
  state: StagingState,
  account: string,
  contexts: BrowserContext[],
  transports: string[],
  blockedExternal: Set<string>
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  contexts.push(context);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin !== state.origin
    ) {
      blockedExternal.add(url.hostname);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await context.routeWebSocket(
    (url) =>
      url.hostname !== '127.0.0.1' || url.port !== new URL(state.origin).port,
    (socket) => {
      blockedExternal.add(new URL(socket.url()).hostname);
      socket.close({ code: 1008, reason: 'Isolated pilot is loopback-only.' });
    }
  );
  context.on('request', (request) => {
    if (
      request.url().startsWith(`${state.origin}/api/`) &&
      ['POST', 'PUT', 'DELETE'].includes(request.method())
    ) {
      const body = request.postData();
      if (body)
        transports.push(`HTTP ${new URL(request.url()).pathname}\n${body}`);
    }
  });
  context.on('page', (page) => {
    page.on('websocket', (socket) => {
      socket.on('framereceived', ({ payload }) => {
        transports.push(
          typeof payload === 'string' ? payload : payload.toString('utf8')
        );
      });
    });
  });
  const page = await context.newPage();
  await page.goto(await stagingSignInUrl(state, account));
  await expect(
    page.getByRole('button', { name: 'Encryption & devices' })
  ).toBeVisible();
  const response = await page.request.get(
    `${state.origin}/api/auth/get-session`
  );
  expect(response.status()).toBe(200);
  const session: unknown = await response.json();
  expect(
    typeof session === 'object' &&
      session !== null &&
      'user' in session &&
      typeof session.user === 'object' &&
      session.user !== null &&
      'id' in session.user &&
      session.user.id === state.accounts[account].userId
  ).toBe(true);
  return page;
}

async function assertMailbox(page: Page, origin: string) {
  const opened = await page.evaluate(
    (origin) =>
      new Promise<boolean>((resolve) => {
        const url = new URL('/ws/dm', origin);
        url.protocol = 'ws:';
        const socket = new WebSocket(url);
        const timeout = setTimeout(() => {
          socket.close();
          resolve(false);
        }, 10_000);
        socket.onopen = () => {
          clearTimeout(timeout);
          socket.close();
          resolve(true);
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      }),
    origin
  );
  expect(opened).toBe(true);
}

async function enableDevice(page: Page) {
  await page.getByRole('button', { name: 'Encryption & devices' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Private messaging devices',
  });
  await dialog
    .getByRole('button', { name: 'Set up this device', exact: true })
    .click();
  await expect(
    dialog.getByRole('textbox', { name: 'Personal recovery key', exact: true })
  ).toBeVisible();
  const recovery = await dialog
    .getByRole('textbox', { name: 'Personal recovery key', exact: true })
    .inputValue();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(recovery)) {
    throw new Error('The pilot recovery-key format is invalid.');
  }
  await dialog
    .getByRole('checkbox', {
      name: 'I saved this key somewhere safe, separate from this device.',
    })
    .check();
  await dialog
    .getByRole('button', {
      name: 'Enable encrypted DMs for this profile',
    })
    .click();
  await expect(
    dialog.getByText('Encrypted DMs are required for this profile.', {
      exact: false,
    })
  ).toBeVisible();
  const root = (await dialog.locator('code').first().textContent())?.trim();
  if (!root || !/^[A-Za-z0-9+/]{43}=$/.test(root)) {
    throw new Error('The pilot public identity format is invalid.');
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  return { recovery, root };
}

async function verify(page: Page, allowed: string[]) {
  const dialog = page.getByRole('alertdialog', {
    name: 'Verify participant encryption identities',
  });
  await expect(dialog).toBeVisible();
  const presented = await dialog.locator('code').allTextContents();
  expect(
    presented.length > 0 &&
      presented.every((key) => allowed.includes(key.trim()))
  ).toBe(true);
  await dialog
    .getByRole('button', {
      name: 'I verified these exact keys',
    })
    .click();
}

async function send(page: Page, content: string) {
  await expect(page.getByRole('textbox', { name: /^Message / })).toBeVisible();
  await page.getByRole('textbox', { name: /^Message / }).fill(content);
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true })
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    page.getByRole('log').getByText(content, { exact: true })
  ).toBeVisible();
}

async function settleConversation(
  page: Page,
  roots: string[],
  readyToSend = false
) {
  await expect
    .poll(
      async () => {
        const dialog = page.getByRole('alertdialog', {
          name: 'Verify participant encryption identities',
        });
        if (await dialog.isVisible()) await verify(page, roots);
        if (readyToSend) {
          const send = page.getByRole('button', {
            name: 'Send message',
            exact: true,
          });
          return (await send.count()) > 0 && (await send.isEnabled());
        }
        return page
          .getByRole('button', { name: 'Save encrypted history backup' })
          .isVisible();
      },
      { timeout: 45_000 }
    )
    .toBe(true);
}

test('real auth, PostgreSQL, Worker and private storage deliver only encrypted chat', async ({
  browser,
}) => {
  const directory = process.env.PANA_E2EE_STAGING_DIRECTORY;
  if (!directory) throw new Error('A managed pilot directory is required.');
  const state = await readStagingState(directory);
  await resetCheckAccounts(state);
  await writeFile(
    path.join(directory, 'pilot.json'),
    JSON.stringify(state, null, 2),
    { mode: 0o600 }
  );
  const contexts: BrowserContext[] = [];
  const transports: string[] = [];
  const blockedExternal = new Set<string>();
  const marker = `PILOT_PRIVATE_TEXT_${state.runId}`;
  const photoStem = `pilot-private-photo-${state.runId}`;
  const groupBefore = `PILOT_GROUP_BEFORE_JOIN_${state.runId}`;
  const groupAfter = `PILOT_GROUP_AFTER_JOIN_${state.runId}`;
  const groupRemoved = `PILOT_GROUP_AFTER_REMOVAL_${state.runId}`;
  const freshMessage = `PILOT_FRESH_DEVICE_${state.runId}`;
  const refusalProbe = `PILOT_REJECTED_LEGACY_${state.runId}`;
  const latenciesMs: number[] = [];
  const start = Date.now();
  const sql = await connectStaging(state);
  let primaryError: unknown;
  try {
    const [network] = await sql<{ unix_socket_directories: string }[]>`
      SHOW unix_socket_directories
    `;
    expect(network.unix_socket_directories).toBe('');
    const alice = await signedIn(
      browser,
      state,
      'check-alice',
      contexts,
      transports,
      blockedExternal
    );
    await test.step('raw Worker mailbox honours real session and rejects a forged profile selection', async () => {
      await assertMailbox(alice, state.origin);
      await alice.context().addCookies([
        {
          name: 'pana_active_profile',
          value: state.accounts['check-bob'].profileId,
          url: state.origin,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      await assertMailbox(alice, state.origin);
      const target = new URL('/api/social/encryption/devices', state.origin);
      target.searchParams.set(
        'profileId',
        state.accounts['check-alice'].profileId
      );
      target.searchParams.set('actorId', state.accounts['check-alice'].actorId);
      const refused = await alice.request.get(target.toString());
      expect(refused.status()).toBe(409);
      expect((await refused.json()).code).toBe('PROFILE_CHANGED');
      await alice.context().clearCookies({ name: 'pana_active_profile' });
      await alice.reload();
    });
    const aliceKeys =
      await test.step('enrol and activate the first real profile', () =>
        enableDevice(alice));
    let bob = await signedIn(
      browser,
      state,
      'check-bob',
      contexts,
      transports,
      blockedExternal
    );
    const bobKeys =
      await test.step('enrol and activate the second real profile', () =>
        enableDevice(bob));
    await Promise.all([
      alice.goto(
        `${state.origin}/messages?to=${state.accounts['check-bob'].actorId}`
      ),
      bob.goto(
        `${state.origin}/messages?to=${state.accounts['check-alice'].actorId}`
      ),
    ]);
    await Promise.all([
      verify(alice, [bobKeys.root]),
      verify(bob, [aliceKeys.root]),
    ]);
    await send(alice, marker);
    await expect(
      bob.getByRole('log').getByText(marker, { exact: true })
    ).toBeVisible();
    await bob.reload();
    await expect(
      bob.getByRole('log').getByText(marker, { exact: true })
    ).toBeVisible();
    await test.step('the held first contact must be accepted before replying', async () => {
      await expect(
        bob.getByRole('button', { name: 'Accept request', exact: true })
      ).toBeVisible();
      await expect(bob.getByRole('textbox', { name: /^Message / })).toHaveCount(
        0
      );
      await bob
        .getByRole('button', { name: 'Accept request', exact: true })
        .click();
      await expect(
        bob.getByRole('textbox', { name: /^Message / })
      ).toBeVisible();
      await send(bob, `${marker}-reciprocal`);
      await expect(
        alice.getByRole('button', { name: 'Accept request', exact: true })
      ).toBeVisible();
      await alice
        .getByRole('button', { name: 'Accept request', exact: true })
        .click();
      await expect(
        alice.getByRole('textbox', { name: /^Message / })
      ).toBeVisible();
    });

    let privateMediaCiphertextBytes = 0;
    await test.step('a real private R2 object decrypts locally and its copied URL is not readable', async () => {
      await alice.getByLabel('Choose a photo').setInputFiles({
        name: `${photoStem}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
          'base64'
        ),
      });
      await expect(
        alice.getByRole('button', { name: 'Send message', exact: true })
      ).toBeEnabled();
      await alice
        .getByRole('button', { name: 'Send message', exact: true })
        .click();
      const attachment = bob.getByRole('button', {
        name: `Open encrypted attachment: ${photoStem}.jpg`,
        exact: true,
      });
      await expect(attachment).toBeVisible();
      const responsePromise = bob.waitForResponse(
        (response) =>
          response
            .url()
            .startsWith(`${state.origin}/api/social/encryption/media/`) &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await attachment.click();
      const response = await responsePromise;
      const image = bob.getByRole('img', {
        name: `${photoStem}.jpg`,
        exact: true,
      });
      await expect(image).toHaveAttribute('src', /^blob:/);
      const clear = await image.evaluate(async (element) => {
        if (!(element instanceof HTMLImageElement))
          throw new Error('Missing local photo.');
        const response = await fetch(element.src);
        return {
          bytes: [...new Uint8Array(await response.arrayBuffer())],
          type: response.headers.get('content-type'),
        };
      });
      expect(clear.type).toBe('image/jpeg');
      const encrypted = await response.body();
      privateMediaCiphertextBytes = encrypted.length;
      expect(encrypted.length).toBe(clear.bytes.length + 16);
      expect(encrypted.equals(Buffer.from(clear.bytes))).toBe(false);
      expect(response.headers()['content-type']).toBe(
        'application/octet-stream'
      );
      expect(response.headers()['cache-control']).toContain('no-store');
      const unsigned = await bob.request.get(response.url(), {
        maxRedirects: 0,
      });
      expect(unsigned.status()).toBe(403);
      expect((await unsigned.json()).code).toBe('DEVICE_APPROVAL_REQUIRED');
      const anonymous = await browser.newContext();
      contexts.push(anonymous);
      const unauthenticated = await anonymous.request.get(response.url(), {
        maxRedirects: 0,
      });
      expect(unauthenticated.status()).toBe(401);
    });

    await test.step('both actual clients publish concurrent ordered ciphertext without duplicate logical messages', async () => {
      await Promise.all(
        [alice, bob].map(async (page, side) => {
          for (let index = 0; index < 5; index++) {
            const before = Date.now();
            await test.step(`client ${side + 1}, ordered send ${index + 1}`, () =>
              send(page, `${marker}-${side}-${index}`));
            latenciesMs.push(Date.now() - before);
          }
        })
      );
      for (let index = 0; index < 5; index++) {
        await expect(
          bob
            .getByRole('log')
            .getByText(`${marker}-0-${index}`, { exact: true })
        ).toBeVisible();
        await expect(
          alice
            .getByRole('log')
            .getByText(`${marker}-1-${index}`, { exact: true })
        ).toBeVisible();
      }
    });

    const [originalDevice] = await sql<{ id: string }[]>`
      SELECT id FROM chat_e2ee_devices
      WHERE profile_id = ${state.accounts['check-alice'].profileId}
        AND revoked_at IS NULL
    `;
    expect(Boolean(originalDevice?.id)).toBe(true);
    const recovered =
      await test.step('sign-in alone cannot read history; the personal key restores history/media but not a live ratchet', async () => {
        await alice
          .getByRole('button', { name: 'Save encrypted history backup' })
          .click();
        await expect(
          alice.getByText(
            'An encrypted backup of retained history was saved.',
            {
              exact: true,
            }
          )
        ).toBeVisible();
        const bobContext = bob.context();
        await bob.close();
        await alice.context().close();
        const recovered = await signedIn(
          browser,
          state,
          'check-alice',
          contexts,
          transports,
          blockedExternal
        );
        await recovered.goto(
          `${state.origin}/messages?to=${state.accounts['check-bob'].actorId}`
        );
        await expect(recovered.getByText(marker, { exact: true })).toHaveCount(
          0
        );
        const region = recovered.getByRole('region', {
          name: 'Open conversation',
        });
        await region
          .getByText('Recover retained encrypted history', { exact: true })
          .click();
        await region
          .getByLabel('Enter personal recovery key', { exact: true })
          .fill(aliceKeys.recovery);
        await region
          .getByRole('button', { name: 'Recover with my key', exact: true })
          .click();
        await settleConversation(recovered, [bobKeys.root]);
        await expect(
          recovered.getByRole('log').getByText(marker, { exact: true })
        ).toBeVisible();
        await expect(
          recovered.getByText(
            'Waiting for an existing participant to invite this device. No earlier group history will be shared.',
            { exact: true }
          )
        ).toBeVisible();
        await recovered
          .getByRole('textbox', { name: /^Message / })
          .fill(freshMessage);
        await expect(
          recovered.getByRole('button', { name: 'Send message', exact: true })
        ).toBeDisabled();
        await recovered
          .getByRole('button', {
            name: `Open encrypted attachment: ${photoStem}.jpg`,
            exact: true,
          })
          .click();
        await expect(
          recovered.getByRole('img', { name: `${photoStem}.jpg`, exact: true })
        ).toHaveAttribute('src', /^blob:/);
        const replacementDevices = await sql<{ id: string }[]>`
        SELECT id FROM chat_e2ee_devices
        WHERE profile_id = ${state.accounts['check-alice'].profileId}
          AND revoked_at IS NULL
      `;
        expect(replacementDevices.length).toBe(2);
        expect(
          replacementDevices.some((device) => device.id !== originalDevice.id)
        ).toBe(true);
        bob = await bobContext.newPage();
        await bob.goto(
          `${state.origin}/messages?to=${state.accounts['check-alice'].actorId}`
        );
        await settleConversation(recovered, [bobKeys.root], true);
        await send(recovered, freshMessage);
        await expect(
          bob.getByRole('log').getByText(freshMessage, { exact: true })
        ).toBeVisible();
        return recovered;
      });

    await test.step('the recovered owner revokes the lost device and active rooms rekey', async () => {
      await recovered
        .getByRole('button', { name: 'Encryption & devices' })
        .click();
      const dialog = recovered.getByRole('dialog', {
        name: 'Private messaging devices',
      });
      const lost = dialog
        .locator('section > div')
        .filter({ hasText: originalDevice.id });
      await lost
        .getByRole('button', { name: 'Revoke device', exact: true })
        .click();
      await lost
        .getByRole('button', { name: 'Confirm revocation', exact: true })
        .click();
      await expect(
        dialog.getByText(
          'Device revoked. Active conversations must rekey before sending.',
          { exact: true }
        )
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      const [old] = await sql<{ revoked: boolean }[]>`
        SELECT revoked_at IS NOT NULL AS revoked FROM chat_e2ee_devices
        WHERE id = ${originalDevice.id}
      `;
      expect(old.revoked).toBe(true);
    });

    const groupUrl = `${state.origin}/messages?group=${state.groups.check.handle}`;
    await test.step('the existing private-group UI explicitly activates encrypted chat', async () => {
      await recovered.goto(groupUrl);
      await recovered
        .getByRole('button', {
          name: 'Enable encrypted group chat',
          exact: true,
        })
        .click();
      await recovered
        .getByRole('button', {
          name: 'Require encryption for new chat',
          exact: true,
        })
        .click();
      await settleConversation(recovered, [bobKeys.root]);
      await bob.goto(groupUrl);
      await settleConversation(bob, [aliceKeys.root]);
      await send(recovered, groupBefore);
      await expect(
        bob.getByRole('log').getByText(groupBefore, { exact: true })
      ).toBeVisible();
    });

    const carol = await signedIn(
      browser,
      state,
      'check-carol',
      contexts,
      transports,
      blockedExternal
    );
    const carolKeys = await enableDevice(carol);
    const roots = [aliceKeys.root, bobKeys.root, carolKeys.root];
    let membershipId = '';
    await test.step('real membership approval invites a new member to future messages only', async () => {
      const requested = await carol.request.post(
        `${state.origin}/api/social/groups/${state.groups.check.handle}/join`,
        { headers: { Origin: state.origin }, maxRedirects: 0 }
      );
      expect(requested.status()).toBe(200);
      const result = z
        .object({
          success: z.literal(true),
          data: z.object({
            membership: z.object({
              id: z.string(),
              status: z.literal('pending'),
            }),
            pending: z.literal(true),
          }),
        })
        .parse(await requested.json());
      membershipId = result.data.membership.id;
      const approval = await recovered.request.patch(
        `${state.origin}/api/social/groups/${state.groups.check.handle}/members/${membershipId}`,
        {
          data: { action: 'approve' },
          headers: { Origin: state.origin },
          maxRedirects: 0,
        }
      );
      expect(approval.status()).toBe(200);
      await carol.goto(groupUrl);
      await Promise.all([
        verify(recovered, roots),
        verify(bob, roots),
        verify(carol, roots),
      ]);
      await settleConversation(carol, roots);
      await expect(carol.getByText(groupBefore, { exact: true })).toHaveCount(
        0
      );
      await send(recovered, groupAfter);
      await expect(
        carol.getByRole('log').getByText(groupAfter, { exact: true })
      ).toBeVisible();
      await send(carol, `${groupAfter}-reply`);
      await expect(
        bob.getByRole('log').getByText(`${groupAfter}-reply`, { exact: true })
      ).toBeVisible();
    });

    await test.step('removal freezes the old epoch and prevents future delivery to the removed member', async () => {
      const removal = await recovered.request.patch(
        `${state.origin}/api/social/groups/${state.groups.check.handle}/members/${membershipId}`,
        {
          data: { action: 'remove' },
          headers: { Origin: state.origin },
          maxRedirects: 0,
        }
      );
      expect(removal.status()).toBe(200);
      await send(recovered, groupRemoved);
      await expect(
        bob.getByRole('log').getByText(groupRemoved, { exact: true })
      ).toBeVisible();
      await expect(carol.getByText(groupRemoved, { exact: true })).toHaveCount(
        0
      );
      const denied = await carol.request.get(
        `${state.origin}/api/social/groups/${state.groups.check.handle}/chat`,
        { maxRedirects: 0 }
      );
      expect(denied.status()).toBe(404);
    });

    await test.step('the real legacy HTTP boundaries cannot downgrade encrypted DMs or group chat', async () => {
      const direct = await recovered.request.post(
        `${state.origin}/api/social/statuses`,
        {
          data: {
            content: refusalProbe,
            visibility: 'direct',
            recipientActorIds: [state.accounts['check-bob'].actorId],
          },
          headers: { Origin: state.origin },
          maxRedirects: 0,
        }
      );
      expect(direct.status()).toBe(400);
      expect((await direct.json()).error).toBe(DIRECT_THREAD_REFUSED);
      const group = await recovered.request.post(
        `${state.origin}/api/social/groups/${state.groups.check.handle}/chat`,
        {
          data: { content: refusalProbe, clientId: crypto.randomUUID() },
          headers: { Origin: state.origin },
          maxRedirects: 0,
        }
      );
      expect(group.status()).toBe(409);
      expect((await group.json()).error).toBe(ENCRYPTED_GROUP_CHAT_REQUIRED);
    });

    const privateValues = [
      marker,
      photoStem,
      freshMessage,
      groupBefore,
      groupAfter,
      groupRemoved,
      aliceKeys.recovery,
      bobKeys.recovery,
      carolKeys.recovery,
    ];
    for (const privateValue of [...privateValues, refusalProbe]) {
      expect(transports.some((body) => body.includes(privateValue))).toBe(
        false
      );
    }
    expect(
      transports.some(
        (body) =>
          body.startsWith('HTTP /api/social/media\n') ||
          body.startsWith('HTTP /api/social/gifs/mirror\n')
      )
    ).toBe(false);
    const hintSchema = z
      .object({
        type: z.literal('encrypted'),
        roomId: z.string().uuid(),
        kind: z.enum(['message', 'membership', 'delete']),
        at: z.number(),
      })
      .strict();
    let encryptedMessageHints = 0;
    for (const frame of transports.filter(
      (value) => !value.startsWith('HTTP ')
    )) {
      if (frame === 'pong') continue;
      const value: unknown = JSON.parse(frame);
      if (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === 'encrypted'
      ) {
        const hint = hintSchema.parse(value);
        if (hint.kind === 'message') encryptedMessageHints++;
      }
    }
    expect(encryptedMessageHints).toBeGreaterThan(0);

    for (const table of [
      'chat_e2ee_identities',
      'chat_e2ee_devices',
      'chat_e2ee_enrollments',
      'chat_e2ee_key_packages',
      'chat_e2ee_events',
      'chat_e2ee_welcomes',
      'chat_e2ee_media',
      'chat_e2ee_backups',
      'chat_e2ee_backup_media',
      'social_statuses',
      'social_group_chat_messages',
    ]) {
      for (const privateValue of privateValues) {
        const [result] = await sql.unsafe<{ count: number }[]>(
          `SELECT count(*)::int AS count FROM "${table}" AS capture
           WHERE strpos(to_jsonb(capture)::text, $1) > 0`,
          [privateValue]
        );
        expect(result.count, `Private material was stored in ${table}.`).toBe(
          0
        );
      }
    }
    const [events] = await sql<{ count: number; bytes: number }[]>`
      SELECT count(*)::int AS count,
        coalesce(sum(octet_length(decode(frame, 'base64'))), 0)::int AS bytes
      FROM chat_e2ee_events
      WHERE kind = 'message' AND sender_actor_id IN (
        ${state.accounts['check-alice'].actorId},
        ${state.accounts['check-bob'].actorId},
        ${state.accounts['check-carol'].actorId}
      )
    `;
    expect(events.count).toBe(18);
    const [demos] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM social_actors
      WHERE username LIKE 'stage-demo-%' AND encrypted_chat_required
    `;
    expect(demos.count).toBe(0);
    await writeFile(
      path.join(directory, 'pilot-results.json'),
      JSON.stringify(
        {
          sourceCommit: state.sourceCommit,
          sourceDirty: state.sourceDirty,
          scenarioSha256: createHash('sha256')
            .update(
              await readFile(
                new URL('./encrypted-messaging.spec.ts', import.meta.url)
              )
            )
            .digest('hex'),
          qualifiedWasmSha256: createHash('sha256')
            .update(
              await readFile(
                path.join(
                  directory,
                  'app',
                  'crypto',
                  'openmls',
                  'pkg',
                  'pana_openmls_bg.wasm'
                )
              )
            )
            .digest('hex'),
          realBetterAuthSessions: true,
          realPostgreSQL: true,
          postgresNetwork: 'loopback-tcp-only',
          fullBuiltWorker: true,
          transportContainsPrivateTextOrRecoveryKeys: false,
          plaintextLegacyRows: 0,
          browserReloadRetainsHistory: true,
          heldRequestAcceptedBeforeReply: true,
          privateMediaCiphertextBytes,
          copiedMediaUrlDenied: true,
          concurrentSends: latenciesMs.length,
          localSendRoundTripsMs: latenciesMs,
          recoveryRequiresPersonalKey: true,
          recoveryUsesFreshDevice: true,
          retainedMediaRestoredBeforeNewInvitation: true,
          lostDeviceRevoked: true,
          newGroupMemberHasNoPreJoinHistory: true,
          removedMemberDeniedFutureDelivery: true,
          legacyPlaintextDowngradesRejected: true,
          encryptedMessageHints,
          opaqueApplicationFrames: events.count,
          opaqueApplicationBytes: events.bytes,
          manualDemoAccountsUntouched: true,
          blockedExternalHosts: [...blockedExternal].sort(),
          elapsedMs: Date.now() - start,
        },
        null,
        2
      )
    );
  } catch (error) {
    primaryError = error;
    const diagnosticsErrors: unknown[] = [];
    let index = 0;
    for (const context of contexts) {
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        try {
          await page.evaluate(() => {
            for (const element of document.querySelectorAll(
              '[data-private], input, textarea'
            )) {
              element.setAttribute('aria-hidden', 'true');
            }
          });
          const snapshot = (await page.locator('body').ariaSnapshot()).replace(
            /(^|[^A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{43,}={0,2}(?=$|[^A-Za-z0-9+/_=-])/g,
            '$1[redacted]'
          );
          await writeFile(
            path.join(directory, `redacted-ui-${index++}.txt`),
            snapshot,
            { mode: 0o600 }
          );
        } catch (diagnosticsError) {
          if (!page.isClosed()) diagnosticsErrors.push(diagnosticsError);
        }
      }
    }
    if (diagnosticsErrors.length) {
      primaryError = new AggregateError(
        [error, ...diagnosticsErrors],
        'The pilot failed and a redacted diagnostic could not be captured.'
      );
    }
    throw primaryError;
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      cleanupErrors.push(error);
    }
    for (const context of contexts) {
      if (!browser.isConnected() || !browser.contexts().includes(context))
        continue;
      try {
        await context.close();
      } catch (error) {
        if (browser.isConnected() && browser.contexts().includes(context)) {
          cleanupErrors.push(error);
        }
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
        'Pilot browser cleanup failed.'
      );
    }
  }
});
