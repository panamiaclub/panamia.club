import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { GhlClient } from '@/lib/ghl';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.GHL_API_KEY;
const originalLocationId = process.env.GHL_LOCATION_ID;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.GHL_API_KEY;
  else process.env.GHL_API_KEY = originalApiKey;
  if (originalLocationId === undefined) delete process.env.GHL_LOCATION_ID;
  else process.env.GHL_LOCATION_ID = originalLocationId;
});

test('findByEmail uses the v2 contacts query endpoint and exact email match', async () => {
  process.env.GHL_API_KEY = 'pit-test';
  process.env.GHL_LOCATION_ID = 'location-123';

  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      'https://services.leadconnectorhq.com/contacts/?locationId=location-123&query=jose%40panamia.club'
    );
    return new Response(
      JSON.stringify({
        contacts: [
          { id: 'fuzzy', email: 'jose+other@panamia.club' },
          { id: 'exact', email: 'Jose@Panamia.Club' },
        ],
      }),
      { status: 200 }
    );
  };

  const client = GhlClient.create();
  assert.ok(client);
  const contact = await client.findByEmail('jose@panamia.club');
  assert.equal(contact?.id, 'exact');
});
