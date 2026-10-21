import { notFound } from 'next/navigation';

import { auth } from '@/auth';
import { AdminPageHeader, Panel, StatBand } from '@/components/Admin/parts';
import { UsersTable } from '@/components/Admin/users-table';
import { ADMIN_CHROME } from '@/lib/admin/theme';
import {
  ACCOUNT_TYPES,
  USER_STATES,
  isUserState,
} from '@/lib/admin/user-filters';
import { listUsers, latestLocksFor, userStats } from '@/lib/admin/users';
import { redirectToSignIn } from '@/lib/signin-redirect';

/**
 * Accounts.
 *
 * ## What this replaces, and what it had to build first
 *
 * The mock that stood here listed its own blocker in its docblock: Lock was
 * "a write nobody has designed yet — there is no unlock flow, no audit row,
 * and no answer to what happens to a locked owner's live listings". All three
 * are answered now, and answering them was most of the work:
 *
 *   - **No unlock flow** → lock and unlock are one control and both write the
 *     same history table, because a suspension you cannot lift is a deletion
 *     with better manners.
 *   - **No audit row** → `user_locks` (migration 0058), with the reason NOT
 *     NULL and non-blank at the database level.
 *   - **Locked owner's listings** → nothing happens to them, deliberately,
 *     and the count is on screen before the button is pressed.
 *
 * ## The finding that changed the shape of this work
 *
 * The mock said `users.locked_at` existed and nothing wrote it. That was true
 * and it was the smaller half. Nothing *enforced* it either: the column was
 * read back by two endpoints as `locked`, and no sign-in path, no middleware
 * and no session check ever consulted it.
 *
 * So the obvious implementation — point the button at an UPDATE — would have
 * produced an admin console that reports success, a row that says Locked, and
 * a member who notices nothing. The worst kind of safety control is one that
 * looks like it worked.
 *
 * Locking is therefore three writes in one transaction (set the column, delete
 * the sessions, record the reason — `lib/admin/users.ts`) plus a refusal at
 * session creation in `auth.ts`. The transaction ends the access they have;
 * the hook denies the access they would get next. Neither half is sufficient
 * and the first one alone is actively misleading.
 *
 * ## Why filters live in the URL
 *
 * Search and filters are a plain GET form rather than client state, so this
 * page ships no JavaScript for the thing it does most. The useful consequence
 * is that a filtered view is a link: an admin can paste "locked accounts" into
 * a thread, and the back button steps through searches the way it should.
 *
 * ## The two filters that cannot be SQL
 *
 * `staff` and `owners` are applied after the read, not in the WHERE clause.
 * For staff that is forced: admin is the union of a column and an environment
 * variable, and no query can see `ADMIN_EMAILS`, so filtering in SQL would
 * silently omit every founder — the group most likely to be looked up that
 * way. See `listUsers()`, which adjusts the count to match so the pager does
 * not offer pages that turn out to be empty.
 */

export const metadata = {
  title: 'Users | Pana Admin',
  robots: { index: false, follow: false },
};

