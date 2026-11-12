'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { EncryptedChatClient } from '@/lib/e2ee/chat-client';
import { localDeviceSchema } from '@/lib/e2ee/client-contract';
import { e2eeIdSchema } from '@/lib/e2ee/identity-contract';

const scopeSchema = z
  .object({
    userId: e2eeIdSchema,
    profileId: e2eeIdSchema,
    actorId: e2eeIdSchema,
    enabled: z.boolean(),
    required: z.boolean(),
    actor: z
      .object({
        id: e2eeIdSchema,
        username: z.string(),
        name: z.string().nullable(),
        iconUrl: z.string().nullable(),
        domain: z.string(),
      })
      .strict(),
  })
  .strict();
export type EncryptionScopeData = z.infer<typeof scopeSchema>;

export function useEncryptionScope(viewerActorId: string | null) {
  const query = useQuery({
    queryKey: ['encrypted-messaging-scope', viewerActorId],
    enabled: !!viewerActorId,
    queryFn: async () => {
      const response = await fetch('/api/social/encryption/context', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok)
        throw new Error('Could not resolve the current encryption profile.');
      const value = z
        .object({ success: z.literal(true), data: scopeSchema.nullable() })
        .parse(await response.json());
      if (value.data && value.data.actorId !== viewerActorId)
        throw new Error(
          'Your active profile changed. Reload Messages before using encryption.'
        );
      return value.data;
    },
    refetchOnWindowFocus: true,
  });
  const [client, setClient] = useState<EncryptedChatClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = query.data;
  useEffect(() => {
    setClient(null);
    setError(null);
    if (!data || (!data.enabled && !data.required)) return;
    let active = true;
    let owned: EncryptedChatClient | null = null;
    void EncryptedChatClient.open({
      userId: data.userId,
      profileId: data.profileId,
      actorId: data.actorId,
    }).then(
      (value) => {
        owned = value;
        if (active) setClient(value);
        else value.close();
      },
      (failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Encrypted storage is unavailable.'
          );
      }
    );
    return () => {
      active = false;
      owned?.close();
    };
  }, [
    data?.userId,
    data?.profileId,
    data?.actorId,
    data?.enabled,
    data?.required,
  ]);
  return {
    context: data ?? null,
    client,
    loading: query.isLoading,
    error: error ?? (query.error instanceof Error ? query.error.message : null),
    refresh: query.refetch,
  };
}
export type EncryptionConnection = ReturnType<typeof useEncryptionScope>;

export function useEncryptionDevice(connection: EncryptionConnection) {
  const client = connection.client;
  return useQuery({
    queryKey: [
      'encrypted-messaging-device',
      connection.context?.userId,
      connection.context?.profileId,
      connection.context?.actorId,
    ],
    enabled: !!client && !!connection.context?.enabled,
    queryFn: async () => {
      if (!client)
        throw new Error('Encrypted device storage is not available.');
      const status = await client.status();
      const session = await client.vault.withLock(() => client.vault.load());
      if (!session?.state)
        return {
          status,
          localDeviceId: null,
          approved: false,
          recoveryKeyAvailable: false,
          ownerKeyAvailable: false,
        };
      const state = localDeviceSchema.parse(JSON.parse(session.state));
      const own = status.devices.find(
        (device) => device.id === state.identity.deviceId
      );
      const approved =
        !!own && !own.revokedAt && Date.parse(own.expiresAt) > Date.now();
      if (approved && !status.identity?.rotationRequired) await client.setup();
      return {
        status,
        localDeviceId: state.identity.deviceId,
        approved,
        recoveryKeyAvailable: !!state.recoveryKey,
        ownerKeyAvailable: !!state.rootSecret,
      };
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useEncryptedRooms(
  connection: EncryptionConnection,
  ready: boolean
) {
  const client = connection.client;
  return useQuery({
    queryKey: [
      'encrypted-messaging-rooms',
      connection.context?.userId,
      connection.context?.profileId,
      connection.context?.actorId,
    ],
    enabled: !!client && ready && !!connection.context?.enabled,
    queryFn: async () => {
      if (!client)
        throw new Error('The encrypted messaging client is unavailable.');
      return client.rooms();
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}
