import type { Metadata } from 'next';
import { EventsDiscover } from './_components/events-discover';

/**
 * /mock/events — the design mock for the events discovery page.
 *
 * Why this exists: there is nowhere to go and browse what is on. `/events` is
 * an offering front page — it explains what Pana Mia events are to somebody
 * who has not been to one. `/e` listed everything upcoming in one flat column.
 * `/directory/events` is a search scope, and its bare browse view literally
 * renders "Type something to search." All three are reasonable answers to
 * questions people do ask. None of them answers the question most people
 * arrive with, which is "what is on this weekend that I would actually like".
 *
 * **This mock was rebuilt once, and the rebuild is the point.** The first
 * version took that question apart into four controls — a When rail, a date
 * strip, a Type filter, a Who-else sort — wore the directory's shipping chrome
 * class for class, and argued that events discovery was a room inside a
 * promoted directory. It was turned down for the right reason: a search band
 * over five facets and a chronological list is a *search results page*. It
 * helps somebody who already knows what they want. It does nothing at all for
 * somebody who wants to be told.
 *
 * So the second version keeps exactly one control — your availability, the
 * only thing the viewer knows that the page cannot work out — and spends the
 * rest of the page stating *reasons*: from hosts you follow, your panas are
 * going, like things you have turned up to, new hosts and small rooms. Every
 * card says why it is there and every card can be argued with.
 *
 * That rebuild also settled the surface. A page whose spine is reasons about
 * events is not a filtered view of the directory's fourth kind, so events
 * became the fifth surface rather than a room inside a promoted directory,
 * registered in `lib/panaverse/surfaces.ts`. It was drawn as
 * `events.panamia.club` and shipped as `panamia.club/e` with `subdomain: null`,
 * which is the one thing the browser frame around this mock now shows
 * differently from the shipped page — the chrome was part of what was under
 * review, and the verdict was a path.
 *
 * The other half is the account menu, drawn open on the right. "The events
 * button in the profile menu will also guide the user there" turned out to be
 * a claim about no code at all: `lib/panaverse/sites.ts` already points the
 * Events tile at `/e`, and because `/e` is the events surface's root path,
 * `resolvePanaSites` absolutises it to the root domain on its own.
 *
 * **This mock is now a record rather than a proposal.** The shipped page lives
 * at `/e`, built from `lib/events/discovery.ts` against real rows; this one
 * runs on fixtures and is kept because the reasoning above is worth having
 * next to the thing it produced.
 *
 * Server component purely to carry `robots: noindex`, which
 * app/mock/README.md requires of every mock route and which robots.ts does not
 * otherwise enforce for /mock.
 */
export const metadata: Metadata = {
  title: 'Mock — events discover',
  robots: { index: false, follow: false },
};

export default function EventsDiscoverMockPage() {
  return <EventsDiscover />;
}
