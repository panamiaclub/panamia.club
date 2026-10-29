'use client';

/**
 * useDmSocket — live DM delivery.
 *
 * Opens one socket to `/ws/dm` and turns each notification into a react-query
 * invalidation. The socket carries no message content, so this hook never
 * writes to the cache: it only says "this is stale", and the ordinary
 * authenticated queries fetch the actual message.
 *
 * That is the whole design. Postgres stays the single source of truth, every
 * read guard (expiry, blocks, hidden actors, the request gate) keeps applying
 * because nothing bypasses the read path, and a dropped socket degrades to the
 * polling the queries already do rather than to a missing message.
 *
 * ## What this replaces
 *
 * `useConversation`'s 15-second `refetchInterval`. That stays as the fallback —
 * removing it would make a failed socket silently fatal — but with the socket
 * open the visible latency is the round trip, not up to fifteen seconds.
 *
 * ## Surviving a suspend
 *
 * A socket is not reliably told when it dies. An OS suspending a backgrounded
 * app, a closed laptop, or a changed network can tear the connection down
 * without a close frame ever arriving, which leaves `readyState` reading OPEN
 * on a connection that is gone — and `send()` on one of those buffers instead
 * of throwing. A hook that only reconnects on `onclose` would sit on that
 * forever.
 *
 * So liveness is asserted rather than assumed, two ways: the heartbeat demands
 * an answer within `PONG_TIMEOUT_MS` and closes the socket if none arrives, and
 * returning to the foreground re-probes immediately instead of waiting for the
 * next beat.
 *
 * This matters most on mobile — the app is a Capacitor WebView around this same
 * deploy, so backgrounding is every session rather than an occasional event —
 * but nothing about the fix is mobile-specific, and a desktop laptop lid hits
 * exactly the same case.
 *
 * ## What a socket cannot do
 *
 * Deliver to an app that is not running. Every platform suspends sockets with
 * the process, so a backgrounded phone receives nothing here regardless of how
 * this is written; that is what push notifications are for, and
 * `handleNotify`'s `delivered` count in worker/dm-stream.ts is where they hook
 * in. See docs/MOBILE-ROADMAP.md step 4.
 *
 * ## Explicitly not here
 *
 * Presence, typing indicators, read receipts. The socket could carry them and
 * the cost would be real: a typing indicator is a message per keystroke per
 * recipient, and presence means publishing when a member is at their desk. A
 * two-person DM thread does not need either. Group and event rooms may earn
 * them later.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socialQueryKey } from '@/lib/query/social';

/** Metadata-only DM and group mailbox broadcasts. */
interface DmSocketMessage {
  type: 'dm' | 'group' | 'ready' | 'error';
  conversationActorId?: string | null;
  statusId?: string;
  at?: number;
  message?: string;
  groupId?: string;
  kind?: 'message' | 'membership';
}

/**
 * Reconnect backoff. Starts fast because the common disconnect is a laptop lid
 * or a tunnel, where the network is back almost immediately, and caps at half a
 * minute so a member who left a tab open overnight against a down deployment
 * does not reconnect thousands of times.
 */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Application-level keepalive, answered by the Durable Object's auto-response
 * without waking it — so this costs no DO billing. It exists because browser
 * JS cannot send a protocol ping frame, and an idle WebSocket through an
 * intermediary proxy is commonly dropped at around 60 seconds.
 */
const HEARTBEAT_MS = 45_000;

/**
 * How long a heartbeat may go unanswered before the socket is presumed dead.
 *
 * This is what makes the keepalive a *liveness check* rather than just traffic.
 * A socket whose connection has been torn down underneath it — the OS
 * suspending a backgrounded app, a laptop lid, a changed network — frequently
 * never receives a close frame, so `onclose` never fires and `readyState`
 * still reads OPEN. `send()` on one of those does not throw either; it buffers
 * into a connection that is never coming back.
 *
 * Without this the hook would sit on that zombie forever, and the member would
 * watch a thread that silently stopped updating. Ten seconds is long enough to
 * survive a slow network and short enough that a wake is not visibly stale.
 */
const PONG_TIMEOUT_MS = 10_000;

