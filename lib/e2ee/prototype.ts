import {
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeGroupState,
  decodeMlsMessage,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  encodeGroupState,
  encodeMlsMessage,
  generateKeyPackage,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  processPrivateMessage,
  zeroOutUint8Array,
  type ClientConfig,
  type ClientState,
  type Credential,
  type KeyPackage,
  type MLSMessage,
  type PrivateKeyPackage,
} from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import { verifyKeyPackage } from 'ts-mls/keyPackage.js';
import { toLeafIndex } from 'ts-mls/treemath.js';
import { z } from 'zod';
import {
  fromBase64,
  importSecret,
  seal,
  sealedObjectSchema,
  toBase64,
  unseal,
  type SealedObject,
} from './sealed-object';

// Prototype only: no production messaging module imports this unaudited SDK.
const cipherSuite = () =>
  getCiphersuiteImpl(
    getCiphersuiteFromName('MLS_128_DHKEMP256_AES128GCM_SHA256_P256')
  );
const utf8 = new TextEncoder();
const text = new TextDecoder('utf-8', { fatal: true });
const encoded = z.string().max(1024 * 1024);
const identitySchema = z
  .object({
    actor: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    device: z.uuid(),
  })
  .strict();
const contactSchema = z
  .object({
    version: z.literal(1),
    keyPackage: encoded,
  })
  .strict();
export type Contact = z.infer<typeof contactSchema>;
const attachmentReference = z
  .object({ id: z.uuid(), secret: z.string().max(44) })
  .strict();
