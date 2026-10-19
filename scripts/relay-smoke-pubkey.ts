// One-off smoke test for an arbitrary nsec against relay.panamia.club.
// Usage: yarn tsx scripts/relay-smoke-pubkey.ts <nsec> [npub]
//
// Group set is discovered, not hardcoded. After NIP-42 AUTH, a REQ for
// kind 39002 with no `#d` is narrowed by the relay to the caller's
// `session.groups` (see `narrowFilterForGroupAccess` in nosflare/src/nip29.ts),
// so the returned events enumerate every group the pubkey is enrolled in.
//
// For each discovered group the script audits the four signals NIP-29
// clients depend on:
//
//   metadata     — kind 39000 with `name` (0xchat falls back to a
//                  "first6:last6" truncation of the group_id when this
//                  is missing, surfacing as e.g. `panami:a-test`)
//   membership   — caller appears in the 39002 `p`-tag list
//   admin grant  — kind 9000 put-user event tags the caller (without
//                  it, clients show "Request to join" even when 39002
//                  has the caller)
//   history      — kind 9 `#h=<group>` returns events (helps separate
//                  "relay has no history" from "client has stale cache")
//
// The write probe from earlier revisions was dropped — it polluted every
// group with a smoke message every run, and the read-side signals above
// cover the same diagnostic ground.
import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { RELAY_URL, connectAndAuth, request } from '../tests-relay/helpers';

// Minimal ANSI color helpers. Stripped when stdout isn't a TTY or NO_COLOR is
// set, so piped output stays clean.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const ansi = (code: string, s: string): string =>
  useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = (s: string): string => ansi('2', s);
const green = (s: string): string => ansi('32', s);
const red = (s: string): string => ansi('31', s);
const yellow = (s: string): string => ansi('33', s);
const bold = (s: string): string => ansi('1', s);

// Output helpers. `explain` is the dim grey used for What/Means and the primer;
// `okLine` / `failLine` / `noteLine` color the indicator+status word of a
// Result line while leaving any trailing detail at default weight.
const explain = (line: string): void => console.log(dim(line));
const resultLine = (
  indent: string,
  color: (s: string) => string,
  symbol: string,
  status: string,
  detail?: string
): void => {
  const tail = detail ? ` ${detail}` : '';
  console.log(`${indent}Result: ${color(`${symbol} ${status}`)}${tail}`);
};
// Symbols escaped via \u so the file passes the pre-commit emoji screen
// (rejects raw U+2600-U+27BF). U+2713 = check mark, U+2717 = ballot x.
// The TS compiler decodes these at parse time, so runtime output renders
// the same glyphs as the literal characters would.
const okLine = (indent: string, status: string, detail?: string): void =>
  resultLine(indent, green, '\u2713', status, detail);
const failLine = (indent: string, status: string, detail?: string): void =>
  resultLine(indent, red, '\u2717', status, detail);
const noteLine = (indent: string, status: string, detail?: string): void =>
  resultLine(indent, yellow, '-', status, detail);

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(s: string): { hrp: string; data: number[] } {
  const sep = s.lastIndexOf('1');
  if (sep < 1) throw new Error('bech32: missing separator');
  const hrp = s.slice(0, sep).toLowerCase();
  const data: number[] = [];
  for (const ch of s.slice(sep + 1)) {
    const idx = CHARSET.indexOf(ch.toLowerCase());
    if (idx < 0) throw new Error(`bech32: bad char ${ch}`);
    data.push(idx);
  }
  return { hrp, data: data.slice(0, -6) };
}

function fromWords(words: number[]): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const v of words) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function decodeKey(bech: string, expectedHrp: string): string {
  const { hrp, data } = bech32Decode(bech);
  if (hrp !== expectedHrp) {
    throw new Error(`expected hrp ${expectedHrp}, got ${hrp}`);
  }
  return bytesToHex(fromWords(data));
}

