'use client';

import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useEncryptionDevice,
  type EncryptionConnection,
} from '../_lib/encryption';

const button =
  'border-pana-indigo/25 text-pana-indigo min-h-10 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50';

export function EncryptionSettings({
  connection,
}: {
  connection: EncryptionConnection;
}) {
  const [open, setOpen] = useState(false);
  if (!connection.context?.enabled && !connection.context?.required)
    return null;
  return (
    <>
      <button
        type="button"
        className={`${button} inline-flex items-center gap-2`}
        onClick={() => setOpen(true)}
      >
        <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Encryption &amp;
        devices
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Private messaging devices</DialogTitle>
            <DialogDescription>
              Approval and your personal key protect this profile. Signing in
              alone does not unlock encrypted history.
            </DialogDescription>
          </DialogHeader>
          <EncryptionControls connection={connection} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EncryptionControls({
  connection,
}: {
  connection: EncryptionConnection;
}) {
  const device = useEncryptionDevice(connection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [recovery, setRecovery] = useState('');
  const [fresh, setFresh] = useState(false);
  const [selectedRevocation, setSelectedRevocation] = useState<string | null>(
    null
  );
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const [identityReset, setIdentityReset] = useState<{
    requestId: string;
    recoveryKey: string;
    rootPublicKey: string;
    accepted: boolean;
  } | null>(null);
  const [resetSaved, setResetSaved] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const client = connection.client;
  const status = device.data?.status;
  const act = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      await device.refetch();
      await connection.refresh();
    } catch (value) {
      setError(
        value instanceof Error ? value.message : 'The encryption action failed.'
      );
    } finally {
      setBusy(false);
    }
  };
  if (!connection.context?.enabled)
    return (
      <p className="px-5 py-4 text-sm" role="status">
        Encrypted messaging is paused. Existing encrypted conversations cannot
        fall back to plaintext.
      </p>
    );
  if (!client)
    return (
      <p
        className="px-5 py-4 text-sm"
        role={connection.error ? 'alert' : 'status'}
      >
        {connection.error ?? 'Opening protected encryption storage...'}
      </p>
    );
  return (
    <div className="space-y-4 p-3 text-sm">
      <p className="text-pana-ink/70">
        New encrypted messages and supported attachments stay on approved
        devices. Metadata and legacy history are not end-to-end encrypted. New
        group members do not receive earlier messages.
      </p>
      {(error || device.error || connection.error) && (
        <p className="text-pana-red-deep break-words" role="alert">
          {error ??
            (device.error instanceof Error
              ? device.error.message
              : connection.error)}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {status?.identity?.rotationRequired && (
        <p className="text-pana-red-deep text-xs" role="alert">
          Profile ownership changed. A current owner must explicitly reset and
          reverify the encryption identity. No messages can fall back to
          plaintext.
        </p>
      )}
      {status?.identity && (
        <p className="text-xs">
          This profile&apos;s public encryption identity:
          <code className="mt-1 block break-all">
            {status.identity.rootPublicKey}
          </code>
        </p>
      )}
      <button
        type="button"
        disabled={busy || device.isLoading}
        className={button}
        onClick={() =>
          void act(async () => {
            const result = await client.setup();
            if (result.recoveryKey) setKey(result.recoveryKey);
            setNotice(
              result.approved
                ? 'This device is approved.'
                : 'Request created. An owner with the authorization key must approve this device.'
            );
          })
        }
      >
        {device.data?.approved
          ? 'Show recovery key / refresh device'
          : 'Set up this device'}
      </button>
      {key && (
        <div
          className="border-pana-indigo/20 space-y-3 rounded-xl border p-3"
          data-private="true"
        >
          <p className="font-bold">
            Save your personal recovery key somewhere private and offline.
          </p>
          <p className="text-pana-ink/70 text-xs">
            Anyone with this key and access to your account can open retained
            backups. Pana cannot replace a lost key or recover expired messages.
          </p>
          <textarea
            aria-label="Personal recovery key"
            readOnly
            value={key}
            autoComplete="off"
            spellCheck={false}
            className="w-full resize-none rounded border p-2 font-mono text-xs break-all"
          />
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />
            I saved this key somewhere safe, separate from this device.
          </label>
          {!status?.identity?.encryptionRequired &&
            status?.canApprove &&
            device.data?.ownerKeyAvailable && (
              <button
                type="button"
                className={button}
                disabled={busy || !saved || !device.data?.approved}
                onClick={() =>
                  void act(async () => {
                    await client.activate(saved);
                    setKey(null);
                    setNotice(
                      'Encrypted DMs are required for this profile. Old clients cannot send plaintext DMs. Existing history is unchanged.'
                    );
                  })
                }
              >
                Enable encrypted DMs for this profile
              </button>
            )}
          <button type="button" className={button} onClick={() => setKey(null)}>
            Hide key
          </button>
        </div>
      )}
      {!device.data?.approved && status?.identity && (
        <p className="text-pana-ink/70 text-xs">
          Ask an owner to compare this device request on both devices, or use
          your personal recovery key below.
          {device.data?.localDeviceId && (
            <>
              {' '}
              Device ID:{' '}
              <code className="break-all">{device.data.localDeviceId}</code>.
            </>
          )}
        </p>
      )}
      <details className="space-y-3 rounded-xl border p-3">
        <summary className="cursor-pointer font-bold">
          Recover retained encrypted history
        </summary>
        <p className="mt-3 text-xs">
          Recovery restores only your authorized retained backup, not another
          member&apos;s history or an old live sending ratchet.
        </p>
        <input
          aria-label="Enter personal recovery key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={recovery}
          onChange={(event) => setRecovery(event.target.value)}
          className="mt-3 w-full rounded border p-2"
        />
        <label className="my-3 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={fresh}
            onChange={(event) => setFresh(event.target.checked)}
          />
          Replace broken local live state with a fresh device. Unsaved local
          messages will be lost; the key is checked before removing anything.
        </label>
        <button
          type="button"
          className={button}
          disabled={busy || !recovery.trim()}
          onClick={() =>
            void act(async () => {
              const result = await (fresh
                ? client.recoverToFreshDevice(recovery)
                : client.recover(recovery));
              setRecovery('');
              setFresh(false);
              setNotice(
                `Recovered ${result.messagesRestored} retained messages.${
                  result.unavailableBackups
                    ? ` ${result.unavailableBackups} backups could not be authenticated with this key; they may need an older recovery key.`
                    : ''
                } ${
                  result.approved
                    ? 'An existing participant must invite this device before new messages can be sent.'
                    : 'Owner approval is still required for this fresh device.'
                }`
              );
            })
          }
        >
          Recover with my key
        </button>
      </details>
      {status?.canApprove && status.identity && (
        <details className="space-y-3 rounded-xl border p-3">
          <summary className="cursor-pointer font-bold">
            Reset encryption identity (last resort)
          </summary>
          <p className="mt-3 text-xs">
            This does not decrypt old conversations. It revokes every approved
            device and deletes this device&apos;s cached history and send queue.
            Save encrypted history backups first if your current keys still
            work. Old retained backups still need their old personal key. Peers
            must explicitly verify your changed identity before new messages
            resume. A reset is allowed at most once in 24 hours.
          </p>
          <label className="my-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={resetAcknowledged}
              onChange={(event) => setResetAcknowledged(event.target.checked)}
            />
            I understand the loss of local history and live device keys, and
            want a visibly new encryption identity.
          </label>
          <button
            type="button"
            className={button}
            disabled={busy || !resetAcknowledged}
            onClick={() =>
              void act(async () => {
                setIdentityReset(
                  await client.prepareIdentityReset(resetAcknowledged)
                );
                setResetSaved(false);
              })
            }
          >
            Prepare a new encryption identity
          </button>
          {identityReset && (
            <div className="space-y-3" data-private="true">
              <p className="text-xs font-bold">
                {identityReset.accepted
                  ? 'This reset was accepted. Finish its saved fresh device instead of discarding the only new keys.'
                  : 'Save this new personal recovery key before confirming. The previous identity has not changed yet.'}
              </p>
              <textarea
                aria-label="New identity recovery key"
                readOnly
                value={identityReset.recoveryKey}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded border p-2 font-mono text-xs break-all"
              />
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resetSaved}
                  onChange={(event) => setResetSaved(event.target.checked)}
                />
                I saved the new personal recovery key.
              </label>
              <input
                aria-label="Type RESET ENCRYPTION to confirm"
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
                autoComplete="off"
                className="w-full rounded border p-2"
              />
              <button
                type="button"
                className={button}
                disabled={
                  busy ||
                  !resetSaved ||
                  resetConfirmation !== 'RESET ENCRYPTION'
                }
                onClick={() =>
                  void act(async () => {
                    await client.commitIdentityReset(
                      identityReset.requestId,
                      resetSaved
                    );
                    setIdentityReset(null);
                    setResetAcknowledged(false);
                    setResetSaved(false);
                    setResetConfirmation('');
                    setNotice(
                      'The encryption identity changed and all old devices were revoked. Peers must verify the new public identity; this does not unlock old history.'
                    );
                  })
                }
              >
                Reset identity and revoke old devices
              </button>{' '}
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await client.cancelIdentityReset();
                    setIdentityReset(null);
                  })
                }
              >
                Cancel prepared reset
              </button>
            </div>
          )}
        </details>
      )}
      {!!status?.pending.length && (
        <section className="space-y-3">
          <h3 className="font-bold">Pending device requests</h3>
          {status.pending.map((pending) => (
            <div
              key={pending.id}
              className="space-y-2 rounded-lg border p-3 text-xs"
            >
              <p>
                Requesting device:{' '}
                <code className="break-all">{pending.challenge.deviceId}</code>
              </p>
              <p>
                Public signing key:{' '}
                <code className="break-all">
                  {pending.challenge.signingKey}
                </code>
              </p>
              <p>
                Compare these values with the requesting device before
                approving.
              </p>
              <button
                type="button"
                className={button}
                disabled={
                  busy ||
                  !status.canApprove ||
                  !device.data?.ownerKeyAvailable ||
                  !pending.proof
                }
                onClick={() =>
                  void act(async () => {
                    await client.approveDevice(pending.id);
                    setNotice(
                      'Device approved. It can now publish fresh invitation keys.'
                    );
                  })
                }
              >
                Approve this exact device
              </button>
            </div>
          ))}
        </section>
      )}
      {!!status?.devices.length && (
        <section className="space-y-3">
          <h3 className="font-bold">Approved devices</h3>
          {status.devices.map((entry) => (
            <div
              key={entry.id}
              className="space-y-2 rounded-lg border p-3 text-xs"
            >
              <p>
                <code className="break-all">{entry.id}</code>
                {entry.id === device.data?.localDeviceId
                  ? ' (this device)'
                  : ''}
              </p>
              <p>
                Public signing key:{' '}
                <code className="break-all">{entry.signingKey}</code>
              </p>
              <p>
                {entry.revokedAt
                  ? 'Revoked'
                  : `Expires ${new Date(entry.expiresAt).toLocaleDateString()}`}
              </p>
              {!entry.revokedAt &&
                status.canApprove &&
                device.data?.ownerKeyAvailable &&
                (selectedRevocation === entry.id ? (
                  <>
                    <p>
                      Revocation stops future access, not plaintext already
                      read. Keep your recovery key before revoking this device.
                    </p>
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await client.revokeDevice(entry.id);
                          setSelectedRevocation(null);
                          setNotice(
                            'Device revoked. Active conversations must rekey before sending.'
                          );
                        })
                      }
                    >
                      Confirm revocation
                    </button>{' '}
                    <button
                      type="button"
                      className={button}
                      onClick={() => setSelectedRevocation(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => setSelectedRevocation(entry.id)}
                  >
                    Revoke device
                  </button>
                ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
