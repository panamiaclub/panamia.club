import { archiveSchema, type HistoryArchive } from './qualification-contract';
import {
  fromBase64,
  importSecret,
  seal,
  unseal,
  type SealedObject,
} from './sealed-object';

export function retainedHistory(archive: HistoryArchive): HistoryArchive {
  return structuredClone({
    ...archive,
    entries: archive.entries.filter(
      (entry) => Date.parse(entry.message.expiresAt) > Date.now()
    ),
  });
}

export async function sealHistory(
  archive: HistoryArchive,
  recoveryKey: string
): Promise<SealedObject> {
  const secret = fromBase64(recoveryKey, 32);
  const clear = new TextEncoder().encode(
    JSON.stringify(retainedHistory(archive))
  );
  try {
    return await seal(
      clear,
      await importSecret(secret),
      'history-backup',
      archive.actor
    );
  } finally {
    secret.fill(0);
    clear.fill(0);
  }
}

export async function restoreRetainedHistory(
  current: HistoryArchive,
  value: unknown,
  recoveryKey: string
): Promise<HistoryArchive> {
  const secret = fromBase64(recoveryKey, 32);
  try {
    const clear = await unseal(
      value,
      await importSecret(secret),
      'history-backup',
      current.actor
    );
    try {
      const archive = archiveSchema.parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear))
      );
      if (archive.actor !== current.actor)
        throw new Error('Backup belongs to another profile.');
      const entries = new Map(
        retainedHistory(current).entries.map((entry) => [
          entry.message.id,
          entry,
        ])
      );
      for (const entry of retainedHistory(archive).entries)
        entries.set(entry.message.id, entry);
      if (entries.size > 500)
        throw new Error('Prototype history limit reached.');
      return {
        version: 1,
        actor: current.actor,
        entries: [...entries.values()],
      };
    } finally {
      clear.fill(0);
    }
  } finally {
    secret.fill(0);
  }
}
