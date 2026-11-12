import {
  EncryptedChatClient,
  ParticipantVerificationRequired,
  type RootApproval,
} from '../../lib/e2ee/chat-client';
import { fromBase64 } from '../../lib/e2ee/encoding';
import type { EncryptedAttachment } from '../../lib/e2ee/room-contract';

const actor = new URLSearchParams(location.search).get('actor');
if (!actor || !['alice', 'bob', 'carol'].includes(actor))
  throw new Error('Choose a synthetic fixture account.');
const scope = {
  userId: `${actor}-user`,
  profileId: `${actor}-profile`,
  actorId: actor,
};
const client = await EncryptedChatClient.open(scope, {
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-pana-fixture-user', scope.userId);
    return fetch(input, { ...init, headers });
  },
});
const status = document.getElementById('status')!;
const history = document.getElementById('history')!;
const error = document.getElementById('error')!;
async function show<T>(operation: () => Promise<T>) {
  error.textContent = '';
  try {
    const result = await operation();
    status.textContent = 'Ready';
    return result;
  } catch (value) {
    if (value instanceof ParticipantVerificationRequired)
      return { verification: value.participants };
    error.textContent =
      value instanceof Error ? value.message : 'Encryption failed';
    throw value;
  }
}

const fixture = {
  client,
  setup: () => client.setup(),
  activate: () => client.activate(true),
  open: (
    input:
      { kind: 'dm'; peerActorId: string } | { kind: 'group'; groupId: string },
    approvals: RootApproval[] = []
  ) =>
    show(async () => {
      const result = await client.openConversation(input, approvals);
      history.textContent = result.history
        .map((entry) => entry.message.content)
        .join('\n');
      return result;
    }),
  refresh: (roomId: string, approvals: RootApproval[] = []) =>
    show(async () => {
      const result = await client.conversation(roomId, approvals);
      history.textContent = result.history
        .map((entry) => entry.message.content)
        .join('\n');
      return result;
    }),
  send: (
    roomId: string,
    text: string,
    file?: { name: string; type: string; bytes: string }
  ) =>
    client.send(
      roomId,
      crypto.randomUUID(),
      text,
      file
        ? [
            new File(
              [Uint8Array.from(fromBase64(file.bytes)).buffer],
              file.name,
              { type: file.type }
            ),
          ]
        : []
    ),
  backup: (roomId: string) => client.backupConversation(roomId),
  recover: (key: string) => client.recover(key),
  restart: (roomId: string) =>
    show(() => client.restartConversation(roomId, true)),
  attachment: async (
    roomId: string,
    manifest: EncryptedAttachment,
    expiry: string
  ) => {
    const file = await client.attachment(roomId, manifest, expiry);
    return { name: file.name, text: new TextDecoder().decode(file.bytes) };
  },
  privateState: async () => {
    const session = await client.vault.load();
    return session?.state ?? null;
  },
};
declare global {
  interface Window {
    panaProduct: typeof fixture;
  }
}
window.panaProduct = fixture;
if (new URLSearchParams(location.search).get('view') === 'messages')
  (await import('./product-view')).mountProductView(client);
status.textContent = 'Ready';
addEventListener('pagehide', () => client.close());
