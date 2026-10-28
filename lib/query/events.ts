import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

/**
 * Upcoming public events, for the feed's "Happening this week" module.
 *
 * Backed by GET /api/events, which calls getUpcomingEvents: published, public,
 * starting in the future, soonest first. The feed wants a handful of cards
 * rather than a page of results, so the default limit here is far below the
 * endpoint's own default of 20.
 */

export interface UpcomingEventVenue {
  name: string | null;
  city: string | null;
  state: string | null;
  slug: string | null;
  lat?: string | null;
  lng?: string | null;
}

export interface UpcomingEvent {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  coverImageAlt: string | null;
  /** ISO 8601 — it has crossed a JSON boundary, so it is no longer a Date. */
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  /**
   * Verified 'going' RSVPs only, maintained transactionally by the rsvp
   * routes. This is a real count, not an estimate, so it can be shown as one.
   */
  attendeeCount: number;
  venue: UpcomingEventVenue | null;
}

export interface UpcomingEventsResponse {
  success: boolean;
  data: {
    events: UpcomingEvent[];
    hasMore: boolean;
  };
}

export const eventsQueryKey = 'events';

async function fetchUpcomingEvents(
  limit: number
): Promise<UpcomingEventsResponse | null> {
  try {
    const response = await axios.get<UpcomingEventsResponse>(
      `/api/events?limit=${limit}`,
      { headers: { Accept: 'application/json' } }
    );
    return response.data;
  } catch (error) {
    console.error('Upcoming events fetch failed:', error);
    /* Null rather than a rejected query: the module hides itself when it has
       nothing, so a failure degrades to an absent section instead of an error
       state sitting in the middle of somebody's timeline. */
    return null;
  }
}

/** Soonest upcoming public events. */
export const useUpcomingEvents = (limit: number = 4) => {
  return useQuery<UpcomingEventsResponse | null, Error>({
    queryKey: [eventsQueryKey, 'upcoming', limit],
    queryFn: () => fetchUpcomingEvents(limit),
  });
};
