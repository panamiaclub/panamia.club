'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { Flag, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader, Panel } from '@/components/Admin/parts';
import { useSession } from '@/lib/auth-client';
import PageMeta from '@/components/PageMeta';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  GRANTABLE_ROLES,
  type GrantableRole,
  canGrant,
} from '@/lib/admin/roles';
import { MIN_SEARCH_LENGTH } from '@/lib/admin/user-search';

/**
 * Who holds a staff role, and how to give someone one.
 *
 * Replaces paging through every account to find four people. The roster is
 * the inverse query — everyone *with* a role, returned whole — and the search
 * box is how you reach somebody who does not have one yet.
 *
 * Granting still goes through the two existing endpoints, each keeping its own
 * tier: admin needs ADMIN_EMAILS membership, the moderation rota needs any
 * admin. This page draws the buttons its viewer may actually use and explains
 * the ones it withholds, rather than offering a control that 401s.
 *
 * Only roles something actually enforces are listed. See lib/admin/roles.ts.
 */

interface Holder {
  userId: string | null;
  email: string;
  name: string | null;
  screenname: string | null;
  hasAccount: boolean;
  hasProfile: boolean;
  isSuperAdmin: boolean;
  grantedAdmin: boolean;
  isAdmin: boolean;
  isContentModerator: boolean;
}

type SearchResult = Omit<Holder, 'hasAccount'> & { userId: string };

function displayName(person: {
  name: string | null;
  screenname: string | null;
  email: string;
}) {
  return person.name || person.screenname || person.email;
}

function holdsRole(person: Holder | SearchResult, role: GrantableRole) {
  return role.id === 'admin' ? person.isAdmin : person.isContentModerator;
}

