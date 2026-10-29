import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDmStream, notifyGroupChatEvent } from '@/lib/dm-stream';

function stateFor(sent: Record<string, unknown>[]) {
  return {
    setWebSocketAutoResponse() {},
    acceptWebSocket() {},
    getWebSockets: () => [
      {
        send: (message: string) => {
          sent.push(JSON.parse(message));
        },
      },
    ],
  };
}
// Workers use a separate runtime/type environment, intentionally excluded
// from tsconfig.json. Exercise its real code through the HTTP/state boundary.
const workerUrl = new URL('../worker/dm-stream.ts', import.meta.url).href;
const {
  DmStream,
}: {
  DmStream: new (
    state: ReturnType<typeof stateFor>,
    env: unknown
  ) => { fetch(request: Request): Promise<Response> };
} = await import(workerUrl);

const originalPair = Object.getOwnPropertyDescriptor(
  globalThis,
  'WebSocketRequestResponsePair'
);
before(() => {
  Object.defineProperty(globalThis, 'WebSocketRequestResponsePair', {
    configurable: true,
    value: class {
      constructor(
        public request: string,
        public response: string
      ) {}
    },
  });
});
after(() => {
  if (originalPair)
    Object.defineProperty(
      globalThis,
      'WebSocketRequestResponsePair',
      originalPair
    );
  else Reflect.deleteProperty(globalThis, 'WebSocketRequestResponsePair');
});

function mailbox() {
  const sent: Record<string, unknown>[] = [];
  const stream = new DmStream(stateFor(sent), {});
  return {
    sent,
    post: (value: unknown) =>
      stream.fetch(
        new Request('https://dm-stream/notify', {
          method: 'POST',
          body: JSON.stringify(value),
        })
      ),
  };
}

describe('shared actor mailbox protocol', () => {
  it('keeps existing DM frames compatible', async () => {
    const box = mailbox();
    assert.equal(
      (
        await box.post({
          conversationActorId: 'peer',
          statusId: 'status',
          at: 123,
        })
      ).status,
      200
    );
    assert.deepEqual(box.sent, [
      { type: 'dm', conversationActorId: 'peer', statusId: 'status', at: 123 },
    ]);
  });
  it('broadcasts group invalidations without message bodies, authors, or media', async () => {
    const box = mailbox();
    await box.post({
      type: 'group',
      groupId: 'garden',
      kind: 'message',
      messageId: 'message',
      at: 123,
      body: 'Private content',
      actorId: 'private-author',
      attachments: ['private.gif'],
    });
    assert.deepEqual(box.sent, [
      {
        type: 'group',
        groupId: 'garden',
        kind: 'message',
        messageId: 'message',
        at: 123,
      },
    ]);
  });
  it('supports membership invalidation without a fabricated message ID', async () => {
    const box = mailbox();
    await box.post({
      type: 'group',
      groupId: 'garden',
      kind: 'membership',
      at: 123,
    });
    assert.deepEqual(box.sent, [
      { type: 'group', groupId: 'garden', kind: 'membership', at: 123 },
    ]);
  });
  it('rejects malformed notification frames instead of broadcasting them', async () => {
    const box = mailbox();
    for (const payload of [
      null,
      {},
      { type: 'group', groupId: 'garden', kind: 'message' },
      { type: 'group', groupId: '', kind: 'membership' },
    ]) {
      assert.equal((await box.post(payload)).status, 400);
    }
    assert.deepEqual(box.sent, []);
  });
  it('bounds group fan-out concurrency and deduplicates mailbox targets', async () => {
    let active = 0;
    let maximum = 0;
    const seen: string[] = [];
    getDmStream({
      DM_STREAM: {
        idFromName: (name) => name,
        get: (id) => ({
          fetch: async (_url, init) => {
            active++;
            maximum = Math.max(maximum, active);
            seen.push(String(id));
            const payload = JSON.parse(String(init?.body));
            assert.deepEqual(Object.keys(payload).sort(), [
              'at',
              'groupId',
              'kind',
              'messageId',
              'type',
            ]);
            await new Promise<void>((resolve) => setTimeout(resolve, 1));
            active--;
            return Response.json({ delivered: 1 });
          },
        }),
      },
    });
    const actors = Array.from({ length: 25 }, (_, index) => `actor-${index}`);
    assert.equal(
      await notifyGroupChatEvent([...actors, actors[0]], {
        groupId: 'garden',
        kind: 'message',
        messageId: 'message',
      }),
      25
    );
    assert.equal(seen.length, 25);
    assert.ok(maximum <= 8);
  });
});
