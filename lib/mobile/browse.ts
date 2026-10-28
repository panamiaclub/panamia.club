import type { SearchResultsInterface } from '@/lib/query/directory';
import type { UpcomingEvent } from '@/lib/query/events';
import type {
  CalendarEntry,
  GroupSearchSummary,
  MyGroupSummary,
} from '@/lib/query/social';
import type { DiscoveryEvent } from '@/lib/events/lanes';
import { formatWhen } from '@/lib/events/lanes';
import { CATEGORY_LABEL, resultHref } from '@/app/directory/search/_lib/format';

export interface NativeEvent extends UpcomingEvent {
  mode: 'online' | 'offline' | 'hybrid';
}

export interface NativeResult {
  id: string;
  kind: 'directory' | 'event' | 'group';
  title: string;
  href: string;
  image: string | null;
  description: string;
  location: string;
  meta: string;
  coords: { lat: number; lng: number } | null;
  slug?: string;
  when?: string;
  annotation?: string;
}

export function nativeCoords(
  latitude: unknown,
  longitude: unknown
): NativeResult['coords'] {
  const numberOf = (value: unknown) =>
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  const lat = numberOf(latitude);
  const lng = numberOf(longitude);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

export function nativeBusiness(result: SearchResultsInterface): NativeResult {
  return {
    id: result._id,
    kind: 'directory',
    title: result.name,
    href: resultHref(result),
    image: result.coverImage || result.images?.primaryCDN || null,
    description: result.five_words || result.details || '',
    location: result.online_only
      ? 'Online'
      : result.primary_address?.city || 'Location not listed',
    meta: (result.categories ?? [])
      .map((category) => CATEGORY_LABEL[category] ?? category)
      .join(' / '),
    coords: result.online_only
      ? null
      : nativeCoords(
          result.geo?.coordinates?.[1],
          result.geo?.coordinates?.[0]
        ),
    annotation: result.certified ? 'Pana certified' : undefined,
  };
}

export function nativeEvent(event: NativeEvent): NativeResult {
  return {
    id: event.id,
    kind: 'event',
    slug: event.slug,
    title: event.title,
    href: `/e/${encodeURIComponent(event.slug)}`,
    image: event.coverImage,
    description: event.description ?? '',
    location:
      event.mode === 'online'
        ? 'Online'
        : [event.venue?.name, event.venue?.city].filter(Boolean).join(' / ') ||
          'Location to be announced',
    meta: `${event.attendeeCount} going`,
    when: formatWhen(new Date(event.startsAt), event.timezone),
    coords:
      event.mode === 'online'
        ? null
        : nativeCoords(event.venue?.lat, event.venue?.lng),
  };
}

export function nativeDiscoveryEvent(event: DiscoveryEvent): NativeResult {
  return {
    id: event.id,
    kind: 'event',
    slug: event.slug,
    title: event.title,
    href: `/e/${encodeURIComponent(event.slug)}`,
    image: event.cover,
    description: event.blurb,
    location: event.where,
    when: event.when,
    meta: `${event.going} going`,
    coords: null,
  };
}

export function nativeCalendarEvent(event: CalendarEntry): NativeResult {
  return {
    id: event.id,
    kind: 'event',
    slug: event.slug,
    title: event.title,
    href: `/e/${encodeURIComponent(event.slug)}`,
    image: event.coverImage,
    description: event.because ?? '',
    location:
      event.mode === 'online'
        ? 'Online'
        : [event.venueName, event.venueCity].filter(Boolean).join(' / ') ||
          'Location to be announced',
    when: formatWhen(new Date(event.startsAt), event.timezone),
    meta: `${event.attendeeCount} going`,
    annotation:
      event.reason === 'hosting'
        ? 'Hosting'
        : event.rsvp === 'going'
          ? 'Going'
          : event.rsvp === 'maybe'
            ? 'Interested'
            : undefined,
    coords: null,
  };
}

export function nativeGroup(group: GroupSearchSummary): NativeResult {
  return {
    id: group.id,
    kind: 'group',
    title: group.name || group.handle,
    href: `/g/${encodeURIComponent(group.handle)}`,
    image: group.headerUrl || group.iconUrl,
    description: group.summary ?? '',
    location:
      group.visibility === 'private'
        ? 'Private group'
        : group.joinPolicy === 'open'
          ? 'Open to join'
          : group.joinPolicy === 'request'
            ? 'Request to join'
            : 'Invite only',
    meta: `${group.memberCount} members`,
    annotation:
      group.visibility === 'public' && group.postsThisWeek > 0
        ? `${group.postsThisWeek} posts this week`
        : undefined,
    coords: null,
  };
}

export function nativeJoinedGroup(group: MyGroupSummary): NativeResult {
  return {
    id: group.id,
    kind: 'group',
    title: group.name,
    href: `/g/${encodeURIComponent(group.handle)}`,
    image: group.iconUrl,
    description: group.summary ?? '',
    location: group.visibility === 'private' ? 'Private group' : 'Public group',
    meta: `${group.memberCount} members`,
    annotation:
      group.postsThisWeek > 0
        ? `${group.postsThisWeek} posts this week`
        : 'No posts this week',
    coords: null,
  };
}

export function nativeMapPins(items: NativeResult[]) {
  const pins = new Map<
    string,
    {
      id: string;
      coords: NonNullable<NativeResult['coords']>;
      items: NativeResult[];
    }
  >();
  for (const item of items) {
    if (!item.coords) continue;
    const id = `${item.coords.lat},${item.coords.lng}`;
    const pin = pins.get(id);
    if (pin) pin.items.push(item);
    else pins.set(id, { id, coords: item.coords, items: [item] });
  }
  return [...pins.values()];
}
