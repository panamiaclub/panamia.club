'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, Inbox, MessageCircle } from 'lucide-react';

import { useSession } from '@/lib/auth-client';
import {
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
  useUnreadCount,
} from '@/lib/query/notifications';
import type { NotificationInterface } from '@/lib/interfaces';
import { getNotificationIcon } from '@/components/NotificationItem';
import { MenuSurface } from './menu-surface';
import styles from './identity.module.css';
import { cn } from '@/lib/utils';

/**
 * Enough to answer "what did I miss?" without turning the panel into the
 * /updates page. The footer row leads there for the rest.
 */
const RECENT_LIMIT = 8;

/** The API decorates each row with a rendered sentence; the type does not. */
type RecentNotification = NotificationInterface & { displayMessage?: string };

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: RecentNotification;
  onOpen: (notification: RecentNotification) => void;
}) {
  const text = notification.displayMessage || notification.message || '';
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
  });

  const body = (
    <>
      <span className={styles.siteIcon} aria-hidden="true">
        {getNotificationIcon(notification.type, notification.context)}
      </span>
      <span className={styles.rowMeta}>
        <span
          className={cn(
            styles.notifText,
            !notification.read && styles.notifTextUnread
          )}
        >
          {text}
        </span>
        <span className={styles.rowHandle}>{timeAgo}</span>
      </span>
      {!notification.read && (
        <span className={styles.notifDot} aria-hidden="true" />
      )}
    </>
  );

  /* A notification that points somewhere is a link, so it can be opened in a
     new tab and reads as navigation to a screen reader. One that points
     nowhere is still worth clicking — that click is what marks it read — so
     it stays a button rather than becoming a link to the current page. */
  if (notification.objectUrl) {
    return (
      <Link
        href={notification.objectUrl}
        role="menuitem"
        data-menu-row
        onClick={() => onOpen(notification)}
        className={cn(styles.row, styles.notifRow)}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      data-menu-row
      onClick={() => onOpen(notification)}
      className={cn(styles.row, styles.notifRow)}
    >
      {body}
    </button>
  );
}

/**
 * The notifications bell, beside the identity pill in the masthead.
 *
 * It wears `MenuSurface` rather than the app's shadcn dropdown for the same
 * reason the signed-out menu does: this is the second popup in the masthead,
 * twelve pixels from the first, and two frames side by side would differ in
 * the ways frames always differ — one keeps a top-right popover on phones
 * where the other opens a bottom sheet, one locks the page scroll and the
 * other does not. `components/NotificationFlower.tsx` was exactly that
 * lookalike; it was never mounted, and this replaces it.
 *
 * Gates itself on the session rather than trusting the masthead to do it,
 * because there are two mastheads and only one of them could. MainHeader is a
 * client component and gated this on `useSession`; SurfaceMemberHeader — the
 * masthead a surface wears over its own rooms, and the one a member on
 * social.panamia.club actually lives under — renders on the server and has no
 * session to check. The bell was therefore absent from the feed entirely, and
 * with it the only link to /messages. Owning the gate here is what lets a
 * server component mount this safely; every query below stays disabled
 * without a session, which matters because each one 401s.
 */
export function NotificationsMenu() {
  const { t } = useTranslation('common');
  const { data: session, status } = useSession();
  const signedIn = status !== 'loading' && !!session;

  /* Drives the list query below. The panel is mounted even while closed, so
     without this the list would be fetched on every page load. */
  const [open, setOpen] = useState(false);

  const { data: unreadCount = 0 } = useUnreadCount({ enabled: signedIn });
  const { data, isLoading } = useNotifications({
    limit: RECENT_LIMIT,
    enabled: open && signedIn,
  });
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = (data?.notifications ?? []) as RecentNotification[];
  const hasUnread = unreadCount > 0;

  /* After the hooks, never before: the gate decides what to render, not which
     hooks run. Nothing is shown while the session resolves either, so the bell
     does not appear and then vanish on a signed-out visitor. */
  if (!signedIn) return null;

  const handleOpen = (notification: RecentNotification) => {
    if (!notification.read) markAsRead.mutate(notification._id);
  };

  return (
    <MenuSurface
      onOpenChange={setOpen}
      label={
        hasUnread
          ? t('notifications.openUnread', { count: unreadCount })
          : t('notifications.open')
      }
      triggerClassName={cn(styles.trigger, styles.bellTrigger)}
      trigger={
        <>
          <span className={styles.bellIcon} aria-hidden="true">
            <Bell className="h-[18px] w-[18px]" />
          </span>
          {/* aria-hidden because the count is already in the button's
              accessible name above — announcing it twice would read as
              "Notifications 3 unread, 3". */}
          {hasUnread && (
            <span className={styles.bellBadge} aria-hidden="true">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </>
      }
      /* Pinned: on a phone the sheet caps at 84vh and eight notifications
         fill it, which would push the rows that lead out of this panel off
         the bottom of the panel that exists to summarise it. */
      footer={(close) => (
        <>
          <div className={styles.separator} />
          {/* Two destinations because they answer different questions.
              Updates is the triage surface -- tabs of statuses to scan and
              clear. Messages is the conversation surface, and is otherwise
              unreachable: nothing else in the app links to /messages, so
              without this row the chat view ships behind a URL only its
              authors know. */}
          <Link
            href="/messages"
            role="menuitem"
            data-menu-row
            onClick={() => close(false)}
            className={cn(styles.row, styles.rowQuiet)}
          >
            <span className={styles.siteIcon} aria-hidden="true">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span className={styles.rowMeta}>
              <span className={styles.rowName}>
                {t('notifications.messages')}
              </span>
            </span>
          </Link>
          <Link
            href="/updates"
            role="menuitem"
            data-menu-row
            onClick={() => close(false)}
            className={cn(styles.row, styles.rowQuiet)}
          >
            <span className={styles.siteIcon} aria-hidden="true">
              <Inbox className="h-4 w-4" />
            </span>
            <span className={styles.rowMeta}>
              <span className={styles.rowName}>
                {t('notifications.viewAll')}
              </span>
            </span>
          </Link>
        </>
      )}
    >
      {() => (
        <>
          <div className={styles.notifHead}>
            <span className={styles.notifHeading}>
              {t('notifications.heading')}
            </span>
            {hasUnread && (
              <button
                type="button"
                data-menu-row
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className={styles.notifMarkAll}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className={styles.notifState}>
              <span className={styles.spinner} aria-hidden="true" />
            </div>
          ) : notifications.length === 0 ? (
            <div className={styles.notifState}>
              <Bell className={styles.notifEmptyIcon} aria-hidden="true" />
              <p className={styles.notifEmptyText}>
                {t('notifications.empty')}
              </p>
              <p className={styles.notifEmptyHint}>
                {t('notifications.emptyHint')}
              </p>
            </div>
          ) : (
            <div className={styles.notifScroll}>
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification._id}
                  notification={notification}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          )}
        </>
      )}
    </MenuSurface>
  );
}
