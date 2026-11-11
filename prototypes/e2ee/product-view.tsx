import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { EncryptedConversation } from '../../app/messages/_components/encrypted-conversation';
import { EncryptionSettings } from '../../app/messages/_components/encryption-controls';
import { EMPTY_MESSAGE_DRAFT } from '../../app/messages/_lib/workspace';
import { usePrivateDraftUrls } from '../../app/messages/_lib/private-drafts';
import type { EncryptedChatClient } from '../../lib/e2ee/chat-client';
import type { EncryptionConnection } from '../../app/messages/_lib/encryption';
import styles from '../../components/messages/workspace.module.css';
import '../../app/globals.css';

export function mountProductView(client: EncryptedChatClient) {
  const peer = new URLSearchParams(location.search).get('peer');
  if (
    !peer ||
    !['alice', 'bob', 'carol'].includes(peer) ||
    peer === client.scope.actorId
  )
    throw new Error('Choose a different synthetic peer for the Messages view.');
  const container = document.createElement('main');
  container.id = 'product-ui';
  document.body.append(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function ProductView() {
    const [draft, setDraft] = useState(EMPTY_MESSAGE_DRAFT);
    usePrivateDraftUrls({ [peer!]: draft });
    const scope = useQuery({
      queryKey: ['fixture-encryption-context'],
      queryFn: async () => {
        const status = await client.status();
        return {
          ...client.scope,
          enabled: true,
          required: status.identity?.encryptionRequired === true,
          actor: {
            id: client.scope.actorId,
            username: client.scope.actorId,
            name: client.scope.actorId,
            domain: 'fixture.invalid',
            iconUrl: null,
          },
        };
      },
    });
    const connection: EncryptionConnection = {
      client,
      context: scope.data ?? null,
      loading: scope.isLoading,
      error: scope.error?.message ?? null,
      refresh: scope.refetch,
    };
    return (
      <>
        <EncryptionSettings connection={connection} />
        <div
          className={`profile-card ${styles.workspace}`}
          data-single-room="true"
          style={{ height: '85vh' }}
        >
          <section className={styles.conversation}>
            <EncryptedConversation
              connection={connection}
              viewerActorId={client.scope.actorId}
              counterparty={{
                id: peer!,
                username: peer!,
                name: peer!,
                domain: 'fixture.invalid',
              }}
              legacyMessages={[
                {
                  id: 'legacy-fixture',
                  content: 'Synthetic legacy history is server-readable.',
                  actor: {
                    id: peer!,
                    username: peer!,
                    domain: 'fixture.invalid',
                  },
                  published: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 86400000).toISOString(),
                },
              ]}
              draft={draft}
              onChange={(patch) =>
                setDraft((current) => ({ ...current, ...patch }))
              }
              onBack={() => {
                location.hash = 'back';
              }}
              detailOpen
            />
          </section>
        </div>
      </>
    );
  }
  createRoot(container).render(
    <QueryClientProvider client={queryClient}>
      <ProductView />
    </QueryClientProvider>
  );
}
