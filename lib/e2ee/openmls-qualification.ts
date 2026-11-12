import init, { MlsDevice } from '../../crypto/openmls/pkg/pana_openmls.js';
import { z } from 'zod';
import {
  archiveSchema,
  encodedSchema,
  envelopeSchema,
  identitySchema,
  messageSchema,
  type Envelope,
  type HistoryArchive,
  type PrototypeMessage,
  type QualificationClient,
  type QualificationFactory,
} from './qualification-contract';
import {
  retainedHistory,
  restoreRetainedHistory,
  sealHistory,
} from './qualification-history';
import { fromBase64, toBase64, type SealedObject } from './sealed-object';

const ENGINE = 'openmls-0.9.2';
const utf8 = new TextEncoder();
const text = new TextDecoder('utf-8', { fatal: true });
const bytesSchema = z.array(z.number().int().min(0).max(255)).max(1024 * 1024);
const memberSchema = z
  .object({
    identity: z.string().max(512),
    public_key: bytesSchema,
    index: z.number().int().nonnegative(),
  })
  .strict();
const roomSchema = z
  .object({
    room: z.string().max(128),
    epoch: z.string().regex(/^\d+$/),
    active: z.boolean(),
    pending_commit: z.boolean(),
    members: z.array(memberSchema),
  })
  .strict();
const contactSchema = z
  .object({
    version: z.literal(1),
    engine: z.literal(ENGINE),
    keyPackage: encodedSchema,
  })
  .strict();
const invitationSchema = z
  .object({
    version: z.literal(1),
    engine: z.literal(ENGINE),
    room: z.uuid(),
    welcome: encodedSchema,
  })
  .strict();
const membershipSchema = z
  .object({
    commit: bytesSchema,
    welcome: bytesSchema.nullable(),
  })
  .strict();
const localSchema = z
  .object({
    version: z.literal(1),
    engine: z.literal(ENGINE),
    identity: identitySchema,
    contact: contactSchema,
    contactIssuedAt: z.number().int().nonnegative(),
    room: z.uuid().nullable(),
    native: z.string().max(90 * 1024 * 1024),
    archive: archiveSchema,
    outgoing: z
      .array(
        z
          .object({
            message: messageSchema,
            frame: encodedSchema,
          })
          .strict()
      )
      .max(500),
  })
  .strict();
let initialization: Promise<void> | undefined;

export async function initializeOpenMLS(bytes?: Uint8Array): Promise<void> {
  initialization ??= init(
    bytes ? { module_or_path: Uint8Array.from(bytes).buffer } : undefined
  ).then(() => undefined);
  return initialization;
}

function engineCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw new Error(
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : 'OpenMLS operation failed.',
      { cause: error }
    );
  }
}

async function describe(value: unknown) {
  await initializeOpenMLS();
  const contact = contactSchema.parse(value);
  const member = memberSchema.parse(
    JSON.parse(
      engineCall(() =>
        MlsDevice.describeKeyPackage(
          fromBase64(contact.keyPackage, 1024 * 1024)
        )
      )
    )
  );
  const identity = identitySchema.parse(JSON.parse(member.identity));
  const hash = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      Uint8Array.from(member.public_key).buffer
    )
  );
  return {
    ...identity,
    fingerprint: [...hash]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
  };
}

/**
 * Synthetic-account qualification adapter, not production enrollment.
 * Approval and delivery acknowledgement remain explicit caller responsibilities.
 */
export class OpenMlsQualificationClient implements QualificationClient {
  readonly identity: z.infer<typeof identitySchema>;
  readonly contact: z.infer<typeof contactSchema>;
  private readonly contactIssuedAt: number;
  private native: MlsDevice;
  private currentRoom: string | null = null;
  private archive: HistoryArchive;
  private outgoing = new Map<
    string,
    { message: PrototypeMessage; envelope: Envelope }
  >();
  private changing = false;
  private disposed = false;

  private constructor(
    identity: z.infer<typeof identitySchema>,
    native: MlsDevice,
    contact: z.infer<typeof contactSchema>,
    contactIssuedAt = Date.now()
  ) {
    this.identity = identity;
    this.native = native;
    this.contact = contact;
    this.contactIssuedAt = contactIssuedAt;
    this.archive = { version: 1, actor: identity.actor, entries: [] };
  }

  static async create(actor: string) {
    await initializeOpenMLS();
    const identity = identitySchema.parse({
      actor,
      device: crypto.randomUUID(),
    });
    const native = engineCall(() => new MlsDevice(JSON.stringify(identity)));
    try {
      return new OpenMlsQualificationClient(identity, native, {
        version: 1,
        engine: ENGINE,
        keyPackage: toBase64(engineCall(() => native.keyPackage())),
      });
    } catch (error) {
      native.free();
      throw error;
    }
  }

  private core(): MlsDevice {
    if (this.disposed)
      throw new Error('The local MLS engine has been disposed.');
    return this.native;
  }

  private roomId(): string {
    if (!this.currentRoom)
      throw new Error('Create or join an encrypted room first.');
    return this.currentRoom;
  }

