/**
 * NotificationItem Component
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * ActivityPub-shaped notification display
 */

'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  UserPlus,
  Check,
  X,
  FileText,
  Edit,
  Trash2,
  Share2,
  Heart,
  Users,
  Bell,
  Video,
  UserMinus,
  Ban,
  Shield,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  NotificationActivityType,
  NotificationContext,
} from '@/lib/interfaces';

interface NotificationItemProps {
  notification: {
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
  };
  onMarkAsRead?: (id: string) => void;
  compact?: boolean;
}

/**
 * Icon for a notification, by context first and activity type second.
 *
 * Exported because the masthead notifications menu draws the same list in a
 * much smaller frame and must label each row with the same glyph. Two copies
 * of this switch would drift the moment a new activity type is added to one
 * of them.
 */
export function getNotificationIcon(
  type: NotificationActivityType,
  context: NotificationContext
) {
  // Context-specific icons
  if (context === 'mentoring') {
    return <Video className="h-4 w-4" />;
  }

  if (context === 'reply') {
    return <MessageCircle className="h-4 w-4" />;
  }

  // A role change is the one Update that is about you rather than about a
  // document, so it gets the badge instead of the pencil.
  if (context === 'group_membership' && type === 'Update') {
    return <Shield className="h-4 w-4" />;
  }

  // Type-specific icons
  switch (type) {
    case 'Invite':
      return <UserPlus className="h-4 w-4" />;
    case 'Join':
      return <UserPlus className="h-4 w-4" />;
    case 'Remove':
      return <UserMinus className="h-4 w-4" />;
    case 'Block':
      return <Ban className="h-4 w-4" />;
    case 'Accept':
      return <Check className="h-4 w-4" />;
    case 'Reject':
      return <X className="h-4 w-4" />;
    case 'Create':
      return <FileText className="h-4 w-4" />;
    case 'Update':
      return <Edit className="h-4 w-4" />;
    case 'Delete':
      return <Trash2 className="h-4 w-4" />;
    case 'Announce':
      return <Share2 className="h-4 w-4" />;
    case 'Like':
      return <Heart className="h-4 w-4" />;
    case 'Follow':
      return <Users className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function getIconColor(
  type: NotificationActivityType,
  _context: NotificationContext
): string {
  switch (type) {
    case 'Accept':
      return 'text-green-600 dark:text-green-400';
    case 'Reject':
      return 'text-red-600 dark:text-red-400';
    case 'Delete':
      return 'text-red-600 dark:text-red-400';
    case 'Remove':
      return 'text-amber-600 dark:text-amber-400';
    case 'Block':
      return 'text-red-600 dark:text-red-400';
    case 'Invite':
      return 'text-blue-600 dark:text-blue-400';
    case 'Like':
      return 'text-pink-600 dark:text-pink-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
}

export default function NotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
}: NotificationItemProps) {
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
  });

  const handleClick = () => {
    if (!notification.read && onMarkAsRead) {
      onMarkAsRead(notification._id);
    }
  };

  const content = (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg p-3 transition-colors',
        !notification.read && 'bg-blue-50 dark:bg-blue-950/30',
        notification.read && 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        compact && 'p-2'
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div
        className={cn(
          'mt-0.5 flex-shrink-0',
          getIconColor(notification.type, notification.context)
        )}
      >
        {getNotificationIcon(notification.type, notification.context)}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm',
            !notification.read && 'font-medium',
            compact && 'text-xs'
          )}
        >
          {notification.displayMessage || notification.message}
        </p>
        <p
          className={cn(
            'mt-0.5 text-xs text-gray-500 dark:text-gray-400',
            compact && 'mt-0'
          )}
        >
          {timeAgo}
        </p>
      </div>

      {/* Unread indicator */}
      {!notification.read && (
        <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />
      )}
    </div>
  );

  // Wrap in link if objectUrl is provided
  if (notification.objectUrl) {
    return (
      <Link href={notification.objectUrl} className="block">
        {content}
      </Link>
    );
  }

  return <div className="cursor-pointer">{content}</div>;
}
