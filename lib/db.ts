/**
 * Drizzle Database Client
 *
 * runWithDb(env, fn) must wrap request handling in the Cloudflare Worker entry
 * point (worker/index.ts). It creates a client for that request and scopes it
 * with AsyncLocalStorage, so the `db` proxy resolves to the current request's
 * client. A shared module-level client is unsafe: concurrent requests in one
 * isolate would use each other's sockets, which workerd rejects as
 * cross-request I/O and then cancels the request as hung.
 *
 * A fresh postgres.js client is created per request on every path. Reusing one
 * across requests trips workerd's cross-request I/O guard — see dbStore below.
 *
 * - Production (CF Workers): env.POSTGRES_URL secret, max: 1 — see the warning below
 * - Local dev (vinext dev): env.POSTGRES_URL secret binding (from .dev.vars)
 * - Local dev (plain Node.js): process.env.POSTGRES_URL, cached
 *
 * Priority: env.POSTGRES_URL > HYPERDRIVE > process.env.POSTGRES_URL
 *
 * We check env.POSTGRES_URL BEFORE HYPERDRIVE because in local dev miniflare rewrites
 * env.HYPERDRIVE.connectionString to use 127.0.0.1:<proxy_port> (not 'localhost'), so
 * a simple 'includes localhost' guard can't reliably detect the placeholder Hyperdrive.
 *
 * This docblock used to end "in production env.POSTGRES_URL is never set, so
 * Hyperdrive is always used there." That is false, and the error propagated:
 * a later reader trusted it and annotated the first branch of getDb as the
 * dev-only path, which is how max: 1 came to sit unnoticed on the production
 * path. Verified 2026-10-10 via `wrangler secret list` — POSTGRES_URL is a
 * deployed secret_text on the production Worker. Because it is checked first,
 * the HYPERDRIVE branch never runs in production. The stale binding was removed
 * from wrangler.jsonc because it referenced a configuration in another
 * Cloudflare account and blocked deployment from the production account.
 *
 * What that actually costs, measured against production the same day:
 *   - max: 1 applies deployed, so every `await Promise.all([...])` in this
 *     codebase runs sequentially in production, not only in dev.
 *   - prepare: false is NOT applied; only the Hyperdrive branch sets it.
 *   - Supabase still pools, so this is a latency problem and not a capacity
 *     cliff: the secret points at Supavisor, which fronts Postgres with ~15
 *     backends and multiplexes over them. 75 concurrent requests to
 *     /api/directory/scope-counts added zero connections — steady 20 of 57
 *     usable (max_connections 60 less 3 reserved). Visitor concurrency does
 *     not approach the ceiling; connection count tracks Worker isolates,
 *     which is why wrangler.jsonc pins placement to one region.
 *
 * A future Hyperdrive migration must first create the configuration in the
 * production Cloudflare account, restore the binding in wrangler.jsonc, and
 * only then delete POSTGRES_URL. Until then, read the first branch below as
 * the production path.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface CloudflareEnv {
  HYPERDRIVE?: { connectionString: string };
  // Set in BOTH production and local dev, which the header docblock once
  // denied. Locally it is a wrangler secret text binding populated from
  // .dev.vars; in production it is a deployed secret (confirmed via
  // `wrangler secret list`), and because getDb checks it first that makes the
  // POSTGRES_URL branch the live production path.
  POSTGRES_URL?: string;
  // '1' turns on per-query logging in production. Off by default — see the
  // `debug` note in the Hyperdrive branch below.
  DEBUG_REQUEST_LOG?: string;
}

export type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

// Cache for plain Node.js dev server (server.js) only — process.env.POSTGRES_URL connections
// don't have the workerd cross-request I/O restriction so sharing is safe there.
const nodeDevInstance: { instance: DbInstance | null } = { instance: null };

// Holds the DB instance for the current request.
//
// A plain module-level variable cannot do this job: workerd serves concurrent
// requests from a single isolate, so request A would read the client that
// request B installed a moment earlier. postgres.js sockets are bound to the
// request context that opened them, so using another request's client trips
// workerd's cross-request I/O guard, the request hangs, and the runtime
// cancels it with "your Worker's code had hung and would never generate a
// response" (surfacing as an intermittent 500).
//
// AsyncLocalStorage keeps the instance scoped to the request that created it
// and propagates across awaits. Requires the `nodejs_compat` flag, which
// wrangler.jsonc already sets.
const dbStore = new AsyncLocalStorage<DbInstance>();

// Retained only as a fallback for code that runs outside a request scope
// (see getDb below). Request-scoped code resolves via dbStore first.
let cachedInstance: DbInstance | null = null;

/**
 * Run `fn` with a DB client scoped to the current request. The worker entry
 * point wraps every request in this so `db` resolves per request instead of
 * through shared mutable state.
 */
