import { ConnectorsFrontDoor } from '@/components/connectors/front-door';

/**
 * The Pana Connectors front page at its named path.
 *
 * The page itself is `components/connectors/front-door.tsx`, shared with `/`
 * on `connectors.panamia.club`. This file exists to give it a route and
 * metadata.
 */

export const metadata = {
  title: 'Pana Connectors | Pana MIA Club',
  description:
    'Community Connectors are the volunteers who keep Pana MIA running — neighborhood pods across Miami-Dade, Broward and Palm Beach.',
};

export default async function ConnectorsFrontPage() {
  return <ConnectorsFrontDoor />;
}
