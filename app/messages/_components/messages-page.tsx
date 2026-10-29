'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { WorkspacePage } from '@/components/messages/workspace-page';
import { MessagesView } from './messages-view';

export function MessagesPageContent({
  initialGroupHandle,
}: {
  initialGroupHandle?: string;
}) {
  const { data: session, status } = useSession();
  const destination = initialGroupHandle
    ? `/messages?group=${encodeURIComponent(initialGroupHandle)}`
    : '/messages';

  return (
    <WorkspacePage>
      {session ? (
        <MessagesView
          key={session.user.id}
          initialGroupHandle={initialGroupHandle}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <MessageCircle
            className="text-pana-indigo h-10 w-10"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-black tracking-tight">Messages.</h1>
          <p className="text-pana-ink/65 text-sm" role="status">
            {status === 'loading'
              ? 'Opening your messages...'
              : 'Sign in to pick up the conversation.'}
          </p>
          {status !== 'loading' && (
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(destination)}`}
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
