import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveSurface } from '@/lib/panaverse/surfaces';
import { HomePage } from '@/components/home/home-page';
import { ConnectorsFrontDoor } from '@/components/connectors/front-door';
import { FeedPage } from './s/_components/feed-page';
import { EventsFrontDoor } from './e/_components/events-front-door';

/**
 * The root of the shared route tree, which is a different front door on each
 * surface hostname.
 *
 * Every surface answers on one route tree, so `/` cannot be handed to any of
 * them structurally: a route group would still resolve to `/` and collide with
 * this file. The only thing distinguishing the requests is the hostname, so
 * that is what this branches on.
 *
 * Deciding here rather than rewriting in the Worker is forced. vinext has no
 * middleware-rewrite signalling, so serving `/s` under the URL `/` would leave
 * the client router fetching RSC payloads for a path the server does not think
 * it is on. Branching inside the route keeps URL and route identical, so
 * payload paths agree and client navigation stays intact.
 *
 * This moves a front door, not a route: every surface route remains reachable
 * from every hostname, and `/s`, `/connectors` and `/admin` still serve the
 * same pages on all of them.
 *
 * ## Why this is a switch and not a condition
 *
 * It used to read `surface.rootPath === '/' ? <HomePage /> : <FeedPage />`,
 * which quietly meant "anything that is not the main site is the feed". That
 * was true while there were two surfaces and became a bug the moment there
 * were more: `connectors.panamia.club/` served the Pana Social feed. It was
 * only ever latent because subdomain links are behind `PANAVERSE_SUBDOMAINS`,
 * but the hostname branch does not consult that flag — `connectors.localhost`
 * resolves without DNS, so the wrong page was one dev URL away the whole time.
 *
 * An exhaustive switch over `surface.id` means the next surface added cannot
 * silently inherit somebody else's homepage: it fails to compile until this
 * file says what its front door is.
 */
export default async function RootPage() {
  const requestHeaders = await headers();
  const surface = resolveSurface(requestHeaders.get('host') ?? '');

  switch (surface.id) {
    case 'social':
      return <FeedPage />;
    case 'events':
      // Unreachable by hostname since Events became path-only: with
      // `subdomain: null` no host resolves to this surface, and its front door
      // is reached at `panamia.club/e` through app/e/page.tsx instead. The
      // branch stays because the switch is exhaustive over surface.id — that
      // exhaustiveness is the point of the switch — and because it remains the
      // right answer if a host is ever aliased here.
      return <EventsFrontDoor />;
    case 'connectors':
      return <ConnectorsFrontDoor />;
    case 'admin':
      // Not rendered inline: the admin surface's sidebar lives in
      // app/admin/layout.tsx, which a page at the route tree root never gets.
      redirect('/admin');
    case 'www':
      return <HomePage />;
  }
}
