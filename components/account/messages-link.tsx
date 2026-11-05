'use client';

import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/lib/auth-client';
import styles from './identity.module.css';
import { cn } from '@/lib/utils';

/**
 * The messages button, beside the bell in the masthead.
 *
 * Chat shipped with its only entry point inside the notifications panel — a
 * row under the bell, two clicks from anywhere. That is the wrong depth for
 * it: notifications are things that happened to you and are read once, while
 * messages are a place you go back to, and burying a destination inside a
 * transient popup makes it findable only by someone who already knows it is
 * there. The first thing asked of the shipped feature was "where do I send
 * messages?", which is the question a missing button produces.
 *
 * A link rather than a menu, because there is nothing to preview here that
 * /messages does not do better — and because the one control that opens a
 * frame in this corner should stay the bell.
 *
 * Gates itself on the session, for the same reason `NotificationsMenu` does:
 * one of the two mastheads that mount it renders on the server and cannot
 * check. Signed-out visitors have no threads, and /messages would bounce them.
 */
export function MessagesLink() {
  const { t } = useTranslation('common');
  const { data: session, status } = useSession();

  /* Nothing while the session resolves, so the button does not appear and then
     vanish on a visitor who turns out to be signed out. */
  if (status === 'loading' || !session) return null;

  return (
    <Link
      href="/messages"
      className={cn(styles.trigger, styles.messagesTrigger)}
      aria-label={t('notifications.messages')}
      title={t('notifications.messages')}
    >
      <span className={styles.messagesIcon} aria-hidden="true">
        <MessagesSquare className="h-[18px] w-[18px]" />
      </span>
    </Link>
  );
}
