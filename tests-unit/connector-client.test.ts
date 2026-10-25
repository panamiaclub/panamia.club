import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveConnectorWork } from '@/lib/connectors/client';

test('connector writes send JSON and require an explicit successful response', async (context) => {
  const fetch = context.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ success: true }), { status: 200 })
  );
  assert.equal(
    await saveConnectorWork('/api/connectors/opportunities', 'POST', {
      id: 'request',
    }),
    null
  );
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, '/api/connectors/opportunities');
  assert.equal(options?.method, 'POST');
  assert.equal(options?.body, JSON.stringify({ id: 'request' }));
  assert.deepEqual(options?.headers, { 'Content-Type': 'application/json' });
});

test('connector writes retain actionable server errors on a conflict or denied operation', async (context) => {
  context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({ success: false, error: 'The crew just filled up.' }),
        { status: 409 }
      )
  );
  assert.equal(
    await saveConnectorWork('/api/connectors/opportunities', 'POST', {
      id: 'request',
    }),
    'The crew just filled up.'
  );
});

test('connector writes never treat malformed success payloads or HTTP failures as success', async (context) => {
  for (const [status, data] of [
    [200, {}],
    [200, { success: false }],
    [500, { success: true }],
    [200, null],
  ] as const) {
    const fetch = context.mock.method(
      globalThis,
      'fetch',
      async () => new Response(JSON.stringify(data), { status })
    );
    assert.equal(
      await saveConnectorWork('/api/connectors/commitments', 'PATCH', {
        id: 'work',
        progress: 'done',
      }),
      'That did not save. Try again.'
    );
    fetch.mock.restore();
  }
});

test('connector writes surface network failures and invalid JSON without throwing away the form', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  assert.equal(
    await saveConnectorWork('/api/connectors/commitments', 'POST', {}),
    'Could not reach the server. Try again.'
  );
  fetch.mock.restore();
  context.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>Proxy error</html>', { status: 502 })
  );
  assert.equal(
    await saveConnectorWork('/api/connectors/commitments', 'POST', {}),
    'Could not reach the server. Try again.'
  );
});

test('staff deletion preserves its query id and sends no synthetic JSON body', async (context) => {
  const fetch = context.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ success: true }))
  );
  assert.equal(
    await saveConnectorWork('/api/admin/connectors/tasks?id=work', 'DELETE'),
    null
  );
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, '/api/admin/connectors/tasks?id=work');
  assert.deepEqual(options, { method: 'DELETE' });
});
