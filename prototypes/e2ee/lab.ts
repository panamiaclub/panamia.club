import {
  PrototypeClient,
  createRecoveryKey,
  describeContact,
} from '../../lib/e2ee/prototype';
import { PrototypeStore } from '../../lib/e2ee/prototype-store';
import {
  decryptAttachment,
  encryptAttachment,
} from '../../lib/e2ee/sealed-object';

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing lab element: ${id}`);
  return found;
}
const area = (id: string) => element(id, HTMLTextAreaElement);
const input = (id: string) => element(id, HTMLInputElement);
const output = (id: string, value: unknown) => {
  element(id, HTMLElement).textContent =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
};
const json = (id: string): unknown => JSON.parse(area(id).value);
let store: PrototypeStore | undefined;
let activeActor: string | undefined;
let download: { bytes: Uint8Array; name: string } | undefined;

async function operation<T>(
  fn: (client: PrototypeClient) => Promise<T>
): Promise<T> {
  if (!store || !activeActor) throw new Error('Open a lab device first.');
  return store.withDevice(activeActor, fn);
}

async function render() {
  await operation(async (client) => {
    output('device', await describeContact(client.contact));
    area('contact').value = JSON.stringify(client.contact);
    output('room', { room: client.room, members: client.members });
    output(
      'history',
      client.history.entries.map((entry) => ({
        room: entry.room,
        id: entry.message.id,
        content: entry.message.content,
        attachments: entry.message.attachments.length,
        expiresAt: entry.message.expiresAt,
      }))
    );
    const select = element('member', HTMLSelectElement);
    select.replaceChildren();
    for (const member of client.members) {
      if (member.device === client.identity.device) continue;
      const option = document.createElement('option');
      option.value = member.device;
      option.textContent = `${member.actor} / ${member.device}`;
      select.append(option);
    }
  });
}

function action(id: string, fn: () => Promise<void>) {
  element(id, HTMLButtonElement).addEventListener('click', async () => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach((button) => {
      button.disabled = true;
    });
    output('error', '');
    output('status', `Working: ${id}.`);
    try {
      await fn();
      if (activeActor) await render();
      output(
        'status',
        `Completed: ${id}. Prototype only; production chat is unchanged.`
      );
    } catch (error) {
      output(
        'error',
        error instanceof Error ? error.message : 'The lab operation failed.'
      );
      output(
        'status',
        'Operation failed; no plaintext fallback was attempted.'
      );
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  });
}

action('open', async () => {
  store ??= await PrototypeStore.open();
  const actor = input('actor').value;
  await store.withDevice(actor, async () => {});
  activeActor = actor;
  download = undefined;
  for (const id of ['outgoing', 'incoming', 'welcome', 'commit'])
    area(id).value = '';
  output('storage', '');
});
action('forget', async () => {
  if (!store || !activeActor) throw new Error('Open a lab device first.');
  await store.forgetDevice(activeActor);
  download = undefined;
  input('recovery').value = '';
  for (const id of ['outgoing', 'incoming', 'welcome', 'commit'])
    area(id).value = '';
});
action('inspect', async () =>
  output('fingerprint', await describeContact(json('peer')))
);
action('trust', async () => {
  await operation((client) => client.trust(json('peer')));
});
action('create', async () => {
  await operation((client) => client.createRoom());
});
action('invite', async () => {
  const result = await operation((client) => client.add(json('peer')));
  area('welcome').value = result.welcome;
  area('commit').value = JSON.stringify(result.commit);
});
action('join', async () => {
  await operation((client) => client.join(area('welcome').value));
});
action('apply', async () => {
  await operation((client) => client.receive(json('commit')));
});
action('remove', async () => {
  const envelope = await operation((client) =>
    client.remove(element('member', HTMLSelectElement).value)
  );
  area('commit').value = JSON.stringify(envelope);
});
action('send', async () => {
  const file = input('file').files?.[0];
  if (file && file.size > 10 * 1024 * 1024)
    throw new Error('Attachment exceeds 10 MB.');
  const attachments = file
    ? [
        await encryptAttachment(
          new Uint8Array(await file.arrayBuffer()),
          file.name,
          file.type
        ),
      ]
    : [];
  const id = crypto.randomUUID();
  const envelope = await operation((client) =>
    client.send(id, area('message').value, attachments)
  );
  area('outgoing').value = JSON.stringify(envelope);
  area('message').value = '';
  input('file').value = '';
});
action('receive', async () => {
  await operation(async (client) => {
    const message = await client.receive(json('incoming'));
    download = undefined;
    if (message?.attachments.length) {
      const entry = client.history.entries.find(
        (entry) => entry.message.id === message.id
      );
      const reference = message.attachments[0];
      const attachment = entry?.objects.find(
        (item) => item.id === reference.id
      );
      if (!attachment) throw new Error('Encrypted attachment is missing.');
      download = await decryptAttachment(
        attachment.object,
        reference.id,
        reference.secret
      );
    }
  });
});
action('download', async () => {
  if (!download) throw new Error('Decrypt a message with an attachment first.');
  // Always download as opaque bytes; never execute HTML/SVG supplied by a peer.
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(download.bytes)], {
      type: 'application/octet-stream',
    })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = download.name || 'attachment';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
action('key', async () => {
  input('recovery').value = createRecoveryKey();
});
action('backup', async () => {
  area('archive').value = JSON.stringify(
    await operation((client) => client.backupHistory(input('recovery').value))
  );
});
action('restore', async () => {
  await operation((client) =>
    client.restoreHistory(json('archive'), input('recovery').value)
  );
});
action('stored', async () => {
  if (!store || !activeActor) throw new Error('Open a lab device first.');
  output('storage', await store.storedCiphertext(activeActor));
});
window.addEventListener('pagehide', () => store?.close());
