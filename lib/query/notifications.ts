/**
 * Notification Query Hooks
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/notifications/
 * ActivityPub-shaped notification system
 */

import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotificationInterface } from '@/lib/interfaces';

export const notificationQueryKey = ['notifications'];

interface NotificationsResponse {
  notifications: NotificationInterface[];
  total: number;
  hasMore: boolean;
}

export async function fetchNotifications(options?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<NotificationsResponse | undefined> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  if (options?.unreadOnly) params.set('unreadOnly', 'true');

  const response = await axios
    .get(`/api/notifications?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    .catch((error: Error) => {
      console.log(error.name, error.message);
    });

  if (response?.data?.success) {
    return response.data.data;
  }
  return undefined;
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await axios
    .get('/api/notifications/unread-count', {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    .catch((error: Error) => {
      console.log(error.name, error.message);
    });

  if (response?.data?.success) {
    return response.data.data.count;
  }
  return 0;
}

export const useNotifications = (options?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  /**
   * Defaults to true. The masthead menu passes `false` until it is opened, so
   * a signed-in visitor who never touches the bell never fetches the list.
   * Kept out of the query key below — it governs *when* we ask, not *what* we
   * ask for, and including it would split the cache into two identical halves.
   */
  enabled?: boolean;
}) => {
  const { enabled = true, ...params } = options ?? {};
  return useQuery<NotificationsResponse | undefined, Error>({
    queryKey: [...notificationQueryKey, 'list', params],
    queryFn: () => fetchNotifications(params),
    enabled,
  });
};

export const useUnreadCount = (options?: { enabled?: boolean }) => {
  return useQuery<number, Error>({
    queryKey: [...notificationQueryKey, 'unreadCount'],
    queryFn: () => fetchUnreadCount(),
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
    enabled: options?.enabled ?? true, // Skip polling for logged-out users
  });
};

export const useMarkAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => {
      return axios.post(`/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationQueryKey,
      });
    },
  });
};

export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      return axios.post('/api/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationQueryKey,
      });
    },
  });
};
