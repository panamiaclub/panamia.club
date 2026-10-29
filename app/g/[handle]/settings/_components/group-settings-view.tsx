'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGroup } from '@/lib/query/social';
import { EditGroupForm } from './edit-group-form';

/**
 * Group settings: what the group says about itself, and how to end it.
 *
 * The two halves are deliberately far apart on the page. Editing a group is
 * routine and reversible; deleting it is neither, and a danger zone that sits
 * directly under the save button is one mis-aimed click from a form people
 * use often.
 *
 * The design problem in the lower half is that the person deleting a group is
 * almost never the person who loses the most by it. An admin sees their own
 * decision; the members see their posts disappear. So the confirmation does
 * not ask "are you sure" -- it states the damage in counts, in the members'
 * terms, and makes the admin type the handle before the button works.
 *
 * Typing the handle is not security theatre. Nothing there is reversible and
 * there is no undo queue, so the only protection against a misclick is making
 * the action impossible to perform by clicking alone.
 */

interface DeletionPreview {
  handle: string;
  name: string;
  memberPosts: number;
  memberPostAuthors: number;
  chatMessages: number;
  activeMembers: number;
  upcomingEvents: number;
  pastEvents: number;
}

export function GroupSettingsView({ handle }: { handle: string }) {
  const { data, isLoading } = useGroup(handle);

  if (isLoading) {
    return (
      <main className="surface-cream min-h-screen pb-20">
        <div className="container mx-auto max-w-2xl px-4 pt-10">
          <div className="bg-pana-ink/10 h-40 animate-pulse rounded-2xl" />
        </div>
      </main>
    );
  }

  const isAdmin = data?.viewer.role === 'admin';

  return (
    <main className="surface-cream min-h-screen pb-20">
      <div className="container mx-auto max-w-2xl px-4 pt-10">
        <Link
          href={`/g/${handle}`}
          className="text-pana-ink/65 hover:text-pana-ink inline-flex items-center gap-1.5 text-[13px] font-bold"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to {data?.actor.name || `@${handle}`}
        </Link>

        <h1 className="text-pana-ink mt-4 text-2xl font-black">Settings</h1>

        {!isAdmin ? (
          <p className="text-pana-ink/65 mt-3 text-[15px] font-medium">
            Only an admin of this group can change its settings.
          </p>
        ) : (
          <>
            {data && (
              /* Keyed on the group id so the form's initial state is rebuilt
                 if the page is ever pointed at a different group without
                 unmounting -- otherwise useState would keep the old values. */
              <EditGroupForm
                key={data.group.id}
                handle={handle}
                group={data.group}
                actor={data.actor}
              />
            )}
            <DangerZone handle={handle} />
          </>
        )}
      </div>
    </main>
  );
}

function DangerZone({ handle }: { handle: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/social/groups/${handle}/deletion-preview`)
      .then((r) => r.json())
      .then((d) => {
        if (active && d.success) setPreview(d.data as DeletionPreview);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [handle]);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/social/groups/${handle}?confirm=${encodeURIComponent(handle)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? 'Could not delete this group');
        setBusy(false);
        return;
      }
      /* replace, not push: the group page this came from no longer exists,
         so leaving it in history would send Back to a 404. */
      router.replace('/groups');
    } catch {
      setError('Could not delete this group');
      setBusy(false);
    }
  }

  const matches = confirm.trim().toLowerCase() === handle.toLowerCase();

  return (
    <section className="border-pana-ink/10 mt-12 border-t pt-10">
      <div className="rounded-2xl border border-red-200 bg-white p-5">
        <h2 className="text-[15px] font-black text-red-700">
          Delete this group
        </h2>

        <p className="text-pana-ink/75 mt-2 text-[14px] leading-relaxed font-medium">
          This cannot be undone, and it does not only affect you.
        </p>

        {preview && (
          <ul className="text-pana-ink/75 mt-4 space-y-1.5 text-[14px] font-medium">
            <li>
              <strong className="text-pana-ink font-black">
                {preview.memberPosts.toLocaleString('en-US')}
              </strong>{' '}
              {preview.memberPosts === 1 ? 'post' : 'posts'}
              {preview.memberPostAuthors > 0 && (
                <>
                  {' '}
                  by {preview.memberPostAuthors.toLocaleString('en-US')}{' '}
                  {preview.memberPostAuthors === 1 ? 'pana' : 'panas'}
                </>
              )}{' '}
              will be deleted.
            </li>
            <li>
              <strong className="text-pana-ink font-black">
                {preview.activeMembers.toLocaleString('en-US')}
              </strong>{' '}
              {preview.activeMembers === 1 ? 'member' : 'members'} will lose
              access.
            </li>
            <li>
              <strong className="text-pana-ink font-black">
                {preview.chatMessages.toLocaleString('en-US')}
              </strong>{' '}
              group chat messages and their moderation records will be
              permanently deleted.
            </li>
            {preview.upcomingEvents > 0 && (
              <li className="text-red-700">
                <strong className="font-black">{preview.upcomingEvents}</strong>{' '}
                upcoming{' '}
                {preview.upcomingEvents === 1 ? 'event is' : 'events are'}{' '}
                hosted by this group and will be cancelled and removed. Anyone
                going will not be notified.
              </li>
            )}
            {preview.pastEvents > 0 && (
              <li>
                <strong className="text-pana-ink font-black">
                  {preview.pastEvents}
                </strong>{' '}
                past {preview.pastEvents === 1 ? 'event' : 'events'} will be
                deleted.
              </li>
            )}
          </ul>
        )}

        {preview && preview.upcomingEvents > 0 && (
          <p className="text-pana-ink/75 mt-4 text-[14px] leading-relaxed font-medium">
            To keep an event, transfer it to yourself or another group from its
            manage page first.
          </p>
        )}

        <label
          htmlFor="confirm-handle"
          className="text-pana-ink/75 mt-5 block text-[13px] font-bold"
        >
          Type <span className="font-black">{handle}</span> to confirm
        </label>
        <input
          id="confirm-handle"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          className="border-pana-ink/15 mt-1.5 w-full rounded-xl border px-3 py-2 text-[14px] font-medium"
        />

        {error && (
          <p className="mt-3 text-[14px] font-bold text-red-700">{error}</p>
        )}

        <Button
          variant="destructive"
          className="mt-4"
          disabled={!matches || busy}
          onClick={handleDelete}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? 'Deleting…' : 'Delete group permanently'}
        </Button>
      </div>
    </section>
  );
}
