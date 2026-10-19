import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { HouseBoard } from '@/components/connectors/house-board';
import { OfferingFrontPage } from '@/components/offerings/offering-front-page';
import { getMyConnector } from '@/lib/connectors/membership';

/**
 * The Pana Connectors front door.
 *
 * Lives here rather than in `app/connectors/page.tsx` because two routes need
 * it: that path, and `/` when the request arrives on `connectors.panamia.club`.
 * The subdomain's root has to render the same thing its named path does, and
 * the only alternative to sharing a component is keeping two copies of a
 * redirect in step forever.
 *
 * Two audiences arrive at the same door and only one of them wants a pitch.
 * Someone who is already a connector clicked the bubble to get to their
 * commitments, so they are sent straight through to the HQ; everybody else
 * gets the explanation of what the programme is.
 *
 * Only an *accepted* member is redirected. Somebody still waiting on a
 * decision, or who was turned down, keeps the pitch — bouncing them would mean
 * a declined applicant could never read the page again without being shown
 * their rejection, and a pending one would lose the explanation of the thing
 * they are waiting to be let into.
 *
 * ## Why this is dynamic
 *
 * It reads the session, so it cannot be cached at the edge the way the other
 * offering front pages are. That is the cost of the redirect above, and it is
 * the same cost the mock version paid for reading `?as=` — which this
 * replaces. A connector who has to scroll past the recruitment pitch every
 * time they open the bubble stops using the bubble.
 */
export async function ConnectorsFrontDoor() {
  const session = await auth();
  const me = session?.user?.id ? await getMyConnector(session.user.id) : null;

  if (me?.membership.status === 'active') {
    redirect('/connectors/hq');
  }

  return (
    <OfferingFrontPage
      id="connectors"
      actions={{
        // "Become a Connector" used to point at `/form/get-listed`, which is
        // the public *business directory* intake. Somebody who read this
        // whole page and decided they wanted in was handed a form about
        // their shop. `/connectors/join` is the programme's own door.
        //
        // Signed-out readers are sent to sign in first, because joining
        // writes to their profile and there is nowhere to put the answers
        // until there is an account to hang them on.
        primary: session?.user?.id ? '/connectors/join' : '/signin',
        secondary: '/connectors/hq',
      }}
      interlude={<HouseBoard />}
    />
  );
}
