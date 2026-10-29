/**
 * Durable Object: DM Stream (actor mailbox)
 *
 * One instance per *recipient actor*, not per thread. A thread-scoped object
 * would only reach a member who already has that thread open, which is the one
 * case where they do not need a socket. An actor-scoped object is a mailbox:
 * the member holds one connection and anything addressed to them arrives on it
 * regardless of what is on screen — which is also what makes an unread badge
 * live for free, later, without a second transport.
 *
 *   POST /api/social/statuses (visibility: 'direct')
 *     └─ createStatus() writes the row          ← Postgres stays authoritative
 *          └─ for each actor in {recipients} ∪ {author}:
 *               env.DM_STREAM.idFromName(actorId) → stub.fetch('/notify')
 *                    └─ broadcast to that actor's open sockets, if any
 *
 * ## This object stores nothing
 *
 * It is a fan-out point, not a cache — the significant divergence from
 * SignalingRoom, which keeps participants and chat history in SQLite. There is
 * no table here and no `cleanupIfEmpty`, because there is nothing to clean up.
 *
 * That is what keeps this path cheap. A second store of message content would
 * need its own expiry, its own moderation reach, its own deletion path, and
 * would have to be reconciled with Postgres every time the two disagreed.
 * Holding nothing means none of those exist. If the member is offline the
 * notify is a no-op and they read the message from Postgres on next load,
 * exactly as they do today.
 *
 * Delivery is therefore **best-effort by construction**, and the ordinary read
 * path is the fallback rather than a recovery mechanism somebody has to write.
 * A dropped notify costs a refresh, never a message.
 *
 * ## The payload carries no message content
 *
 * Broadcasts say *that* something arrived and *which* conversation it belongs
 * to, never what it said. The client refetches through the normal authenticated
 * query, so every guard on the read path — expiry, blocks, hidden actors, the
 * request gate — still applies. Pushing content through here would route around
 * all of it, and would mean a message deleted a second later had already been
 * delivered in full.
 *
 * ## Identity comes from the Worker, never from the client
 *
 * The object's *name* is the actor id, set server-side in worker/index.ts after
 * the session is resolved. A client cannot ask for someone else's mailbox
 * because it never names one. This is the opposite of the signaling room, which
 * trusts `data.userId` from the client's own join message — survivable for a
 * proof-of-concept behind unguessable room ids, a hole for messaging.
 *
 * ## Hibernation
 *
 * Sockets are handed to the runtime with `state.acceptWebSocket()` rather than
 * `ws.accept()`, so this object is evicted between messages and billed only
 * while it runs. A mailbox is almost entirely idle — a member may hold a
 * connection for hours and receive four messages — so pinning it in memory
 * would bill hours of wall clock for milliseconds of work.
 *
 * The consequence is that **no instance field survives between messages**.
 * Nothing here keeps state across a wake; the live sockets are whatever
 * `state.getWebSockets()` returns at the moment it is called.
 *
 * Protocol:
 *   Server → Client:
 *     { type: "ready" }
 *     { type: "dm", conversationActorId: string | null, statusId: string, at: number }
 *     { type: "group", groupId: string, kind: "message" | "membership", messageId?: string, at: number }
 *   Client → Server:
 *     "ping"  → "pong", answered by the runtime without waking this object
 */

interface MailboxState {
  setWebSocketAutoResponse(pair: WebSocketRequestResponsePair): void;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): { send(message: string): void }[];
}

/** Pinned to each socket at accept time, readable after a wake. */
interface SocketMeta {
  connectedAt: number;
}

export class DmStream {
  private state: MailboxState;