  private info() {
    return roomSchema.parse(
      JSON.parse(engineCall(() => this.core().roomInfo(this.roomId())))
    );
  }

  private async change<T>(operation: () => Promise<T>): Promise<T> {
    this.core();
    if (this.changing)
      throw new Error(
        'Concurrent device operations require a serialized storage transaction.'
      );
    this.changing = true;
    try {
      return await operation();
    } finally {
      this.changing = false;
    }
  }

  get room() {
    return this.currentRoom;
  }
  get members() {
    if (!this.currentRoom) return [];
    return this.info().members.map((member) => ({
      ...identitySchema.parse(JSON.parse(member.identity)),
      leaf: member.index,
    }));
  }
  get history() {
    return retainedHistory(this.archive);
  }

  trust(value: unknown) {
    return this.change(async () => {
      const contact = contactSchema.parse(value);
      const member = memberSchema.parse(
        JSON.parse(
          engineCall(() =>
            MlsDevice.describeKeyPackage(
              fromBase64(contact.keyPackage, 1024 * 1024)
            )
          )
        )
      );
      identitySchema.parse(JSON.parse(member.identity));
      engineCall(() =>
        this.core().approveIdentity(
          member.identity,
          Uint8Array.from(member.public_key)
        )
      );
    });
  }

  createRoom() {
    return this.change(async () => {
      if (this.currentRoom)
        throw new Error('This qualification device already has a room.');
      const room = crypto.randomUUID();
      engineCall(() => this.core().createRoom(room));
      this.currentRoom = room;
    });
  }

  add(value: unknown) {
    return this.change(async () => {
      const contact = contactSchema.parse(value);
      const frames = membershipSchema.parse(
        JSON.parse(
          engineCall(() =>
            this.core().addMember(
              this.roomId(),
              fromBase64(contact.keyPackage, 1024 * 1024)
            )
          )
        )
      );
      if (!frames.welcome) throw new Error('No MLS invitation was generated.');
      return {
        commit: {
          version: 1 as const,
          frame: toBase64(Uint8Array.from(frames.commit)),
          objects: [],
        },
        welcome: JSON.stringify({
          version: 1,
          engine: ENGINE,
          room: this.roomId(),
          welcome: toBase64(Uint8Array.from(frames.welcome)),
        }),
      };
    });
  }

  acknowledgeCommit() {
    return this.change(async () => {
      engineCall(() => this.core().acknowledgeCommit(this.roomId()));
    });
  }

  join(value: string) {
    return this.change(async () => {
      if (this.currentRoom)
        throw new Error('A device cannot reuse an MLS invitation.');
      const invitation = invitationSchema.parse(JSON.parse(value));
      engineCall(() =>
        this.core().joinRoom(
          invitation.room,
          fromBase64(invitation.welcome, 1024 * 1024)
        )
      );
      this.currentRoom = invitation.room;
    });
  }

  remove(device: string) {
    return this.change(async () => {
      const member = this.info().members.find(
        (member) =>
          identitySchema.parse(JSON.parse(member.identity)).device === device
      );
      if (!member) throw new Error('Choose a current device to remove.');
      const frames = membershipSchema.parse(
        JSON.parse(
          engineCall(() =>
            this.core().removeMember(this.roomId(), member.identity)
          )
        )
      );
      return {
        version: 1 as const,
        frame: toBase64(Uint8Array.from(frames.commit)),
        objects: [],
      };
    });
  }

