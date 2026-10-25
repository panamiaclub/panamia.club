import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { copyReferralLink } from '@/lib/referrals-client';

const referralUrl = 'https://pana.social/r/memberCode12';
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator'
);
const originalClipboardItem = Object.getOwnPropertyDescriptor(
  globalThis,
  'ClipboardItem'
);

class FakeClipboardItem {
  constructor(readonly data: Record<string, Promise<Blob>>) {}
}

function usePromisedClipboard(
  write: (items: FakeClipboardItem[]) => Promise<void>
) {
  Object.defineProperty(globalThis, 'ClipboardItem', {
    configurable: true,
    value: FakeClipboardItem,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { write } },
  });
}

describe('copying a referral link', () => {
  const copied: string[] = [];
  const clipboard = {
    writeText: async (text: string) => {
      copied.push(text);
    },
  };

  beforeEach(() => {
    copied.length = 0;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard },
    });
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    for (const [key, descriptor] of [
      ['navigator', originalNavigator],
      ['ClipboardItem', originalClipboardItem],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  });

  test('gets or creates the link and copies the canonical server URL', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ referralUrl })
    );

    await copyReferralLink();

    assert.equal(fetch.mock.callCount(), 1);
    assert.deepEqual(fetch.mock.calls[0].arguments, [
      '/api/referrals/me',
      { method: 'POST' },
    ]);
    assert.deepEqual(copied, [referralUrl]);
  });

  test('starts a promised clipboard write before the network responds', async (t) => {
    let respond!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    t.mock.method(globalThis, 'fetch', () => response);
    let writeStarted = false;
    usePromisedClipboard(async (items) => {
      writeStarted = true;
      assert.equal(items.length, 1);
      const blob = await items[0].data['text/plain'];
      assert.equal(blob.type, 'text/plain');
      copied.push(await blob.text());
    });

    const copying = copyReferralLink();

    assert.equal(writeStarted, true);
    assert.deepEqual(copied, []);
    respond(Response.json({ referralUrl }));
    await copying;
    assert.deepEqual(copied, [referralUrl]);
  });

  test('reports API errors even if a promised clipboard write resolves', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ error: 'Request failed' }, { status: 500 })
    );
    usePromisedClipboard(async () => {});

    await assert.rejects(copyReferralLink(), /Could not get/);
    assert.deepEqual(copied, []);
  });

  test('reports permission failures from a promised clipboard write', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ referralUrl })
    );
    const error = new Error('Clipboard permission denied');
    usePromisedClipboard(async () => {
      throw error;
    });

    await assert.rejects(copyReferralLink(), error);
    assert.deepEqual(copied, []);
  });

  for (const status of [401, 500]) {
    test(`does not copy when the API returns ${status}`, async (t) => {
      t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ error: 'Request failed' }, { status })
      );

      await assert.rejects(copyReferralLink(), /Could not get/);
      assert.deepEqual(copied, []);
    });
  }

  for (const body of [
    null,
    {},
    { referralUrl: null },
    { referralUrl: 42 },
    { referralUrl: '' },
    { referralUrl: '   ' },
  ]) {
    test(`rejects missing or invalid referral data: ${JSON.stringify(body)}`, async (t) => {
      t.mock.method(globalThis, 'fetch', async () => Response.json(body));

      await assert.rejects(copyReferralLink(), /No referral link/);
      assert.deepEqual(copied, []);
    });
  }

  test('reports network failures without copying', async (t) => {
    const error = new Error('Network unavailable');
    t.mock.method(globalThis, 'fetch', async () => {
      throw error;
    });

    await assert.rejects(copyReferralLink(), error);
    assert.deepEqual(copied, []);
  });

  test('reports clipboard permission failures rather than claiming success', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ referralUrl })
    );
    const error = new Error('Clipboard permission denied');
    t.mock.method(clipboard, 'writeText', async () => {
      throw error;
    });

    await assert.rejects(copyReferralLink(), error);
    assert.deepEqual(copied, []);
  });

  test('does not create a link when the clipboard is unavailable', async (t) => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    const fetch = t.mock.method(globalThis, 'fetch');

    await assert.rejects(copyReferralLink(), /Clipboard is not available/);
    assert.equal(fetch.mock.callCount(), 0);
  });
});
