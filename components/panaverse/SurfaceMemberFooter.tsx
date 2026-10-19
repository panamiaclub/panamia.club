import Link from 'next/link';
import {
  DEFAULT_SURFACE,
  type PanaverseSurface,
} from '@/lib/panaverse/surfaces';
import { SURFACE_TONE } from '@/lib/panaverse/branding';

/**
 * The closing rule under a surface's own rooms.
 *
 * `SurfaceMemberHeader` alone would have left the gap this closes. A surface
 * renders neither MainFooter nor the guest footer over its own pages, so
 * social.panamia.club/s and every public profile at /p/* had no route to the
 * terms or the privacy policy at all. The profiles are the part that makes it
 * a compliance gap rather than a missing flourish: they are public, indexable
 * pages that a signed-out visitor can reach, and on the social surface they
 * offered no legal links whatsoever.
 *
 * Deliberately not a site footer. `/signin` set the pattern — a page that
 * carries only the legal links a visitor needs rather than reproducing
 * MainFooter — and `SurfaceGuestFooter` followed it. This follows both.
 *
 * The links are relative, so they open on the surface the member is already in
 * and arrive wearing the guest treatment. Sending a member to Pana Mia to read
 * the terms would undo the decision the whole surface split implements.
 *
 * It carries no switcher and no way home: the surface masthead above it is
 * sticky, so both are on screen no matter how far down a timeline the member
 * has scrolled.
 */
export function SurfaceMemberFooter({
  surface,
}: {
  /** The surface being served — names itself and sets the tone of the rule. */
  surface: PanaverseSurface;
}) {
  return (
    <footer
      className="panaverse-guest-footer"
      data-tone={SURFACE_TONE[surface.id]}
    >
      <div className="panaverse-guest-footer-inner container mx-auto max-w-6xl px-4">
        <span className="panaverse-guest-footer-note">
          {surface.name}, part of {DEFAULT_SURFACE.name}
        </span>
        <nav aria-label="Legal" className="panaverse-guest-footer-nav">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