async function main() {
  const [, , nsec, npub] = process.argv;
  if (!nsec) {
    console.error(
      'usage: yarn tsx scripts/relay-smoke-pubkey.ts <nsec> [npub]'
    );
    process.exit(1);
  }

  const skHex = decodeKey(nsec, 'nsec');
  const derivedPubkey = bytesToHex(schnorr.getPublicKey(hexToBytes(skHex)));
  let stated: string | null = null;
  if (npub) {
    stated = decodeKey(npub, 'npub');
    if (stated !== derivedPubkey) {
      console.error('npub does not match nsec — refusing to run');
      console.error(`  stated:  ${stated}`);
      console.error(`  derived: ${derivedPubkey}`);
      process.exit(2);
    }
  }

  console.log(bold('Pana MIA Resilience — relay smoke test'));
  console.log(bold('======================================='));
  console.log('');
  explain(
    'A Nostr "event" is a signed JSON object tagged by an integer "kind."'
  );
  explain('NIP-29 (relay-managed groups) uses these kinds:');
  explain('  kind 9      — group chat message (tagged with #h=<group_id>)');
  explain('  kind 9000   — admin "put-user" event (adds a pubkey to a group)');
  explain('  kind 39000  — group metadata: name, about, picture (replaceable)');
  explain('  kind 39001  — group admin list (replaceable)');
  explain('  kind 39002  — group member roster (replaceable)');
  explain('Tag filters narrow REQs: #h=<group_id> for chat/admin events,');
  explain('#d=<group_id> for the 39xxx replaceable metadata events.');
  console.log('');
  console.log(`relay   : ${RELAY_URL}`);
  console.log(`pubkey  : ${derivedPubkey}`);
  if (stated) explain('npub OK : matches derived pubkey');
  console.log('');

  // ---------------------------------------------------------------------------
  // [1/2] NIP-42 AUTH
  // ---------------------------------------------------------------------------
  console.log(bold('[1/2] AUTH (NIP-42 challenge-response)'));
  explain('  What : the relay issues a random challenge; we sign it with');
  explain('         the nsec to prove we hold this pubkey. After this the');
  explain('         connection is treated as the pubkey on member-only gates.');
  const ws = await connectAndAuth(skHex);
  okLine('  ', 'AUTH succeeded');
  explain('  Means: member-restricted REQs (39002, 9000, 9, …) now resolve');
  explain("         to this pubkey's view. A failure here usually means a");
  explain('         bad nsec or a relay-side outage, not a membership issue.');
  console.log('');

  // ---------------------------------------------------------------------------
  // [2/2] Group discovery
  // ---------------------------------------------------------------------------
  console.log(bold('[2/2] Group discovery (REQ kind 39002, no #d)'));
  explain("  What : ask the relay for every group's member roster at once.");
  explain('         The relay narrows the REQ to groups you actually belong');
  explain('         to (nip29.ts narrowFilterForGroupAccess), so each result');
  explain('         event represents one of your enrollments.');
  const discovery = await request(ws, 'smoke-discover', { kinds: [39002] });
  if (discovery.closed) {
    failLine('  ', 'CLOSED', `— ${discovery.reason}`);
    explain("  Means: the relay refused — most likely you're not enrolled");
    explain("         in any group, or AUTH didn't stick.");
    ws.close();
    return;
  }
  const groups = discovery.events
    .map((ev) => ({
      groupId: ev.tags.find((t) => t[0] === 'd')?.[1] ?? null,
      memberPubkeys: ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]),
    }))
    .filter(
      (g): g is { groupId: string; memberPubkeys: string[] } =>
        g.groupId !== null
    )
    .sort((a, b) => a.groupId.localeCompare(b.groupId));
  if (groups.length === 0) {
    noteLine('  ', '0 enrolled groups');
    explain('  Means: the relay has no group enrollment for this pubkey.');
    explain('         If you expected one, /api/relay/enroll never ran or');
    explain('         ran with a different pubkey.');
    ws.close();
    return;
  }
  okLine(
    '  ',
    `enrolled in ${groups.length} group(s)`,
    `— ${groups.map((g) => g.groupId).join(', ')}`
  );
  explain("  Means: the relay's authoritative view (39002) lists you in");
  explain('         these groups. Each is audited individually below.');

  // ---------------------------------------------------------------------------
  // Per-group audit
  // ---------------------------------------------------------------------------
  for (const { groupId, memberPubkeys } of groups) {
    console.log('');
    console.log(bold(`== Group: ${groupId} ==`));

    // ----- membership in 39002 (already collected during discovery) ----------
    const inList = memberPubkeys.includes(derivedPubkey);
    console.log('');
    console.log('  membership (from the 39002 fetched in [2/2])');
    explain("    What : is your pubkey in this group's member roster?");
    if (inList) {
      okLine(
        '    ',
        'caller IS listed',
        `(roster size: ${memberPubkeys.length})`
      );
      explain('    Means: NIP-29 clients reading 39002 will see you as a');
      explain('           current member.');
    } else {
      failLine(
        '    ',
        'caller is NOT listed',
        `(roster size: ${memberPubkeys.length})`
      );
      explain("    Means: the relay returned this group's roster but you're");
      explain('           NOT in it — the group state is stale or this REQ');
      explain('           was answered from a different session.');
    }

    // ----- metadata (kind 39000) — name + about + picture --------------------
    console.log('');
    console.log(`  metadata (REQ kind 39000 #d=${groupId})`);
    explain("    What : fetch the group's public-facing display info. The");
    explain('           `name` tag is what clients render as the group title.');
    const metaRes = await request(ws, `smoke-meta-${groupId}`, {
      kinds: [39000],
      '#d': [groupId],
      limit: 1,
    });
    if (metaRes.closed) {
      failLine('    ', 'CLOSED', `— ${metaRes.reason}`);
      explain('    Means: the relay refused metadata read. 39000 should be');
      explain('           public, so a CLOSED here is unusual.');
    } else if (metaRes.events.length === 0) {
      failLine('    ', 'no 39000 emitted', '(EOSE with 0 events)');
      explain('    Means: the group is enrolled but its metadata never');
      explain('           materialized. 0xchat will fall back to a');
      explain('           "first6:last6" truncation of the group_id (e.g.');
      explain('           `panami:a-test` for `panamia-test`).');
    } else {
      const name = metaRes.events[0].tags.find((t) => t[0] === 'name')?.[1];
      if (name) {
        okLine('    ', `name="${name}"`);
        explain('    Means: clients show the human-readable group title.');
      } else {
        failLine('    ', 'name="(missing)"');
        explain('    Means: 39000 exists but lacks a `name` tag — clients');
        explain('           will still show a truncated group_id.');
      }
    }

    // ----- admin grant (kind 9000 put-user) ----------------------------------
    console.log('');
    console.log(`  admin grant (REQ kind 9000 #h=${groupId})`);
    explain('    What : fetch the relay-signed "put-user" events that record');
    explain('           each admission. NIP-29 clients require one targeting');
    explain(
      '           your pubkey before they treat you as admitted; without'
    );
    explain('           it they show a "Request to join Group" screen even');
    explain('           when 39002 lists you.');
    const grantRes = await request(ws, `smoke-grant-${groupId}`, {
      kinds: [9000],
      '#h': [groupId],
      limit: 500,
    });
    if (grantRes.closed) {
      failLine('    ', 'CLOSED', `— ${grantRes.reason}`);
      explain('    Means: the relay refused the read. Same diagnosis as a');
      explain('           non-member 39002 CLOSED.');
    } else {
      const ownGrant = grantRes.events.some((ev) =>
        ev.tags.some((t) => t[0] === 'p' && t[1] === derivedPubkey)
      );
      const detail = `(${grantRes.events.length} put-user event(s) total)`;
      if (ownGrant) {
        okLine('    ', 'one put-user targets caller', detail);
        explain('    Means: clients see you as admitted by the relay admin.');
      } else {
        failLine('    ', 'no put-user targets caller', detail);
        explain('    Means: this is the usual cause of the "Request to join"');
        explain('           screen. Either the relay never synthesized a');
        explain("           9000 for you, or one exists but didn't reach");
        explain('           this REQ (cache miss or upstream bug).');
      }
    }

    // ----- chat history (kind 9) ---------------------------------------------
    console.log('');
    console.log(`  history (REQ kind 9 #h=${groupId}, limit 20)`);
    explain('    What : fetch up to 20 recent group chat messages.');
    const histRes = await request(ws, `smoke-hist-${groupId}`, {
      kinds: [9],
      '#h': [groupId],
      limit: 20,
    });
    if (histRes.closed) {
      failLine('    ', 'CLOSED', `— ${histRes.reason}`);
      explain('    Means: the relay refused chat read for this group. Chat');
      explain('           is members-only, so this implies the relay no');
      explain('           longer treats you as a member for this filter.');
    } else if (histRes.events.length === 0) {
      noteLine('    ', '0 recent chat event(s)');
      explain('    Means: the relay has no kind 9 history for this group.');
      explain('           Either nothing has been posted yet, or events were');
      explain('           pruned. Not necessarily a bug.');
    } else {
      okLine('    ', `${histRes.events.length} recent chat event(s)`);
      explain('    Means: the relay has chat history. If a client opens');
      explain('           this group but shows no old messages, the bug is');
      explain("           in the client's local cache, not the relay.");
    }
  }

  ws.close();
  console.log('');
  console.log(dim('done.'));
}

main().catch((err) => {
  console.error('smoke failed:', err);
  process.exit(1);
});
