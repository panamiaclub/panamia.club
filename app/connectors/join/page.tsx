import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { ConnectorJoinForm } from '@/components/connectors/join-form';
import { getMyConnector } from '@/lib/connectors/membership';
import { redirectToSignIn } from '@/lib/signin-redirect';
import { getSmsSubscriptionForUser } from '@/lib/sms-subscriptions';

/**
 * Where "Apply to be a Connector" goes.
 *
 * The form is `components/connectors/join-form.tsx`; this file gives it a
 * route, metadata, and the session it needs.
 *
 * Applying writes to the signed-in member's own profile, so there is nowhere
 * to put the answers until there is an account to hang them on — hence the
 * redirect to sign in rather than an anonymous form that asks for an email and
 * tries to match it up later.
 *
 * Somebody who has already applied gets the same form with their answers in
 * it. The API treats a second POST as an edit that carries the decision over,
 * so this is also the "change my houses" page for an accepted member and the
 * "I picked the wrong pod" fix for one still waiting — and that is one page
 * fewer to keep in step with the first.
 *
 * A declined applicant is sent to HQ instead. Their edit would save and change
 * nothing, since the decision is carried over, so showing them a working form
 * would be a promise the API does not keep.
 *
 * `noindex`, because it requires a session. A search result that lands every
 * visitor on a sign-in redirect is a worse answer than not ranking at all.
 */

export const metadata = {
  title: 'Apply to be a Connector | Pana MIA Club',
  description:
    'Join a neighborhood pod across Miami-Dade, Broward or Palm Beach, pick the house that matches what you already like doing, and tell your pod what you can bring.',
  robots: { index: false, follow: false },
};

export default async function ConnectorJoinPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirectToSignIn('/connectors/join');
  }

  const [me, smsSubscription] = await Promise.all([
    getMyConnector(session.user.id),
    getSmsSubscriptionForUser(session.user.id),
  ]);
  if (
    me?.membership.status === 'declined' ||
    me?.membership.status === 'inactive'
  ) {
    redirect('/connectors/hq');
  }

  return (
    <ConnectorJoinForm
      initialPod={me?.membership.pod ?? null}
      initialHouses={me?.membership.houses ?? []}
      initialBring={me?.membership.bring ?? ''}
      currentTier={me?.membership.tier ?? 1}
      initialSmsOptIn={
        smsSubscription?.status === 'active' ||
        smsSubscription?.status === 'pending'
      }
      initialSmsPhone={smsSubscription?.phone ?? ''}
      isEditing={me !== null}
      isPending={me?.membership.status === 'pending'}
    />
  );
}
