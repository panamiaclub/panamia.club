import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import {
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
  useUnreadCount,
} from '@/lib/query/notifications';

function notificationQueries(client: QueryClient) {
  const mutations: {
    read?: ReturnType<typeof useMarkAsRead>;
    readAll?: ReturnType<typeof useMarkAllAsRead>;
  } = {};

  function Notifications() {
    useNotifications({ limit: 8, enabled: false });
    useUnreadCount({ enabled: false });
    mutations.read = useMarkAsRead();
    mutations.readAll = useMarkAllAsRead();
    return null;
  }

  renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(Notifications))
  );
  assert.ok(mutations.read);
  assert.ok(mutations.readAll);
  return { read: mutations.read, readAll: mutations.readAll };
}

for (const action of ['read', 'readAll'] as const) {
  test(`${action} invalidates both the notification list and unread count`, async (t) => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const post = t.mock.method(axios, 'post', async () => ({
      data: { success: true },
    }));

    try {
      const mutations = notificationQueries(client);
      const listKey = ['notifications', 'list', { limit: 8 }];
      const unreadKey = ['notifications', 'unreadCount'];
      assert.deepEqual(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
        [listKey, unreadKey]
      );
      client.setQueryData(listKey, { notifications: [], total: 0 });
      client.setQueryData(unreadKey, 1);

      if (action === 'read') {
        await mutations.read.mutateAsync('follow-alert');
      } else {
        await mutations.readAll.mutateAsync();
      }

      assert.equal(post.mock.callCount(), 1);
      assert.equal(
        post.mock.calls[0].arguments[0],
        action === 'read'
          ? '/api/notifications/follow-alert/read'
          : '/api/notifications/mark-all-read'
      );
      assert.equal(client.getQueryState(listKey)?.isInvalidated, true);
      assert.equal(client.getQueryState(unreadKey)?.isInvalidated, true);
    } finally {
      client.clear();
    }
  });
}
