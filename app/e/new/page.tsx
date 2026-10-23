/**
 * Host an event.
 *
 * A server component now, where it used to be a client page that fetched its
 * own session and then rendered a spinner while it waited. Two things changed
 * and both of them wanted the server:
 *
 * - The signed-out case is a `redirect`, so it happens before any markup is
 *   sent rather than as a `useEffect` that fires after a flash of a card
 *   saying "Please sign in to host an event."
 * - The form's whole argument is the reach readout beside it, and that is
 *   built out of follower counts, past events and attendance history. Those
 *   are a handful of indexed queries on the server and would be four round
 *   trips and a loading state in the browser.
 *
 * See `app/e/new/_components/events-host.tsx` for why the page is shaped the
 * way it is.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { getHostContext } from '@/lib/events/host-context';
import { EventsHost } from './_components/events-host';

/* Typed structurally rather than as `Metadata`: the vinext `next` shim does
   not export that type. */
export const metadata = {
  title: 'Put something on | Pana MIA',
  description:
    'Post an event to the Pana MIA network and see which lanes it reaches before you do.',
  alternates: { canonical: '/e/new' },
};

export default async function NewEventPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/signin?callbackUrl=/e/new');
  }

  const context = await getHostContext(session.user.id);

  /* No profile row means `POST /api/events` would answer 403 to anything this
     page submitted. Saying so up front is the difference between one sentence
     and twelve fields filled in for nothing. */
  if (!context) {
    return (
      <main className="dirscope">
        <div className="dirsearch-band">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-[58rem]">
              <span className="section-eyebrow">Events</span>
              <h1 className="text-pana-ink mt-2 text-[1.75rem] leading-tight font-black tracking-[-0.02em]">
                You need a profile first
              </h1>
              <p className="text-pana-ink/60 mt-2 max-w-[42rem] text-[0.9375rem] font-semibold">
                An event is hosted by somebody — a pana or a group they run —
                and that name is what readers follow, so there is nothing to
                post under until you have one.
              </p>
              <Link
                href="/account/user/edit#profile"
                className="dirsearch-tail-primary mt-4 inline-flex"
              >
                Set up your profile
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <EventsHost context={context} />;
}