const STATE_LABEL: Record<string, string> = {
  all: 'Everyone',
  locked: 'Locked',
  unverified: 'Unverified email',
  owners: 'Runs a listing',
  staff: 'Admin or moderator',
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* Same gate as the connectors console, for the same reason: this page shows
   * real names and real email addresses, and nothing under /admin is covered
   * by middleware. Signed out is probably an expired staff session, so send
   * them to sign in; signed in but not admin should not learn this exists. */
  const session = await auth();
  if (!session?.user?.id) redirectToSignIn('/admin/users');
  if (!session.user.isAdmin) notFound();

  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const query = one('q') ?? '';
  const stateParam = one('state');
  const state = isUserState(stateParam) ? stateParam : 'all';
  const type = one('type') ?? '';
  const page = Number.parseInt(one('page') ?? '1', 10) || 1;

  const [result, stats] = await Promise.all([
    listUsers({ query, state, accountType: type || null, page }),
    userStats(),
  ]);

  const filtering = query.length > 0 || state !== 'all' || type.length > 0;

  /* Why each locked account was locked, for the rows on this page only. One
     extra query, and only when something on the page is actually locked. */
  const locks = await latestLocksFor(
    result.rows.filter((row) => row.lockedAt !== null).map((row) => row.id)
  );

  /* Preserve the current filters when paging, so Next does not silently drop
   * the search the admin is halfway through reading. */
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (state !== 'all') next.set('state', state);
    if (type) next.set('type', type);
    if (target > 1) next.set('page', String(target));
    const qs = next.toString();
    return qs ? `/admin/users?${qs}` : '/admin/users';
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Accounts"
        description={
          <p>
            Everyone with a sign-in. Locking ends their sessions immediately and
            refuses the next one — it does not touch the listings they run.
          </p>
        }
      />

      <div>
        <StatBand
          stats={[
            {
              label: 'Accounts',
              value: String(stats.total),
              note: 'Everyone who has ever signed in',
            },
            {
              label: 'Locked',
              value: String(stats.locked),
              note: 'Signed out and refused at sign-in',
            },
            {
              label: 'Unverified',
              value: String(stats.unverified),
              note: 'Never confirmed their email',
            },
          ]}
        />
      </div>

      <div className="mt-6">
        <Panel title="Find someone">
          {/* A plain GET form. No client bundle, and the result is a link. */}
          <form method="get" className="flex flex-wrap items-end gap-3 p-5">
            <div className="min-w-[14rem] flex-1">
              <label
                htmlFor="q"
                className="text-pana-ink/70 block text-xs font-bold"
              >
                Name, screenname or email
              </label>
              <input
                id="q"
                name="q"
                defaultValue={query}
                placeholder="maria, @mariacooks, maria@…"
                className="border-pana-ink/20 text-pana-ink mt-1 w-full rounded-lg border-2 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="state"
                className="text-pana-ink/70 block text-xs font-bold"
              >
                Showing
              </label>
              <select
                id="state"
                name="state"
                defaultValue={state}
                className="border-pana-ink/20 text-pana-ink mt-1 rounded-lg border-2 bg-white px-3 py-2 text-sm"
              >
                {USER_STATES.map((value) => (
                  <option key={value} value={value}>
                    {STATE_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="type"
                className="text-pana-ink/70 block text-xs font-bold"
              >
                Account type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={type}
                className="border-pana-ink/20 text-pana-ink mt-1 rounded-lg border-2 bg-white px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                {ACCOUNT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className={`border-pana-ink rounded-full border-2 ${ADMIN_CHROME.FILL} px-4 py-2 text-sm font-extrabold ${ADMIN_CHROME.ON_FILL}`}
            >
              Search
            </button>
            {filtering ? (
              <a
                href="/admin/users"
                className="text-pana-indigo text-sm font-bold underline"
              >
                Clear
              </a>
            ) : null}
          </form>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title={
            filtering ? `${result.total} matching` : `${result.total} accounts`
          }
          action={
            result.totalPages > 1 ? (
              <span className={`text-xs font-bold ${ADMIN_CHROME.ON_FILL}`}>
                Page {result.page} of {result.totalPages}
              </span>
            ) : null
          }
        >
          <UsersTable
            viewerIsAdmin={session.user.isAdmin}
            viewerIsSuperAdmin={session.user.isSuperAdmin}
            rows={result.rows.map((row) => {
              const lock = locks.get(row.id);
              return {
                ...row,
                createdAt: row.createdAt.toISOString(),
                lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
                lockReason: lock?.reason ?? null,
                lockedBy: lock?.actorEmail ?? null,
              };
            })}
          />
          {result.totalPages > 1 ? (
            <div className="border-pana-ink/10 flex items-center justify-between border-t-2 px-5 py-3">
              {result.page > 1 ? (
                <a
                  href={pageHref(result.page - 1)}
                  className="text-pana-indigo text-sm font-bold underline"
                >
                  ← Previous
                </a>
              ) : (
                <span />
              )}
              {result.page < result.totalPages ? (
                <a
                  href={pageHref(result.page + 1)}
                  className="text-pana-indigo text-sm font-bold underline"
                >
                  Next →
                </a>
              ) : (
                <span />
              )}
            </div>
          ) : null}
        </Panel>
      </div>

      <p className="text-pana-ink/60 mt-4 max-w-2xl text-xs">
        Admin and moderator roles are granted on{' '}
        <a
          className="text-pana-indigo font-bold underline"
          href="/admin/users/roles"
        >
          Roles &amp; permissions
        </a>
        . Accounts holding admin cannot be locked from here — remove the role
        first, so this control can never be turned on the people who could undo
        it.
      </p>
    </>
  );
}
