import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { EncryptedApi } from '../lib/e2ee/api';

test('default and explicitly supplied native fetch keep their global receiver', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  async function nativeLikeFetch(
    this: unknown,
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) {
    assert.equal(
      this,
      globalThis,
      'Native fetch requires its global receiver.'
    );
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.cache, 'no-store');
    calls.push(String(input));
    return Response.json({ success: true, data: { ready: true } });
  }
  globalThis.fetch = nativeLikeFetch;
  try {
    for (const transport of [undefined, nativeLikeFetch]) {
      const api = new EncryptedApi(
        { userId: 'owner', profileId: 'personal', actorId: 'alice' },
        transport
      );
      const shape = z.object({ ready: z.literal(true) });
      assert.deepEqual(
        await api.json(shape, 'GET', '/api/social/encryption/devices'),
        { ready: true }
      );
      assert.deepEqual(await api.deviceAction(shape, 'challenge', {}), {
        ready: true,
      });
    }
    assert.equal(calls.length, 4);
  } finally {
    globalThis.fetch = original;
  }
});
