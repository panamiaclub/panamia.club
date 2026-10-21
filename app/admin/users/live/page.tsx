'use client';

import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import { useSession } from '@/lib/auth-client';
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { Flag, ShieldCheck, User } from 'lucide-react';
import PageMeta from '@/components/PageMeta';
import { UserInterface, Pagination } from '@/lib/interfaces';
import { standardizeDateTime } from '@/lib/standardized';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The live user list, and the one screen that grants admin.
 *
 * This is the original `/admin/users` page, moved here rather than deleted
 * when that path became the mock. It is the only screen in the product that
 * reads real `users` rows, so removing it to make room for a design would have
 * taken away a working tool to show a picture of a better one.
 *
 * It is off the sidebar. `/admin/users` links down to it.
 *
 * Three bugs were fixed across the move, all pre-existing:
 *
 * - `new URLSearchParams().append(...)` returns `undefined`, not the params
 *   object, so this requested `?undefined` and the page number was never sent.
 * - The caller sent `page` while /api/getUserList read `page_number`, so even
 *   after the above was fixed every page still showed the first twenty rows.
 *   The route now reads either spelling; this sends the canonical one.
 * - The avatar icon was `text-white` on a white card.
 */

/** A row as /api/getUserList returns it — the base record plus the admin tiers. */
type AdminUserRow = UserInterface & {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  grantedAdmin?: boolean;
  isContentModerator?: boolean;
  hasProfile?: boolean;
};

