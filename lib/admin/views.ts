/**
 * What the admin surface contains.
 *
 * Kept as data rather than as markup so the sidebar, the overview and anything
 * else that wants to enumerate staff tools read from one list. Adding a view
 * should be an entry here plus a route.
 *
 * ## Why there are icons and colours in here
 *
 * Six tools rendered as six lines of text are six identical shapes, and staff
 * who use this daily navigate by shape long before they read. The icon and the
 * group colour are the shape. They live beside the name because they are part
 * of what a view *is*, not decoration a component adds later — and because the
 * sidebar and the overview both need them and must not disagree.
 *
 * ## What is deliberately not in here
 *
 * Mentoring, Articles and Podcasts were dropped from the sidebar so the
 * surface carries only the work being prioritised now. Their routes and their
 * endpoints are untouched and still answer — see `PARKED_TOOLS` at the bottom,
 * which keeps them written down rather than letting them become folklore.
 */

import {
  Activity,
  CalendarClock,
  ClipboardCheck,
  Download,
  Flag,
  HeartHandshake,
  type LucideIcon,
  Mail,
  ShieldCheck,
  ShoppingBag,
  Store,
  UsersRound,
} from 'lucide-react';

export type ViewStatus = 'mock' | 'live' | 'stub';

export type AdminGroupId = 'directory' | 'community' | 'inbox' | 'site';

export interface AdminGroup {
  id: AdminGroupId;
  name: string;
  /** One line, on the group's header band. What this shelf of tools is for. */
  blurb: string;
  /**
   * The band fill, and the only text colour that is safe on it.
   *
   * Written as complete Tailwind class strings rather than a colour name the
   * caller interpolates. Tailwind v4 only emits a utility it can see spelled
   * out in a source file, so `bg-pana-${group.accent}` compiles to nothing —
   * the band renders transparent and the bug is invisible in review. This has
   * bitten this codebase twice; see the note on ADMIN_CHROME.RULE_LG.
   *
   * Measured against the CONTRAST RULE at the top of app/globals.css. Every
   * pairing below clears AA for body text:
   *
   *   ink   / blue    8.21      ink  / flame   7.50
   *   cream / indigo  9.01      ink  / butter 16.41
   *
   * Changing a fill means re-measuring its partner in the same edit. The warm
   * fills here carry ink and the one dark fill carries cream, which is the
   * rule the whole palette runs on.
   */
  fill: string;
  onFill: string;
}

/** Sidebar order, and the order the overview stacks them in. */
export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    id: 'directory',
    name: 'Directory',
    blurb: 'Who is listed, and who is still waiting to get in.',
    fill: 'bg-pana-blue',
    onFill: 'text-pana-ink',
  },
  {
    id: 'community',
    name: 'Community',
    blurb: 'The panas themselves, and the programmes they belong to.',
    fill: 'bg-pana-indigo',
    onFill: 'text-pana-cream',
  },
  {
    id: 'inbox',
    name: 'Inbox',
    blurb: 'Things panas sent us that are waiting on an answer.',
    fill: 'bg-pana-butter',
    onFill: 'text-pana-ink',
  },
  /* The first group that is not about panas. The three above sort staff work
     by who it concerns; this one is about the machine they all run on, which
     is why it sits last — it is the group you open when something is wrong
     rather than one you work through. Flame on ink measures 7.50, the same
     footing as the others; see the CONTRAST RULE note on `fill` above. */
  {
    id: 'site',
    name: 'Site',
    blurb: 'How the website itself is holding up.',
    fill: 'bg-pana-flame',
    onFill: 'text-pana-ink',
  },
];

export interface AdminView {
  id: string;
  name: string;
  href: string;
  group: AdminGroupId;
  /** One line. What this is. */
  blurb: string;
  /** The specific things an admin can do once they are in there. */
  does: readonly string[];
  status: ViewStatus;
  /**
   * Who may use this tool, which decides whether the nav draws it.
   *
   * Defaults to `'admin'`. `'moderator'` means content moderators reach it
   * too — currently only the abuse-report queue, which is the one job the
   * `contentModerator` role exists to hand out.
   *
   * This governs *drawing*, not *serving*: the route's own
   * `checkModeratorAuth()` is the boundary. Keeping the two in one file means
   * a tool added for moderators cannot be left out of their nav, and a tool
   * that is not for them cannot be drawn into it.
   */
  access?: 'admin' | 'moderator';
  /**
   * The view this one sits beneath in the sidebar, by id.
   *
   * Navigational only. A child is reached and permitted on its own terms and
   * `canSeeView` never consults the parent — nesting says where a row is
   * drawn, not who may use it.
   *
   * A child must sit in its parent's group. Nothing checks across groups, and
   * a cross-group parent would draw the child in the wrong shelf or not at
   * all, depending on which list ran first.
   */
  parent?: string;
  /** Decorative. Every call site pairs it with aria-hidden. */
  icon: LucideIcon;
}

