import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { z } from 'zod';
import { EncryptedChatClient } from '../../lib/e2ee/chat-client';
import { localDeviceSchema } from '../../lib/e2ee/client-contract';
import {
  createWrappingKey,
  openWrappingKey,
  removeWrappingKey,
  verifyWrappingKey,
  type StorageCapabilities,
} from '../../lib/e2ee/protection';
import { nativeQualificationResultSchema } from './native-contract';

const markerDatabase = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('pana-synthetic-native-qualification', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('markers');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () =>
    reject(
      request.error ??
        new Error('Cannot open the native qualification marker store.')
    );
});
const markerSchema = z
  .object({
    runId: z.uuid(),
    roomId: z.uuid(),
    aliceDeviceId: z.uuid(),
    bobDeviceId: z.uuid(),
    pageId: z.uuid(),
    phase: z.enum(['resume', 'foreground']),
  })
  .strict();
const platform = z
  .enum(['android', 'ios'])
  .parse(new URLSearchParams(location.search).get('platform'));
const startedAt = performance.now();
const pageId = crypto.randomUUID();
const status = document.getElementById('status')!;
const error = document.getElementById('error')!;
const text = 'Synthetic native text stays inside approved participant devices';
const photo = 'Synthetic native encrypted file bytes';
const filename = 'synthetic-private-native-image.png';
let phase: 'create' | 'resume' | 'foreground' = 'create';
let runId = '';
let foregroundReady = false;
let backgroundSeen = false;
let foregroundRunning = false;
let alice: EncryptedChatClient | null = null;
let bob: EncryptedChatClient | null = null;
let capabilities: StorageCapabilities | null = null;

