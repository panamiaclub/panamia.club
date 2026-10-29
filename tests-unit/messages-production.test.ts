import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SocialStatusDisplay } from '@/lib/interfaces';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';
import {
  conversationUnavailable,
  messageError,
  unconfirmedMessages,
  type OutgoingMessage,
} from '@/app/messages/_lib/workspace';
import { resolveChromeSurface, wearsOwnChrome } from '@/lib/panaverse/chrome';
import { DEFAULT_SURFACE, surfaceForPath } from '@/lib/panaverse/surfaces';

const outgoing: OutgoingMessage = {
  id: 'local-message',
  recipientActorId: 'other-actor',
  content: 'Keep these words.',
  attachments: [
    {
      type: 'image',
      mediaType: 'image/gif',
      url: 'https://example.invalid/our-mirrored.gif',
      name: 'A little hello',
    },
  ],
  published: '2026-10-28T14:00:00.000Z',
  delivery: 'sending',
};

function persisted(id: string): SocialStatusDisplay {
  return {
    id,
    uri: `https://example.invalid/statuses/${id}`,
    content: '<p>Keep these words.</p>',
    published: outgoing.published,
    repliesCount: 0,
    likesCount: 0,
    liked: false,
    actor: { id: 'viewer', username: 'viewer', domain: 'example.invalid' },
  };
}

describe('production Messages delivery reconciliation', () => {
  it('reconciles an own group message by nonce before the HTTP acknowledgement arrives', () => {
    const pending = { ...outgoing, clientId: 'group-client-id' };
    const message = {
      ...persisted('server-message'),
      clientId: 'group-client-id',
    };
    assert.deepEqual(unconfirmedMessages([pending], [message]), []);
    assert.deepEqual(
      unconfirmedMessages([pending], [{ ...message, clientId: null }]),
      [pending]
    );
  });
  it('keeps sending and failed messages, including their original recipient and GIF', () => {
    const failed: OutgoingMessage = {
      ...outgoing,
      delivery: 'failed',
      error: 'Try again.',
    };
    const result = unconfirmedMessages([outgoing, failed], []);
    assert.deepEqual(result, [outgoing, failed]);
    assert.equal(result[1].recipientActorId, 'other-actor');
    assert.equal(result[1].attachments?.[0].url, outgoing.attachments?.[0].url);
  });

  it('never treats matching text as a server acknowledgement', () => {
    assert.deepEqual(
      unconfirmedMessages([outgoing], [persisted('unrelated')]),
      [outgoing]
    );
  });

  it('keeps an acknowledged bubble until its exact server ID is visible', () => {
    const sent: OutgoingMessage = {
      ...outgoing,
      delivery: 'sent',
      serverId: 'confirmed',
    };
    assert.deepEqual(unconfirmedMessages([sent], [persisted('unrelated')]), [
      sent,
    ]);
    assert.deepEqual(unconfirmedMessages([sent], [persisted('confirmed')]), []);
  });

  it('does not drop other pending messages when one acknowledgement arrives', () => {
    const sent: OutgoingMessage = {
      ...outgoing,
      delivery: 'sent',
      serverId: 'confirmed',
    };
    const next: OutgoingMessage = { ...outgoing, id: 'another-local-message' };
    assert.deepEqual(
      unconfirmedMessages([sent, next], [persisted('confirmed')]),
      [next]
    );
  });
});

describe('production Messages errors', () => {
  it('preserves the shared refusal without inferring why it happened', () => {
    assert.equal(
      messageError(
        {
          isAxiosError: true,
          response: { status: 400, data: { error: DIRECT_THREAD_REFUSED } },
        },
        'Could not send.'
      ),
      DIRECT_THREAD_REFUSED
    );
  });

  it('uses the actionable fallback for a network failure or non-text API error', () => {
    const fallback = 'Check your connection and try again.';
    assert.equal(messageError({ isAxiosError: true }, fallback), fallback);
    assert.equal(
      messageError(
        {
          isAxiosError: true,
          response: { data: { error: { secret: 'not a client message' } } },
        },
        fallback
      ),
      fallback
    );
    assert.equal(messageError(null, fallback), fallback);
  });

  it('surfaces explicit acknowledgement failures', () => {
    assert.equal(
      messageError(
        new Error('Could not confirm message delivery.'),
        'Try again.'
      ),
      'Could not confirm message delivery.'
    );
  });

  it('hides an unavailable cached thread without distinguishing a block from absence', () => {
    for (const status of [401, 403, 404]) {
      assert.equal(
        conversationUnavailable({ isAxiosError: true, response: { status } }),
        true
      );
    }
    for (const status of [400, 429, 500]) {
      assert.equal(
        conversationUnavailable({ isAxiosError: true, response: { status } }),
        false
      );
    }
    assert.equal(conversationUnavailable(new Error('Network failed')), false);
  });
});

describe('Messages surface ownership', () => {
  it('keeps the production page inside real Pana Social chrome', () => {
    assert.equal(surfaceForPath('/messages').id, 'social');
    assert.equal(
      resolveChromeSurface(DEFAULT_SURFACE, '/messages').id,
      'social'
    );
    assert.equal(wearsOwnChrome('/messages'), false);
    assert.equal(wearsOwnChrome('/mock/dm-chat'), true);
  });
});
