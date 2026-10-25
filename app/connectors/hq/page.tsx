import type { ReactNode } from 'react';

import { auth } from '@/auth';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { HqHero } from '@/components/connectors/hq-hero';
import { HqDashboard } from '@/components/connectors/hq-dashboard';
import { ConnectorHousePills } from '@/components/connectors/dashboard-parts';
import {
  countConnectorsInPod,
  getMyConnector,
  type ProfileConnector,
} from '@/lib/connectors/membership';
import { listCommitments } from '@/lib/connectors/commitments';
import { listUpcomingForPod } from '@/lib/connectors/events';
import { listOpportunities } from '@/lib/connectors/opportunities';
import { getPod } from '@/lib/connectors/model';
import { CONNECTORS_CHROME } from '@/lib/connectors/theme';

/**
 * Connector HQ — the page a connector actually lives on.
 *
 * ## What changed, and why
 *
 * This page used to render a fixture: a hardcoded demo connector called
 * Bianca, shown to everybody who added `?as=connector` to the URL. Signed in
 * as yourself, HQ greeted you by somebody else's name — which is exactly the
 * bug that was reported against production. It now reads the signed-in
 * member's own membership from `profiles.connector`.
 *
 * ## What was removed, and what came back
 *
 * The events, open asks and birthdays panels were all deleted when this page
 * stopped being a fixture: all three rendered invented people — asks "asked
 * by" names that do not exist, birthdays for nobody — with no table behind
 * any of them. The note left here said they come back when they have real
 * data behind them.
 *
 * Events have. drizzle/0057 gave programme gatherings a table and the admin
 * console creates them, so "Coming up" is back in the sidebar showing this
 * member's pod plus anything programme-wide — real rows or an empty state,
 * never a placeholder.
 *
 * Open asks now live in connector_opportunities, with signups recorded as
 * ordinary commitments shared with the existing admin coordination desk.
 * Birthdays still have no field: collecting dates of birth is a separate
 * product and privacy decision, not a gap to quietly fill.
 *
 * What stays is what is true: your own commitments, which you write; your
 * pod's real size, counted; and the tier ladder for your houses, which is
 * programme content from `lib/connectors/model.ts` rather than a person.
 *
 * The "next in your house" panel is the one piece that is not in the
 * spreadsheet today. The deck lists example actions per house per tier, and
 * leaving that on a slide means it gets read once during onboarding and never
 * again — which is precisely when somebody starts wondering what Tier 2 would
 * actually involve.
 *
 * ## From a slide to a thing you can do
 *
 * Those per-house action lists were read-only for their first few rounds: the
 * deck's thirty-six actions rendered as a ladder in the sidebar, with the only
 * route from "that one sounds like me" to "it is on my board" being to
 * remember the wording and retype it into the free-text form higher up the
 * page. So the single hardest question in the programme — a new Tier 1
 * connector asking what they are supposed to do on Monday — was answered by
 * an empty input.
 *
 * `ActionLibrary` now carries those lists in the main column with a commit
 * button on every line, and the sidebar keeps `TierLadder`, which is the part
 * that was never really about actions: it explains that tiers measure load
 * rather than seniority. Both read `lib/connectors/model.ts`, so the
 * programme's own wording stays the only copy of itself.
 *
 * ## Three ways not to see HQ
 *
 * Applying is not joining. This page is only the dashboard for an accepted
 * member; a pending applicant, a declined one and somebody who has never
 * applied each get their own message instead, because telling all three "you
 * are not a connector yet" would be wrong for two of them.
 */

export const metadata = {
  title: 'Connector HQ | Pana MIA Club',
  robots: { index: false, follow: false },
};

export default async function ConnectorHqPage() {
  const session = await auth();

  // Not signed in and not a member land in the same place on purpose. HQ has
  // nothing to show either of them, and "sign in" is the wrong first thing to
  // say to somebody who has never heard of the programme.
  if (!session?.user?.id) {
    return <NotAConnectorYet signedIn={false} />;
  }

  const me = await getMyConnector(session.user.id);
  if (!me) {
    return <NotAConnectorYet signedIn />;
  }

  // Applying is not joining. Only an accepted member gets HQ; the other two
  // states each get an answer of their own, because "we have your
  // application" and "the answer was no" are different things to be told.
  if (me.membership.status === 'pending') {
    return <ApplicationPending membership={me.membership} />;
  }
  if (me.membership.status === 'declined') {
    return <ApplicationDeclined />;
  }
  if (me.membership.status === 'inactive') {
    return <ConnectorInactive />;
  }

  const { displayName, imageUrl, membership } = me;

  const [podSize, commitments, upcoming, opportunities] = await Promise.all([
    countConnectorsInPod(membership.pod),
    listCommitments(me.profileId),
    listUpcomingForPod(membership.pod),
    listOpportunities(),
  ]);

  return (
    <main className="bg-pana-cream text-pana-ink pb-20">
      <HqHero
        displayName={displayName}
        imageUrl={imageUrl}
        membership={membership}
        podSize={podSize}
        activeCount={
          commitments.filter((row) => row.progress !== 'done').length
        }
        completedCount={
          commitments.filter((row) => row.progress === 'done').length
        }
      />
      <HqDashboard
        commitments={commitments}
        opportunities={opportunities}
        houses={membership.houses}
        majorHouse={membership.majorHouse}
        minorHouse={membership.minorHouse}
        pod={membership.pod}
        tier={membership.tier}
        bring={membership.bring}
        upcoming={upcoming}
      />
    </main>
  );
}