export default function AdminRolesPage() {
  const { gate } = useAdminGate();
  const { data: session } = useSession();
  const actor = {
    isAdmin: session?.user?.isAdmin ?? false,
    isSuperAdmin: session?.user?.isSuperAdmin ?? false,
  };

  const [roster, setRoster] = useState<Holder[]>([]);
  const [rosterError, setRosterError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Keyed by person *and* role: someone can hold both, and a bare user id
  // would grey out both buttons while either was saving.
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ key: string; message: string }>();

  const loadRoster = useCallback(() => {
    axios
      .get('/api/admin/users/roles')
      .then((res) => {
        setRoster(res.data?.data ?? []);
        setRosterError(undefined);
      })
      .catch(() => setRosterError('Could not load the roster.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadRoster, [loadRoster]);

  // Debounced so typing a name is one request, not one per keystroke. The
  // cleanup cancels the pending call, so only the last pause actually fires.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      axios
        .get(`/api/admin/users/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => setResults(res.data?.data ?? []))
        .catch(() => setResults([]))
        .finally(() => {
          setSearching(false);
          setSearched(true);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function setRole(
    person: { userId: string; email: string; name: string | null },
    role: GrantableRole,
    next: boolean
  ) {
    const key = `${person.userId}:${role.id}`;
    const who = person.name || person.email;
    const confirmText = next
      ? `Give ${who} ${role.badge}? ${role.grants}`
      : `Remove ${role.badge} from ${who}?`;
    if (!window.confirm(confirmText)) return;

    setBusy(key);
    setRowError(undefined);
    try {
      await axios.post(role.endpoint, {
        userId: person.userId,
        [role.field]: next,
      });
      loadRoster();
      // The search results carry role flags too, so a grant made from the
      // search panel has to update there as well or the button it was clicked
      // on keeps offering the same action.
      setResults((current) =>
        current.map((r) =>
          r.userId === person.userId
            ? {
                ...r,
                ...(role.id === 'admin'
                  ? { grantedAdmin: next, isAdmin: next || r.isSuperAdmin }
                  : { isContentModerator: next }),
              }
            : r
        )
      );
    } catch (error) {
      const message =
        (axios.isAxiosError(error) && error.response?.data?.error) ||
        `Could not change ${role.badge}.`;
      setRowError({ key, message });
    } finally {
      setBusy(null);
    }
  }

  function revokeControl(person: Holder, role: GrantableRole) {
    if (!canGrant(role, actor)) return null;
    if (!person.userId) return null;
    // An ADMIN_EMAILS admin cannot be revoked here: clearing the column would
    // leave their access intact. The endpoint refuses it with a 409; saying so
    // up front is better than letting the click explain it.
    if (role.id === 'admin' && person.isSuperAdmin) return null;
    if (!holdsRole(person, role)) return null;

    const key = `${person.userId}:${role.id}`;
    return (
      <Button
        variant="outline"
        onClick={() =>
          setRole(
            { userId: person.userId!, email: person.email, name: person.name },
            role,
            false
          )
        }
        disabled={busy === key}
      >
        {busy === key ? 'Saving…' : `Remove ${role.badge.toLowerCase()}`}
      </Button>
    );
  }

  function roleBadges(person: Holder | SearchResult) {
    return (
      <>
        {person.isAdmin ? (
          <span className="bg-pana-indigo inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {person.isSuperAdmin ? 'Admin · founder' : 'Admin'}
          </span>
        ) : null}
        {person.isContentModerator ? (
          <span className="bg-pana-ink/10 text-pana-ink inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Moderation rota
          </span>
        ) : null}
      </>
    );
  }

  function rosterSection(role: GrantableRole) {
    const holders = roster.filter((person) => holdsRole(person, role));
    return (
      <section key={role.id} className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold">
            {role.id === 'admin' ? (
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Flag className="h-5 w-5" aria-hidden="true" />
            )}
            {role.name}
            <span className="text-pana-ink/50 text-sm font-semibold">
              {holders.length}
            </span>
          </h3>
          <p className="text-pana-ink/70 mt-1 max-w-2xl text-sm leading-relaxed">
            {role.grants}{' '}
            <span className="text-pana-ink/50">
              {role.grantedBy === 'super-admin'
                ? 'Granted by founders only.'
                : 'Granted by any admin.'}
            </span>
          </p>
        </div>

        {holders.length === 0 ? (
          <p className="text-pana-ink/60 text-sm italic">
            Nobody holds this yet.
          </p>
        ) : (
          <div className="space-y-3">
            {holders.map((person) => {
              const key = `${person.userId ?? person.email}:${role.id}`;
              const control = revokeControl(person, role);
              return (
                <Card key={key}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">
                            {displayName(person)}
                          </span>
                          {roleBadges(person)}
                        </div>
                        <p className="text-pana-ink/60 mt-1 text-sm break-all">
                          {person.email}
                        </p>
                        {/*
                          One note, not two. Every account-less holder is an
                          ADMIN_EMAILS entry and so is also a super-admin, so
                          these conditions both match and would stack. The
                          no-account note already says where the access comes
                          from, and the revoke note would be advice about
                          removing something there is no account to remove.
                        */}
                        {!person.hasAccount ? (
                          <p className="text-pana-ink/70 mt-2 max-w-xl text-xs leading-relaxed">
                            Listed in <code>ADMIN_EMAILS</code> but has never
                            signed in, so there is no account yet. They become
                            an admin the moment they do.
                          </p>
                        ) : role.id === 'admin' && person.isSuperAdmin ? (
                          <p className="text-pana-ink/70 mt-2 max-w-xl text-xs leading-relaxed">
                            Admin through <code>ADMIN_EMAILS</code>. Removing
                            this means editing that secret — clearing it here
                            would not take the access away.
                          </p>
                        ) : null}
                      </div>
                      {control ? <div>{control}</div> : null}
                    </div>
                    {rowError?.key === key ? (
                      <p className="text-pana-red mt-3 text-xs font-semibold">
                        {rowError.message}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function grantControls(person: SearchResult) {
    return GRANTABLE_ROLES.map((role) => {
      if (!canGrant(role, actor)) return null;
      const has = holdsRole(person, role);
      if (has && role.id === 'admin' && person.isSuperAdmin) return null;
      const key = `${person.userId}:${role.id}`;

      if (!person.hasProfile && !has) {
        return (
          <p
            key={key}
            className="text-pana-ink/60 max-w-md text-xs leading-relaxed"
          >
            No profile yet, so there is nowhere to record {role.badge}. They
            need to finish setting up their profile first.
          </p>
        );
      }

      return (
        <Button
          key={key}
          variant={has ? 'outline' : 'default'}
          onClick={() => setRole(person, role, !has)}
          disabled={busy === key}
        >
          {busy === key
            ? 'Saving…'
            : has
              ? `Remove ${role.badge.toLowerCase()}`
              : `Give ${role.badge.toLowerCase()}`}
        </Button>
      );
    }).filter(Boolean);
  }

  if (gate) return gate;

  return (
    <>
      <PageMeta title="Roles & permissions | Admin" desc="" />
      <div>
        <AdminPageHeader
          eyebrow="Access"
          title="Roles & permissions"
          description={
            <p>
              Who holds a staff role, and how to give someone one. Only roles
              the site actually enforces appear here.
            </p>
          }
        />

        <div className="border-pana-ink/10 bg-pana-butter/30 text-pana-ink/80 mb-8 max-w-2xl rounded-xl border p-4 text-sm leading-relaxed">
          {actor.isSuperAdmin ? (
            <>
              <strong className="font-bold">You can grant both roles.</strong>{' '}
              Grants take effect on the person&rsquo;s next page load — no
              sign-out needed.
            </>
          ) : (
            <>
              <strong className="font-bold">
                You can put panas on the moderation rota.
              </strong>{' '}
              Granting admin is limited to accounts in <code>ADMIN_EMAILS</code>
              , so that a compromised admin account cannot create more admins.
            </>
          )}{' '}
          Browsing every account instead?{' '}
          <Link
            href="/admin/users/live"
            className="font-bold underline underline-offset-4"
          >
            The full user list
          </Link>{' '}
          is still there.
        </div>

        <div className="mb-10 space-y-8">
          {loading ? (
            <p className="text-pana-ink/60 text-sm">Loading the roster…</p>
          ) : rosterError ? (
            <p className="text-pana-red text-sm font-semibold">{rosterError}</p>
          ) : (
            GRANTABLE_ROLES.map(rosterSection)
          )}
        </div>

        <Panel title="Give someone a role">
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-bold">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                Give someone a role
              </h3>
              <p className="text-pana-ink/70 mt-1 max-w-2xl text-sm leading-relaxed">
                Search by name, handle or email.
              </p>
            </div>

            <div className="relative max-w-md">
              <Search
                className="text-pana-ink/40 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a pana…"
                aria-label="Search panas by name, handle or email"
                className="border-pana-ink/20 focus:border-pana-indigo focus:ring-pana-indigo/30 w-full rounded-xl border py-2.5 pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
              />
            </div>

            {searching ? (
              <p className="text-pana-ink/60 text-sm">Searching…</p>
            ) : null}

            {!searching && searched && results.length === 0 ? (
              <p className="text-pana-ink/60 text-sm">
                Nobody matched &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : null}

            <div className="space-y-3">
              {results.map((person) => {
                const controls = grantControls(person);
                const errorKey = GRANTABLE_ROLES.map(
                  (r) => `${person.userId}:${r.id}`
                ).find((k) => rowError?.key === k);
                return (
                  <Card key={person.userId}>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">
                              {displayName(person)}
                            </span>
                            {roleBadges(person)}
                          </div>
                          <p className="text-pana-ink/60 mt-1 text-sm break-all">
                            {person.email}
                          </p>
                        </div>
                        {controls.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {controls}
                          </div>
                        ) : null}
                      </div>
                      {errorKey ? (
                        <p className="text-pana-red mt-3 text-xs font-semibold">
                          {rowError?.message}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </Panel>
      </div>
    </>
  );
}
