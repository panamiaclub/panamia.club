import type { Metadata } from 'next';
import { SURFACE_DESCRIPTION } from '@/lib/panaverse/branding';
import {
  DEFAULT_SURFACE,
  getSurface,
  originFor,
} from '@/lib/panaverse/surfaces';

export const INFO_LINKS = [
  { id: 'directory', href: '/d' },
  { id: 'social', href: '/s' },
  { id: 'events', href: '/e' },
  { id: 'connectors', href: '/connectors' },
  { id: 'listing', href: '/form/get-listed' },
  { id: 'support', href: '/support-pana' },
] as const;

export function getInfoCanonicalUrl(): string {
  const info = getSurface('info');
  return info.subdomainPending
    ? `${originFor(DEFAULT_SURFACE)}${info.rootPath}`
    : `${originFor(info)}/`;
}

export function getInfoMetadata(): Metadata {
  const title = 'Pana MIA Club | The Future Is Local';
  const description = SURFACE_DESCRIPTION.info;
  const canonical = getInfoCanonicalUrl();

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName: 'Pana MIA Club',
      images: [
        {
          url: new URL('/img/impact/pana-social-dinner.webp', canonical).href,
          alt: 'Panas gathered around a table at a community dinner',
        },
      ],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}
