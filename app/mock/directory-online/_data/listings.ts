import { groupOnlineZipListings, type OnlineZipArea } from '@/lib/online-zip';

// Approximate ZIP points from GeoNames through Zippopotam.us, not business addresses.
const MIAMI_ZIP: OnlineZipArea = {
  postalCode: '33138',
  country: 'US',
  city: 'Miami',
  region: 'FL',
  lat: 25.8521,
  lng: -80.1821,
};
const BROWARD_ZIP: OnlineZipArea = {
  postalCode: '33301',
  country: 'US',
  city: 'Fort Lauderdale',
  region: 'FL',
  lat: 26.1216,
  lng: -80.1288,
};

export const COUNTIES = [
  { id: 'miami_dade', label: 'Miami-Dade' },
  { id: 'broward', label: 'Broward' },
  { id: 'palm_beach', label: 'Palm Beach County' },
] as const;

export type County = (typeof COUNTIES)[number]['id'];
export type AreaFilter = 'all' | County;
export type LocationKind = 'storefront' | 'online' | 'mobile' | 'unprovided';
export type LocationFilter = 'all' | LocationKind;

type ListingLocation =
  | {
      kind: 'storefront';
      city: string;
      county: County;
      address: string;
      /** Fixture stand-in for profiles.addressLat/addressLng, never a home. */
      coordinates: { lat: number; lng: number };
    }
  | {
      kind: 'online';
      serviceAreas: readonly County[] | 'anywhere';
      baseZip: OnlineZipArea;
    }
  | { kind: 'mobile'; serviceAreas: readonly County[] }
  | { kind: 'unprovided' };

export interface LocationListing {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  /** Fixture stand-in for the profile's public cover image. */
  cover: string;
  /** Proposed public location choice, not inferred from a missing address. */
  location: ListingLocation;
}

export const LOCATION_LABEL: Record<LocationKind, string> = {
  storefront: 'Public storefront',
  online: 'Online business',
  mobile: 'Mobile / by appointment',
  unprovided: 'Location not provided',
};

export const LISTINGS: readonly LocationListing[] = [
  {
    id: 'rayo-coffee',
    name: 'Rayo Coffee',
    tagline: 'Your neighbourhood coffee stop.',
    description:
      'A little space for a good cafecito, a fresh pastry, and a conversation that runs longer than you planned.',
    category: 'Food & drink',
    cover: '/img/directory/cafe-01.jpg',
    location: {
      kind: 'storefront',
      city: 'South Miami',
      county: 'miami_dade',
      address: 'Sample storefront on Sunset Drive',
      coordinates: { lat: 25.708, lng: -80.291 },
    },
  },
  {
    id: 'luna-wellness',
    name: 'Luna Wellness',
    tagline: 'A little room to reconnect.',
    description:
      'One-on-one sound and mindfulness sessions over video. Rooted in Broward, with no studio or public visiting address.',
    category: 'Wellness',
    cover: '/img/directory/wellness-01.jpg',
    location: {
      kind: 'online',
      serviceAreas: ['broward'],
      baseZip: BROWARD_ZIP,
    },
  },
  {
    id: 'sello-press',
    name: 'Sello Press',
    tagline: 'Small editions. Big ideas.',
    description:
      'Independent zines and prints, ordered online and shipped anywhere. No storefront, pickup, or trip required.',
    category: 'Art & design',
    cover: '/img/directory/art-01.jpg',
    location: { kind: 'online', serviceAreas: 'anywhere', baseZip: MIAMI_ZIP },
  },
  {
    id: 'barrio-arts-lab',
    name: 'Barrio Arts Lab',
    tagline: 'Make something. Stay a while.',
    description:
      'A shared studio and gallery with open-studio afternoons, workshops, and a wall for your next idea.',
    category: 'Art & design',
    cover: '/img/directory/artisanal-01.jpg',
    location: {
      kind: 'storefront',
      city: 'Delray Beach',
      county: 'palm_beach',
      address: 'Sample public studio in Delray Beach',
      coordinates: { lat: 26.456, lng: -80.073 },
    },
  },
  {
    id: 'casa-digital',
    name: 'Casa Digital',
    tagline: 'Good design for local dreams.',
    description:
      'A remote design practice for neighbourhood businesses. We work with clients across Miami-Dade and Broward, entirely online.',
    category: 'Art & design',
    cover: '/img/directory/tech-01.jpg',
    location: {
      kind: 'online',
      serviceAreas: ['miami_dade', 'broward'],
      baseZip: MIAMI_ZIP,
    },
  },
  {
    id: 'marea-massage',
    name: 'Marea Mobile Massage',
    tagline: 'A moment of calm, brought to you.',
    description:
      'Appointment-based bodywork that travels to clients in Broward and Palm Beach County. Meeting details are arranged privately.',
    category: 'Wellness',
    cover: '/img/directory/wellness-02.jpg',
    location: {
      kind: 'mobile',
      serviceAreas: ['broward', 'palm_beach'],
    },
  },
  {
    id: 'little-sun-studio',
    name: 'Little Sun Studio',
    tagline: 'Objects with a little everyday joy.',
    description:
      'A new maker in the directory. They have not added their public location or service area yet.',
    category: 'Art & design',
    cover: '/img/directory/products-01.jpg',
    location: { kind: 'unprovided' },
  },
];

export function countyLabel(county: County): string {
  return COUNTIES.find((entry) => entry.id === county)!.label;
}

export function serviceAreasFor(listing: LocationListing): readonly County[] {
  const location = listing.location;
  if (location.kind === 'mobile') return location.serviceAreas;
  if (location.kind === 'online' && location.serviceAreas !== 'anywhere') {
    return location.serviceAreas;
  }
  return [];
}

export function getOnlineZipGroups(listings: readonly LocationListing[]) {
  return groupOnlineZipListings(listings, (listing) =>
    listing.location.kind === 'online' ? listing.location.baseZip : null
  );
}

export function mapCoordinatesFor(listing: LocationListing) {
  return listing.location.kind === 'storefront'
    ? listing.location.coordinates
    : null;
}

export function locationDescription(listing: LocationListing): string {
  const location = listing.location;
  if (location.kind === 'storefront') {
    return `${location.city}, ${countyLabel(location.county)}`;
  }
  if (location.kind === 'unprovided') return 'Location not provided';
  if (location.kind === 'online') {
    const service =
      location.serviceAreas === 'anywhere'
        ? 'Serves anywhere'
        : `Serves ${location.serviceAreas.map(countyLabel).join(' + ')}`;
    return `Base ZIP ${location.baseZip.postalCode} (${location.baseZip.city}) / ${service}`;
  }
  return `Serves ${serviceAreasFor(listing).map(countyLabel).join(' + ')}`;
}

export function filterListings({
  query = '',
  area = 'all',
  kind = 'all',
}: {
  query?: string;
  area?: AreaFilter;
  kind?: LocationFilter;
} = {}): LocationListing[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return LISTINGS.filter((listing) => {
    if (kind !== 'all' && listing.location.kind !== kind) return false;
    if (area !== 'all') {
      const location = listing.location;
      const matchesArea =
        (location.kind === 'storefront' && location.county === area) ||
        (location.kind === 'online' && location.serviceAreas === 'anywhere') ||
        serviceAreasFor(listing).includes(area);
      if (!matchesArea) return false;
    }
    const text = [
      listing.name,
      listing.tagline,
      listing.description,
      listing.category,
      LOCATION_LABEL[listing.location.kind],
      locationDescription(listing),
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