export const ADMIN_VIEWS: readonly AdminView[] = [
  {
    id: 'listings',
    name: 'Directory listings',
    href: '/admin/listings',
    group: 'directory',
    blurb: 'Applications waiting to be let into the directory.',
    does: [
      'See everything waiting, oldest first',
      'Read the application without leaving the queue',
      'Approve or decline',
    ],
    status: 'live',
    icon: Store,
  },
  {
    id: 'download-profiles',
    name: 'Export profiles',
    href: '/admin/download-profiles',
    group: 'directory',
    blurb: 'Pull the directory down as a spreadsheet.',
    does: ['Download every profile as CSV'],
    status: 'live',
    icon: Download,
  },
  {
    id: 'connectors',
    name: 'Pana Connectors',
    href: '/admin/connectors',
    group: 'community',
    blurb: 'The volunteer programme: roster, houses and the events calendar.',
    does: [
      'Move a connector between houses',
      'Run the events calendar',
      'Read the programme numbers',
    ],
    status: 'live',
    icon: HeartHandshake,
  },
  /* The two below are subpages of Connectors and nest under it. They carry
     their own rows rather than living only in the page's tab strip because
     the nav matches the active row on an exact pathname: a subpage with no
     entry would leave the whole sidebar looking unselected while you were
     standing on it.

     Named for what they are rather than repeating the programme. "Connector
     applications" under "Pana Connectors" stutters once the indent already
     says whose applications these are. */
  {
    id: 'connector-applications',
    name: 'Applications',
    href: '/admin/connectors/applications',
    group: 'community',
    parent: 'connectors',
    blurb: 'People waiting to be let into the volunteer programme.',
    does: [
      'Read what somebody said they can bring',
      'Accept or decline, oldest application first',
    ],
    status: 'live',
    icon: ClipboardCheck,
  },
  {
    id: 'connector-scheduling',
    name: 'Scheduling',
    href: '/admin/connectors/scheduling',
    group: 'community',
    parent: 'connectors',
    blurb: 'Who is carrying what, and handing out the next piece of work.',
    does: [
      'See each connector’s open load in hours',
      'Assign a task to somebody who has room',
    ],
    status: 'live',
    icon: CalendarClock,
  },
  {
    id: 'users',
    name: 'Users',
    href: '/admin/users',
    group: 'community',
    blurb: 'Every account on the site, and what staff can do about one.',
    does: [
      'Find an account by name, handle or email',
      'Lock an account: ends their sessions and refuses the next sign-in',
      'See who holds admin, and why it cannot be granted here',
    ],
    status: 'live',
    icon: UsersRound,
  },
  {
    id: 'roles',
    name: 'Roles & permissions',
    href: '/admin/users/roles',
    group: 'community',
    parent: 'users',
    blurb: 'Who holds a staff role, and how to give someone one.',
    does: [
      'See every admin and everyone on the moderation rota',
      'Search for a pana by name, handle or email',
      'Grant or revoke a role, within what your own tier allows',
    ],
    status: 'live',
    icon: ShieldCheck,
  },
  {
    id: 'contactus',
    name: 'Contact submissions',
    href: '/admin/contactus',
    group: 'inbox',
    blurb: 'Messages from the contact form.',
    does: ['Read the queue', 'Set status and category'],
    status: 'live',
    icon: Mail,
  },
  {
    id: 'reports',
    name: 'Abuse reports',
    href: '/admin/reports',
    group: 'inbox',
    blurb: 'Moderation reports from the Nostr relay.',
    does: ['Triage a report', 'Act on the reported account'],
    status: 'live',
    access: 'moderator',
    icon: Flag,
  },
  {
    id: 'shop',
    name: 'Shop operations',
    href: '/admin/shop',
    group: 'site',
    blurb: 'Paid orders, stock reservations and merchandise fulfillment.',
    does: [
      'Sync active products from Stripe',
      'Set physical inventory quantities',
      'Track and fulfill paid merchandise orders',
    ],
    status: 'live',
    icon: ShoppingBag,
  },
  {
    id: 'livesite',
    name: 'Live site',
    href: '/admin/livesite',
    group: 'site',
    blurb: 'Whether the site is healthy, and what is waiting on a human.',
    does: [
      'See everything queued across the surface in one place',
      'Watch signups and new profiles week over week',
      'Check the hourly cleanup job actually ran',
    ],
    status: 'live',
    icon: Activity,
  },
];

