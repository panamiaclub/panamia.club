import { FeedPage } from './_components/feed-page';

/**
 * Pana Social's front door, at the path every hostname can reach it by.
 *
 * The feed itself lives in `_components/feed-page.tsx` because it is also what
 * `/` serves on a surface hostname — social.panamia.club/ is the same page
 * under a shorter URL. This route stays the canonical place in the shared
 * route tree: it is what panamia.club/s serves, what links point at, and what
 * the app falls back to if PANAVERSE_SUBDOMAINS is ever turned off.
 */
export default function SocialPage() {
  return <FeedPage />;
}
