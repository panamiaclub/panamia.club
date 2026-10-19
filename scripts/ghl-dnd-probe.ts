/**
 * One-off: settle how DND is actually written on a GHL contact.
 *
 * Two contradictions, both affecting live code:
 *
 *  1. WHICH ENDPOINT. external/panamia-next-crm-bridge/src/lib/ghl.ts calls
 *     `PUT /contacts/{id}/dnd`; lib/ghl.ts states that endpoint does not exist
 *     and writes DND through `PUT /contacts/{id}` with a dndSettings body. One
 *     of them is wrong, and the bridge's inactive-sweep job depends on it.
 *
 *  2. WHICH KEY CASING. The create-contact v3 schema spells the per-channel
 *     keys lowercase (call, email, sms, whatsApp); upsert spells them
 *     capitalized (Call, Email, SMS, WhatsApp). lib/ghl.ts sends capitalized
 *     keys to PUT /contacts/{id}. If that endpoint wants lowercase, the
 *     per-channel settings are silently dropped while the top-level `dnd` flag
 *     still flips — which looks like success and is not.
 *
 * Two further questions the per-channel UI (`PATCH /api/crm/contact/dnd`)
 * depends on, added after the first run settled the two above:
 *
 *  3. IS PER-CHANNEL INDEPENDENT OF THE MASTER FLAG? The route writes
 *     `dnd: false` whenever any channel stays open. If the top-level flag gates
 *     the whole dndSettings object rather than acting as a master switch, a
 *     single disabled channel reads back inactive and the toggle does nothing.
 *
 *  4. DOES A PARTIAL dndSettings MERGE OR REPLACE? `setDndChannels()` always
 *     writes all four channels because this is undocumented and the analogous
 *     case (upsert's `tags`) replaces. If it merges, that can be simplified; if
 *     it replaces, a partial write silently re-enables every channel the user
 *     had turned off.
 *
 * Every result is checked by reading the contact back. A 2xx from GHL is not
 * evidence: task deletes were observed answering 200 without deleting.
 *
 * NOTE: this proves what GHL *stores*, not what it *sends*. Whether a stored
 * `active` status actually suppresses delivery on that channel cannot be tested
 * without sending real messages.
 *
 *   npx tsx scripts/ghl-dnd-probe.ts --api-key=pit-xxxx --location-id=xxxx
 *
 * Optional: --keep (skip teardown), --yes (no prompts).
 *
 * Needs contacts.readonly and contacts.write. Creates one contact on a
 * non-deliverable domain and deletes it at the end.
 */

import { createInterface } from 'node:readline/promises';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const argv = process.argv.slice(2);
const arg = (n: string) =>
  argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) || undefined;

const API_KEY = arg('api-key');
const LOCATION_ID = arg('location-id');
const KEEP = argv.includes('--keep');
const AUTO_YES = argv.includes('--yes');

const runId = new Date()
  .toISOString()
  .replace(/[-:T.]/g, '')
  .slice(0, 14);

interface Res {
  status: number;
  ok: boolean;
  body: unknown;
  raw: string;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  version = VERSION
): Promise<Res> {
  const res = await fetch(`${GHL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Version: version,
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  return { status: res.status, ok: res.ok, body: parsed, raw };
}

interface ContactDnd {
  dnd?: boolean;
  dndSettings?: Record<string, { status?: string }>;
}

/** Read the contact back and return just the DND-relevant state. */
async function readDnd(id: string): Promise<ContactDnd> {
  const res = await call('GET', `/contacts/${id}`);
  const contact = (res.body as { contact?: ContactDnd })?.contact ?? {};
  return { dnd: contact.dnd, dndSettings: contact.dndSettings };
}

/** Channels whose status is 'active' (i.e. suppressed), whatever the casing. */
function activeChannels(state: ContactDnd): string[] {
  return Object.entries(state.dndSettings ?? {})
    .filter(([, v]) => v?.status === 'active')
    .map(([k]) => k)
    .sort();
}

// Module scope so TypeScript does not narrow it to null across the closure
// that assigns it.
let rl: ReturnType<typeof createInterface> | null = null;

async function confirm(question: string): Promise<boolean> {
  if (AUTO_YES) return true;
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n  ${question} [y/N] `);
  return answer.trim().toLowerCase().startsWith('y');
}

function report(
  label: string,
  sent: unknown,
  status: number,
  after: ContactDnd
) {
  const channels = activeChannels(after);
  console.log(`\n  ${label}`);
  console.log(`    sent:        ${JSON.stringify(sent)}`);
  console.log(`    http:        ${status}`);
  console.log(`    dnd flag:    ${String(after.dnd)}`);
  console.log(
    `    channels on: ${channels.length ? channels.join(', ') : '(none)'}`
  );
  return { status, dnd: after.dnd, channels };
}

