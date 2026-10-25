/**
 * Panaverse surface branding.
 *
 * The marks and copy each surface wears. Deliberately a sibling of
 * `surfaces.ts` rather than part of it: the registry is what routes a request,
 * and the Worker has no use for a logo. Keeping presentation here lets the
 * registry stay the smallest thing that can answer "which surface is this".
 *
 * This is the real source for surface branding — the mocks read it too, so a
 * mock cannot drift from what ships.
 */

import type { SurfaceId } from './surfaces';

/** A wordmark, with intrinsic dimensions so next/image reserves space and the
 *  page does not shift when it loads. */
export interface SurfaceMark {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * The lockup each surface flies.
 *
 * Every mark is from the same hand-drawn family in the same orange, right down
 * to the star dotting the `i`. That is deliberate: the panas do not use colour
 * or letterform to tell their offerings apart, so the mark says "which room"
 * without ever saying "different organisation".
 */
export const SURFACE_MARK: Record<SurfaceId, SurfaceMark> = {
  www: {
    src: '/logos/pana_logo_long_orange.png',
    width: 800,
    height: 135,
    alt: 'Pana Mia Club',
  },
  info: {
    src: '/logos/pana_logo_long_orange.png',
    width: 800,
    height: 135,
    alt: 'Pana Mia Club',
  },
  social: {
    src: '/logos/pana_social_long_orange.png',
    width: 800,
    height: 120,
    alt: 'Pana Social',
  },
  /* Set by scripts/generate-surface-wordmark.py, like the two below it, and
   * the first mark generated since that script was written down — Connectors
   * and Admin were produced by a script nobody committed, so the recipe had to
   * be read back off their PNGs. Regenerate with:
   *
   *   python scripts/generate-surface-wordmark.py --font Nunito[wght].ttf \
   *     --word EVENTS --star-index 6 --out public/logos/pana_events_long_orange.png
   *
   * The star is appended rather than set inside the word, which is new. The
   * drawn marks put it on an `i` — Pana Mia Club dots the `i` of MIA, and
   * Admin does the same. Connectors has no `i`, so the star took the place of
   * the first `O`. EVENTS has neither: no `i` to dot and no round letter to
   * stand in, and the one candidate — a star in the `V` slot — was tried and
   * reads as a redaction rather than a letter, because the word stops being
   * guessable the moment its second character is a shape.
   *
   * So it trails the word at small-cap height. That is a departure, and worth
   * it here for a reason the other marks did not have: starring a thing is
   * what a person does to an event. The accent that could not go inside the
   * word turns out to mean something sitting after it.
   *
   * 800x115 keeps it in family — `.panaverse-logo` sizes marks by height with
   * `width: auto`, so a flatter lockup flies wider at the same height and
   * pushes the avatar towards the frame edge. Replacing this with drawn
   * lettering at the same path and roughly this ratio changes nothing else. */
  events: {
    src: '/logos/pana_events_long_orange.png',
    width: 800,
    height: 115,
    alt: 'Pana Events',
  },
  /* Not from that hand. Nobody has drawn "Connectors" yet, and no typeface
   * traces hand lettering convincingly, so this is set in Nunito Black — the
   * family the site already loads — borrowing the four things that actually
   * make the family read.
   *
   * Two-tier capitals: the house marks are not mixed case, they are capitals
   * throughout with only the lead letter of each word drawn large. PanaSocial
   * is P + ANA, S + OCIAL; PanaMiaClub does it three times. An all-caps or a
   * true-lowercase setting both miss this, and both were tried first.
   *
   * Set solid with no word space. Pana-flame sampled off the Pana Mia mark
   * rather than guessed. And a star inside the word — there is no `i` in
   * CONNECTORS for it to dot, so it stands in for the first `O`.
   *
   * Every glyph also carries a small seeded rotation, baseline shift and
   * weight change, because a uniform baseline is most of what makes type read
   * as type instead of as lettering. What it still cannot fake is the
   * irregular marker stroke of the real marks; that needs a person with a pen.
   *
   * Same 800px width and near-identical aspect as its siblings, because
   * `.panaverse-logo` sizes marks by height with `width: auto` — a tighter
   * lockup would have flown 100px wider than Pana Social's and pushed the
   * avatar past the frame. Replacing this with drawn lettering at the same
   * path and ratio changes nothing else. */
  connectors: {
    src: '/logos/pana_connectors_long_orange.png',
    width: 800,
    height: 121,
    alt: 'Pana Connectors',
  },
  /* Set with the same script as the Connectors mark, with one difference that
   * matters: ADMIN contains a real `i`, so the star goes back to doing its
   * actual job. The family does not replace a letter with a star — look at the
   * MIA of the Pana Mia mark and the `i` keeps its stem, with the star sitting
   * just clear of it as an oversized dot. Connectors had to fake that because
   * the word has no `i` at all. This one does not, so the proportions are
   * measured straight off the Pana Mia lockup: star radius about 0.30 of the
   * stem height, with a gap of roughly a tenth of the stem between them.
   *
   * Taller than its siblings (179 rather than ~130 at 800 wide) because the
   * canvas has to clear the star, and ADMIN is a short word so there are fewer
   * glyphs to spread that height across. `.panaverse-logo` sizes by height
   * with `width: auto`, so the practical effect is that this mark flies
   * narrower than the others rather than larger — which is what a shorter word
   * should do. */
  admin: {
    src: '/logos/pana_admin_long_orange.png',
    width: 800,
    height: 179,
    alt: 'Pana Admin',
  },
};

/** Square marks, per surface. Separate from SURFACE_MARK above, which holds
 *  wordmarks: a wordmark squashed into a square home-screen tile is
 *  unreadable, so installable icons are their own asset.
 *
 *  Shared by the manifest route (which lists the 192/512/maskable variants)
 *  and the root layout (which emits the apple-touch-icon link, because iOS
 *  takes the home screen icon from that link and not from the manifest). Two
 *  copies of this mapping would install two different tiles for the same
 *  surface depending on which platform did the installing. */
export const SURFACE_ICON: Record<SurfaceId, string> = {
  www: 'pana_mia_icon',
  info: 'pana_mia_icon',
  social: 'pana_social_icon',
  /* Borrows the Pana Mia tile, and unlike admin below that is a gap rather
   * than a decision. The sibling tiles are drawn illustrations, not set type —
   * the Pana Social tile is the flower glyph — so there is nothing to generate
   * a matching one from, and events is exactly the kind of surface a member
   * would pin to a home screen. It should get its own tile when somebody draws
   * one; until then the Pana Mia tile is at least honest about what they
   * installed. */
  events: 'pana_mia_icon',
  connectors: 'pana_connectors_icon',
  /* Borrows the Pana Mia tile rather than getting one of its own. An icon is
   * for a thing you install to a home screen, and this surface is the back
   * office of Pana Mia rather than a product a member would keep next to
   * their other apps. If a pana does install it, the Pana Mia tile is the
   * honest answer to what they just installed. Give it a tile of its own when
   * somebody actually wants the admin console pinned. */
  admin: 'pana_mia_icon',
};

/** What each surface is for, in the second person — written for a member
 *  deciding where to click, not a developer reading the registry. */
export const SURFACE_BLURB: Record<SurfaceId, string> = {
  www: 'Find Panas, browse the directory, and see what the org is up to.',
  info: 'Meet Pana Mia and find your next local connection.',
  social: 'Post, reply, and read what your Panas are making this week.',
  events: 'What is on, who is going, and why you would want to be there.',
  connectors:
    'Your house, your pod, and what you said you would do this month.',
  /* Second person like the rest, but this one is never read by a member
   * deciding where to click — the surface is not offered in the switcher. It
   * exists so the record is complete and so anything that enumerates surfaces
   * has a sentence to print. */
  admin: 'Approvals, the connector programme, and the rest of the back office.',
};

/**
 * Default meta description per surface, used by the root layout for any page
 * that does not set its own.
 *
 * `www` is deliberately the exact string the root layout shipped before
 * surfaces existed: the main site's description is indexed, and this change is
 * meant to give Pana Social its own identity, not to quietly rewrite Pana
 * Mia's. Only the social entry is new.
 */
export const SURFACE_DESCRIPTION: Record<SurfaceId, string> = {
  www: 'Community platform for Pana Mia',
  info: 'Connect with South Florida creatives, small businesses, and neighbors through Pana MIA Club. Explore the directory, events, Pana Social, and ways to get involved.',
  social:
    'The Pana Mia community timeline — post, reply, and follow Panas across the fediverse.',
  events:
    'Markets, mixers and shows across the Pana Mia network — surfaced by who is hosting and who is going, not by who paid to be seen.',
  connectors:
    'Headquarters for the Pana Mia Community Connectors — houses, pods, commitments and events across Miami-Dade, Broward and Palm Beach.',
  /* Written to be unhelpful to a search engine on purpose. Every admin route
   * also sets `robots: { index: false }` in its own metadata; this is the
   * fallback for anything that forgets to. */
  admin: 'Staff tools for Pana Mia. Not a public page.',
};

/** Which colour a surface carries through its chrome. Values are token names
 *  from app/globals.css, not raw hex, so a surface cannot introduce a colour
 *  that is not already in the palette.
 *
 *  Specifically, this union is the set of names that have a `[data-tone]`
 *  block in app/globals.css — not the set of colours in the palette, which is
 *  larger. Every consumer below ends up in a `data-tone` attribute, and a
 *  value CSS has no block for resolves to nothing: the element renders with
 *  no accent at all rather than visibly wrong, which is the failure mode
 *  hardest to catch by looking. Adding a name here without adding the block
 *  there is the one way to reintroduce it, so the two move together. */
export type SurfaceTone =
  'indigo' | 'burnt' | 'flame' | 'blue' | 'red' | 'orange' | 'pink';

/** One masthead nav link. `href` is a real route in `app/`, never a fixture —
 *  see SURFACE_NAV. */
export interface SurfaceNavItem {
  label: string;
  href: string;
}

/**
 * The masthead nav each surface carries.
 *
 * Deliberately per-surface: a shared nav listing every route in the panaverse
 * is how a timeline ends up with a directory link in it. What stays constant
 * across surfaces is the mark, the switcher and the avatar — enough to read as
 * one organisation without pretending the rooms have the same job.
 *
 * Every href here is a route that exists today. The design mock at
 * `app/mock/_data/panaverse.ts` carries an aspirational nav for Pana Social
 * (Explore, Groups, Notifications) because a mock is allowed to draw things
 * that are not built yet; shipping chrome is not, so social lists the one
 * own-surface destination it actually has. Add routes here as they land rather
 * than copying the mock's list across.
 *
 * `www` is empty because the main site renders MainHeader, which has its own
 * nav — this drives the surface masthead, and the surface masthead never flies
 * over www. An invented list of links here would rot unverified.
 */
export const SURFACE_NAV: Record<SurfaceId, SurfaceNavItem[]> = {
  www: [],
  info: [],
  social: [{ label: 'Home', href: '/s' }],
  /* Just the front door, like social. `/e/new` is deliberately not here: it is
   * the one own-surface route a signed-out visitor gets bounced off, and the
   * discovery page already carries a Host link in its own header where it can
   * be shown conditionally. */
  events: [{ label: 'Calendar', href: '/e' }],
  /* HQ only. The programme's admin console is not listed: it is the one
   * destination on this surface a signed-in connector can be refused, and a
   * masthead link that bounces most of the people who see it is worse than no
   * link. It now lives on the admin surface at `/admin/connectors`, and admins
   * reach it from HQ or from the admin hub. */
  connectors: [{ label: 'HQ', href: '/connectors/hq' }],
  /* Empty on purpose. This surface carries a persistent sidebar
   * (`app/admin/layout.tsx`) listing every tool, including a way back to the
   * overview, so masthead links would be a second, shorter copy of a nav the
   * reader can already see. The sidebar is the nav here. */
  admin: [],
};

/**
 * A real, shipped part of Pana Mia served from the main site rather than from
 * a hostname of its own.
 *
 * Rooms are listed in the switcher below the surfaces and styled more quietly,
 * because giving them equal weight would promise a front door they do not
 * have. Each one is a candidate to be promoted to a surface later, which is a
 * registry entry plus a DNS record rather than a rewrite.
 */
export interface PanaverseRoom {
  name: string;
  /** The route it lives at today. Relative on purpose — see SHARED_ROOMS. */
  path: string;
  blurb: string;
  tone: SurfaceTone;
}

/**
 * The rooms the switcher offers.
 *
 * Paths are relative, so following one from Pana Social keeps the member on
 * social.pana.social and the page arrives wearing the guest chrome
 * (`SurfaceGuestHeader`). That is the same call `SurfaceGuestFooter` makes for
 * the legal links, and for the same reason: bouncing a member to another
 * hostname to look at Pana Mia content is exactly the "two separate products"
 * message the switcher exists to dispel.
 *
 * Blurbs are one truncating line in the panel and are written to fit. A room
 * that needs two lines to explain itself is arguing to be a surface.
 */
export const SHARED_ROOMS: readonly PanaverseRoom[] = [
  /* Events used to head this list. It is a surface now, so it is listed above
   * with the others — leaving it here as well would have put it in the
   * switcher twice, once as a front door and once as a room that does not have
   * one.
   *
   * This is the promotion path the type promised, run once: a registry entry,
   * a mark, and a line deleted from here. No DNS record, unlike the surfaces
   * that came before it — Events is path-only, served from pana.social/e. A
   * surface is a thing with its own name and tone, not a thing with its own
   * hostname. */
  {
    name: 'Peer Mentoring',
    path: '/m',
    blurb: 'Book time with a Pana',
    tone: 'blue',
  },
  {
    name: 'Resilience Network',
    path: '/r',
    blurb: 'Mutual aid groups',
    tone: 'red',
  },
];

/**
 * The accent each surface carries.
 *
 * Wayfinding, not branding. Both live marks are the same orange in the same
 * hand-lettered family — the panas deliberately do not use colour to tell
 * their offerings apart — so the logo never recolours, and the accent rule
 * (border, active nav, pill hover) is the only thing answering "which room am
 * I in".
 *
 * `social` is flame rather than burnt because that is the orange the real logo
 * is drawn in; burnt was a guess made before the live mark was in hand.
 */
export const SURFACE_TONE: Record<SurfaceId, SurfaceTone> = {
  www: 'indigo',
  info: 'indigo',
  social: 'flame',
  /* Red, which is the last unclaimed accent and happens to be the right one:
   * it is the colour a date gets ringed in. The two warm oranges were already
   * spoken for, and events sitting a shade off Pana Social would have told a
   * member nothing about which room they had moved to.
   *
   * It collides with the Resilience Network room, which is also red — the same
   * kind of collision connectors documents against the Education house, and
   * tolerable for the same reason: rooms are listed below surfaces in the
   * switcher and styled more quietly, so the two are never set side by side at
   * equal weight. If Resilience is ever promoted to a surface, one of the two
   * has to give. */
  events: 'red',
  /* Burnt rather than flame: the mark is the same orange as everyone else's,
   * so the accent is the only thing telling a member they have moved from the
   * timeline to HQ, and two oranges a shade apart tell them nothing. Burnt is
   * also the house colour of Education, which is a collision worth watching —
   * if the house board ever moves into the chrome, one of the two has to give.
   */
  connectors: 'burnt',
  /* The only cool accent in the set, and the only one that is not a wayfinding
   * decision so much as a warning. Every member surface is warm; a staff tool
   * that looked like one would invite somebody to forget which they were
   * looking at while holding a button that publishes or refuses a business.
   *
   * Blue is also the one tone no member surface had claimed, so nothing had to
   * move to make room. See lib/admin/theme.ts for why the page chrome fills
   * with this same colour and sets ink on it rather than cream — unlike every
   * other surface, this fill is light. */
  admin: 'blue',
};
