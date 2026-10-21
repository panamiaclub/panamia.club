'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { LayoutGrid, type LucideIcon } from 'lucide-react';

import { StatusPill } from '@/components/Admin/status-pill';
import { useSession } from '@/lib/auth-client';
import { ADMIN_CHROME } from '@/lib/admin/theme';
import {
  ADMIN_GROUPS,
  adminGroup,
  childViewsFor,
  topLevelViewsInGroupFor,
  type AdminView,
  type AdminViewer,
} from '@/lib/admin/views';

/**
 * The admin surface's navigation.
 *
 * Replaces the old `AdminMenu` strip, which was a wrapping row of black pills
 * that needed two rows at 1280px and four at 430px. A row that grows sideways
 * gets worse with every tool added; a column does not, which is the whole
 * reason this is a sidebar.
 *
 * Active state is an exact pathname match rather than a prefix match on
 * purpose: `/admin` is a prefix of every other route here, so prefix matching
 * would light up Overview on every page.
 *
 * ## The icons are not decoration
 *
 * Six links of similar length in one column are six identical shapes, and the
 * only way to tell them apart is to read all six. Each one now carries its
 * view's icon on a chip in its group's colour, so the column can be navigated
 * by position and colour the way a toolbar is — which is what someone who
 * opens this every day actually does.
 *
 * Below `lg` this is still a horizontal strip, because a sidebar on a phone is
 * either a drawer behind a tap or a column that pushes the work off-screen.
 * The strip is 63px tall against the old menu's 244px, and it scrolls rather
 * than wraps, so it stays one row however many tools get added.
 */

function NavLink({
  view,
  active,
  sectionActive = false,
  fill,
  onFill,
}: {
  view: AdminView;
  active: boolean;
  /** A row beneath this one is the active page. Parents only. */
  sectionActive?: boolean;
  fill: string;
  onFill: string;
}) {
  const Icon = view.icon;

  return (
    <Link
      href={view.href}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap transition-colors',
        active
          ? `${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL} font-bold`
          : sectionActive
            ? // Weight and full-strength ink, no fill. A second filled row
              // would compete with the child that actually is the page; this
              // only has to say "you are somewhere under here".
              'text-pana-ink hover:bg-pana-ink/5 font-bold'
            : 'text-pana-ink/75 hover:bg-pana-ink/5 hover:text-pana-ink font-medium',
      ].join(' ')}
    >
      {/* On the active row the chip drops its own colour. The row is already
          filled with the surface blue, and a second fill inside it reads as a
          button inside a button. */}
      <span
        aria-hidden="true"
        className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
          active ? 'bg-pana-ink/15 text-pana-ink' : `${fill} ${onFill}`,
        ].join(' ')}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">{view.name}</span>
      <StatusPill status={view.status} />
    </Link>
  );
}

/* The overview is not in ADMIN_VIEWS — it is the page listing them, not one of
   them — so its nav row is built here. It borrows the Directory colour rather
   than inventing a fifth, since it is the shelf it sits above. */
const OVERVIEW: AdminView = {
  id: 'overview',
  name: 'Overview',
  href: '/admin',
  group: 'directory',
  blurb: '',
  does: [],
  status: 'live',
  icon: LayoutGrid as LucideIcon,
};

function GroupLabel({ children }: { children: string }) {
  return (
    <p
      className={`hidden pb-1.5 pl-1 text-[0.6875rem] font-black tracking-[0.14em] uppercase lg:block ${ADMIN_CHROME.ACCENT}`}
    >
      {children}
    </p>
  );
}

export default function AdminNav() {
  const pathname = usePathname();
  const directory = adminGroup('directory');
  const { data: session, status } = useSession();

  // While the session resolves, draw the full column and narrow it afterwards
  // rather than the reverse. Growing a sidebar moves every row under the
  // pointer at the moment the page becomes clickable; shrinking one only
  // removes rows the viewer was never going to hit. This is not a boundary —
  // every route behind it checks for itself — so being briefly generous costs
  // nothing but a flicker, and only for moderators, who are the rarer viewer.
  const viewer: AdminViewer =
    status === 'loading'
      ? { isAdmin: true, isContentModerator: true }
      : {
          isAdmin: session?.user?.isAdmin ?? false,
          isContentModerator: session?.user?.isContentModerator ?? false,
        };

  return (
    <nav aria-label="Admin sections" className="lg:w-60 lg:shrink-0">
      <div className="border-pana-ink/10 flex gap-5 overflow-x-auto rounded-2xl border bg-white p-3 shadow-[0_8px_24px_rgb(17_13_13_/_0.06)] lg:sticky lg:top-6 lg:block lg:gap-0 lg:overflow-visible">
        <div className="hidden px-2 pt-1 pb-4 lg:block">
          <p className="text-pana-navy text-[0.68rem] font-black tracking-[0.16em] uppercase">
            Pana MIA
          </p>
          <p className="mt-0.5 text-xl font-black tracking-tight">
            Back office
          </p>
        </div>
        {/* Overview is the shelf listing every tool, so it is only useful to
            someone who can open them. A moderator gets their one tool
            directly. */}
        {viewer.isAdmin && (
          <div className="lg:mb-5">
            <GroupLabel>Admin</GroupLabel>
            <ul className="flex gap-1.5 lg:flex-col lg:gap-0.5">
              <li>
                <NavLink
                  view={OVERVIEW}
                  active={pathname === '/admin'}
                  fill={directory.fill}
                  onFill={directory.onFill}
                />
              </li>
            </ul>
          </div>
        )}

        {ADMIN_GROUPS.map((group) => {
          const views = topLevelViewsInGroupFor(group.id, viewer);
          if (views.length === 0) return null;
          return (
            <div key={group.id} className="lg:mb-5">
              <GroupLabel>{group.name}</GroupLabel>
              {/* Children sit in the same flat list as their parent rather
                  than in a nested <ul>. Below lg this column collapses to a
                  horizontal strip where indentation means nothing, and a real
                  nested list would have to be undone there with
                  display:contents — which has a history of dropping list
                  semantics in screen readers. A flat list of links degrades
                  to the strip for free and still reads correctly aloud; the
                  rail and indent are the visual half only. */}
              <ul className="flex gap-1.5 lg:flex-col lg:gap-0.5">
                {views.map((view) => {
                  const children = childViewsFor(view.id, viewer);
                  return (
                    <Fragment key={view.id}>
                      <li>
                        <NavLink
                          view={view}
                          active={pathname === view.href}
                          sectionActive={children.some(
                            (child) => pathname === child.href
                          )}
                          fill={group.fill}
                          onFill={group.onFill}
                        />
                      </li>
                      {children.map((child) => (
                        <li
                          key={child.id}
                          className="lg:border-pana-ink/10 lg:ml-3.5 lg:border-l-2 lg:pl-2"
                        >
                          <NavLink
                            view={child}
                            active={pathname === child.href}
                            fill={group.fill}
                            onFill={group.onFill}
                          />
                        </li>
                      ))}
                    </Fragment>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