function assert(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(detail);
}
async function markerValue(value?: z.infer<typeof markerSchema>) {
  const db = await markerDatabase;
  const tx = db.transaction('markers', value ? 'readwrite' : 'readonly', {
    durability: 'strict',
  });
  let result: unknown;
  if (value) tx.objectStore('markers').put(markerSchema.parse(value), 'phase');
  else {
    const request = tx.objectStore('markers').get('phase');
    request.onsuccess = () => {
      result = request.result;
    };
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        tx.error ??
          new Error('The qualification phase marker was not committed.')
      );
  });
  return value ?? (result === undefined ? null : markerSchema.parse(result));
}
async function report(ok: boolean, detail?: unknown) {
  const result = nativeQualificationResultSchema.parse({
    phase,
    platform,
    ok,
    elapsedMs: Math.round(performance.now() - startedAt),
    userAgent: navigator.userAgent,
    ...(capabilities
      ? {
          provider: capabilities.provider,
          hardwareBacked: capabilities.hardwareBacked,
        }
      : {}),
    ...(detail
      ? {
          error:
            detail instanceof Error
              ? detail.message.slice(0, 1000)
              : 'Native qualification failed.',
        }
      : {}),
  });
  const response = await fetch(`/__e2ee/native-result/${runId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error('The local qualification recorder rejected the result.');
  status.textContent = ok ? `${phase}: passed` : `${phase}: failed`;
  if (!ok) error.textContent = result.error ?? 'Native qualification failed.';
}
async function client(actorId: 'alice' | 'bob') {
  const scope = {
    actorId,
    profileId: `${actorId}-profile`,
    userId: `${actorId}-user`,
  };
  return EncryptedChatClient.open(scope, {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('x-pana-fixture-user', scope.userId);
      return fetch(input, { ...init, headers });
    },
  });
}
async function local(value: EncryptedChatClient) {
  const session = await value.vault.withLock(() => value.vault.load());
  assert(
    session?.state,
    'The actual native device vault was not durably saved.'
  );
  assert(
    session.wrapping.kind === 'native',
    'The native app must never fall back to a browser wrapping key.'
  );
  capabilities = session.wrapping.capabilities;
  assert(
    session.wrapping.capabilities.provider ===
      (platform === 'android'
        ? 'android-keystore'
        : 'ios-keychain-this-device-only'),
    'The real platform protection provider does not match this native app.'
  );
  assert(
    !session.key.extractable,
    'The local data encryption key must remain non-extractable.'
  );
  return { session, state: localDeviceSchema.parse(JSON.parse(session.state)) };
}
async function noWireSecrets() {
  assert(alice && bob, 'Native clients are unavailable.');
  const audit = JSON.stringify(await (await fetch('/__e2ee/audit')).json());
  for (const value of [text, photo, filename])
    assert(
      !audit.includes(value),
      'Readable private content escaped into the local API capture.'
    );
  for (const peer of [alice, bob]) {
    const { state } = await local(peer);
    for (const secret of [state.rootSecret, state.recoveryKey, state.native])
      if (secret)
        assert(
          !audit.includes(secret),
          'Private identity, recovery or live ratchet material escaped into a request.'
        );
  }
}
async function fail(failure: unknown) {
  error.textContent =
    failure instanceof Error ? failure.message : 'Native qualification failed.';
  try {
    await report(false, failure);
  } catch (recordingFailure) {
    error.textContent += ` Result recording failed: ${recordingFailure instanceof Error ? recordingFailure.message : 'unknown'}`;
  }
}
try {
  const health = z
    .object({ synthetic: z.literal(true), runId: z.uuid() })
    .parse(await (await fetch('/__e2ee/health')).json());
  runId = health.runId;
  assert(
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === platform,
    'This scenario requires a real Capacitor WebView, not browser bridge mocks.'
  );
  assert(
    Capacitor.isPluginAvailable('PanaProtectedStorage'),
    'The native protected-storage plugin is not registered.'
  );
  const marker = await markerValue();
  if (marker) {
    assert(
      marker.runId === runId,
      'Clear this isolated fixture app before starting another qualification run.'
    );
    phase = marker.phase;
  }
  alice = await client('alice');
  bob = await client('bob');
  await App.addListener('appStateChange', ({ isActive }) => {
    if (!foregroundReady) return;
    if (!isActive) {
      backgroundSeen = true;
      return;
    }
    if (!backgroundSeen || foregroundRunning) return;
    foregroundRunning = true;
    phase = 'foreground';
    void (async () => {
      assert(alice && bob, 'The resumed native clients are unavailable.');
      const marker = await markerValue();
      assert(marker, 'The cold-restart phase marker was not committed.');
      const receipt = await bob.send(
        marker.roomId,
        crypto.randomUUID(),
        'Synthetic message after real app backgrounding'
      );
      const view = await alice.conversation(marker.roomId);
      assert(
        view.history.some(
          (entry) => entry.id === receipt.id && entry.message.actorId === 'bob'
        ),
        'The actual native WebView did not resume its persisted live sending ratchet.'
      );
      await noWireSecrets();
      await report(true);
    })().catch(fail);
  });
  if (!marker) {
    const wrapping = await createWrappingKey();
    assert(
      wrapping.descriptor.kind === 'native',
      'Native protection was replaced with a browser descriptor.'
    );
    await verifyWrappingKey(await openWrappingKey(wrapping.descriptor));
    await removeWrappingKey(wrapping.descriptor);
    let refused = false;
    try {
      await openWrappingKey(wrapping.descriptor);
    } catch {
      refused = true;
    }
    assert(refused, 'A deleted native wrapping key was silently regenerated.');
    const a = await alice.setup();
    const b = await bob.setup();
    assert(
      a.approved &&
        b.approved &&
        a.recoveryKey &&
        b.recoveryKey &&
        a.rootPublicKey &&
        b.rootPublicKey,
      'Synthetic native enrollment did not produce separate owner-approved devices.'
    );
    await alice.activate(true);
    await bob.activate(true);
    const room = await alice.openConversation(
      { kind: 'dm', peerActorId: 'bob' },
      [{ actorId: 'bob', rootPublicKey: b.rootPublicKey }]
    );
    await bob.openConversation({ kind: 'dm', peerActorId: 'alice' }, [
      { actorId: 'alice', rootPublicKey: a.rootPublicKey },
    ]);
    await alice.send(room.room.id, crypto.randomUUID(), text, [
      new File([photo], filename, { type: 'image/png' }),
    ]);
    const received = await bob.conversation(room.room.id);
    const entry = received.history.find(
      (entry) => entry.message.content === text
    );
    assert(
      entry,
      'The actual native peer did not authenticate and retain its message.'
    );
    const file = await bob.attachment(
      room.room.id,
      entry.message.attachments[0],
      entry.expiresAt
    );
    try {
      assert(
        new TextDecoder().decode(file.bytes) === photo,
        'Native encrypted media did not round-trip.'
      );
    } finally {
      file.bytes.fill(0);
    }
    await alice.backupConversation(room.room.id);
    await noWireSecrets();
    await markerValue(
      markerSchema.parse({
        runId,
        roomId: room.room.id,
        aliceDeviceId: a.deviceId,
        bobDeviceId: b.deviceId,
        pageId,
        phase: 'resume',
      })
    );
    await report(true);
  } else {
    assert(
      marker.pageId !== pageId,
      'The cold-restart phase reused its previous JavaScript execution.'
    );
    const a = await alice.setup();
    const b = await bob.setup();
    assert(
      a.deviceId === marker.aliceDeviceId && b.deviceId === marker.bobDeviceId,
      'Cold restart replaced native devices instead of opening the protected persisted state.'
    );
    const view = await bob.conversation(marker.roomId);
    const entry = view.history.find((entry) => entry.message.content === text);
    assert(entry, 'Native cold restart lost authenticated retained history.');
    const file = await bob.attachment(
      marker.roomId,
      entry.message.attachments[0],
      entry.expiresAt
    );
    try {
      assert(
        new TextDecoder().decode(file.bytes) === photo,
        'Native cold restart lost encrypted attachment state.'
      );
    } finally {
      file.bytes.fill(0);
    }
    const receipt = await bob.send(
      marker.roomId,
      crypto.randomUUID(),
      'Synthetic message from a cold-restarted native ratchet'
    );
    assert(
      (await alice.conversation(marker.roomId)).history.some(
        (entry) => entry.id === receipt.id
      ),
      'Native cold restart could not safely send and receive with the original live keys.'
    );
    await noWireSecrets();
    await markerValue({ ...marker, pageId, phase: 'foreground' });
    foregroundReady = true;
    await report(true);
  }
} catch (failure) {
  await fail(failure);
}
addEventListener('pagehide', () => {
  alice?.close();
  bob?.close();
});