/**
 * The full-page message states HQ can show instead of a dashboard.
 *
 * One shell for all of them so that "not a connector", "waiting" and
 * "declined" cannot drift apart visually. They are the same page answering
 * the same question — why am I not looking at HQ — with different reasons.
 */
function HqMessage({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className="bg-pana-cream text-pana-ink py-24">
      <div className="container mx-auto max-w-xl px-4 text-center">
        <h1 className="text-3xl leading-tight font-extrabold sm:text-4xl">
          {title}
        </h1>
        <div className="text-pana-ink/70 mt-4 text-base leading-relaxed">
          {children}
        </div>
        {actions && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </main>
  );
}

function PrimaryAction({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <SurfaceLink
      href={href}
      className={`rounded-full border-2 ${CONNECTORS_CHROME.BORDER} ${CONNECTORS_CHROME.FILL} px-5 py-2.5 text-sm font-extrabold ${CONNECTORS_CHROME.ON_FILL}`}
    >
      {children}
    </SurfaceLink>
  );
}

function SecondaryAction({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <SurfaceLink
      href={href}
      className="border-pana-ink text-pana-ink rounded-full border-2 px-5 py-2.5 text-sm font-extrabold"
    >
      {children}
    </SurfaceLink>
  );
}

/**
 * What somebody who is not in the programme sees if they reach the HQ URL.
 *
 * A redirect would be tidier, but this is the more useful answer: the person
 * most likely to land here is a pana who heard about Connectors from a friend
 * and was sent the link, and bouncing them to the front page without a word
 * loses the thread of why they clicked.
 */
function NotAConnectorYet({ signedIn }: { signedIn: boolean }) {
  return (
    <HqMessage
      title="You are not a connector yet."
      actions={
        <>
          <PrimaryAction href={signedIn ? '/connectors/join' : '/signin'}>
            {signedIn ? 'Apply to be a Connector' : 'Sign in to apply'}
          </PrimaryAction>
          {/* The second button used to be "Become a Pana" pointing at
           * `/form/get-listed`, the business directory intake. Two buttons,
           * neither of which joined the programme. */}
          <SecondaryAction href="/connectors">
            What is Pana Connectors?
          </SecondaryAction>
        </>
      }
    >
      <p>
        Connector HQ is where the pods keep their commitments and their people.
        Read what the programme is, and if it sounds like you, there is a way
        in.
      </p>
    </HqMessage>
  );
}

/**
 * Somebody has applied and is waiting on a decision.
 *
 * Their answers are shown back to them for two reasons: it confirms the form
 * actually saved something, and it is the moment they are most likely to spot
 * that they picked the wrong pod — so the edit link is right there rather
 * than requiring them to guess that the join page still works.
 */
function ApplicationPending({ membership }: { membership: ProfileConnector }) {
  const pod = getPod(membership.pod);

  return (
    <HqMessage
      title="Your application is in."
      actions={
        <>
          <PrimaryAction href="/connectors/join">
            Change your answers
          </PrimaryAction>
          <SecondaryAction href="/connectors">
            What is Pana Connectors?
          </SecondaryAction>
        </>
      }
    >
      <p>
        Someone from the programme reviews these by hand, so this is not
        instant. You will keep access to this page — when you have been taken
        on, this is where your HQ appears.
      </p>
      <dl className="border-pana-ink/20 mt-6 flex flex-col gap-3 rounded-xl border-2 border-dashed p-5 text-left text-sm">
        <div>
          <dt className="text-pana-ink/60 text-xs font-bold tracking-wide uppercase">
            Pod
          </dt>
          <dd className="mt-0.5 font-bold">{pod.name}</dd>
        </div>
        <div>
          <dt className="text-pana-ink/60 text-xs font-bold tracking-wide uppercase">
            {membership.houses.length === 1 ? 'House' : 'Houses'}
          </dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            <ConnectorHousePills
              houses={membership.houses}
              majorHouse={membership.majorHouse}
              minorHouse={membership.minorHouse}
            />
          </dd>
        </div>
      </dl>
    </HqMessage>
  );
}

/**
 * The answer was no.
 *
 * Deliberately short, and deliberately without a re-apply button. Re-posting
 * the join form carries the decision over rather than resetting it, so a
 * button here would look like a second chance and deliver nothing — see
 * `app/api/admin/connectors/[profileId]/decline/route.ts` for why reversing a
 * decision is a conversation rather than a click.
 */
function ApplicationDeclined() {
  return (
    <HqMessage
      title="You are not in the programme."
      actions={
        <SecondaryAction href="/connectors">
          What is Pana Connectors?
        </SecondaryAction>
      }
    >
      <p>
        Your application was reviewed and not taken forward this time. If you
        think that is a mistake, or things have changed, talk to whoever you
        know in the programme — there are plenty of other ways to be in this
        community in the meantime.
      </p>
    </HqMessage>
  );
}

function ConnectorInactive() {
  return (
    <HqMessage
      title="Your Connector membership has ended."
      actions={
        <SecondaryAction href="/connectors">
          Explore the programme
        </SecondaryAction>
      }
    >
      <p>
        You are no longer on the active Connector roster. Your past work stays
        in the programme record, but you will not receive Connector assignments
        or group notifications. Contact the programme team if you think this is
        a mistake.
      </p>
    </HqMessage>
  );
}
