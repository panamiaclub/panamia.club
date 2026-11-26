'use client';

import { useEffect, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { nativePlatform } from '@/lib/mobile/native';
import {
  PUSH_ENABLED_KEY,
  PUSH_PENDING_KEY,
  updatePushDevice,
} from '@/lib/mobile/push';
import { pushDestination } from '@/lib/push/payload';

export function NativePushNotifications({
  userId,
  signedIn,
  showControls,
}: {
  userId: string;
  signedIn: boolean;
  showControls: boolean;
}) {
  const router = useRouter();
  const queries = useQueryClient();
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const controls = useRef<((enable: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!window.Capacitor?.isPluginAvailable?.('PushNotifications')) {
      setMessage('Update the app to enable push notifications.');
      return;
    }
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    const keep = async (pending: Promise<PluginListenerHandle>) => {
      const handle = await pending;
      if (disposed) await handle.remove();
      else handles.push(handle);
    };
    const report = (error: unknown) => {
      console.error('[push] Native notification setup failed');
      if (!disposed)
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not set up notifications.'
        );
    };
    const openPending = async () => {
      const id = localStorage.getItem(PUSH_PENDING_KEY);
      if (!signedIn || !id || disposed) return;
      const response = await fetch(
        `/api/push/open?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' }
      );
      if (!response.ok)
        throw new Error('Could not open notification. Try opening the bell.');
      const data = (await response.json()) as { href?: unknown };
      if (disposed) return;
      localStorage.removeItem(PUSH_PENDING_KEY);
      router.push(pushDestination(data.href));
      void queries.invalidateQueries({ queryKey: ['notifications'] });
    };
    void (async () => {
      const { PushNotifications: push } =
        await import('@capacitor/push-notifications');
      if (disposed) return;
      const platform = nativePlatform();
      await keep(
        push.addListener('pushNotificationActionPerformed', (action) => {
          const id: unknown = action.notification.data?.notificationId;
          if (typeof id !== 'string' || id.length > 200) return;
          localStorage.setItem(PUSH_PENDING_KEY, id);
          void openPending().catch(report);
        })
      );
      await keep(
        push.addListener('pushNotificationReceived', () => {
          void queries.invalidateQueries({ queryKey: ['notifications'] });
        })
      );
      await keep(
        push.addListener('registration', (token) => {
          if (
            disposed ||
            !signedIn ||
            localStorage.getItem(PUSH_ENABLED_KEY) !== 'true' ||
            !platform
          )
            return;
          void updatePushDevice({ platform, token: token.value })
            .then(() => {
              if (
                !disposed &&
                localStorage.getItem(PUSH_ENABLED_KEY) === 'true'
              ) {
                setEnabled(true);
                setMessage('Push notifications are enabled on this device.');
              }
            })
            .catch(report)
            .finally(() => {
              if (!disposed) setBusy(false);
            });
        })
      );
      await keep(
        push.addListener('registrationError', () => {
          if (!disposed) {
            setBusy(false);
            setMessage(
              'Push registration failed. Check your connection and app configuration, then try again.'
            );
          }
          console.error('[push] Native push registration failed');
        })
      );
      if (disposed) return;
      if (platform === 'android') {
        await push.createChannel({
          id: 'pana-notifications',
          name: 'Pana Mia notifications',
          description: 'Messages and account activity',
          importance: 4,
          visibility: 0,
        });
      }
      if (disposed) return;
      const refresh = async () => {
        if (disposed || !signedIn) return;
        const permission = await push.checkPermissions();
        if (
          permission.receive === 'granted' &&
          localStorage.getItem(PUSH_ENABLED_KEY) === 'true'
        ) {
          await push.register();
        } else {
          await updatePushDevice();
          if (!disposed) setEnabled(false);
        }
        await openPending();
      };
      controls.current = async (enable) => {
        if (!signedIn || disposed) return;
        setBusy(true);
        setMessage('');
        try {
          if (enable) {
            const permission = await push.requestPermissions();
            if (permission.receive !== 'granted') {
              await updatePushDevice();
              setEnabled(false);
              setMessage(
                'Notifications are blocked. Allow them in your device Settings, then try again.'
              );
              setBusy(false);
              return;
            }
            localStorage.setItem(PUSH_ENABLED_KEY, 'true');
            await push.register();
          } else {
            localStorage.setItem(PUSH_ENABLED_KEY, 'false');
            setEnabled(false);
            await Promise.all([
              updatePushDevice(),
              push.unregister(),
              push.removeAllDeliveredNotifications(),
            ]);
            setMessage('Push notifications are off on this device.');
            setBusy(false);
          }
        } catch (error) {
          setBusy(false);
          report(error);
        }
      };
      const { App } = await import('@capacitor/app');
      await keep(
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void refresh().catch(report);
        })
      );
      if (!disposed) setReady(true);
      await refresh();
    })().catch(report);
    return () => {
      disposed = true;
      controls.current = null;
      setReady(false);
      for (const handle of handles) void handle.remove();
    };
  }, [userId, signedIn, router, queries]);

  if (!signedIn || !showControls) return null;
  return (
    <div className="border-b px-4 py-2 text-sm">
      <button
        type="button"
        className="min-h-11 underline"
        disabled={!ready || busy}
        onClick={() => void controls.current?.(!enabled)}
      >
        {busy
          ? 'Updating notifications...'
          : enabled
            ? 'Turn off push notifications'
            : 'Enable push notifications'}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
