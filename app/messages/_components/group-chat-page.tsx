'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useMyActor } from '@/lib/query/social';
import { WorkspacePage } from '@/components/messages/workspace-page';
import styles from '@/components/messages/workspace.module.css';
import {
  GroupConversation,
  GroupChatPlaceholder,
  useGroupChatState,
} from './group-chat';
import { useGroupChatThread } from '../_lib/group-chat-query';
import { useDmSocket } from '../_lib/use-dm-socket';

export function GroupChatPage({ handle }: { handle: string }) {
  const { data: session, status } = useSession();
  return (
    <WorkspacePage>
      {session ? (
        <GroupChatAccount key={session.user.id} handle={handle} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <Users className="text-pana-indigo h-10 w-10" aria-hidden="true" />
          <h1 className="text-2xl font-black">Group chat</h1>
          <p className="text-pana-ink/65 text-sm" role="status">
            {status === 'loading'
              ? 'Opening group chat...'
              : 'Sign in to join the conversation. Only active group members can read and post here.'}
          </p>
          {status !== 'loading' && (
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(`/g/${encodeURIComponent(handle)}/chat`)}`}
              className="bg-pana-indigo text-pana-cream rounded-xl px-5 py-3 text-sm font-extrabold"
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </WorkspacePage>
  );
}

function GroupChatAccount({ handle }: { handle: string }) {
  const actor = useMyActor();
  return (
    <GroupChatOwner
      key={actor.data?.actor?.id ?? 'no-actor'}
      handle={handle}
      viewerActorId={actor.data?.actor?.id ?? null}
      actorLoading={actor.isLoading}
      actorError={actor.isError}
      onRetryActor={() => {
        void actor.refetch();
      }}
    />
  );
}

function GroupChatOwner({
  handle,
  viewerActorId,
  actorLoading,
  actorError,
  onRetryActor,
}: {
  handle: string;
  viewerActorId: string | null;
  actorLoading: boolean;
  actorError: boolean;
  onRetryActor: () => void;
}) {
  const router = useRouter();
  const conversationRef = useRef<HTMLElement>(null);
  const state = useGroupChatState(viewerActorId);
  const thread = useGroupChatThread(handle, !!viewerActorId);
  useDmSocket(!!viewerActorId);
  const back = () => router.push(`/g/${encodeURIComponent(handle)}`);
  return (
    <>
      <h1 className="sr-only">
        {thread.data?.pages[0]?.group.name ?? 'Group chat'}
      </h1>
      <div
        className={`profile-card ${styles.workspace}`}
        data-single-room="true"
      >
        <section
          ref={conversationRef}
          tabIndex={-1}
          className={styles.conversation}
          aria-label="Open conversation"
        >
          {viewerActorId ? (
            <GroupConversation
              handle={handle}
              viewerActorId={viewerActorId}
              thread={thread}
              state={state}
              detailOpen
              onBack={back}
              conversationRef={conversationRef}
              standalone
            />
          ) : (
            <>
              <GroupChatPlaceholder
                loading={actorLoading}
                message={
                  actorError
                    ? 'Could not load your active profile.'
                    : actorLoading
                      ? undefined
                      : 'Open Pana Social to finish setting up messaging for this profile.'
                }
                onBack={back}
                onRetry={onRetryActor}
                standalone
                handle={handle}
              />
              {!actorLoading && (
                <Link
                  href="/s"
                  className="text-pana-indigo px-6 py-4 text-center text-sm font-bold underline"
                >
                  Open Pana Social
                </Link>
              )}
            </>
          )}
        </section>
      </div>
      <span className="sr-only" role="status">
        {state.announcement}
      </span>
    </>
  );
}
