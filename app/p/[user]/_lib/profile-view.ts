/**
 * Maps a stored profile row onto what the profile page renders.
 *
 * The page's components were designed against a fixture with fields the real
 * table does not have — a cover image, a tidy list of links, a coordinate pair.
 * Rather than push that mismatch into every component as optional chaining and
 * fallbacks, it is absorbed once, here. Components take a ProfileView and can
 * trust its shape.
 *
 * Everything in this module is pure. The database work happens in page.tsx.
 */
import { normalizeUsZip } from '@/lib/online-zip';

import type { LegacyProfile } from '@/lib/server/profile';
import type { ProfileSocialsInterface } from '@/lib/interfaces';

export type LinkKind =
  'website' | 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'spotify';

export interface ProfileLink {
  kind: LinkKind;
  /** What the chip shows — a handle where we have one, a domain otherwise. */
  label: string;
  href: string;
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface GalleryImage {
  src: string;
  alt: string;
}

export interface ProfileView {
  id: string;
  handle: string;
  name: string;
  tagline: string | null;
  bio: string | null;
  logo: string | null;
  /**
   * The wide image behind the header. Profiles have no cover field, so the
   * first gallery image stands in; a listing with photos should look like one.
   * Null renders a flat surface rather than a broken frame.
   */
  coverImage: string | null;
  city: string | null;
  region: string | null;
  coords: Coords | null;
  /**
   * Online business without a public storefront. Exact street distance and
   * directions are suppressed; local discovery can use the public base ZIP.
   * Never inferred from missing coordinates on an unfinished storefront.
   */
  onlineOnly: boolean;
  /** Public five-digit base ZIP for an online business, when provided. */
  baseZip?: string | null;
  certified: boolean;
  categories: string[];
  links: ProfileLink[];
  gallery: GalleryImage[];
}

/** Trim, and treat an empty or whitespace-only string as absent. */
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Tag an outbound link so the business can see the directory sent the visit.
 *
 * Carried over from the page this one replaces. It is the only evidence a
 * listing produces that being in the directory is worth anything, so it
 * survives the redesign.
 */
function withSource(url: string): string {
  try {
    const tagged = new URL(url);
    tagged.searchParams.set('utm_source', 'panamia');
    return tagged.toString();
  } catch {
    return url;
  }
}

/**
 * Turn a stored social value into something linkable.
 *
 * These fields have been free text for years, so they hold every variation
 * people type: full URLs, bare domains, "@handle", and plain handles. Guessing
 * wrong produces a dead link on a business's only web presence, so each shape
 * is handled explicitly rather than blindly prefixed.
 */
function socialUrl(
  base: string,
  value: string
): { href: string; label: string } {
  if (/^https?:\/\//i.test(value)) {
    // The trailing segment can already carry an "@" — TikTok profile URLs are
    // literally tiktok.com/@handle — so strip it before prefixing, or the chip
    // renders "@@handle".
    const handle = value
      .replace(/\/+$/, '')
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/^@+/, '');
    return { href: value, label: handle ? `@${handle}` : value };
  }

  const handle = value.replace(/^@/, '').replace(/\/+$/, '');
  return { href: `${base}${handle}`, label: `@${handle}` };
}

function websiteUrl(value: string): { href: string; label: string } {
  const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let label = value;
  try {
    label = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    // Unparseable: show what was stored rather than dropping the link. A
    // visitor can still read a malformed address; an absent one tells them
    // nothing.
  }
  return { href, label };
}

/**
 * The outbound links row.
 *
 * Ordered deliberately rather than by object key order: the website is the
 * destination the business controls, so it leads. A listing whose links arrive
 * in whatever order the JSONB happens to serialize reads as unmaintained.
 *
 * Phone and email are deliberately absent. `profiles` holds both, but on a
 * personal profile the email column is the account's sign-in address — the
 * page this replaces published neither, and a redesign is no reason to start
 * leaking contact details a member never offered to the public.
 */
export function buildLinks(
  socials: ProfileSocialsInterface | null
): ProfileLink[] {
  const links: ProfileLink[] = [];
  const s = socials ?? {};

  const website = clean(s.website);
  if (website) {
    const { href, label } = websiteUrl(website);
    links.push({ kind: 'website', label, href: withSource(href) });
  }

  const socialSources: Array<[LinkKind, string | null, string]> = [
    ['instagram', clean(s.instagram), 'https://instagram.com/'],
    ['facebook', clean(s.facebook), 'https://facebook.com/'],
    ['tiktok', clean(s.tiktok), 'https://tiktok.com/@'],
    ['twitter', clean(s.twitter), 'https://x.com/'],
    ['spotify', clean(s.spotify), 'https://open.spotify.com/'],
  ];

  for (const [kind, value, base] of socialSources) {
    if (!value) continue;
    const { href, label } = socialUrl(base, value);
    links.push({ kind, label, href: withSource(href) });
  }

  return links;
}

/**
 * Categories as a flat list of labels.
 *
 * The JSONB column has held both a plain string array and an array of objects
 * over its life, so both are accepted. Anything else is dropped rather than
 * stringified, because "[object Object]" in a tag pill is worse than one
 * missing tag.
 */
export function buildCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        return clean(record.name) ?? clean(record.label) ?? null;
      }
      return null;
    })
    .filter((label): label is string => Boolean(label));
}

export function buildGallery(
  images: LegacyProfile['images'],
  businessName: string
): GalleryImage[] {
  return [images?.gallery1CDN, images?.gallery2CDN, images?.gallery3CDN]
    .map((src) => clean(src))
    .filter((src): src is string => Boolean(src))
    .map((src, index) => ({
      src,
      // Numbered rather than left empty: these are decorative to a sighted
      // reader but load-bearing to a screen reader deciding whether to open
      // the lightbox.
      alt: `${businessName} photo ${index + 1}`,
    }));
}

export function toProfileView(
  profile: LegacyProfile,
  handle: string
): ProfileView {
  const name = profile.name ?? '';
  const gallery = buildGallery(profile.images, name);
  const coordinates = profile.geo?.coordinates;

  return {
    id: profile.id,
    handle,
    name,
    tagline: clean(profile.five_words),
    bio: clean(profile.details) ?? clean(profile.background),
    logo: clean(profile.images?.primaryCDN),
    coverImage: gallery[0]?.src ?? null,
    city: clean(profile.primary_address?.city),
    region: clean(profile.primary_address?.state),
    coords:
      profile.onlineOnly !== true &&
      Array.isArray(coordinates) &&
      coordinates.length >= 2
        ? { lng: coordinates[0], lat: coordinates[1] }
        : null,
    certified: profile.panaCertifiedAt != null,
    onlineOnly: profile.onlineOnly === true,
    baseZip:
      profile.onlineOnly === true
        ? normalizeUsZip(profile.primary_address?.zipcode)
        : null,
    categories: buildCategories(profile.categories),
    links: buildLinks(profile.socials),
    gallery,
  };
}

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance. Pure arithmetic, so it is safe to run during render
 * on both the server and the client without a hydration mismatch.
 */
export function distanceInMiles(from: Coords, to: Coords): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}