/** Looks a group up by id. Throws rather than returning undefined: every view
 *  carries a group id from this same file, so a miss is a typo, not a state. */
export function adminGroup(id: AdminGroupId): AdminGroup {
  const group = ADMIN_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`Unknown admin group: ${id}`);
  return group;
}

export function viewsInGroup(group: AdminGroupId): readonly AdminView[] {
  return ADMIN_VIEWS.filter((v) => v.group === group);
}

/** The access-bearing half of a session, so this file need not import auth. */
export interface AdminViewer {
  isAdmin: boolean;
  isContentModerator: boolean;
}

/**
 * Whether this viewer may use a tool.
 *
 * Admins reach everything. A content moderator who is not an admin reaches
 * only the tools marked `access: 'moderator'`.
 *
 * Drawing a tool somebody cannot use is the bug `components/Admin/gate.tsx`
 * was written to fix: it tells them the tool exists, invites them in, and then
 * fails in a way indistinguishable from a broken page. A moderator seeing the
 * whole admin sidebar would reproduce that for every tool but one.
 */
export function canSeeView(view: AdminView, viewer: AdminViewer): boolean {
  if (viewer.isAdmin) return true;
  return view.access === 'moderator' && viewer.isContentModerator;
}

/** `viewsInGroup` narrowed to what this viewer may actually use. */
export function viewsInGroupFor(
  group: AdminGroupId,
  viewer: AdminViewer
): readonly AdminView[] {
  return viewsInGroup(group).filter((view) => canSeeView(view, viewer));
}

/**
 * The rows in a group that draw at the top level, for this viewer.
 *
 * A view whose parent this viewer cannot see is promoted rather than hidden:
 * it is permitted on its own terms, and indenting a row beneath one that is
 * not drawn reads as a rendering fault. That cannot happen under today's
 * access rules — every nested view and its parent are admin-only — which is
 * the reason to settle it here instead of finding it later.
 */
export function topLevelViewsInGroupFor(
  group: AdminGroupId,
  viewer: AdminViewer
): readonly AdminView[] {
  const visible = viewsInGroupFor(group, viewer);
  return visible.filter(
    (view) => !view.parent || !visible.some((v) => v.id === view.parent)
  );
}

/** The rows nesting under `parentId`, in ADMIN_VIEWS order. */
export function childViewsFor(
  parentId: string,
  viewer: AdminViewer
): readonly AdminView[] {
  return ADMIN_VIEWS.filter(
    (view) => view.parent === parentId && canSeeView(view, viewer)
  );
}

/**
 * Capability that exists as an API and has no screen.
 *
 * Distinct from `PARKED_TOOLS` below: these were never built, those were built
 * and set aside.
 */
export interface UnbuiltTool {
  name: string;
  api: string;
  note: string;
}

export const UNBUILT_TOOLS: readonly UnbuiltTool[] = [
  {
    name: 'Venue approvals',
    api: '/api/admin/venues/[slug]/approve · /suspend',
    note: 'Same shape as the listings queue. Probably the next one to build.',
  },
  {
    name: 'Events',
    api: 'none',
    note: 'The old admin menu linked to /account/admin/events, which has never had a page or an endpoint behind it. Dropped rather than carried over.',
  },
];

/**
 * Built, working, and deliberately off the sidebar.
 *
 * These three came across in the move from `/account/admin/*` and were then
 * taken out of the navigation to keep the surface on the work being done now.
 * Nothing was deleted: the routes still render, the endpoints still answer,
 * and the `/account/admin/*` redirects still land on them — which matters,
 * because staff notification mail contains those old URLs.
 *
 * Written down rather than dropped silently so that "where did Articles go"
 * has an answer in the codebase. Putting one back is this entry becoming an
 * `ADMIN_VIEWS` row again.
 */
export interface ParkedTool {
  name: string;
  href: string;
  note: string;
}

export const PARKED_TOOLS: readonly ParkedTool[] = [
  {
    name: 'Mentoring',
    href: '/admin/mentoring',
    note: 'Session and participation charts, reading /api/admin/mentoring/dashboard.',
  },
  {
    name: 'Articles',
    href: '/admin/articles',
    note: 'Remove and restore community articles. Three endpoints behind it, all live.',
  },
  {
    name: 'Podcasts',
    href: '/admin/podcasts',
    note: 'Was a placeholder before the move and still is — no endpoint was ever written.',
  },
];