export default function AdminUsersLivePage() {
  const { gate } = useAdminGate();
  const { data: session } = useSession();
  const canGrant = session?.user?.isSuperAdmin ?? false;
  // Granting the moderation rota needs only admin, not the founder tier. The
  // role carries the report queue and no grant power of its own, so it cannot
  // replicate itself; gating it behind ADMIN_EMAILS would put every volunteer
  // behind one person for no safety gained.
  const canGrantModerator = session?.user?.isAdmin ?? false;

  const [page_number, setPageNumber] = useState(1);
  const [submissions_list, setSubmissionsList] = useState<AdminUserRow[]>([]);
  const [pagination, setPagination] = useState({} as Pagination);
  // Keyed by row *and* role: the two toggles on a row are independent, and a
  // bare row id would grey out both while either was saving.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string }>();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.append('page_number', page_number.toString());
    axios
      .get(`/api/getUserList?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      })
      .then((resp) => {
        setSubmissionsList(resp.data.data);
        setPagination(resp.data.pagination);
        return resp;
      })
      .catch((error) => {
        console.log(error);
        return [];
      });
  }, [page_number]);

  useEffect(() => {
    load();
  }, [load]);

  async function setAdmin(row: AdminUserRow, admin: boolean) {
    const who = row.name || row.screenname || row.email;
    const question = admin
      ? `Give ${who} admin access? They will be able to use every admin screen.`
      : `Remove admin access from ${who}?`;
    if (!window.confirm(question)) return;

    setBusyId(`${row._id}:admin`);
    setRowError(undefined);
    try {
      await axios.post('/api/admin/users/admin-role', {
        userId: row._id,
        admin,
      });
      // Re-read rather than patching state locally: the server is the only
      // thing that knows whether the write actually landed, and a local flip
      // would show success even if the row had changed underneath.
      load();
    } catch (error) {
      const message =
        (axios.isAxiosError(error) && error.response?.data?.error) ||
        'Could not change admin access.';
      setRowError({ id: row._id, message });
    } finally {
      setBusyId(null);
    }
  }

  async function setContentModerator(
    row: AdminUserRow,
    contentModerator: boolean
  ) {
    const who = row.name || row.screenname || row.email;
    const question = contentModerator
      ? `Put ${who} on the moderation rota? They will see the abuse-report ` +
        `queue and be emailed about new reports.`
      : `Take ${who} off the moderation rota?`;
    if (!window.confirm(question)) return;

    setBusyId(`${row._id}:moderator`);
    setRowError(undefined);
    try {
      await axios.post('/api/admin/users/content-moderator', {
        userId: row._id,
        contentModerator,
      });
      load();
    } catch (error) {
      const message =
        (axios.isAxiosError(error) && error.response?.data?.error) ||
        'Could not change the moderation rota.';
      setRowError({ id: row._id, message });
    } finally {
      setBusyId(null);
    }
  }

  function adminControl(item: AdminUserRow) {
    if (!canGrant) return null;

    // Both disabled cases are rendered rather than hidden. A missing button is
    // indistinguishable from a bug, and the reason is the useful part.
    if (item.isSuperAdmin) {
      return (
        <p className="text-pana-ink/70 text-xs">
          Managed in <code>ADMIN_EMAILS</code> — not changeable here.
        </p>
      );
    }
    if (!item.hasProfile) {
      return (
        <p className="text-pana-ink/70 text-xs">
          No profile yet, so there is nowhere to record a grant.
        </p>
      );
    }
    return (
      <Button
        variant={item.grantedAdmin ? 'outline' : 'default'}
        onClick={() => setAdmin(item, !item.grantedAdmin)}
        disabled={busyId === `${item._id}:admin`}
      >
        {busyId === `${item._id}:admin`
          ? 'Saving…'
          : item.grantedAdmin
            ? 'Remove admin'
            : 'Make admin'}
      </Button>
    );
  }

  function moderatorControl(item: AdminUserRow) {
    if (!canGrantModerator) return null;
    // An admin already reaches the report queue, so offering the role to one
    // would be a toggle that changes nothing visible. The exception is the
    // report email, which follows the role — admins get that through the
    // admin half of the rota query, so there is still nothing to add here.
    if (item.isAdmin) return null;
    if (!item.hasProfile) return null;

    return (
      <Button
        variant={item.isContentModerator ? 'outline' : 'default'}
        onClick={() => setContentModerator(item, !item.isContentModerator)}
        disabled={busyId === `${item._id}:moderator`}
      >
        {busyId === `${item._id}:moderator`
          ? 'Saving…'
          : item.isContentModerator
            ? 'Remove from rota'
            : 'Add to moderation rota'}
      </Button>
    );
  }

  function createListElements() {
    return submissions_list.map((item: AdminUserRow, index) => {
      const controls = [adminControl(item), moderatorControl(item)].filter(
        Boolean
      );
      return (
        <Card key={index}>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <User className="text-pana-ink/60 h-5 w-5" />
                </div>
                <div className="text-sm">
                  Created: {standardizeDateTime(item?.createdAt)}
                </div>
                <div className="text-sm">
                  Updated: {standardizeDateTime(item?.updatedAt)}
                </div>
                {item.isAdmin ? (
                  <span className="bg-pana-indigo inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {item.isSuperAdmin ? 'Admin · founder' : 'Admin'}
                  </span>
                ) : null}
                {!item.isAdmin && item.isContentModerator ? (
                  <span className="bg-pana-ink/10 text-pana-ink inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold">
                    <Flag className="h-3.5 w-3.5" />
                    Moderation rota
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                <div>
                  <span className="font-semibold">Name:</span> {item?.name}
                </div>
                <div>
                  <span className="font-semibold">Email:</span> {item?.email}
                </div>
              </div>
              {controls.length > 0 ? (
                <div className="border-pana-ink/10 space-y-3 border-t pt-3">
                  {controls.map((control, i) => (
                    <div key={i}>{control}</div>
                  ))}
                  {rowError?.id === item._id ? (
                    <p className="text-pana-red mt-2 text-xs font-semibold">
                      {rowError.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      );
    });
  }

  if (gate) return gate;

  return (
    <>
      <PageMeta title="Users — live list | Admin" desc="" />
      <div>
        <AdminPageHeader
          eyebrow="Community"
          title="Users — live list"
          description={
            <p>
              Real rows from the database. Use{' '}
              <Link
                href="/admin/users"
                className="font-bold underline underline-offset-4"
              >
                Accounts
              </Link>{' '}
              for focused search and account controls.
            </p>
          }
        />
        <div className="border-pana-ink/10 bg-pana-butter/30 text-pana-ink/80 mb-6 max-w-2xl rounded-xl border p-4 text-sm leading-relaxed">
          {canGrant ? (
            <>
              <strong className="font-bold">You can grant admin.</strong> A
              grant takes effect on their next page load — no sign-out needed.
              Accounts listed in <code>ADMIN_EMAILS</code> are marked{' '}
              <em>founder</em> and can only be changed by editing that secret.
            </>
          ) : (
            <>
              <strong className="font-bold">You cannot grant admin.</strong>{' '}
              That is limited to accounts in <code>ADMIN_EMAILS</code>, so that
              a compromised admin account cannot create more admins.
            </>
          )}
          {canGrantModerator ? (
            <p className="mt-3">
              You can put somebody on the{' '}
              <strong className="font-bold">moderation rota</strong>. That gives
              them the abuse-report queue and the emails that come with it — not
              the rest of the admin tools, and not the ability to grant anything
              to anyone.
            </p>
          ) : null}
          <p className="mt-3">
            Looking for one specific person, or for who already holds a role?{' '}
            <Link
              href="/admin/users/roles"
              className="font-bold underline underline-offset-4"
            >
              Roles &amp; permissions
            </Link>{' '}
            has a search box and lists the roster directly, instead of paging
            through every account.
          </p>
        </div>
        <div className="space-y-6">
          <div className="space-y-4">{createListElements()}</div>
          <div className="flex items-center gap-4">
            <small>Page: {pagination?.page_number}</small>
            <Button
              onClick={() => setPageNumber(page_number - 1)}
              disabled={pagination?.page_number == 1}
            >
              Previous
            </Button>
            <Button
              onClick={() => setPageNumber(page_number + 1)}
              disabled={pagination?.page_number == pagination.total_pages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
