/**
 * Updates Page
 *
 * Combines messages (@-me/sent) and notifications (Pana Updates).
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/timelines/
 */

'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCheck,
  Bell,
  Inbox,
  Send,
  Trash2,
  ShieldQuestion,
  Check,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import NotificationItem from '@/components/NotificationItem';
import { PostCard } from '@/components/social/PostCard';
import { AttachmentGrid } from '@/components/social/AttachmentGrid';
import { BlockMenu } from '@/components/social/BlockMenu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from '@/lib/query/notifications';
import {
  useInboxMessages,
  useSentMessages,
  useDeletePost,
  useDmRequests,
  useAcceptDmRequest,
  useDeleteDmRequest,
  type DmRequestEntry,
} from '@/lib/query/social';
import type {
  SocialStatusDisplay,
  NotificationActivityType,
  NotificationContext,
} from '@/lib/interfaces';

type ActiveTab = 'at-me' | 'requests' | 'sent' | 'pana-updates';

export default function UpdatesPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>('at-me');
  const [notificationOffset, setNotificationOffset] = useState(0);
  const limit = 20;

  // Notifications query (single stream, no filter)
  const {
    data: notificationsData,
    isLoading: notificationsLoading,
    isFetching: notificationsFetching,
  } = useNotifications({
    limit,
    offset: notificationOffset,
    unreadOnly: false,
  });

  // Messages queries
  const { data: inboxData, isLoading: inboxLoading } = useInboxMessages();

  const { data: sentData, isLoading: sentLoading } = useSentMessages();

  const { data: dmRequests, isLoading: requestsLoading } = useDmRequests();
  const acceptRequest = useAcceptDmRequest();
  const deleteRequest = useDeleteDmRequest();

  const deletePost = useDeletePost();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  const handleLoadMoreNotifications = () => {
    setNotificationOffset((prev) => prev + limit);
  };

  const handleDeleteMessage = (statusId: string) => {
    if (confirm('Are you sure you want to delete this message?')) {
      deletePost.mutate(statusId);
    }
  };

  if (!session) {
    return (
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Unauthorized</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400">
              You must be logged in to view this page.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const notifications = notificationsData?.notifications || [];
  const hasMoreNotifications = notificationsData?.hasMore || false;
  const hasUnread = notifications.some((n) => !n.read);

  const inboxMessages = inboxData?.statuses || [];
  const sentMessages = sentData?.statuses || [];
  const requests = dmRequests || [];

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="space-y-6">
        {/* Main Content Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as ActiveTab)}
              >
                <TabsList>
                  <TabsTrigger
                    value="at-me"
                    className="flex items-center gap-2"
                  >
                    <Inbox className="h-4 w-4" />
                    @-me
                  </TabsTrigger>
                  <TabsTrigger
                    value="requests"
                    className="flex items-center gap-2"
                  >
                    <ShieldQuestion className="h-4 w-4" />
                    Requests
                    {requests.length > 0 && (
                      <span className="bg-muted text-foreground rounded-full px-1.5 py-0.5 text-xs font-semibold">
                        {requests.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="sent" className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Sent
                  </TabsTrigger>
                  <TabsTrigger
                    value="pana-updates"
                    className="flex items-center gap-2"
                  >
                    <Bell className="h-4 w-4" />
                    Pana Updates
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {activeTab === 'pana-updates' && hasUnread && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsRead.isPending}
                >
                  <CheckCheck className="mr-1 h-4 w-4" />
                  Mark all read
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'at-me' && (
              <MessagesSection
                messages={inboxMessages}
                isLoading={inboxLoading}
                emptyIcon={<Inbox className="mb-3 h-12 w-12 text-gray-400" />}
                emptyTitle="No messages yet"
                emptyDescription="When someone sends you a message, it will appear here."
              />
            )}
            {activeTab === 'requests' && (
              <RequestsSection
                requests={requests}
                isLoading={requestsLoading}
                onAccept={(senderActorId) =>
                  acceptRequest.mutate(senderActorId)
                }
                onDelete={(senderActorId) =>
                  deleteRequest.mutate(senderActorId)
                }
                isBusy={acceptRequest.isPending || deleteRequest.isPending}
              />
            )}
            {activeTab === 'sent' && (
              <MessagesSection
                messages={sentMessages}
                isLoading={sentLoading}
                emptyIcon={<Send className="mb-3 h-12 w-12 text-gray-400" />}
                emptyTitle="No sent messages"
                emptyDescription="Messages you send will appear here."
                showDelete
                onDeleteMessage={handleDeleteMessage}
                isDeleting={deletePost.isPending}
              />
            )}
            {activeTab === 'pana-updates' && (
              <NotificationsSection
                notifications={notifications}
                isLoading={notificationsLoading}
                hasMore={hasMoreNotifications}
                isFetching={notificationsFetching}
                onMarkAsRead={handleMarkAsRead}
                onLoadMore={handleLoadMoreNotifications}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MessagesSection({
  messages,
  isLoading,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  showDelete = false,
  onDeleteMessage,
  isDeleting = false,
}: {
  messages: SocialStatusDisplay[];
  isLoading: boolean;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  showDelete?: boolean;
  onDeleteMessage?: (statusId: string) => void;
  isDeleting?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        {emptyIcon}
        <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
          {emptyTitle}
        </p>
        <p className="mt-1 text-sm text-gray-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((status) => (
        <div key={status.id} className="relative">
          <PostCard status={status} />
          {showDelete && onDeleteMessage && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
              onClick={() => onDeleteMessage(status.id)}
              disabled={isDeleting}
              title="Delete message"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Render stored status HTML as plain text.
 *
 * Status bodies now pass through `renderStatusMarkdown()`, which escapes raw
 * HTML at ingest, and every HTML sink renders via `<SafeHtml>`. Neither covers
 * this case. Rows stored before sanitisation landed were never backfilled, so a
 * held message can still be attacker-authored markup — and the Requests folder
 * is the worst possible place to hand that to `dangerouslySetInnerHTML`, since
 * by definition the sender is someone the reader has not accepted yet.
 *
 * The independent reason is the lure: friendly anchor text hiding a hostile
 * href. Sanitising does not touch that — `<a href="https://evil.test">your
 * bank</a>` survives any allowlist intact. Flattening to text is what defuses
 * it, which is the whole point of a stranger's first message. Do not "simplify"
 * this to `<SafeHtml>`; it would be safe from script injection and still lose
 * the defence that matters here.
 *
 * The result is placed in a text node, so React escapes it no matter how
 * imperfectly this strips. A mangled strip is cosmetic here, never an
 * injection.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The Requests folder.
 *
 * A message from someone outside your Panas is held here instead of landing in
 * @-me, and the sender is never told which happened. The folder shows the
 * message itself rather than just a name, because triaging on a name alone
 * makes "accept" the only way to learn what was said -- and accepting is
 * exactly the consent the gate exists to ask for. See docs/SOCIAL-GRAPH.md C1.
 */
function RequestsSection({
  requests,
  isLoading,
  onAccept,
  onDelete,
  isBusy,
}: {
  requests: DmRequestEntry[];
  isLoading: boolean;
  onAccept: (senderActorId: string) => void;
  onDelete: (senderActorId: string) => void;
  isBusy: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldQuestion className="mb-4 h-12 w-12 text-gray-400" />
        <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
          Nothing waiting
        </p>
        <p className="mt-1 text-sm text-gray-500">
          When a pana who is not one of yours messages you, it waits here
          instead of your inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <RequestCard
          key={request.sender.id}
          request={request}
          onAccept={onAccept}
          onDelete={onDelete}
          isBusy={isBusy}
        />
      ))}
    </div>
  );
}

