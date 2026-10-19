import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { boundPushMessage, PUSH_FIELD_BYTES } from '@/lib/push/payload';

const jsonBytes = (value: string) =>
  Buffer.byteLength(JSON.stringify(value)) - 2;

describe('push payload budgets', () => {
  test('keeps ordinary content and optional metadata unchanged', () => {
    const message = { title: 'Pana', body: 'Hi', url: '/updates', badge: 3 };
    assert.deepEqual(boundPushMessage(message), message);
    assert.deepEqual(boundPushMessage({ title: 'Hi', body: '' }), {
      title: 'Hi',
      body: '',
    });
  });

  test('bounds long ASCII titles and bodies without mutating the source', () => {
    const message = { title: 't'.repeat(10_000), body: 'b'.repeat(100_000) };
    const bounded = boundPushMessage(message);
    assert.equal(jsonBytes(bounded.title), PUSH_FIELD_BYTES.title);
    assert.equal(jsonBytes(bounded.body), PUSH_FIELD_BYTES.body);
    assert.equal(message.body.length, 100_000);
  });

  for (const text of ['\u{1f600}', '\u00e9', '\u0000', '"\\\n', '\ud800']) {
    test(`counts serialized UTF-8 bytes for ${JSON.stringify(text)}`, () => {
      const bounded = boundPushMessage({
        title: text.repeat(10_000),
        body: text.repeat(10_000),
      });
      assert.ok(jsonBytes(bounded.title) <= PUSH_FIELD_BYTES.title);
      assert.ok(jsonBytes(bounded.body) <= PUSH_FIELD_BYTES.body);
      if (text === '\u{1f600}') {
        assert.ok([...bounded.body].every((character) => character === text));
      }
    });
  }

  test('keeps an exact-limit URL but replaces an oversized URL, never truncates it', () => {
    const url = `/${'a'.repeat(PUSH_FIELD_BYTES.url - 1)}`;
    assert.equal(
      boundPushMessage({ title: 'Hi', body: 'There', url }).url,
      url
    );
    assert.equal(
      boundPushMessage({ title: 'Hi', body: 'There', url: `${url}a` }).url,
      '/updates'
    );
  });
});