export function runWithDb<T>(env: CloudflareEnv, fn: () => T): T {
  return dbStore.run(getDb(env), fn);
}

export function getDb(env?: CloudflareEnv): DbInstance {
  // Production AND local dev (vinext dev): env.POSTGRES_URL is set in both, so
  // this branch is the deployed path today — not a dev-only one. See the
  // header docblock for how that happened and what it costs.
  // Always create a fresh client per request — workerd prevents cross-request socket reuse.
  // (Sharing a postgres.js pool across requests causes "Cannot perform I/O on behalf of a
  // different request" because the pool's TCP sockets are bound to the creating request.)
  // max: 1 — NOT the 5 the Hyperdrive branch uses, and the difference is not a
  //   pooling preference. Dev talks to a local Postgres
  //   through postgres.js's Cloudflare build, whose socket polyfill
  //   mis-pipelines the extended query protocol once more than one query is in
  //   flight: a Bind lands against another query's Parse and the server
  //   rejects it with "bind message supplies N parameters, but prepared
  //   statement \"\" requires N-1" (SQLSTATE 08P01). `prepare: false` does not
  //   avoid it; serialising onto one connection does.
  //
  //   This was raised to 5 to make `Promise.all` behave in dev the way it was
  //   believed to behave deployed. It does the opposite — the polyfill just
  //   crashes, and only on pages that fan out, so the events discovery feed
  //   and the host page both 500'd for signed-in readers while their
  //   signed-out versions, which skip the viewer-shaped queries, rendered fine.
  //
  //   The sentence that stood here said the concurrency is "absorbed by
  //   Hyperdrive" deployed. It is not: POSTGRES_URL is a production secret, so
  //   this branch is the deployed path and max: 1 serialises fan-out in
  //   production too. That is latency, not breakage — Supavisor still pools
  //   behind the connection string, so the 60-connection ceiling stays far
  //   away (see the header docblock for the measurements). Lifting the cap
  //   belongs with removing the secret, not on its own: raising it here would
  //   reintroduce the 08P01 crash in dev for no production benefit.
  if (env?.POSTGRES_URL) {
    const client = postgres(env.POSTGRES_URL, { max: 1 });
    const instance = drizzle(client, { schema });
    cachedInstance = instance;
    return instance;
  }

  // Hyperdrive path for the Supabase connection pool. This was written as the
  // production path and is still the intended one, but it is unreachable in
  // production today: POSTGRES_URL is a deployed secret and is checked above.
  // Everything below describes how this behaves once that secret is deleted.
  // Local dev still reaches it when .dev.vars omits POSTGRES_URL.
  if (env?.HYPERDRIVE) {
    // Always create a fresh postgres.js client for each Worker request.
    // Hyperdrive manages the actual connection pool to Supabase; a new client here is just
    // a new local socket to Hyperdrive — cheap. Reusing a cached client across requests
    // leads to stale-connection failures once Hyperdrive silently closes an idle socket.
    //
    // max: 5 — Cloudflare's published value for postgres.js behind Hyperdrive,
    //   and the reason is a hard limit rather than a preference: a Worker
    //   invocation may have at most six outbound connections waiting on
    //   response headers, and a TCP socket counts. Five leaves one slot for
    //   any other fetch in the same request.
    //   https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/
    //
    //   This was 1, on the reasoning that "Workers have no persistent
    //   connection pool". That is the reason the client is built per request
    //   (below); it is not a reason to cap that client at a single socket, and
    //   capping it had a cost that was easy to miss: postgres.js queues
    //   concurrent queries onto the available connections, so at max: 1 every
    //   `await Promise.all([...])` in this codebase ran sequentially. The
    //   search typeahead fires four such queries per keystroke batch.
    //
    //   Raising this does not multiply connections against Supabase. Hyperdrive
    //   pools to the origin independently and multiplexes in transaction mode;
    //   the origin ceiling is Hyperdrive's, not this number.
    //   https://developers.cloudflare.com/hyperdrive/configuration/connection-pooling/
    //
    //   Do not raise it to 6. The docs say a seventh connection queues, but
    //   porsager/postgres#1023 — filed by a Cloudflare engineer — reports a
    //   production deadlock at max: 10 rather than graceful queueing, and that
    //   issue is what prompted the documented 5.
    //
    // prepare: false — Hyperdrive only supports the simple query protocol,
    //   not the extended protocol (prepared statements) that postgres.js uses by default.
    //   https://developers.cloudflare.com/hyperdrive/examples/postgres-js/
    //
    //   That is no longer true: Hyperdrive now documents support for named
    //   prepared statements in postgres.js, and says leaving this false costs
    //   both its statement cache and an extra round trip per query. Left false
    //   here on purpose anyway — porsager/postgres#960 ("prepared statement
    //   already exists" against Hyperdrive) is still open, and `prepare: false`
    //   is the workaround in that thread. Worth revisiting as its own change,
    //   with somewhere to verify it; it is not a free flip.
    //
    // debug — log every query so failures are visible in wrangler tail.
    //   Opt-in rather than always-on. Workers Logs bills per event beyond the
    //   included allowance, and this emitted one event per query on every
    //   request — comfortably the largest single source of log volume in the
    //   Worker, for output nobody reads outside an active investigation.
    //   Set the DEBUG_REQUEST_LOG=1 secret to turn it back on; it gates the
    //   matching per-request breadcrumb in auth.ts too.
    //
    //   Failures are unaffected: errors still surface through the
    //   `observability` block in wrangler.jsonc, which samples at 100%. This
    //   only drops the successful-query chatter around them.
    const debugQueries = env.DEBUG_REQUEST_LOG === '1';
    const client = postgres(env.HYPERDRIVE.connectionString, {
      max: 5,
      prepare: false,
      ...(debugQueries
        ? {
            debug: (connection, query, params) => {
              const short = (
                typeof query === 'string' ? query : String(query)
              ).slice(0, 80);
              console.log(
                '[db]',
                short,
                params?.length ? `p[${params.length}]` : ''
              );
            },
          }
        : {}),
    });
    const instance = drizzle(client, { schema });
    cachedInstance = instance;
    return instance;
  }

  // No env provided: called via `db` proxy. Prefer the current request's
  // client; fall back to the last one created only for code paths that run
  // outside runWithDb (scheduled handlers, Durable Objects).
  const scoped = dbStore.getStore();
  if (scoped) return scoped;
  if (cachedInstance) return cachedInstance;

  // Plain Node.js dev server (server.js) — process.env.POSTGRES_URL is available and
  // sharing a connection pool across requests is safe outside workerd.
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      'Database: no connection string. ' +
        'Provide the HYPERDRIVE binding (production) or set POSTGRES_URL (local dev).'
    );
  }
  if (nodeDevInstance.instance) return nodeDevInstance.instance;
  const client = postgres(connectionString);
  const instance = drizzle(client, { schema });
  nodeDevInstance.instance = instance;
  return instance;
}

// Backward-compatible export for the 100+ files that do `import { db } from '@/lib/db'`.
// Every property access is forwarded lazily to getDb(), which returns the cached instance
// that was primed by the worker entry point before the request reached application code.
export const db: DbInstance = new Proxy({} as DbInstance, {
  get(_, prop: string | symbol) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