  send(
    id: string,
    content: string,
    attachments: Array<{
      id: string;
      secret: string;
      object: SealedObject;
    }> = []
  ) {
    return this.change(async () => {
      const previous = this.outgoing.get(id);
      const references = attachments.map(({ id, secret }) => ({ id, secret }));
      if (previous) {
        if (Date.parse(previous.message.expiresAt) <= Date.now())
          throw new Error('Cannot retry an expired message.');
        if (
          previous.message.content !== content ||
          JSON.stringify(previous.message.attachments) !==
            JSON.stringify(references)
        )
          throw new Error('A retry must contain the original message.');
        return structuredClone(previous.envelope);
      }
      if (this.archive.entries.length >= 500)
        throw new Error('Qualification history limit reached.');
      const message = messageSchema.parse({
        id,
        content,
        attachments: references,
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
      if (!content.trim() && !attachments.length)
        throw new Error('Write a message or attach a file.');
      const clear = utf8.encode(JSON.stringify(message));
      let frame: Uint8Array;
      try {
        frame = engineCall(() =>
          this.core().encryptMessage(this.roomId(), clear)
        );
      } finally {
        clear.fill(0);
      }
      const envelope: Envelope = {
        version: 1,
        frame: toBase64(frame),
        objects: attachments.map(({ id, object }) => ({ id, object })),
      };
      this.outgoing.set(id, { message, envelope });
      this.archive.entries.push({
        room: this.roomId(),
        message,
        objects: envelope.objects,
      });
      return structuredClone(envelope);
    });
  }

  receive(value: unknown) {
    return this.change(async () => {
      const envelope = envelopeSchema.parse(value);
      const result = z
        .object({
          kind: z.enum(['message', 'commit']),
          sender: z.string().max(512),
          content: bytesSchema,
        })
        .strict()
        .parse(
          JSON.parse(
            engineCall(() =>
              this.core().processMessage(
                this.roomId(),
                fromBase64(envelope.frame, 1024 * 1024)
              )
            )
          )
        );
      if (result.kind === 'commit') return null;
      const clear = Uint8Array.from(result.content);
      let message: PrototypeMessage;
      try {
        message = messageSchema.parse(JSON.parse(text.decode(clear)));
      } finally {
        clear.fill(0);
      }
      if (
        message.attachments.length !== envelope.objects.length ||
        new Set(envelope.objects.map((object) => object.id)).size !==
          envelope.objects.length ||
        !message.attachments.every((ref) =>
          envelope.objects.some((object) => object.id === ref.id)
        )
      )
        throw new Error(
          'Encrypted attachment objects do not match the message.'
        );
      if (Date.parse(message.expiresAt) <= Date.now())
        throw new Error('Message has expired.');
      if (this.archive.entries.length >= 500)
        throw new Error('Qualification history limit reached.');
      this.archive.entries.push({
        room: this.roomId(),
        message,
        objects: envelope.objects,
      });
      return structuredClone(message);
    });
  }

  exportLocalSecrets() {
    const history = this.history;
    const retained = new Set(history.entries.map((entry) => entry.message.id));
    const state = engineCall(() => this.core().snapshotLocal());
    try {
      return JSON.stringify({
        version: 1,
        engine: ENGINE,
        identity: this.identity,
        contact: this.contact,
        contactIssuedAt: this.contactIssuedAt,
        room: this.currentRoom,
        native: toBase64(state),
        archive: history,
        outgoing: [...this.outgoing]
          .filter(([id]) => retained.has(id))
          .map(([, value]) => ({
            message: value.message,
            frame: value.envelope.frame,
          })),
      });
    } finally {
      state.fill(0);
    }
  }

  static async restore(value: string) {
    await initializeOpenMLS();
    const snapshot = localSchema.parse(JSON.parse(value));
    if (snapshot.archive.actor !== snapshot.identity.actor)
      throw new Error('History belongs to another profile.');
    const state = fromBase64(snapshot.native);
    let native: MlsDevice;
    try {
      native = engineCall(() => MlsDevice.restoreLocal(state));
    } finally {
      state.fill(0);
    }
    try {
      if (native.deviceIdentity() !== JSON.stringify(snapshot.identity)) {
        throw new Error('Local MLS state belongs to another identity.');
      }
      const renew = Date.now() - snapshot.contactIssuedAt >= 86_400_000;
      const contact: z.infer<typeof contactSchema> = renew
        ? {
            version: 1 as const,
            engine: ENGINE,
            keyPackage: toBase64(engineCall(() => native.keyPackage())),
          }
        : snapshot.contact;
      const publicContact = memberSchema.parse(
        JSON.parse(
          engineCall(() =>
            MlsDevice.describeKeyPackage(
              fromBase64(contact.keyPackage, 1024 * 1024)
            )
          )
        )
      );
      if (
        publicContact.identity !== JSON.stringify(snapshot.identity) ||
        toBase64(Uint8Array.from(publicContact.public_key)) !==
          toBase64(native.publicKey())
      )
        throw new Error('Local MLS state belongs to another identity.');
      const client = new OpenMlsQualificationClient(
        snapshot.identity,
        native,
        contact,
        renew ? Date.now() : snapshot.contactIssuedAt
      );
      client.currentRoom = snapshot.room;
      if (snapshot.room) client.info();
      client.archive = snapshot.archive;
      for (const entry of snapshot.outgoing) {
        const history = client.archive.entries.find(
          (item) => item.message.id === entry.message.id
        );
        if (!history)
          throw new Error('Saved retry state has no corresponding history.');
        client.outgoing.set(entry.message.id, {
          message: entry.message,
          envelope: {
            version: 1,
            frame: entry.frame,
            objects: history.objects,
          },
        });
      }
      return client;
    } catch (error) {
      native.free();
      throw error;
    }
  }

  backupHistory(key: string) {
    return sealHistory(this.archive, key);
  }
  restoreHistory(value: unknown, key: string) {
    return this.change(async () => {
      this.archive = await restoreRetainedHistory(this.archive, value, key);
    });
  }
  dispose() {
    if (!this.disposed) {
      this.native.free();
      this.disposed = true;
    }
  }
}

export const openMlsQualificationFactory: QualificationFactory = {
  database: 'pana-e2ee-openmls-v1',
  lockNamespace: 'pana-e2ee-openmls-v1',
  contextPrefix: `${ENGINE}:`,
  create: (actor) => OpenMlsQualificationClient.create(actor),
  restore: (value) => OpenMlsQualificationClient.restore(value),
  describe,
};
