import { test, expect, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

test.beforeEach(async ({ request }) => {
  test.skip(
    !test.info().project.name.startsWith('openmls-'),
    'The product engine is OpenMLS, not the reference.'
  );
  await request.post('/__e2ee/reset');
});

async function device(browser: Browser, actor: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/product.html?actor=${actor}`);
  await expect(page.locator('#status')).toHaveText('Ready');
  const setup = await page.evaluate(() => window.panaProduct.setup());
  expect(setup.approved).toBe(true);
  expect(setup.recoveryKey).toBeTruthy();
  await page.evaluate(() => window.panaProduct.activate());
  return { context, page, key: setup.recoveryKey! };
}
async function open(
  page: Page,
  input:
    { kind: 'dm'; peerActorId: string } | { kind: 'group'; groupId: string }
) {
  const initial = await page.evaluate(
    (input) => window.panaProduct.open(input),
    input
  );
  if ('verification' in initial) {
    const result = await page.evaluate(
      ({ input, participants }) =>
        window.panaProduct.open(
          input,
          participants.map(({ actorId, rootPublicKey }) => ({
            actorId,
            rootPublicKey,
          }))
        ),
      { input, participants: initial.verification }
    );
    if ('verification' in result)
      throw new Error('Explicit participant confirmation did not complete.');
    return result;
  }
  return initial;
}
async function refresh(page: Page, id: string) {
  const initial = await page.evaluate(
    (id) => window.panaProduct.refresh(id),
    id
  );
  if ('verification' in initial) {
    const result = await page.evaluate(
      ({ id, participants }) =>
        window.panaProduct.refresh(
          id,
          participants.map(({ actorId, rootPublicKey }) => ({
            actorId,
            rootPublicKey,
          }))
        ),
      { id, participants: initial.verification }
    );
    if ('verification' in result)
      throw new Error('Explicit participant confirmation did not complete.');
    return result;
  }
  return initial;
}

test('product client enrolls real keys, delivers private text/media through actual API handlers and survives reload', async ({
  browser,
  request,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  try {
    const room = await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(
          id,
          'Only the actual client may read this text'
        ),
      room.room.id
    );
    const received = await open(bob.page, { kind: 'dm', peerActorId: 'alice' });
    expect(received.history.map((entry) => entry.message.content)).toContain(
      'Only the actual client may read this text'
    );
    await bob.page.reload();
    await expect(bob.page.locator('#status')).toHaveText('Ready');
    await bob.page.evaluate(() => window.panaProduct.setup());
    await bob.page.evaluate(
      (id) => window.panaProduct.send(id, 'The persisted ratchet still works'),
      room.room.id
    );
    expect(
      (await refresh(alice.page, room.room.id)).history.map(
        (entry) => entry.message.content
      )
    ).toContain('The persisted ratchet still works');
    await alice.page.evaluate(
      ({ id, bytes }) =>
        window.panaProduct.send(id, 'Private encrypted media delivery', {
          name: 'not-public-location.png',
          type: 'image/png',
          bytes,
        }),
      {
        id: room.room.id,
        bytes: Buffer.from('The private attachment body').toString('base64'),
      }
    );
    const media = await refresh(bob.page, room.room.id);
    const entry = media.history.find(
      (entry) => entry.message.content === 'Private encrypted media delivery'
    );
    expect(entry).toBeTruthy();
    const file = await bob.page.evaluate(
      ({ id, manifest, expiry }) =>
        window.panaProduct.attachment(id, manifest, expiry),
      {
        id: room.room.id,
        manifest: entry!.message.attachments[0],
        expiry: entry!.expiresAt,
      }
    );
    expect(file).toEqual({
      name: 'not-public-location.png',
      text: 'The private attachment body',
    });
    const audit = JSON.stringify(
      await (await request.get('/__e2ee/audit')).json()
    );
    for (const secret of [
      alice.key,
      bob.key,
      'Only the actual client may read this text',
      'The persisted ratchet still works',
      'Private encrypted media delivery',
      'not-public-location.png',
      'The private attachment body',
    ])
      expect(audit).not.toContain(secret);
    const state = JSON.parse(
      (await alice.page.evaluate(() => window.panaProduct.privateState()))!
    );
    expect(audit).not.toContain(state.rootSecret);
    expect(audit).not.toContain(state.native);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test('product recovery uses a personal secret and fresh device identity without restoring live ratchets', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  const replacement = await browser.newContext();
  try {
    const room = await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(id, 'Retained history for the personal backup'),
      room.room.id
    );
    const original = await open(bob.page, { kind: 'dm', peerActorId: 'alice' });
    await bob.page.evaluate(
      (id) => window.panaProduct.backup(id),
      room.room.id
    );
    const old = JSON.parse(
      (await bob.page.evaluate(() => window.panaProduct.privateState()))!
    );
    const page = await replacement.newPage();
    await page.goto('/product.html?actor=bob');
    await expect(page.locator('#status')).toHaveText('Ready');
    const restored = await page.evaluate(
      (key) => window.panaProduct.recover(key),
      bob.key
    );
    expect(restored.identityRestored).toBe(true);
    expect(restored.messagesRestored).toBeGreaterThan(0);
    expect(restored.deviceId).not.toBe(old.identity.deviceId);
    const fresh = JSON.parse(
      (await page.evaluate(() => window.panaProduct.privateState()))!
    );
    expect(fresh.rooms).toHaveLength(0);
    expect(fresh.native).not.toBe(old.native);
    await refresh(alice.page, room.room.id);
    const recovered = await open(page, { kind: 'dm', peerActorId: 'alice' });
    expect(recovered.history.map((entry) => entry.message.content)).toContain(
      'Retained history for the personal backup'
    );
    await page.evaluate(
      (id) =>
        window.panaProduct.send(
          id,
          'A fresh device can send only after a new invitation'
        ),
      original.room.id
    );
    expect(
      (await refresh(alice.page, room.room.id)).history.map(
        (entry) => entry.message.content
      )
    ).toContain('A fresh device can send only after a new invitation');
  } finally {
    await alice.context.close();
    await bob.context.close();
    await replacement.close();
  }
});

test('product group membership excludes pre-join history and blocks a removed participant', async ({
  browser,
  request,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  const carol = await device(browser, 'carol');
  try {
    let room = await open(alice.page, { kind: 'group', groupId: 'garden' });
    await alice.page.evaluate(
      (id) => window.panaProduct.send(id, 'Before the new group member joined'),
      room.room.id
    );
    await open(bob.page, { kind: 'group', groupId: 'garden' });
    await request.post('/__e2ee/group/add-carol');
    room = await refresh(alice.page, room.room.id);
    await alice.page.evaluate(
      (id) => window.panaProduct.send(id, 'After the new member joined'),
      room.room.id
    );
    const joined = await open(carol.page, { kind: 'group', groupId: 'garden' });
    expect(joined.history.map((entry) => entry.message.content)).not.toContain(
      'Before the new group member joined'
    );
    expect(joined.history.map((entry) => entry.message.content)).toContain(
      'After the new member joined'
    );
    await request.post('/__e2ee/group/remove-bob');
    room = await refresh(alice.page, room.room.id);
    await expect(
      bob.page.evaluate((id) => window.panaProduct.refresh(id), room.room.id)
    ).rejects.toThrow();
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(id, 'Only the remaining members receive this'),
      room.room.id
    );
    expect(
      (await refresh(carol.page, room.room.id)).history.map(
        (entry) => entry.message.content
      )
    ).toContain('Only the remaining members receive this');
  } finally {
    await alice.context.close();
    await bob.context.close();
    await carol.context.close();
  }
});

test('a visibly new identity revokes old devices, requires peer re-verification and cannot unlock history without its old personal key', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  try {
    const room = await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(
          id,
          'History remains protected by the earlier personal key'
        ),
      room.room.id
    );
    await open(bob.page, { kind: 'dm', peerActorId: 'alice' });
    await alice.page.evaluate(
      (id) => window.panaProduct.backup(id),
      room.room.id
    );
    const previous = JSON.parse(
      (await alice.page.evaluate(() => window.panaProduct.privateState()))!
    );
    const prepared = await alice.page.evaluate(() =>
      window.panaProduct.client.prepareIdentityReset(true)
    );
    expect(prepared.recoveryKey).not.toBe(alice.key);
    await expect(
      alice.page.evaluate(
        (id) => window.panaProduct.client.commitIdentityReset(id, false),
        prepared.requestId
      )
    ).rejects.toThrow('Save the new personal recovery key');
    const changed = await alice.page.evaluate(
      (id) => window.panaProduct.client.commitIdentityReset(id, true),
      prepared.requestId
    );
    expect(changed.deviceId).not.toBe(previous.identity.deviceId);
    const status = await alice.page.evaluate(() =>
      window.panaProduct.client.status()
    );
    expect(status.identity!.rootVersion).toBe(2);
    expect(
      status.devices.find((entry) => entry.id === previous.identity.deviceId)!
        .revokedAt
    ).not.toBeNull();
    const verification = await bob.page.evaluate(
      (id) => window.panaProduct.refresh(id),
      room.room.id
    );
    expect(
      'verification' in verification &&
        verification.verification.some(
          (entry) =>
            entry.changed && entry.rootPublicKey === prepared.rootPublicKey
        )
    ).toBe(true);
    await refresh(bob.page, room.room.id);
    await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    const recovered = await alice.page.evaluate(
      (key) => window.panaProduct.recover(key),
      alice.key
    );
    expect(recovered.identityRestored).toBe(false);
    expect(recovered.messagesRestored).toBeGreaterThan(0);
    expect(recovered.unavailableBackups).toBeGreaterThan(0);
    expect(
      JSON.parse(
        (await alice.page.evaluate(() => window.panaProduct.privateState()))!
      ).recoveryKey
    ).toBe(prepared.recoveryKey);
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(
          id,
          'Only newly verified devices receive this identity'
        ),
      room.room.id
    );
    expect(
      (await refresh(bob.page, room.room.id)).history.map(
        (entry) => entry.message.content
      )
    ).toContain('Only newly verified devices receive this identity');
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test('lost live room state can start a signed fresh session only after every old approved participant is revoked', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const room = await open(alice.page, { kind: 'group', groupId: 'garden' });
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(
          id,
          'A personally retained earlier group message'
        ),
      room.room.id
    );
    await open(bob.page, { kind: 'group', groupId: 'garden' });
    await alice.page.evaluate(
      (id) => window.panaProduct.backup(id),
      room.room.id
    );
    await bob.page.evaluate(
      (id) => window.panaProduct.backup(id),
      room.room.id
    );
    const oldA = JSON.parse(
      (await alice.page.evaluate(() => window.panaProduct.privateState()))!
    ).identity.deviceId;
    const oldB = JSON.parse(
      (await bob.page.evaluate(() => window.panaProduct.privateState()))!
    ).identity.deviceId;
    const ap = await a.newPage();
    await ap.goto('/product.html?actor=alice');
    const bp = await b.newPage();
    await bp.goto('/product.html?actor=bob');
    await expect(ap.locator('#status')).toHaveText('Ready');
    await expect(bp.locator('#status')).toHaveText('Ready');
    await ap.evaluate((key) => window.panaProduct.recover(key), alice.key);
    await bp.evaluate((key) => window.panaProduct.recover(key), bob.key);
    await expect(
      ap.evaluate(
        (id) => window.panaProduct.client.restartConversation(id, true),
        room.room.id
      )
    ).rejects.toThrow('existing approved participant');
    await ap.evaluate((id) => window.panaProduct.client.revokeDevice(id), oldA);
    await bp.evaluate((id) => window.panaProduct.client.revokeDevice(id), oldB);
    const before = await open(ap, { kind: 'group', groupId: 'garden' });
    expect(before.room.canRestart).toBe(true);
    const restarted = await ap.evaluate(
      (id) => window.panaProduct.restart(id),
      room.room.id
    );
    if ('verification' in restarted)
      await open(ap, { kind: 'group', groupId: 'garden' });
    const after = await refresh(ap, room.room.id);
    expect(after.room.cryptoGroupId).not.toBe(room.room.cryptoGroupId);
    await open(bp, { kind: 'group', groupId: 'garden' });
    await ap.evaluate(
      (id) =>
        window.panaProduct.send(
          id,
          'Fresh room keys, never restored live ratchets'
        ),
      room.room.id
    );
    expect(
      (await refresh(bp, room.room.id)).history.map(
        (entry) => entry.message.content
      )
    ).toContain('Fresh room keys, never restored live ratchets');
    await expect(
      alice.page.evaluate((id) => window.panaProduct.refresh(id), room.room.id)
    ).rejects.toThrow('revoked');
  } finally {
    await alice.context.close();
    await bob.context.close();
    await a.close();
    await b.close();
  }
});

test('a restored old local snapshot is refused before publishing another encrypted message', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  try {
    const room = await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    await open(bob.page, { kind: 'dm', peerActorId: 'alice' });
    const previous = await alice.page.evaluate(() =>
      window.panaProduct.privateState()
    );
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(id, 'Advance the actual private sending state'),
      room.room.id
    );
    await alice.page.evaluate(
      async (previous) =>
        window.panaProduct.client.vault.withLock(async () => {
          const current = await window.panaProduct.client.vault.load();
          await current!.save(previous!, null);
        }),
      previous
    );
    await expect(
      alice.page.evaluate(
        (id) =>
          window.panaProduct.send(
            id,
            'A copied old ratchet must never publish'
          ),
        room.room.id
      )
    ).rejects.toThrow(/rolled back or copied/);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test('an accepted send whose response is lost retries the exact durable ciphertext once', async ({
  browser,
  request,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  try {
    const room = await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    await open(bob.page, { kind: 'dm', peerActorId: 'alice' });
    let aborted = false;
    await alice.page.route(
      `**/api/social/encryption/rooms/${room.room.id}/events`,
      async (route) => {
        if (route.request().method() === 'POST' && !aborted) {
          aborted = true;
          await route.fetch();
          await route.abort('failed');
        } else await route.continue();
      }
    );

    await expect(
      alice.page.evaluate(
        (id) =>
          window.panaProduct.send(
            id,
            'Durable delivery survives a lost acknowledgement'
          ),
        room.room.id
      )
    ).rejects.toThrow();
    await refresh(alice.page, room.room.id);
    const received = await refresh(bob.page, room.room.id);
    expect(
      received.history.filter(
        (entry) =>
          entry.message.content ===
          'Durable delivery survives a lost acknowledgement'
      )
    ).toHaveLength(1);
    const posts = (
      (await (await request.get('/__e2ee/audit')).json()) as Array<{
        method: string;
        path: string;
        body: string;
      }>
    )
      .filter(
        (entry) => entry.method === 'POST' && entry.path.endsWith('/events')
      )
      .map((entry) => JSON.parse(entry.body).input)
      .filter((entry) => entry.kind === 'message');
    expect(posts).toHaveLength(2);
    expect(posts[0]).toEqual(posts[1]);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test('cached history revalidation stays inside signed URL limits and preserves the exact text boundary', async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  try {
    const room = await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    await open(bob.page, { kind: 'dm', peerActorId: 'alice' });
    await alice.page.evaluate(async (id) => {
      await window.panaProduct.send(id, 'x'.repeat(5000));
      for (let index = 0; index < 41; index++)
        await window.panaProduct.send(id, `Retained scoped message ${index}`);
    }, room.room.id);
    await expect(
      alice.page.evaluate(
        (id) => window.panaProduct.send(id, 'x'.repeat(5001)),
        room.room.id
      )
    ).rejects.toThrow('5,000');
    const received = await refresh(bob.page, room.room.id);
    expect(received.history).toHaveLength(42);
    expect(received.history[0].message.content).toHaveLength(5000);
    const audit = (await (await request.get('/__e2ee/audit')).json()) as Array<{
      path: string;
    }>;
    const visibility = audit.filter((entry) =>
      entry.path.includes('/visibility?')
    );
    expect(visibility.length).toBeGreaterThanOrEqual(2);
    for (const entry of visibility)
      expect(entry.path.length).toBeLessThanOrEqual(2048);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test('an invalid private frame quarantines its live room instead of repeatedly consuming ratchet state', async ({
  browser,
}) => {
  const alice = await device(browser, 'alice');
  const bob = await device(browser, 'bob');
  try {
    const room = await open(alice.page, { kind: 'dm', peerActorId: 'bob' });
    await open(bob.page, { kind: 'dm', peerActorId: 'alice' });
    await alice.page.evaluate(
      (id) =>
        window.panaProduct.send(
          id,
          'A genuine private frame, corrupted by the synthetic relay'
        ),
      room.room.id
    );
    let deliveryReads = 0;
    await bob.page.route(
      `**/api/social/encryption/rooms/${room.room.id}/events?*`,
      async (route) => {
        deliveryReads++;
        const response = await route.fetch();
        const value = await response.json();
        for (const entry of value.data.events)
          if (entry.kind === 'message' && entry.frame) {
            const bytes = Buffer.from(entry.frame, 'base64');
            bytes[bytes.length - 1] ^= 1;
            entry.frame = bytes.toString('base64');
            entry.frameSha256 = createHash('sha256')
              .update(bytes)
              .digest('hex');
          }
        await route.fulfill({ json: value });
      }
    );
    await expect(
      bob.page.evaluate((id) => window.panaProduct.refresh(id), room.room.id)
    ).rejects.toThrow('could not authenticate its ordered update');
    const first = deliveryReads;
    await expect(
      bob.page.evaluate((id) => window.panaProduct.refresh(id), room.room.id)
    ).rejects.toThrow('recover onto a fresh device');
    expect(deliveryReads).toBe(first);
    const state = JSON.parse(
      (await bob.page.evaluate(() => window.panaProduct.privateState()))!
    );
    expect(
      state.rooms.find(
        (entry: { roomId: string }) => entry.roomId === room.room.id
      ).blocked
    ).toBeTruthy();
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
