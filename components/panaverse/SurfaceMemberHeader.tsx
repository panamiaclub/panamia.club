import Image from 'next/image';
import Link from 'next/link';
import { frontDoorPath, type PanaverseSurface } from '@/lib/panaverse/surfaces';
import { SURFACE_MARK, SURFACE_TONE } from '@/lib/panaverse/branding';
import { SurfaceIdentity } from '@/components/panaverse/SurfaceIdentity';
import { SurfaceSearch } from '@/components/panaverse/SurfaceSearch';
import { NotificationsMenu } from '@/components/account/notifications-menu';
import { MessagesLink } from '@/components/account/messages-link';

/**
 * The masthead a surface wears over its own rooms.
 *
 * Pana Social had none. The root layout withholds the Pana Mia masthead on
 * surface hostnames — correctly, because that masthead over a timeline is what
 * made Pana Social read as a section of the main site — and `SurfaceGuestHeader`
 * only covers pages a surface has *borrowed*. The surface's own front door fell
 * between the two, so a signed-in member at social.panamia.club/s got a bare
 * page: no mark, no nav, no account, and no route back to Pana Mia.
 *
 * Mark on the left, search in the middle, account on the right: the shape a
 * timeline wears, rather than the main site's centred mark. The two surfaces
 * share an account and a palette, and diverge here because finding a Pana is
 * the first thing done on a social feed and never the first thing done on a
 * directory landing page.
 *
 * NAV IS DELIBERATELY ABSENT, but the route home is not. The MENU drawer that
 * used to sit on the left carried the surface nav, the shared rooms, and — via
 * `originForFrom` — the only link that could cross from social.panamia.club
 * back to the main site. That last one now comes from `PANA_SITES` in the
 * account menu instead: its paths are resolved server-side by
 * `resolvePanaSites`, so a site on another surface links to that surface's
 * origin. Until PANAVERSE_SUBDOMAINS was turned on those links were relative
 * and a member could not leave this hostname through them; they can now.
 *
 * What is still missing is the surface nav proper — the rooms of Pana Social
 * itself. See `SurfaceMenu` in the history of this directory for what was here.
 *
 * Rendered server-side. Only the controls that need session state are client
 * components.
 */
export function SurfaceMemberHeader({
  surface,
  host,
}: {
  /** The surface being served — its mark flies here. */
  surface: PanaverseSurface;
  /** The hostname in hand, which decides where this surface's front door is. */
  host: string | null | undefined;
}) {
  const mark = SURFACE_MARK[surface.id];

  return (
    <header
      className="panaverse-masthead"
      data-tone={SURFACE_TONE[surface.id]}
      data-sticky="true"
      data-contained="true"
    >
      <div
        className="panaverse-masthead-inner container mx-auto max-w-6xl px-4"
        data-layout="search"
      >
        <Link
          href={frontDoorPath(surface, host)}
          className="panaverse-guest-home"
          aria-label={`${surface.name} home`}
        >
          {/* No `priority`. The mark is 22px tall and the timeline below it
              carries avatars and attachments that are the real largest paint;
              preloading this would be a warning for no gain. */}
          <Image
            src={mark.src}
            alt={mark.alt}
            width={mark.width}
            height={mark.height}
            sizes="160px"
            className="panaverse-logo"
          />
        </Link>

        <SurfaceSearch
          initialScope={surface.id === 'events' ? 'event' : 'group'}
        />

        <div className="panaverse-masthead-right">
          {/* Both gate themselves on the session — this header renders on the
              server and cannot. Messages, then notifications, then you. */}
          <MessagesLink />
          <NotificationsMenu />
          <SurfaceIdentity />
        </div>
      </div>
    </header>
  );
}