  constructor(state: MailboxState, _env: unknown) {
    this.state = state;

    // Answer keepalives in the runtime rather than in this class. Browser JS
    // cannot send a protocol-level ping frame, so a web client's keepalive has
    // to be an ordinary message — and an ordinary message would wake this
    // object on every beat and undo hibernation entirely. An auto-response is
    // handled without incurring wall-clock time.
    //
    // A native mobile client does not need this at all: OkHttp's pingInterval
    // and URLSessionWebSocketTask.sendPing emit real ping frames, which the
    // runtime answers without ever reaching webSocketMessage.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal fan-out from createStatus. Not reachable from outside: this
    // object is only ever addressed through a DO stub, which requires the
    // binding, which only the Worker has.
    if (url.pathname === '/notify') {
      return this.handleNotify(request);
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const meta: SocketMeta = { connectedAt: Date.now() };
    server.serializeAttachment(meta);

    this.state.acceptWebSocket(server);

    // Sent so the client can distinguish "socket open" from "socket open and
    // the server agrees who I am". The upgrade succeeding only proves the
    // Worker authenticated the session; this proves the mailbox accepted it.
    server.send(JSON.stringify({ type: 'ready' }));

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Fan a notification out to every socket this actor currently holds.
   *
   * Returns the delivered count, which is the honest signal the caller needs
   * and the one place a future push integration belongs: `delivered === 0`
   * means this member has no live connection, which is exactly the condition
   * for "send an APNs/FCM push instead". Mobile clients lose their socket the
   * moment the OS suspends the app, so background delivery is a push problem
   * no socket architecture solves — but this object is the thing that knows.
   */
  private async handleNotify(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json(
        { delivered: 0, error: 'Invalid JSON' },
        {
          status: 400,
        }
      );
    }

    // A notification that cannot name a status is meaningless — the client's
    // only job on receipt is to refetch, and it needs to know what arrived.
    if (!payload || typeof payload !== 'object') {
      return Response.json(
        { delivered: 0, error: 'Invalid notification' },
        { status: 400 }
      );
    }

    // Rebuilt field by field rather than spread, so the wire format is fixed
    // here and cannot be widened — or have `type` overwritten — by whatever the
    // caller happened to post.
    const value = payload as Record<string, unknown>;
    const at =
      typeof value.at === 'number' && Number.isFinite(value.at)
        ? value.at
        : Date.now();
    let message: string;
    if (value.type === 'group') {
      if (
        typeof value.groupId !== 'string' ||
        !value.groupId ||
        (value.kind !== 'membership' && value.kind !== 'message') ||
        (value.kind === 'message' &&
          (typeof value.messageId !== 'string' || !value.messageId))
      ) {
        return Response.json(
          { delivered: 0, error: 'Invalid group notification' },
          { status: 400 }
        );
      }
      message = JSON.stringify({
        type: 'group',
        groupId: value.groupId,
        kind: value.kind,
        at,
        ...(value.kind === 'message' ? { messageId: value.messageId } : {}),
      });
    } else {
      if (typeof value.statusId !== 'string' || !value.statusId) {
        return Response.json(
          { delivered: 0, error: 'Missing statusId' },
          { status: 400 }
        );
      }
      message = JSON.stringify({
        type: 'dm',
        conversationActorId:
          typeof value.conversationActorId === 'string'
            ? value.conversationActorId
            : null,
        statusId: value.statusId,
        at,
      });
    }
    const sockets = this.state.getWebSockets();

    let delivered = 0;
    for (const ws of sockets) {
      try {
        ws.send(message);
        delivered++;
      } catch {
        // A socket that died between getWebSockets() and send(). Nothing to do
        // and nothing to report: the member reads this message from Postgres on
        // their next load, which is the same outcome as never having been
        // connected. Closing it here would race the runtime's own cleanup.
      }
    }

    return Response.json({ delivered });
  }

  // ── Hibernation handlers ────────────────────────────────────────────────
  // Methods, not closures: a handler captured at accept time does not survive
  // this object being evicted.

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // A mailbox is one-directional. Sending happens over the ordinary HTTP API
    // so that one code path owns validation, the request gate, federation, and
    // expiry stamping; accepting sends here would be a second, thinner door
    // into the same substrate that would have to re-implement all four.
    //
    // 'ping' never arrives — setWebSocketAutoResponse answers it in the runtime
    // — so anything reaching this method is a client doing something the
    // protocol does not define. Say so rather than failing silently.
    const text =
      typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (text === 'ping') return;

    try {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'This socket is receive-only; send DMs via the HTTP API.',
        })
      );
    } catch {
      // The socket closed mid-send. Nothing to recover.
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string) {
    // compatibility_date 2026-02-24 predates web_socket_auto_reply_to_close
    // (2026-04-07) and the flag is not set, so the runtime does not echo the
    // Close frame and the server half stays open until closed here. A lingering
    // socket keeps appearing in getWebSockets(), which would inflate the
    // delivered count that a future push hook reads as "they got it".
    try {
      // 1005 (no status received) and 1006 (abnormal closure) are receive-only
      // codes and echoing either is rejected; report a normal closure instead.
      const echo = code === 1005 || code === 1006 ? 1000 : code;
      ws.close(echo, 'closing');
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown) {
    try {
      ws.close(1011, 'error');
    } catch {
      // Already closed.
    }
  }
}
