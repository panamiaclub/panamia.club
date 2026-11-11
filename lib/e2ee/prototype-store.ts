import { PrototypeClient, describeContact } from './prototype';
import { seal, unseal, type SealedObject } from './sealed-object';
import type {
  QualificationClient,
  QualificationFactory,
} from './qualification-contract';

const STORE = 'records';
export const referenceFactory: QualificationFactory = {
  database: 'pana-e2ee-prototype-v1',
  lockNamespace: 'pana-e2ee-prototype',
  contextPrefix: '',
  create: (actor) => PrototypeClient.create(actor),
  restore: (value) => PrototypeClient.restoreLocalSecrets(value),
  describe: describeContact,
};

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () =>
      reject(value.error ?? new Error('Device storage failed.'));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        transaction.error ?? new Error('Device storage transaction failed.')
      );
  });
}

export class PrototypeStore {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly factory: QualificationFactory
  ) {}

  static async open(
    factory: QualificationFactory = referenceFactory
  ): Promise<PrototypeStore> {
    if (
      !globalThis.isSecureContext ||
      !navigator.locks ||
      !globalThis.indexedDB
    ) {
      throw new Error(
        'This lab requires a secure browser with IndexedDB and Web Locks.'
      );
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open(factory.database, 1);
      let blocked = false;
      opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
      opening.onblocked = () => {
        blocked = true;
        reject(
          new Error('Close other lab windows before upgrading device storage.')
        );
      };
      opening.onerror = () =>
        reject(opening.error ?? new Error('Cannot open device storage.'));
      opening.onsuccess = () => {
        if (blocked) opening.result.close();
        else resolve(opening.result);
      };
    });
    db.onversionchange = () => db.close();
    return new PrototypeStore(db, factory);
  }

  private async read<T>(id: string): Promise<T | undefined> {
    const transaction = this.db.transaction(STORE, 'readonly');
    const finished = complete(transaction);
    const [result] = await Promise.all([
      request<T | undefined>(transaction.objectStore(STORE).get(id)),
      finished,
    ]);
    return result;
  }

  private async write(key: string, value: unknown): Promise<void> {
    const transaction = this.db.transaction(STORE, 'readwrite');
    const finished = complete(transaction);
    transaction.objectStore(STORE).put(value, key);
    await finished;
  }

  async storedCiphertext(actor: string): Promise<SealedObject | undefined> {
    return this.read<SealedObject>(`state:${actor}`);
  }

  async withDevice<T>(
    actor: string,
    operation: (client: QualificationClient) => Promise<T>
  ): Promise<T> {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(actor))
      throw new Error('Use a short lab identity without spaces.');
    return navigator.locks.request(
      `${this.factory.lockNamespace}:${actor}`,
      async () => {
        const context = this.factory.contextPrefix + actor;
        let key = await this.read<CryptoKey>(`key:${actor}`);
        const saved = await this.storedCiphertext(actor);
        if (saved && !key)
          throw new Error(
            'Local encryption key is missing. Recover history onto a new device.'
          );
        if (!key) {
          key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );
          await this.write(`key:${actor}`, key);
        }
        if (
          !(key instanceof CryptoKey) ||
          key.extractable ||
          key.algorithm.name !== 'AES-GCM'
        ) {
          throw new Error('Invalid local device encryption key.');
        }
        let client: QualificationClient;
        if (saved) {
          const clear = await unseal(saved, key, 'local-state', context);
          try {
            client = await this.factory.restore(
              new TextDecoder().decode(clear)
            );
            if (client.identity.actor !== actor) {
              client.dispose?.();
              throw new Error('Device belongs to a different profile.');
            }
          } finally {
            clear.fill(0);
          }
        } else {
          client = await this.factory.create(actor);
        }
        try {
          return await operation(client);
        } finally {
          // Persist state before returning an outbound frame, including after a
          // valid MLS frame whose application payload was rejected.
          try {
            const clear = new TextEncoder().encode(client.exportLocalSecrets());
            try {
              const sealed = await seal(clear, key, 'local-state', context);
              await this.write(`state:${actor}`, sealed);
            } finally {
              clear.fill(0);
            }
          } finally {
            client.dispose?.();
          }
        }
      }
    );
  }

  async forgetDevice(actor: string): Promise<void> {
    await navigator.locks.request(
      `${this.factory.lockNamespace}:${actor}`,
      async () => {
        const transaction = this.db.transaction(STORE, 'readwrite');
        const finished = complete(transaction);
        transaction.objectStore(STORE).delete(`state:${actor}`);
        transaction.objectStore(STORE).delete(`key:${actor}`);
        await finished;
      }
    );
  }

  close(): void {
    this.db.close();
  }
}
