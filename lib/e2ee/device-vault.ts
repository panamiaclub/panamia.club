import { z } from 'zod';
import { e2eeIdSchema, sha256, sha256Schema } from './identity-contract';
import { encryptedMessageSchema, type EncryptedMessage } from './room-contract';
import {
  sealRecord,
  unsealRecord,
  type EncryptedRecord,
} from './crypto-format';
import {
  createWrappingKey,
  openWrappingKey,
  removeWrappingKey,
  type WrappingKey,
} from './protection';

const DB_NAME = 'pana-chat-device-v1';
export const vaultScopeSchema = z
  .object({
    userId: e2eeIdSchema,
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
  })
  .strict();
export type VaultScope = z.infer<typeof vaultScopeSchema>;
export const checkpointSchema = z
  .object({
    operationId: z.uuid(),
    previousHash: sha256Schema.nullable(),
    nextHash: sha256Schema,
  })
  .strict();
export type PendingCheckpoint = z.infer<typeof checkpointSchema>;
const envelopeSchema = z
  .object({
    version: z.literal(1),
    state: z.string().max(60 * 1024 * 1024),
    stateHash: sha256Schema,
    checkpoint: checkpointSchema.nullable(),
  })
  .strict();
const replacementSchema = z
  .object({
    version: z.literal(1),
    state: z.string().max(60 * 1024 * 1024),
    stateHash: sha256Schema,
    request: z.string().max(128 * 1024),
  })
  .strict();
type Replacement = z.infer<typeof replacementSchema> & {
  key: CryptoKey;
  wrapping: WrappingKey;
};
type Envelope = z.infer<typeof envelopeSchema>;
type VaultRow = { wrapping: WrappingKey; record: EncryptedRecord };
export type HistoryEntry = {
  roomId: string;
  id: string;
  sequence: number;
  expiresAt: string;
  createdAt: string;
  message: EncryptedMessage;
};
type StoredHistory = {
  scope: string;
  roomId: string;
  id: string;
  sequence: number;
  expiresAt: string;
  record: EncryptedRecord;
};
const historyPayloadSchema = z
  .object({
    version: z.literal(1),
    sequence: z.number().int().positive(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    message: encryptedMessageSchema,
  })
  .strict();
export type VaultChanges = {
  history?: HistoryEntry[];
  removeHistory?: Array<{ roomId: string; id: string }>;
  media?: Array<{ id: string; bytes: Uint8Array; expiresAt: string }>;
  removeMedia?: string[];
};

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () =>
      reject(value.error ?? new Error('Encrypted device storage failed.'));
  });
}
function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(
        tx.error ?? new Error('Encrypted device storage transaction failed.')
      );
  });
}

