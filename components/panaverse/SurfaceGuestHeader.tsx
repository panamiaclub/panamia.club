import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  DEFAULT_SURFACE,
  frontDoorPath,
  originForFrom,
  type PanaverseSurface,
} from '@/lib/panaverse/surfaces';
import { SURFACE_MARK, SURFACE_TONE } from '@/lib/panaverse/branding';

/**
 * The bar a surface wears over a page it is borrowing from another surface.
 *
 * One deploy serves the whole panaverse, so every route answers on every
 * hostname: social.panamia.club/directory/search really does render the main
 * site's directory. That is a feature — a member who wants the directory
 * should not be bounced to a different hostname to read it — but until this
 * existed those pages rendered with no header, no footer and no way back to
 * the feed. The surface kept the member and then stranded them.
 *
 * So this is deliberately not a second masthead. It carries the two things a
 * borrowed page cannot supply for itself:
 *
 *   - the mark, linking home, so the member can always get back to the surface
 *     they were actually in;
 *   - an honest statement of whose page this is, with a link to it on its own
 *     surface, for anyone who wants the full site around it.
 *
 * It has no nav. A directory nav rendered under the Pana Social mark would
 * claim the surface owns pages it is only showing, which is the same
 * confusion in the opposite direction.
 */
export function SurfaceGuestHeader({
  surface,
  host,
  pathname,
  owner = DEFAULT_SURFACE,
}: {
  /** The surface being served — the one whose mark flies here. */
  surface: PanaverseSurface;
  /** Raw Host header, so cross-surface links keep the scheme and port in hand
   *  instead of sending a developer out to the live site. */
  host: string | null | undefined;
  /** Path being served, used to link to the same page on its own surface. */
  pathname: string;
  /** The surface this page belongs to. */
  owner?: PanaverseSurface;
}) {
  const mark = SURFACE_MARK[surface.id];
  const ownerOrigin = originForFrom(owner, host);

  /**
   * Whether the owner has a site of its own to open, as reached from here.
   *
   * `originForFrom` answers with the host in hand for a surface that has no
   * origin of its own — one carrying `subdomainPending`, or any surface at all
   * while `PANAVERSE_SUBDOMAINS` is off. That is the right answer for a link
   * that must not point at a name DNS cannot resolve, and the wrong one for
   * this link in particular, whose whole purpose is to leave: it would offer
   * the page already being read, wearing an external-link icon.
   *
   * Compared as origins rather than read off any single flag, because a
   * surface reaches that state three ways and only one of them is a flag. A
   * path-only surface is not among them: Events has `subdomain: null`, so its
   * origin is the root domain and this link correctly leaves for
   * `panamia.club/e` from admin, social, or anywhere else it is borrowed.
   */
  const ownerHasOwnSite = ownerOrigin !== originForFrom(surface, host);

  return (
    <header
      className="panaverse-masthead panaverse-guest"
      data-tone={SURFACE_TONE[surface.id]}
      data-contained="true"
    >
      <div className="panaverse-masthead-inner container mx-auto max-w-6xl px-4">
        <Link
          href={frontDoorPath(surface, host)}
          className="panaverse-guest-home"
          aria-label={`${surface.name} home`}
        >
          {/* No `priority`: this bar is never the largest paint on the page,
              and preloading a 22px-tall mark above the borrowed page's own
              hero would be a preload warning for no gain. */}
          <Image
            src={mark.src}
            alt={mark.alt}
            width={mark.width}
            height={mark.height}
            sizes="160px"
            className="panaverse-logo"
          />
        </Link>

        {/* Hidden on narrow screens, where the mark and the link are the two
            things that have to survive. The sentence is context, not a
            control. */}
        <span className="panaverse-guest-note">
          <span aria-hidden="true">·</span> A {owner.name} page
        </span>

        {/* Dropped entirely rather than rendered inert when the owner has no
            site of its own. The note beside it already says whose page this
            is, which is the honest half; a control that goes nowhere is not a
            weaker version of this link, it is a different and worse thing. */}
        {ownerHasOwnSite && (
          <a
            href={`${ownerOrigin}${pathname}`}
            className="panaverse-guest-link"
          >
            Open on {owner.name}
            <ExternalLink
              className="h-3.5 w-3.5 flex-none"
              aria-hidden="true"
            />
          </a>
        )}
      </div>
    </header>
  );
}
