// Browser-only helpers that (re)publish a pubkey's identity events to the
// panamia relay, signing with the matching nsec held in browser memory. Shared
// by the /r enrollment flow and the key-rotation flow so both publish the same
// set under whichever key is current. Each function returns a result instead of
// toasting so the caller controls messaging.
//
// Server-side use is not supported — publishWithAuth needs a browser WebSocket.
import axios from 'axios';
import { publishWithAuth } from './publish-browser';
import type { UnsignedEvent } from './sign';

const RELAY = 'wss://relay.panamia.club';

// Default group set a panamia member belongs to. Mirrors AUTO_ENROLL_GROUPS in
// /api/relay/enroll and /api/relay/rotate — keep in sync.
export const DEFAULT_GROUPS = ['panamia-test', 'panamia-public'] as const;

interface ProfileSeed {
  name: string;
  nip05: string;
  about: string | null;
  picture: string | null;
}

export interface StepResult {
  ok: boolean;
  // For multi-event steps, the kinds that failed to publish.
  failedKinds?: number[];
  // Relay/transport reason when a single-event step fails.
  reason?: string;
}

// Build the kind 0 content payload. Drop nullish fields so other clients don't
// render empty "about"/"picture" sections.
function buildMetadataContent(seed: ProfileSeed): string {
  const meta: Record<string, string> = {
    name: seed.name,
    display_name: seed.name,
    nip05: seed.nip05,
  };
  if (seed.about) meta.about = seed.about;
  if (seed.picture) meta.picture = seed.picture;
  return JSON.stringify(meta);
}

// Kind 0 profile metadata, seeded from the caller's panamia profile so other
// clients show their screenname and nip05 rather than a hex pubkey.
export async function publishProfileMetadata(
  skHex: string
): Promise<StepResult> {
  try {
    const seedRes = await axios.get<ProfileSeed>('/api/relay/profile-seed');
    const result = await publishWithAuth(skHex, {
      kind: 0,
      tags: [],
      content: buildMetadataContent(seedRes.data),
    });
    return { ok: result.accepted, reason: result.reason };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'failed' };
  }
}

// NIP-65/NIP-17/NIP-EE relay lists declaring relay.panamia.club as this pubkey's
// preferred relay so DM and MLS clients can find where to reach the user.
export async function publishRelayLists(skHex: string): Promise<StepResult> {
  const events: UnsignedEvent[] = [
    { kind: 10002, tags: [['r', RELAY]], content: '' },
    { kind: 10050, tags: [['relay', RELAY]], content: '' },
    { kind: 10051, tags: [['relay', RELAY]], content: '' },
  ];
  const failed: number[] = [];
  for (const ev of events) {
    try {
      const result = await publishWithAuth(skHex, ev);
      if (!result.accepted) failed.push(ev.kind);
    } catch {
      failed.push(ev.kind);
    }
  }
  return { ok: failed.length === 0, failedKinds: failed };
}

// NIP-29 kind 10009 client-side group list so clients (Nostrord) land the user
// directly in their groups instead of showing a "Join group" button.
export async function publishGroupList(
  skHex: string,
  groups: readonly string[] = DEFAULT_GROUPS
): Promise<StepResult> {
  try {
    const result = await publishWithAuth(skHex, {
      kind: 10009,
      tags: groups.map((g) => ['group', g, RELAY]),
      content: '',
    });
    return { ok: result.accepted, reason: result.reason };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'failed' };
  }
}

// Republish the full identity event set under `skHex`. Returns the list of
// human-readable warnings for any step that didn't fully succeed; an empty
// array means everything published. Never throws — partial failure is
// tolerable (the key is already rotated server-side; the user can re-run).
export async function publishIdentityEvents(
  skHex: string,
  groups: readonly string[] = DEFAULT_GROUPS
): Promise<string[]> {
  const warnings: string[] = [];

  const meta = await publishProfileMetadata(skHex);
  if (!meta.ok) {
    warnings.push(
      'Profile metadata (display name) was not published' +
        (meta.reason ? `: ${meta.reason}` : '') +
        '. Some clients may show a hex pubkey until you republish.'
    );
  }

  const groupList = await publishGroupList(skHex, groups);
  if (!groupList.ok) {
    warnings.push(
      'Group list was not published — Nostrord may show a "Join group" button on first open.'
    );
  }

  const relays = await publishRelayLists(skHex);
  if (!relays.ok) {
    warnings.push(
      `Relay list kind(s) ${relays.failedKinds?.join(', ')} were not published — ` +
        'some clients may use their default relays instead of relay.panamia.club.'
    );
  }

  return warnings;
}
