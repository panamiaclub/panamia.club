import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupMessages,
  MOCK_CHAT_CONTACTS,
  MOCK_CHAT_REQUESTS,
  MOCK_CHAT_THREADS,
  MOCK_CHAT_VIEWER,
  REFUSAL_COPY,
  threadSnippet,
  type MockChatMessage,
} from '../app/mock/dm-chat/_data/mock-dm-chat';
import { DIRECT_THREAD_REFUSED } from '../lib/dm-refusal';
import { wearsOwnChrome } from '../lib/panaverse/chrome';

const sent: MockChatMessage = {
  id: 'one',
  from: 'me',
  body: 'First message',
  day: 'Today',
  time: '2:00 PM',
  delivery: 'sent',
};

describe('Messages workspace fixtures', () => {
  test('keeps sending and failed messages separate from acknowledged groups', () => {
    const messages: MockChatMessage[] = [
      sent,
      { ...sent, id: 'two', delivery: 'sending' },
      { ...sent, id: 'three', delivery: 'failed' },
      { ...sent, id: 'four', delivery: 'failed' },
    ];
    assert.deepEqual(
      groupMessages(messages).map((group) => group.length),
      [1, 1, 1, 1]
    );
  });

  test('groups consecutive acknowledged messages, without grouping across days', () => {
    const messages: MockChatMessage[] = [
      sent,
      { ...sent, id: 'two' },
      { ...sent, id: 'three', day: 'Tomorrow' },
    ];
    assert.deepEqual(
      groupMessages(messages).map((group) => group.length),
      [2, 1]
    );
  });

  test('makes new conversations available without offering the viewer', () => {
    const ids = MOCK_CHAT_CONTACTS.map((contact) => contact.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(
      MOCK_CHAT_CONTACTS.every(
        ({ person }) => person.handle !== MOCK_CHAT_VIEWER.handle
      )
    );
    assert.ok(
      MOCK_CHAT_CONTACTS.some(
        ({ id }) => !MOCK_CHAT_THREADS.some((thread) => thread.id === id)
      )
    );
  });

  test('keeps held requests outside the ordinary fixture inbox', () => {
    assert.ok(MOCK_CHAT_REQUESTS.length > 0);
    assert.ok(MOCK_CHAT_REQUESTS.every((thread) => thread.gate === 'hold'));
    assert.ok(MOCK_CHAT_THREADS.every((thread) => thread.gate !== 'hold'));
    assert.equal(REFUSAL_COPY, DIRECT_THREAD_REFUSED);
  });

  test('shows a useful snippet for an attachment-only message', () => {
    const thread = MOCK_CHAT_THREADS[0];
    assert.equal(
      threadSnippet({
        ...thread,
        messages: [
          {
            ...sent,
            body: '',
            gif: {
              id: 'yay',
              label: 'Celebration',
              word: 'yay!',
              tone: 'butter',
            },
          },
        ],
      }),
      'You: GIF'
    );
  });

  test('gives only the mock its viewport-owning chrome', () => {
    assert.equal(wearsOwnChrome('/mock/dm-chat'), true);
    assert.equal(wearsOwnChrome('/mock/dm-chat/'), true);
    assert.equal(wearsOwnChrome('/mock/dm-chat-other'), false);
    assert.equal(wearsOwnChrome('/messages'), false);
  });
});