async function main() {
  if (!API_KEY || !LOCATION_ID) {
    console.error(
      'FATAL: --api-key= and --location-id= are required.\n' +
        '  npx tsx scripts/ghl-dnd-probe.ts --api-key=pit-xxxx --location-id=xxxx'
    );
    process.exit(1);
  }

  console.log(`\nGHL DND probe — run ${runId}`);
  console.log(`location: ${LOCATION_ID}`);
  console.log(
    '\n  Creates one contact on a non-deliverable domain, toggles DND on it,\n' +
      '  and deletes it. Writes to PRODUCTION.'
  );
  if (!(await confirm('Proceed?'))) {
    console.log('Aborted. Nothing was written.');
    rl?.close();
    return;
  }

  // --- Setup ---------------------------------------------------------------
  const created = await call('POST', '/contacts/', {
    firstName: 'DND',
    lastName: `Probe ${runId}`,
    email: `dnd-probe-${runId}@invalid.test.panamia.club`,
    locationId: LOCATION_ID,
    source: 'panamia.club dnd probe',
  });
  const contactId = (created.body as { contact?: { id?: string } })?.contact
    ?.id;
  if (!contactId) {
    console.error(`\nFAIL: could not create contact (${created.status})`);
    console.error(created.raw.slice(0, 300));
    rl?.close();
    process.exit(1);
  }
  console.log(`\ncontact: ${contactId}`);
  console.log(`baseline: ${JSON.stringify(await readDnd(contactId))}`);

  const results: Record<string, unknown> = {};

  // --- 1. Bridge style: dedicated /dnd endpoint ----------------------------
  const bridgeBody = {
    email: { status: 'active' },
    sms: { status: 'active' },
  };
  const bridge = await call('PUT', `/contacts/${contactId}/dnd`, bridgeBody);
  results.bridgeEndpoint = report(
    'A. bridge style — PUT /contacts/{id}/dnd',
    bridgeBody,
    bridge.status,
    await readDnd(contactId)
  );
  if (!bridge.ok) console.log(`    error:       ${bridge.raw.slice(0, 200)}`);

  // --- 2. App style, capitalized keys (what lib/ghl.ts sends today) --------
  const capsBody = {
    dnd: true,
    dndSettings: {
      Email: { status: 'active', code: 'user_unsubscribe' },
      SMS: { status: 'active', code: 'user_unsubscribe' },
      WhatsApp: { status: 'active', code: 'user_unsubscribe' },
      Call: { status: 'active', code: 'user_unsubscribe' },
    },
  };
  const caps = await call('PUT', `/contacts/${contactId}`, capsBody);
  results.appCapitalized = report(
    'B. app style, capitalized keys — PUT /contacts/{id}',
    capsBody.dndSettings,
    caps.status,
    await readDnd(contactId)
  );
  if (!caps.ok) console.log(`    error:       ${caps.raw.slice(0, 200)}`);

  // Clear before the casing test, so B's effect cannot be mistaken for C's.
  await call('PUT', `/contacts/${contactId}`, {
    dnd: false,
    dndSettings: {
      Email: { status: 'inactive' },
      SMS: { status: 'inactive' },
      WhatsApp: { status: 'inactive' },
      Call: { status: 'inactive' },
    },
  });
  const cleared = await readDnd(contactId);
  console.log(
    `\n  reset before casing test — dnd=${String(cleared.dnd)} channels=${activeChannels(cleared).join(', ') || '(none)'}`
  );

  // --- 3. App style, lowercase keys (the v3 create schema's spelling) ------
  const lowerBody = {
    dnd: true,
    dndSettings: {
      email: { status: 'active', code: 'user_unsubscribe' },
      sms: { status: 'active', code: 'user_unsubscribe' },
      whatsApp: { status: 'active', code: 'user_unsubscribe' },
      call: { status: 'active', code: 'user_unsubscribe' },
    },
  };
  const lower = await call('PUT', `/contacts/${contactId}`, lowerBody);
  results.appLowercase = report(
    'C. app style, lowercase keys — PUT /contacts/{id}',
    lowerBody.dndSettings,
    lower.status,
    await readDnd(contactId)
  );
  if (!lower.ok) console.log(`    error:       ${lower.raw.slice(0, 200)}`);

  // --- 4. Clearing DND — the resubscribe path clearDndAll() relies on ------
  const clearBody = {
    dnd: false,
    dndSettings: {
      Email: { status: 'inactive', code: 'user_resubscribe' },
      SMS: { status: 'inactive', code: 'user_resubscribe' },
      WhatsApp: { status: 'inactive', code: 'user_resubscribe' },
      Call: { status: 'inactive', code: 'user_resubscribe' },
    },
  };
  const clear = await call('PUT', `/contacts/${contactId}`, clearBody);
  results.clear = report(
    'D. clear DND — PUT /contacts/{id}',
    clearBody.dndSettings,
    clear.status,
    await readDnd(contactId)
  );

  // --- 5. Per-channel suppression with the master flag off -----------------
  // The per-channel UI writes dnd:false whenever any channel stays open, on the
  // reading that the top-level flag is a master switch. If the flag instead
  // gates the whole dndSettings object, a single disabled channel would read
  // back as inactive and the toggle would silently do nothing.
  const partialBody = {
    dnd: false,
    dndSettings: {
      Email: { status: 'active', code: 'user_unsubscribe' },
      SMS: { status: 'inactive', code: 'user_resubscribe' },
      WhatsApp: { status: 'inactive', code: 'user_resubscribe' },
      Call: { status: 'inactive', code: 'user_resubscribe' },
    },
  };
  const partial = await call('PUT', `/contacts/${contactId}`, partialBody);
  const afterPartial = await readDnd(contactId);
  results.oneChannelMasterOff = report(
    'E. one channel suppressed, dnd:false — PUT /contacts/{id}',
    partialBody.dndSettings,
    partial.status,
    afterPartial
  );
  if (!partial.ok) console.log(`    error:       ${partial.raw.slice(0, 200)}`);

  // --- 6. Does a partial dndSettings merge, or replace? --------------------
  // setDndChannels() always writes all four channels precisely because this is
  // undocumented, and upsert's `tags` replaces. If the answer is "merges", that
  // belt-and-braces could be dropped; if "replaces", sending one key would
  // silently re-enable every channel the user had turned off.
  const mergeBody = {
    dnd: false,
    dndSettings: { SMS: { status: 'active', code: 'user_unsubscribe' } },
  };
  const merge = await call('PUT', `/contacts/${contactId}`, mergeBody);
  const afterMerge = await readDnd(contactId);
  results.partialMerge = report(
    'F. partial body, SMS only — does Email survive?',
    mergeBody.dndSettings,
    merge.status,
    afterMerge
  );
  if (!merge.ok) console.log(`    error:       ${merge.raw.slice(0, 200)}`);

  // --- Teardown ------------------------------------------------------------
  if (KEEP) {
    console.log(
      `\nTeardown skipped (--keep). Contact left behind: ${contactId}`
    );
  } else {
    const del = await call('DELETE', `/contacts/${contactId}`);
    const check = await call('GET', `/contacts/${contactId}`);
    // GHL reports a missing contact as 400 with "not found", not 404.
    const gone =
      check.status === 404 ||
      (check.status === 400 && /not found/i.test(check.raw));
    console.log(
      `\nteardown: DELETE ${del.status}, ${gone ? 'confirmed gone' : `STILL PRESENT — delete ${contactId} by hand`}`
    );
  }

  // --- Verdict -------------------------------------------------------------
  const a = results.bridgeEndpoint as { status: number; channels: string[] };
  const b = results.appCapitalized as { dnd?: boolean; channels: string[] };
  const c = results.appLowercase as { dnd?: boolean; channels: string[] };

  console.log('\n--- verdict ---');
  console.log(
    `  PUT /contacts/{id}/dnd  : ${
      a.status >= 200 && a.status < 300
        ? a.channels.length
          ? 'WORKS — bridge is correct'
          : `answered ${a.status} but changed nothing — a lie, not a fix`
        : `REJECTED (${a.status}) — bridge's updateDnd() is broken`
    }`
  );
  console.log(
    `  capitalized dndSettings : ${b.channels.length ? `applied (${b.channels.join(', ')})` : 'NOT applied'}`
  );
  console.log(
    `  lowercase dndSettings   : ${c.channels.length ? `applied (${c.channels.join(', ')})` : 'NOT applied'}`
  );
  console.log(
    `  top-level dnd flag      : B=${String(b.dnd)} C=${String(c.dnd)}`
  );

  const e = results.oneChannelMasterOff as {
    dnd?: boolean;
    channels: string[];
  };
  const f = results.partialMerge as { dnd?: boolean; channels: string[] };

  const oneChannelHeld = e.channels.length === 1 && e.channels[0] === 'Email';
  console.log(
    `  one channel, dnd:false  : ${
      oneChannelHeld
        ? 'HELD (Email only) — per-channel control works with the master off'
        : `got [${e.channels.join(', ') || 'none'}] — per-channel control is NOT independent of the master flag`
    }`
  );

  const merged = f.channels.includes('Email') && f.channels.includes('SMS');
  console.log(
    `  partial body            : ${
      merged
        ? 'MERGES — Email survived a body that only named SMS'
        : `REPLACES — sending SMS alone left [${f.channels.join(', ') || 'none'}], so Email was dropped`
    }`
  );

  console.log(
    '\n  E decides whether the per-channel UI works at all. F decides whether\n' +
      '  setDndChannels() must keep writing all four channels: if the API\n' +
      '  replaces rather than merges, a partial write silently re-enables every\n' +
      '  channel the user had turned off.'
  );

  rl?.close();
}

main().catch((e) => {
  console.error('\nProbe aborted:', e);
  process.exit(1);
});