export class DeviceVault {
  readonly scope: VaultScope;
  readonly context: string;
  private constructor(
    private readonly db: IDBDatabase,
    scope: VaultScope
  ) {
    this.scope = vaultScopeSchema.parse(scope);
    this.context = JSON.stringify(this.scope);
  }
  static async open(scope: VaultScope) {
    if (
      !globalThis.isSecureContext ||
      !crypto.subtle ||
      !globalThis.indexedDB ||
      !navigator.locks ||
      typeof AbortSignal.timeout !== 'function'
    )
      throw new Error(
        'Update your browser or system WebView. Encrypted messaging requires secure storage, serialized device operations and bounded requests.'
      );
    vaultScopeSchema.parse(scope);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open(DB_NAME, 1);
      let blocked = false;
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore('vaults');
        const history = opening.result.createObjectStore('history', {
          keyPath: ['scope', 'roomId', 'id'],
        });
        history.createIndex('room', ['scope', 'roomId', 'sequence']);
        history.createIndex('scope', 'scope');
        const media = opening.result.createObjectStore('media', {
          keyPath: ['scope', 'id'],
        });
        media.createIndex('scope', 'scope');
      };
      opening.onblocked = () => {
        blocked = true;
        reject(
          new Error(
            'Close other Pana windows to upgrade encrypted device storage.'
          )
        );
      };
      opening.onerror = () =>
        reject(
          opening.error ?? new Error('Cannot open encrypted device storage.')
        );
      opening.onsuccess = () => {
        if (blocked) opening.result.close();
        else resolve(opening.result);
      };
    });
    db.onversionchange = () => db.close();
    return new DeviceVault(db, scope);
  }
  withLock<T>(operation: () => Promise<T>): Promise<T> {
    return navigator.locks.request(`pana-chat:${this.context}`, operation);
  }
  async load(): Promise<VaultSession | null> {
    const tx = this.db.transaction('vaults', 'readonly');
    const row = await request<VaultRow | undefined>(
      tx.objectStore('vaults').get(this.context)
    );
    if (!row) return null;
    const key = await openWrappingKey(row.wrapping);
    const clear = await unsealRecord(
      row.record,
      key,
      'device-state',
      this.context
    );
    try {
      const envelope = envelopeSchema.parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear))
      );
      const actual = await sha256(new TextEncoder().encode(envelope.state));
      if (
        actual !== envelope.stateHash ||
        (envelope.checkpoint && envelope.checkpoint.nextHash !== actual)
      )
        throw new Error(
          'Encrypted device state or its pending checkpoint is inconsistent. Recover onto fresh keys.'
        );
      return new VaultSession(this, key, row.wrapping, envelope);
    } finally {
      clear.fill(0);
    }
  }
  async initialize() {
    if (await this.load())
      throw new Error('This profile already has encrypted device state.');
    const { descriptor, key } = await createWrappingKey();
    return new VaultSession(this, key, descriptor, null);
  }
  async replacement(): Promise<Replacement | null> {
    const tx = this.db.transaction('vaults', 'readonly');
    const row = await request<VaultRow | undefined>(
      tx.objectStore('vaults').get(`${this.context}:replacement`)
    );
    if (!row) return null;
    const key = await openWrappingKey(row.wrapping);
    const clear = await unsealRecord(
      row.record,
      key,
      'device-state',
      `${this.context}:replacement`
    );
    try {
      const value = replacementSchema.parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear))
      );
      if (
        (await sha256(new TextEncoder().encode(value.state))) !==
        value.stateHash
      )
        throw new Error(
          'The staged replacement state is inconsistent. Existing device keys were not changed.'
        );
      return { ...value, key, wrapping: row.wrapping };
    } finally {
      clear.fill(0);
    }
  }
  async stageReplacement(state: string, publicRequest: string) {
    if (await this.replacement())
      throw new Error(
        'Finish or explicitly cancel the staged encryption identity reset first.'
      );
    const { descriptor, key } = await createWrappingKey();
    const value = replacementSchema.parse({
      version: 1,
      state,
      stateHash: await sha256(new TextEncoder().encode(state)),
      request: publicRequest,
    });
    const clear = new TextEncoder().encode(JSON.stringify(value));
    let record: EncryptedRecord;
    try {
      record = await sealRecord(
        clear,
        key,
        'device-state',
        `${this.context}:replacement`
      );
    } finally {
      clear.fill(0);
    }
    const tx = this.db.transaction('vaults', 'readwrite', {
      durability: 'strict',
    });
    tx.objectStore('vaults').put(
      { wrapping: descriptor, record },
      `${this.context}:replacement`
    );
    await completed(tx);
  }
  async discardReplacement() {
    const tx = this.db.transaction('vaults', 'readwrite', {
      durability: 'strict',
    });
    const row = await request<VaultRow | undefined>(
      tx.objectStore('vaults').get(`${this.context}:replacement`)
    );
    tx.objectStore('vaults').delete(`${this.context}:replacement`);
    await completed(tx);
    if (row) await removeWrappingKey(row.wrapping);
  }
  async promoteReplacement(replacement: Replacement) {
    const envelope: Envelope = {
      version: 1,
      state: replacement.state,
      stateHash: replacement.stateHash,
      checkpoint: null,
    };
    const clear = new TextEncoder().encode(
      JSON.stringify(envelopeSchema.parse(envelope))
    );
    let record: EncryptedRecord;
    try {
      record = await sealRecord(
        clear,
        replacement.key,
        'device-state',
        this.context
      );
    } finally {
      clear.fill(0);
    }
    const reading = this.db.transaction('vaults', 'readonly');
    const previous = await request<VaultRow | undefined>(
      reading.objectStore('vaults').get(this.context)
    );
    const tx = this.db.transaction(
      ['vaults', 'history', 'media'],
      'readwrite',
      { durability: 'strict' }
    );
    tx.objectStore('vaults').put(
      { wrapping: replacement.wrapping, record },
      this.context
    );
    tx.objectStore('vaults').delete(`${this.context}:replacement`);
    for (const name of ['history', 'media']) {
      const cursor = tx
        .objectStore(name)
        .index('scope')
        .openCursor(IDBKeyRange.only(this.context));
      cursor.onsuccess = () => {
        if (cursor.result) {
          cursor.result.delete();
          cursor.result.continue();
        }
      };
    }
    await completed(tx);
    if (previous) await removeWrappingKey(previous.wrapping);
  }
  async commit(
    session: VaultSession,
    envelope: Envelope,
    changes: VaultChanges = {}
  ) {
    const clear = new TextEncoder().encode(
      JSON.stringify(envelopeSchema.parse(envelope))
    );
    let record: EncryptedRecord;
    try {
      record = await sealRecord(
        clear,
        session.key,
        'device-state',
        this.context
      );
    } finally {
      clear.fill(0);
    }
    const history: StoredHistory[] = await Promise.all(
      (changes.history ?? []).map(async (entry) => {
        const message = encryptedMessageSchema.parse(entry.message);
        if (
          message.roomId !== entry.roomId ||
          message.attemptId !== entry.id ||
          !Number.isSafeInteger(entry.sequence) ||
          entry.sequence < 1
        )
          throw new Error('Invalid authenticated history entry.');
        z.iso.datetime().parse(entry.expiresAt);
        if (Date.parse(entry.expiresAt) > Date.parse(message.expiresAt))
          throw new Error(
            'Local history cannot extend authenticated message expiry.'
          );
        const payload = historyPayloadSchema.parse({
          version: 1,
          sequence: entry.sequence,
          expiresAt: entry.expiresAt,
          createdAt: entry.createdAt,
          message,
        });
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        try {
          return {
            scope: this.context,
            roomId: entry.roomId,
            id: entry.id,
            sequence: entry.sequence,
            expiresAt: entry.expiresAt,
            record: await sealRecord(
              bytes,
              session.key,
              'message-record',
              `${this.context}:${entry.roomId}:${entry.id}`
            ),
          };
        } finally {
          bytes.fill(0);
        }
      })
    );
    for (const media of changes.media ?? []) {
      z.uuid().parse(media.id);
      z.iso.datetime().parse(media.expiresAt);
      if (media.bytes.length < 17 || media.bytes.length > 10 * 1024 * 1024 + 16)
        throw new Error('Invalid encrypted local attachment size.');
    }
    const tx = this.db.transaction(
      ['vaults', 'history', 'media'],
      'readwrite',
      { durability: 'strict' }
    );
    try {
      tx.objectStore('vaults').put(
        { wrapping: session.wrapping, record },
        this.context
      );
      for (const entry of history) tx.objectStore('history').put(entry);
      for (const entry of changes.removeHistory ?? [])
        tx.objectStore('history').delete([
          this.context,
          entry.roomId,
          entry.id,
        ]);
      for (const media of changes.media ?? []) {
        tx.objectStore('media').put({
          scope: this.context,
          id: media.id,
          bytes: Uint8Array.from(media.bytes).buffer,
          expiresAt: media.expiresAt,
        });
      }
      for (const id of changes.removeMedia ?? [])
        tx.objectStore('media').delete([this.context, id]);
    } catch (error) {
      tx.abort();
      throw error;
    }
    await completed(tx);
    session.envelope = envelope;
  }
  async history(
    session: VaultSession,
    roomId: string,
    before = Number.MAX_SAFE_INTEGER,
    limit = 100
  ): Promise<HistoryEntry[]> {
    z.uuid().parse(roomId);
    if (
      !Number.isSafeInteger(before) ||
      before < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error('Invalid encrypted history cursor.');
    const tx = this.db.transaction('history', 'readonly');
    const rows = await new Promise<StoredHistory[]>((resolve, reject) => {
      const values: StoredHistory[] = [];
      const range = IDBKeyRange.bound(
        [this.context, roomId, 0],
        [this.context, roomId, before],
        false,
        true
      );
      const opening = tx
        .objectStore('history')
        .index('room')
        .openCursor(range, 'prev');
      opening.onerror = () =>
        reject(
          opening.error ?? new Error('Cannot read encrypted local history.')
        );
      opening.onsuccess = () => {
        const cursor = opening.result;
        if (!cursor || values.length >= limit) {
          resolve(values);
          return;
        }
        const value: StoredHistory = cursor.value;
        if (Date.parse(value.expiresAt) > Date.now()) values.push(value);
        cursor.continue();
      };
    });
    const result = await Promise.all(
      rows.map(async (row) => {
        const clear = await unsealRecord(
          row.record,
          session.key,
          'message-record',
          `${this.context}:${roomId}:${row.id}`
        );
        try {
          const payload = historyPayloadSchema.parse(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear))
          );
          const message = payload.message;
          if (
            message.roomId !== roomId ||
            message.attemptId !== row.id ||
            payload.sequence !== row.sequence ||
            payload.expiresAt !== row.expiresAt
          )
            throw new Error(
              'Local encrypted history belongs to another conversation.'
            );
          if (
            Date.parse(payload.expiresAt) <= Date.now() ||
            Date.parse(message.expiresAt) <= Date.now()
          )
            return null;
          return {
            roomId,
            id: row.id,
            sequence: row.sequence,
            expiresAt: row.expiresAt,
            createdAt: payload.createdAt,
            message,
          };
        } finally {
          clear.fill(0);
        }
      })
    );
    return result
      .filter((entry): entry is HistoryEntry => entry !== null)
      .reverse();
  }
  async media(id: string): Promise<Uint8Array | null> {
    const tx = this.db.transaction('media', 'readonly');
    const row = await request<
      { bytes: ArrayBuffer; expiresAt: string } | undefined
    >(tx.objectStore('media').get([this.context, id]));
    if (!row || Date.parse(row.expiresAt) <= Date.now()) return null;
    if (
      !(row.bytes instanceof ArrayBuffer) ||
      row.bytes.byteLength < 17 ||
      row.bytes.byteLength > 10 * 1024 * 1024 + 16
    )
      throw new Error(
        'The saved encrypted attachment is invalid. Recover a fresh device or download a new authorized copy.'
      );
    return new Uint8Array(row.bytes);
  }
  async forget() {
    const session = await this.load();
    if (!session) return;
    await removeWrappingKey(session.wrapping);
    await this.discardLocal();
  }
  /** Explicit recovery only: never regenerate a copied/missing native key. */
  async discardLocal() {
    const tx = this.db.transaction(
      ['vaults', 'history', 'media'],
      'readwrite',
      { durability: 'strict' }
    );
    tx.objectStore('vaults').delete(this.context);
    for (const name of ['history', 'media']) {
      const cursor = tx
        .objectStore(name)
        .index('scope')
        .openCursor(IDBKeyRange.only(this.context));
      cursor.onsuccess = () => {
        if (cursor.result) {
          cursor.result.delete();
          cursor.result.continue();
        }
      };
    }
    await completed(tx);
  }
  close() {
    this.db.close();
  }
}

export class VaultSession {
  constructor(
    readonly vault: DeviceVault,
    readonly key: CryptoKey,
    readonly wrapping: WrappingKey,
    public envelope: Envelope | null
  ) {}
  get state() {
    return this.envelope?.state ?? null;
  }
  get stateHash() {
    return this.envelope?.stateHash ?? null;
  }
  get checkpoint() {
    return this.envelope?.checkpoint ?? null;
  }
  async save(
    state: string,
    checkpoint: PendingCheckpoint | null,
    changes: VaultChanges = {}
  ) {
    const stateHash = await sha256(new TextEncoder().encode(state));
    if (checkpoint && checkpoint.nextHash !== stateHash)
      throw new Error(
        'The saved ratchet state must match its checkpoint exactly.'
      );
    await this.vault.commit(
      this,
      { version: 1, state, stateHash, checkpoint },
      changes
    );
    return stateHash;
  }
  async acknowledgeCheckpoint() {
    if (!this.envelope)
      throw new Error('No encrypted state is available to acknowledge.');
    await this.vault.commit(this, { ...this.envelope, checkpoint: null });
  }
}