function RequestCard({
  request,
  onAccept,
  onDelete,
  isBusy,
}: {
  request: DmRequestEntry;
  onAccept: (senderActorId: string) => void;
  onDelete: (senderActorId: string) => void;
  isBusy: boolean;
}) {
  const { sender, messages } = request;
  const displayName = sender.name || sender.username;
  const firstName = displayName.split(' ')[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      {/* What the hold means, in the reader's terms rather than the system's. */}
      <div className="bg-pana-butter text-pana-ink px-4 py-3">
        <p className="text-sm font-semibold">
          {firstName} is not one of your Panas
        </p>
        <p className="mt-1 text-sm">
          This message is waiting here instead of your inbox, and you were not
          notified. {firstName} cannot tell whether you have seen it.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={sender.iconUrl || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link
              href={`/p/${sender.username}`}
              className="font-semibold hover:underline"
            >
              {displayName}
            </Link>
            <p className="truncate text-sm text-gray-500">
              @{sender.username} &middot;{' '}
              {formatDistanceToNow(new Date(request.requestedAt), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>

        {/* A direct message expires while the request row survives, so an
            empty thread is a normal aged-out state and must not read as a
            card that failed to load. */}
        {messages.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-900">
            <Clock className="h-4 w-4 shrink-0" />
            Their message has since expired. Only the request is left.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className="space-y-3 rounded-md bg-gray-50 p-3 dark:bg-gray-900"
            >
              {message.content && (
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {htmlToText(message.content)}
                </p>
              )}
              {message.attachments && message.attachments.length > 0 && (
                <AttachmentGrid attachments={message.attachments} />
              )}
            </div>
          ))
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => onAccept(sender.id)}
            disabled={isBusy}
          >
            <Check className="mr-1 h-4 w-4" />
            Move to inbox
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(sender.id)}
            disabled={isBusy}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete without replying
          </Button>
          <BlockMenu
            username={sender.username}
            actorUri={sender.uri}
            displayName={displayName}
          />
        </div>
      </div>
    </div>
  );
}

function NotificationsSection({
  notifications,
  isLoading,
  hasMore,
  isFetching,
  onMarkAsRead,
  onLoadMore,
}: {
  notifications: {
    _id: string;
    type: NotificationActivityType;
    context: NotificationContext;
    actorScreenname?: string;
    actorName?: string;
    objectTitle?: string;
    objectUrl?: string;
    message?: string;
    displayMessage?: string;
    read: boolean;
    createdAt: Date | string;
  }[];
  isLoading: boolean;
  hasMore: boolean;
  isFetching: boolean;
  onMarkAsRead: (id: string) => void;
  onLoadMore: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Bell className="mb-3 h-12 w-12 text-gray-400" />
        <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
          No notifications yet
        </p>
        <p className="mt-1 text-sm text-gray-500">
          When you receive notifications, they&apos;ll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification._id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
        />
      ))}

      {hasMore && (
        <div className="pt-4 text-center">
          <Button variant="outline" onClick={onLoadMore} disabled={isFetching}>
            {isFetching ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
