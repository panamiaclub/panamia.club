import { after, beforeEach, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';
import { ENCRYPTED_GROUP_CHAT_REQUIRED } from '@/lib/chat';
import { chatWriteFailure } from '@/lib/server/chat-write-errors';

const privateText =
  'Synthetic rejected private text must not appear in SQL logs';
const privateFilename = 'synthetic-private-location.png';
let failure: unknown;
const errorLog = mock.method(console, 'error', () => {});
const notifications = mock.fn(async () => {});
mock.module(import.meta.resolve('../auth.ts'), {
  exports: { auth: async () => ({ user: { id: 'fixture-user' } }) },
});
mock.module(import.meta.resolve('../lib/server/active-profile.ts'), {
  exports: {
    getActiveProfileWithActor: async () => ({
      id: 'fixture-profile',
      socialActor: { id: 'fixture-actor' },
    }),
  },
});
mock.module(import.meta.resolve('../lib/federation/index.ts'), {
  exports: {
    createStatus: async () => {
      throw failure;
    },
    getPublicTimeline: async () => {
      throw new Error('This fixture exercises writes only.');
    },
  },
});
mock.module(import.meta.resolve('../lib/server/group-chat.ts'), {
  exports: {
    sendGroupChatMessage: async () => {
      throw failure;
    },
    readGroupChat: async () => {
      throw new Error('This fixture exercises writes only.');
    },
  },
});
mock.module(import.meta.resolve('../lib/notifications.ts'), {
  exports: { createNotification: notifications },
});
const statusRoute = await import('../app/api/social/statuses/route');
const groupRoute = await import('../app/api/social/groups/[handle]/chat/route');

beforeEach(() => {
  errorLog.mock.resetCalls();
  notifications.mock.resetCalls();
  failure = new Error(
    `Failed query: INSERT ... ${privateText} ${privateFilename}`,
    {
      cause: Object.assign(new Error('Encrypted chat transport required'), {
        code: 'P0001',
      }),
    }
  );
});
after(() => mock.restoreAll());
function request(path: string) {
  return new NextRequest(`https://fixture.invalid${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: crypto.randomUUID(),
      content: privateText,
      visibility: 'direct',
      recipientActorIds: ['fixture-peer'],
      attachments: [
        {
          type: 'image',
          mediaType: 'image/png',
          url: 'https://fixture.invalid/private.png',
          name: privateFilename,
        },
      ],
    }),
  });
}
function assertNoPrivateCopy(value: unknown) {
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes(privateText), false);
  assert.equal(encoded.includes(privateFilename), false);
  assert.equal(encoded.includes('Failed query'), false);
}
it('turns the database plaintext latch into the same ambiguous DM refusal without logging SQL parameters', async () => {
  const response = await statusRoute.POST(request('/api/social/statuses'));
  assert.equal(response.status, 400);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const body = await response.json();
  assert.equal(body.error, DIRECT_THREAD_REFUSED);
  assertNoPrivateCopy(body);
  assert.equal(errorLog.mock.callCount(), 0);
  assert.equal(notifications.mock.callCount(), 0);
});
it('returns the established group encryption requirement for a rejected legacy private write', async () => {
  const response = await groupRoute.POST(
    request('/api/social/groups/garden/chat'),
    {
      params: Promise.resolve({ handle: 'garden' }),
    }
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, ENCRYPTED_GROUP_CHAT_REQUIRED);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(errorLog.mock.callCount(), 0);
});
it('surfaces unknown persistence failures but keeps message bodies and attachment metadata out of responses and diagnostics', async () => {
  const error = new Error(`Failed query: ${privateText} ${privateFilename}`);
  error.name = privateText;
  failure = error;
  const response = await statusRoute.POST(request('/api/social/statuses'));
  assert.equal(response.status, 500);
  assertNoPrivateCopy(await response.json());
  assert.equal(errorLog.mock.callCount(), 1);
  assertNoPrivateCopy(errorLog.mock.calls.map((call) => call.arguments));
  assert.equal(notifications.mock.callCount(), 0);
});
it('does not disguise an unrelated database exception as an encryption-policy refusal', () => {
  const unrelated = new Error('Encrypted chat transport required', {
    cause: failure,
  });
  Object.assign(unrelated, { code: '23505', cause: null });
  assert.equal(chatWriteFailure(unrelated, 'group').status, 500);
  assert.equal(errorLog.mock.callCount(), 1);
});