const messageSchema = z
  .object({
    id: z.uuid(),
    content: z.string().max(5000),
    attachments: z.array(attachmentReference).max(4),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type PrototypeMessage = z.infer<typeof messageSchema>;
const envelopeSchema = z
  .object({
    version: z.literal(1),
    frame: encoded,
    objects: z
      .array(z.object({ id: z.uuid(), object: sealedObjectSchema }).strict())
      .max(4),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
const archiveEntrySchema = z
  .object({
    room: z.string().max(128),
    message: messageSchema,
    objects: envelopeSchema.shape.objects,
  })
  .strict();
const archiveSchema = z
  .object({
    version: z.literal(1),
    actor: identitySchema.shape.actor,
    entries: z.array(archiveEntrySchema).max(500),
  })
  .strict();
export type HistoryArchive = z.infer<typeof archiveSchema>;
const localSnapshotSchema = z
  .object({
    version: z.literal(1),
    identity: identitySchema,
    contact: contactSchema,
    privatePackage: z
      .object({
        initPrivateKey: z.string().max(256),
        hpkePrivateKey: z.string().max(256),
        signaturePrivateKey: z.string().max(256),
      })
      .strict(),
    trusted: z.array(contactSchema).max(100),
    state: encoded.nullable(),
    archive: archiveSchema,
    outgoing: z
      .array(
        z
          .object({
            id: z.uuid(),
            message: messageSchema,
            frame: encoded,
          })
          .strict()
      )
      .max(500),
  })
  .strict();

function frame(value: unknown): MLSMessage {
  const bytes = fromBase64(encoded.parse(value), 768 * 1024);
  const decoded = decodeMlsMessage(bytes, 0);
  if (
    !decoded ||
    decoded[1] !== bytes.length ||
    decoded[0].version !== 'mls10'
  ) {
    throw new Error('Invalid or unsupported MLS message.');
  }
  return decoded[0];
}

function contactPackage(value: unknown): KeyPackage {
  const contact = contactSchema.parse(value);
  const decoded = frame(contact.keyPackage);
  if (
    decoded.wireformat !== 'mls_key_package' ||
    decoded.keyPackage.cipherSuite !==
      'MLS_128_DHKEMP256_AES128GCM_SHA256_P256' ||
    decoded.keyPackage.leafNode.credential.credentialType !== 'basic'
  ) {
    throw new Error('Expected a supported prototype device key package.');
  }
  credentialIdentity(decoded.keyPackage.leafNode.credential);
  return decoded.keyPackage;
}

function credentialIdentity(credential: Credential) {
  if (credential.credentialType !== 'basic') {
    throw new Error('Unsupported device credential.');
  }
  return identitySchema.parse(JSON.parse(text.decode(credential.identity)));
}

export async function describeContact(value: unknown) {
  const keyPackage = contactPackage(value);
  if (!(await verifyKeyPackage(keyPackage, (await cipherSuite()).signature))) {
    throw new Error('Device key package signature is invalid.');
  }
  const identity = credentialIdentity(keyPackage.leafNode.credential);
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      Uint8Array.from(keyPackage.leafNode.signaturePublicKey).buffer
    )
  );
  return {
    ...identity,
    fingerprint: [...digest]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
  };
}

export class PrototypeClient {
  readonly identity: z.infer<typeof identitySchema>;
  readonly contact: Contact;
  private readonly keys: {
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
  };
  private readonly trusted = new Map<string, Contact>();
  private state: ClientState | null = null;
  private changing = false;
  private archive: HistoryArchive;
  private readonly outgoing = new Map<
    string,
    { message: PrototypeMessage; envelope: Envelope }
  >();

  private constructor(
    identity: z.infer<typeof identitySchema>,
    keys: PrototypeClient['keys']
  ) {
    this.identity = identity;
    this.keys = keys;
    this.contact = {
      version: 1,
      keyPackage: toBase64(
        encodeMlsMessage({
          version: 'mls10',
          wireformat: 'mls_key_package',
          keyPackage: keys.publicPackage,
        })
      ),
    };
    this.trusted.set(JSON.stringify(identity), this.contact);
    this.archive = { version: 1, actor: identity.actor, entries: [] };
  }

  static async create(actor: string) {
    const identity = identitySchema.parse({
      actor,
      device: crypto.randomUUID(),
    });
    const keys = await generateKeyPackage(
      {
        credentialType: 'basic',
        identity: utf8.encode(JSON.stringify(identity)),
      },
      defaultCapabilities(),
      defaultLifetime,
      [],
      await cipherSuite()
    );
    return new PrototypeClient(identity, keys);
  }

  private async change<T>(operation: () => Promise<T>): Promise<T> {
    if (this.changing) {
      throw new Error(
        'Concurrent device operations require a serialized storage transaction.'
      );
    }
    this.changing = true;
    try {
      return await operation();
    } finally {
      this.changing = false;
    }
  }

  trust(value: unknown): Promise<void> {
    return this.change(() => this.trustOnce(value));
  }

  createRoom(): Promise<void> {
    return this.change(() => this.createRoomOnce());
  }

  add(value: unknown) {
    return this.change(() => this.addOnce(value));
  }

  join(welcome: string): Promise<void> {
    return this.change(() => this.joinOnce(welcome));
  }

  remove(device: string): Promise<Envelope> {
    return this.change(() => this.removeOnce(device));
  }

  send(...args: Parameters<PrototypeClient['sendOnce']>): Promise<Envelope> {
    return this.change(() => this.sendOnce(...args));
  }

  receive(value: unknown): Promise<PrototypeMessage | null> {
    return this.change(() => this.receiveOnce(value));
  }

  restoreHistory(value: unknown, recoveryKey: string): Promise<void> {
    return this.change(() => this.restoreHistoryOnce(value, recoveryKey));
  }

  private async trustOnce(value: unknown): Promise<void> {
    const contact = contactSchema.parse(value);
    const description = await describeContact(contact);
    const id = JSON.stringify({
      actor: description.actor,
      device: description.device,
    });
    const previous = this.trusted.get(id);
    if (
      previous &&
      toBase64(contactPackage(previous).leafNode.signaturePublicKey) !==
        toBase64(contactPackage(contact).leafNode.signaturePublicKey)
    ) {
      throw new Error(
        'Device signing key changed. Do not silently replace trust.'
      );
    }
    this.trusted.set(id, contact);
  }

  private config(): ClientConfig {
    return {
      ...defaultClientConfig,
      authService: {
        validateCredential: async (credential, publicKey) => {
          if (credential.credentialType !== 'basic') return false;
          const pinned = this.trusted.get(text.decode(credential.identity));
          return (
            !!pinned &&
            toBase64(contactPackage(pinned).leafNode.signaturePublicKey) ===
              toBase64(publicKey)
          );
        },
      },
    };
  }

  private roomState(): ClientState {
    if (!this.state) throw new Error('Create or join an encrypted room first.');
    return this.state;
  }

  get room(): string | null {
    return this.state ? text.decode(this.state.groupContext.groupId) : null;
  }

  get members() {
    return (this.state?.ratchetTree ?? []).flatMap((node, index) =>
      node?.nodeType === 'leaf'
        ? [
            {
              ...credentialIdentity(node.leaf.credential),
              leaf: index / 2,
            },
          ]
        : []
    );
  }

  get history(): HistoryArchive {
    return structuredClone({
      ...this.archive,
      entries: this.archive.entries.filter(
        (entry) => Date.parse(entry.message.expiresAt) > Date.now()
      ),
    });
  }

  private async createRoomOnce(): Promise<void> {
    if (this.state)
      throw new Error('This prototype device already has a room.');
    this.state = await createGroup(
      utf8.encode(crypto.randomUUID()),
      this.keys.publicPackage,
      this.keys.privatePackage,
      [],
      await cipherSuite(),
      this.config()
    );
  }

  private async addOnce(value: unknown) {
    const contact = contactSchema.parse(value);
    const keyPackage = contactPackage(contact);
    if (
      !(await this.config().authService.validateCredential(
        keyPackage.leafNode.credential,
        keyPackage.leafNode.signaturePublicKey
      ))
    ) {
      throw new Error(
        'Verify and explicitly trust this device before inviting it.'
      );
    }
    const result = await createCommit(
      { state: this.roomState(), cipherSuite: await cipherSuite() },
      {
        extraProposals: [{ proposalType: 'add', add: { keyPackage } }],
        ratchetTreeExtension: true,
      }
    );
    if (!result.welcome) throw new Error('MLS did not create an invitation.');
    this.state = result.newState;
    result.consumed.forEach(zeroOutUint8Array);
    return {
      commit: {
        version: 1 as const,
        frame: toBase64(encodeMlsMessage(result.commit)),
        objects: [],
      },
      welcome: toBase64(
        encodeMlsMessage({
          version: 'mls10',
          wireformat: 'mls_welcome',
          welcome: result.welcome,
        })
      ),
    };
  }

  private async joinOnce(welcome: string): Promise<void> {
    if (this.state) throw new Error('A device cannot reuse an MLS invitation.');
    const decoded = frame(welcome);
    if (decoded.wireformat !== 'mls_welcome')
      throw new Error('Expected an MLS invitation.');
    this.state = await joinGroup(
      decoded.welcome,
      this.keys.publicPackage,
      this.keys.privatePackage,
      emptyPskIndex,
      await cipherSuite(),
      undefined,
      undefined,
      this.config()
    );
  }

  private async removeOnce(device: string): Promise<Envelope> {
    const member = this.members.find((entry) => entry.device === device);
    if (!member || device === this.identity.device) {
      throw new Error('Choose a different current member to remove.');
    }
    const result = await createCommit(
      { state: this.roomState(), cipherSuite: await cipherSuite() },
      {
        extraProposals: [
          {
            proposalType: 'remove',
            remove: { removed: toLeafIndex(member.leaf) },
          },
        ],
      }
    );
    this.state = result.newState;
    result.consumed.forEach(zeroOutUint8Array);
    return {
      version: 1,
      frame: toBase64(encodeMlsMessage(result.commit)),
      objects: [],
    };
  }

  private async sendOnce(
    id: string,
    content: string,
    attachments: Array<{
      id: string;
      secret: string;
      object: SealedObject;
    }> = []
  ): Promise<Envelope> {
    const previous = this.outgoing.get(id);
    if (previous) {
      if (Date.parse(previous.message.expiresAt) <= Date.now()) {
        throw new Error('Cannot retry an expired message.');
      }
      if (
        previous.message.content !== content ||
        JSON.stringify(previous.message.attachments) !==
          JSON.stringify(attachments.map(({ id, secret }) => ({ id, secret })))
      ) {
        throw new Error('A retry must contain the original message.');
      }
      return structuredClone(previous.envelope);
    }
    if (this.outgoing.size >= 500)
      throw new Error('Prototype message limit reached.');
    const message = messageSchema.parse({
      id,
      content,
      attachments: attachments.map(({ id, secret }) => ({ id, secret })),
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    if (!content.trim() && !attachments.length)
      throw new Error('Write a message or attach a file.');
    const result = await createApplicationMessage(
      this.roomState(),
      utf8.encode(JSON.stringify(message)),
      await cipherSuite()
    );
    const envelope: Envelope = {
      version: 1,
      frame: toBase64(
        encodeMlsMessage({
          version: 'mls10',
          wireformat: 'mls_private_message',
          privateMessage: result.privateMessage,
        })
      ),
      objects: attachments.map(({ id, object }) => ({ id, object })),
    };
    this.state = result.newState;
    result.consumed.forEach(zeroOutUint8Array);
    this.outgoing.set(id, { message, envelope });
    this.archive.entries.push({
      room: this.room!,
      message,
      objects: envelope.objects,
    });
    return structuredClone(envelope);
  }

  private async receiveOnce(value: unknown): Promise<PrototypeMessage | null> {
    const envelope = envelopeSchema.parse(value);
    const decoded = frame(envelope.frame);
    if (decoded.wireformat !== 'mls_private_message') {
      throw new Error('Only private MLS frames are accepted.');
    }
    const result = await processPrivateMessage(
      this.roomState(),
      decoded.privateMessage,
      emptyPskIndex,
      await cipherSuite()
    );
    this.state = result.newState;
    result.consumed.forEach(zeroOutUint8Array);
    if (result.kind === 'newState') return null;
    const message = messageSchema.parse(
      JSON.parse(text.decode(result.message))
    );
    if (
      message.attachments.length !== envelope.objects.length ||
      new Set(envelope.objects.map((object) => object.id)).size !==
        envelope.objects.length ||
      !message.attachments.every((ref) =>
        envelope.objects.some((object) => object.id === ref.id)
      )
    ) {
      throw new Error('Encrypted attachment objects do not match the message.');
    }
    if (Date.parse(message.expiresAt) <= Date.now())
      throw new Error('Message has expired.');
    if (this.archive.entries.length >= 500)
      throw new Error('Prototype history limit reached.');
    this.archive.entries.push({
      room: this.room!,
      message,
      objects: envelope.objects,
    });
    return structuredClone(message);
  }

  exportLocalSecrets(): string {
    const history = this.history;
    const retainedIds = new Set(
      history.entries.map((entry) => entry.message.id)
    );
    return JSON.stringify({
      version: 1,
      identity: this.identity,
      contact: this.contact,
      privatePackage: Object.fromEntries(
        Object.entries(this.keys.privatePackage).map(([name, value]) => [
          name,
          toBase64(value),
        ])
      ),
      trusted: [...this.trusted.values()],
      state: this.state ? toBase64(encodeGroupState(this.state)) : null,
      archive: history,
      outgoing: [...this.outgoing]
        .filter(
          ([id, value]) =>
            retainedIds.has(id) &&
            Date.parse(value.message.expiresAt) > Date.now()
        )
        .map(([id, value]) => ({
          id,
          message: value.message,
          frame: value.envelope.frame,
        })),
    });
  }

  static async restoreLocalSecrets(value: string): Promise<PrototypeClient> {
    const snapshot = localSnapshotSchema.parse(JSON.parse(value));
    const client = new PrototypeClient(snapshot.identity, {
      publicPackage: contactPackage(snapshot.contact),
      privatePackage: {
        initPrivateKey: fromBase64(snapshot.privatePackage.initPrivateKey, 128),
        hpkePrivateKey: fromBase64(snapshot.privatePackage.hpkePrivateKey, 128),
        signaturePrivateKey: fromBase64(
          snapshot.privatePackage.signaturePrivateKey,
          128
        ),
      },
    });
    if (
      JSON.stringify(
        credentialIdentity(client.keys.publicPackage.leafNode.credential)
      ) !== JSON.stringify(snapshot.identity) ||
      snapshot.archive.actor !== snapshot.identity.actor
    ) {
      throw new Error('Device state belongs to another identity.');
    }
    for (const contact of snapshot.trusted) await client.trust(contact);
    if (snapshot.state) {
      const bytes = fromBase64(snapshot.state);
      const decoded = decodeGroupState(bytes, 0);
      if (!decoded || decoded[1] !== bytes.length)
        throw new Error('Invalid saved MLS state.');
      client.state = { ...decoded[0], clientConfig: client.config() };
    }
    client.archive = snapshot.archive;
    for (const entry of snapshot.outgoing) {
      const history = snapshot.archive.entries.find(
        (item) => item.message.id === entry.id
      );
      if (!history || entry.message.id !== entry.id) {
        throw new Error('Saved retry state has no corresponding history.');
      }
      client.outgoing.set(entry.id, {
        message: entry.message,
        envelope: { version: 1, frame: entry.frame, objects: history.objects },
      });
    }
    return client;
  }

  private async restoreHistoryOnce(
    value: unknown,
    recoveryKey: string
  ): Promise<void> {
    const secret = fromBase64(recoveryKey, 32);
    try {
      const decrypted = await unseal(
        value,
        await importSecret(secret),
        'history-backup',
        this.identity.actor
      );
      try {
        const archive = archiveSchema.parse(JSON.parse(text.decode(decrypted)));
        if (archive.actor !== this.identity.actor)
          throw new Error('Backup belongs to another profile.');
        const entries = new Map(
          this.history.entries.map((entry) => [entry.message.id, entry])
        );
        for (const entry of archive.entries) {
          if (Date.parse(entry.message.expiresAt) > Date.now())
            entries.set(entry.message.id, entry);
        }
        if (entries.size > 500)
          throw new Error('Prototype history limit reached.');
        this.archive = {
          version: 1,
          actor: archive.actor,
          entries: [...entries.values()],
        };
      } finally {
        decrypted.fill(0);
      }
    } finally {
      secret.fill(0);
    }
  }

  async backupHistory(recoveryKey: string): Promise<SealedObject> {
    const secret = fromBase64(recoveryKey, 32);
    try {
      // History only: restoring a backup must not clone live ratchet/device state.
      return await seal(
        utf8.encode(JSON.stringify(this.history)),
        await importSecret(secret),
        'history-backup',
        this.identity.actor
      );
    } finally {
      secret.fill(0);
    }
  }
}

export function createRecoveryKey(): string {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  try {
    return toBase64(secret);
  } finally {
    secret.fill(0);
  }
}
