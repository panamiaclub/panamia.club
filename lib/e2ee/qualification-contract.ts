import { z } from 'zod';
import { sealedObjectSchema, type SealedObject } from './sealed-object';

// Synthetic-account lab formats, not the production enrollment/wire contract.
export const encodedSchema = z.string().max(1024 * 1024);
export const identitySchema = z
  .object({
    actor: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    device: z.uuid(),
  })
  .strict();
export const referenceContactSchema = z
  .object({
    version: z.literal(1),
    keyPackage: encodedSchema,
  })
  .strict();
export type Contact = z.infer<typeof referenceContactSchema>;

export const messageSchema = z
  .object({
    id: z.uuid(),
    content: z.string().max(5000),
    attachments: z
      .array(
        z
          .object({
            id: z.uuid(),
            secret: z.string().max(44),
          })
          .strict()
      )
      .max(4),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type PrototypeMessage = z.infer<typeof messageSchema>;

export const envelopeSchema = z
  .object({
    version: z.literal(1),
    frame: encodedSchema,
    objects: z
      .array(
        z
          .object({
            id: z.uuid(),
            object: sealedObjectSchema,
          })
          .strict()
      )
      .max(4),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;

export const archiveSchema = z
  .object({
    version: z.literal(1),
    actor: identitySchema.shape.actor,
    entries: z
      .array(
        z
          .object({
            room: z.string().max(128),
            message: messageSchema,
            objects: envelopeSchema.shape.objects,
          })
          .strict()
      )
      .max(500),
  })
  .strict();
export type HistoryArchive = z.infer<typeof archiveSchema>;

export interface QualificationClient {
  readonly identity: z.infer<typeof identitySchema>;
  readonly contact: Contact;
  readonly room: string | null;
  readonly members: Array<{ actor: string; device: string; leaf: number }>;
  readonly history: HistoryArchive;
  trust(value: unknown): Promise<void>;
  createRoom(): Promise<void>;
  add(value: unknown): Promise<{ commit: Envelope; welcome: string }>;
  join(welcome: string): Promise<void>;
  remove(device: string): Promise<Envelope>;
  send(
    id: string,
    content: string,
    attachments?: Array<{
      id: string;
      secret: string;
      object: SealedObject;
    }>
  ): Promise<Envelope>;
  receive(value: unknown): Promise<PrototypeMessage | null>;
  exportLocalSecrets(): string;
  backupHistory(key: string): Promise<SealedObject>;
  restoreHistory(value: unknown, key: string): Promise<void>;
  acknowledgeCommit?(): Promise<void>;
  dispose?(): void;
}

export interface QualificationFactory {
  readonly database: string;
  readonly lockNamespace: string;
  readonly contextPrefix: string;
  create(actor: string): Promise<QualificationClient>;
  restore(value: string): Promise<QualificationClient>;
  describe(value: unknown): Promise<{
    actor: string;
    device: string;
    fingerprint: string;
  }>;
}