export function useDmSocket(enabled: boolean) {
  const queryClient = useQueryClient();

  // Held in refs rather than state: every one of these changes as part of
  // connection bookkeeping, and re-rendering the subscriber because a timer
  // fired would be noise. Nothing here is rendered.
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    closedByUsRef.current = false;

    const clearPongWatchdog = () => {
      if (pongRef.current) {
        clearTimeout(pongRef.current);
        pongRef.current = null;
      }
    };

    const clearTimers = () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      clearPongWatchdog();
    };

    /**
     * Send a heartbeat and require an answer.
     *
     * Closing on timeout is the point: `close()` fires `onclose` locally even
     * when the peer is unreachable, so the ordinary reconnect path picks it up
     * from there and there is no second recovery mechanism to keep in step.
     */
    const probe = (socket: WebSocket) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send('ping');
      } catch {
        socket.close();
        return;
      }
      clearPongWatchdog();
      pongRef.current = setTimeout(() => {
        try {
          // 4000 is the application-defined range; it distinguishes this from
          // a protocol close in logs.
          socket.close(4000, 'heartbeat timeout');
        } catch {
          // Already gone, which is the same outcome.
        }
      }, PONG_TIMEOUT_MS);
    };

    const connect = () => {
      if (closedByUsRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // No actor id in the URL, by design: the Worker derives the mailbox from
      // the session. There is nothing here to tamper with. See worker/index.ts.
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/ws/dm`
      );
      socketRef.current = socket;

      socket.onopen = () => {
        attemptsRef.current = 0;
        heartbeatRef.current = setInterval(() => probe(socket), HEARTBEAT_MS);
      };

      socket.onmessage = (event) => {
        // Any inbound traffic proves the connection is alive, so it answers the
        // outstanding heartbeat whatever it happens to be.
        clearPongWatchdog();

        // 'pong' is the auto-response to our heartbeat and is not JSON. Its
        // only job was the liveness proof above.
        if (event.data === 'pong') return;

        let payload: DmSocketMessage;
        try {
          payload = JSON.parse(event.data as string) as DmSocketMessage;
        } catch {
          return;
        }

        if (payload.type === 'group') {
          if (typeof payload.groupId !== 'string' || !payload.groupId) return;
          queryClient.invalidateQueries({
            queryKey: [socialQueryKey, 'messages', 'groups'],
          });
          if (payload.kind === 'membership') {
            queryClient.invalidateQueries({
              queryKey: [socialQueryKey, 'group'],
            });
            queryClient.invalidateQueries({
              queryKey: [socialQueryKey, 'me', 'groups'],
            });
            queryClient.invalidateQueries({
              queryKey: [socialQueryKey, 'groups'],
            });
          }
          return;
        }
        if (payload.type !== 'dm') return;

        // The list always changes: a new message moves a conversation to the
        // top and rewrites its snippet, whoever it was with.
        queryClient.invalidateQueries({
          queryKey: [socialQueryKey, 'messages', 'conversations'],
        });

        // Requests can change too. A first message from a stranger is held,
        // which creates a request rather than a conversation — so the folder
        // that would otherwise need a reload is what fills in.
        queryClient.invalidateQueries({
          queryKey: [socialQueryKey, 'dm-requests'],
        });

        // The thread itself, when the notification names one. A multi-recipient
        // DM names none — it has no 1:1 thread — and the list refresh above is
        // the whole of its effect.
        if (payload.conversationActorId) {
          queryClient.invalidateQueries({
            queryKey: [
              socialQueryKey,
              'messages',
              'conversation',
              payload.conversationActorId,
            ],
          });
        }
      };

      socket.onclose = () => {
        clearTimers();
        socketRef.current = null;
        if (closedByUsRef.current) return;

        // Refetch on reconnect rather than replaying: the DO holds no history
        // to replay from, and Postgres already knows everything missed while
        // the socket was down. This is why losing the socket costs nothing.
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** attemptsRef.current,
          RECONNECT_MAX_MS
        );
        attemptsRef.current += 1;
        reconnectRef.current = setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: [socialQueryKey, 'messages'],
          });
          connect();
        }, delay);
      };

      socket.onerror = () => {
        // Deliberately quiet. onclose follows an error and owns the retry, so
        // handling it here would double the backoff schedule. A failing socket
        // is not a user-visible fault — the queries keep polling — so there is
        // nothing to surface either.
        socket.close();
      };
    };

    connect();

    /**
     * Come back from a suspend, a sleep, or a dead network.
     *
     * This is the half that makes the hook work on a phone. A backgrounded app
     * — WebView or native — has its socket torn down by the OS, and the ordinary
     * `onclose` reconnect may never fire because no close frame ever arrives.
     * The heartbeat above eventually catches that, but "eventually" is up to a
     * minute of a thread that looks live and is not.
     *
     * The same thing happens on a laptop lid, so this is not a mobile special
     * case — it is the general fix that mobile happens to hit constantly,
     * because backgrounding is every session rather than an occasional event.
     */
    const revive = () => {
      if (closedByUsRef.current) return;

      // Refresh regardless of what the socket turns out to be doing. Anything
      // could have landed while this was suspended, and unlike the open thread
      // — which polls and refetches on focus — the conversation list has no
      // fallback of its own and would otherwise stay stale until a remount.
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'messages'],
      });

      const socket = socketRef.current;

      if (socket?.readyState === WebSocket.CONNECTING) return;

      if (socket?.readyState === WebSocket.OPEN) {
        // Possibly a zombie. Ask now rather than waiting for the next beat; if
        // it is dead the watchdog closes it and the reconnect path takes over.
        probe(socket);
        return;
      }

      // Not connected. The member is looking at the screen right now, so drop
      // whatever backoff was pending instead of making them wait it out.
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      // A socket still CLOSING has an `onclose` yet to fire. Left attached it
      // would run *after* the replacement is in `socketRef`, null that ref and
      // schedule a second reconnect on top of it — two live sockets, one of
      // them unreachable and leaking its heartbeat. It is already on its way
      // out and has nothing left to report, so detach it.
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socketRef.current = null;
      }

      attemptsRef.current = 0;
      connect();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') revive();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    // Not visibility-gated: a background tab that regains the network should be
    // live by the time it is looked at, not reconnecting from scratch then.
    window.addEventListener('online', revive);

    return () => {
      closedByUsRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', revive);
      clearTimers();
      socketRef.current?.close(1000, 'unmounted');
      socketRef.current = null;
    };
  }, [enabled, queryClient]);
}
