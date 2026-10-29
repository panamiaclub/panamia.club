/**
 * Social Query Hooks
 *
 * React Query hooks for social timeline features.
 * @see docs/SOCIAL-ROADMAP.md Phase 4
 */

import axios from 'axios';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { SocialStatusDisplay, SocialActorDisplay } from '@/lib/interfaces';
import type {
  SocialActor,
  SocialGroup,
  SocialGroupJoinPolicy,
  SocialGroupRole,
  SocialGroupVisibility,
} from '@/lib/schema';
/* Type-only, so this is erased at compile time and the server-only GIPHY
   module never reaches the client bundle. */
import type { GifResult } from '@/lib/gifs/giphy';

export const socialQueryKey = ['social'];

// ============================================================================
// Types
// ============================================================================

interface TimelineResponse {
  statuses: SocialStatusDisplay[];
  nextCursor: string | null;
}

interface ActorResponse {
  actor: SocialActorDisplay;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isSelf: boolean;
  /**
   * The viewer's own outgoing block/mute rows only. There is deliberately no
   * flag for "this actor blocked you" — rendering one would make the block
   * detectable, which is the one thing it has to avoid.
   */
  isBlocked?: boolean;
  isMuted?: boolean;
}

interface MyActorResponse {
  actor: SocialActor | null;
  eligible: boolean;
  reason?: string;
  screenname?: string | null;
}

interface ActorsResponse {
  actors: SocialActor[];
  nextCursor: string | null;
}

interface RepliesResponse {
  replies: SocialStatusDisplay[];
  nextCursor: string | null;
}

/** Envelope every /api/social route responds with. */
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Request Helper
// ============================================================================

/**
 * Wraps a failed request in an Error carrying the API's own message when it
 * sent one, so TanStack Query surfaces something actionable via `error`.
 */
function toSocialError(url: string, error: unknown, status?: number): Error {
  const apiMessage = axios.isAxiosError(error)
    ? (error.response?.data as ApiEnvelope<unknown> | undefined)?.error
    : undefined;

  const detail =
    apiMessage ||
    (error instanceof Error ? error.message : String(error)) ||
    'Request failed';

  const wrapped = new Error(
    `${url} failed (${status ?? 'network error'}): ${detail}`,
    { cause: error }
  );
  wrapped.name = 'SocialApiError';
  return wrapped;
}

// ============================================================================
// Fetch Functions
// ============================================================================

/**
 * Fetches a social API envelope and unwraps its `data`.
 *
 * The distinction that matters here is absence versus failure. A 401, 403, or
 * 404 is a definitive answer — there is no actor, or none this viewer may see —
 * so it resolves to null and the caller renders an empty state. Anything else
 * is a genuine failure and throws, so React Query reports `isError` and retries
 * instead of pretending the data is simply empty.
 *
 * Returning `undefined` is not an option. React Query rejects it outright
 * ("Query data cannot be undefined") and the query never settles, so the caller
 * spins forever. That is exactly what stranded personal profiles belonging to
 * accounts that never enrolled in Pana Social, whose actor legitimately 404s.
 *
 * Genuine failures are wrapped by `toSocialError` so the thrown value is a
 * named `SocialApiError` carrying the API's own message. That is the half of
 * #165 worth keeping: its `getSocial` helper was dropped in the merge because
 * it returned a non-nullable `T` via per-status fallbacks, which contradicts
 * the `T | null` contract every caller here and downstream is written against.
 */
async function getSocialData<T>(url: string): Promise<T | null> {
  try {
    const response = await axios.get(url);

    if (response.data?.success) {
      return (response.data.data ?? null) as T | null;
    }

    throw new Error(response.data?.error ?? `Request to ${url} failed`);
  } catch (error) {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;

    if (status === 401 || status === 403 || status === 404) {
      return null;
    }

    throw toSocialError(url, error, status);
  }
}

async function fetchMyActor(): Promise<MyActorResponse | null> {
  return getSocialData('/api/social/actors/me');
}

async function fetchTimeline(
  cursor?: string,
  limit: number = 20
): Promise<TimelineResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());

  return getSocialData(`/api/social/timeline?${params.toString()}`);
}

async function fetchPublicTimeline(
  cursor?: string,
  limit: number = 20
): Promise<TimelineResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());

  return getSocialData(`/api/social/statuses?${params.toString()}`);
}

async function fetchMyPosts(
  cursor?: string,
  limit: number = 20
): Promise<TimelineResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());

  return getSocialData(`/api/social/actors/me/posts?${params.toString()}`);
}

async function fetchActor(username: string): Promise<ActorResponse | null> {
  return getSocialData(`/api/social/actors/${encodeURIComponent(username)}`);
}

async function fetchActorPosts(
  username: string,
  cursor?: string,
  limit: number = 20,
  includeReplies: boolean = false
): Promise<TimelineResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());
  if (includeReplies) params.set('replies', 'true');

  return getSocialData(
    `/api/social/actors/${encodeURIComponent(username)}/posts?${params.toString()}`
  );
}

async function fetchStatus(
  statusId: string
): Promise<{ status: SocialStatusDisplay } | null> {
  return getSocialData(`/api/social/statuses/${statusId}`);
}

async function fetchStatusReplies(
  statusId: string,
  cursor?: string,
  limit: number = 20
): Promise<RepliesResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());

  return getSocialData(
    `/api/social/statuses/${statusId}/replies?${params.toString()}`
  );
}

async function fetchFollows(
  type: 'following' | 'followers',
  cursor?: string,
  limit: number = 20
): Promise<ActorsResponse | null> {
  const params = new URLSearchParams();
  params.set('type', type);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());

  return getSocialData(`/api/social/follows?${params.toString()}`);
}

async function fetchInboxMessages(
  cursor?: string,
  limit: number = 20
): Promise<TimelineResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());

  return getSocialData(`/api/social/messages/inbox?${params.toString()}`);
}

async function fetchSentMessages(
  cursor?: string,
  limit: number = 20
): Promise<TimelineResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit.toString());

  return getSocialData(`/api/social/messages/sent?${params.toString()}`);
}

// ============================================================================
// Query Hooks
// ============================================================================

export const useMyActor = () => {
  return useQuery<MyActorResponse | null, Error>({
    queryKey: [socialQueryKey, 'me'],
    queryFn: () => fetchMyActor(),
  });
};

export const useTimeline = (cursor?: string, limit: number = 20) => {
  return useQuery<TimelineResponse | null, Error>({
    queryKey: [socialQueryKey, 'timeline', 'home', cursor, limit],
    queryFn: () => fetchTimeline(cursor, limit),
  });
};

export const usePublicTimeline = (cursor?: string, limit: number = 20) => {
  return useQuery<TimelineResponse | null, Error>({
    queryKey: [socialQueryKey, 'timeline', 'public', cursor, limit],
    queryFn: () => fetchPublicTimeline(cursor, limit),
  });
};

export const useMyPosts = (cursor?: string, limit: number = 20) => {
  return useQuery<TimelineResponse | null, Error>({
    queryKey: [socialQueryKey, 'me', 'posts', cursor, limit],
    queryFn: () => fetchMyPosts(cursor, limit),
  });
};

/**
 * `enabled` lets a caller hold the request back until it knows the answer can
 * matter. The directory renders one of these per result card, so fetching an
 * actor the viewer could never follow costs a round trip per card.
 */
export const useActor = (username: string, enabled: boolean = true) => {
  return useQuery<ActorResponse | null, Error>({
    queryKey: [socialQueryKey, 'actor', username],
    queryFn: () => fetchActor(username),
    enabled: !!username && enabled,
  });
};

export const useActorPosts = (
  username: string,
  cursor?: string,
  limit: number = 20,
  includeReplies: boolean = false
) => {
  return useQuery<TimelineResponse | null, Error>({
    queryKey: [
      socialQueryKey,
      'actor',
      username,
      'posts',
      cursor,
      limit,
      includeReplies,
    ],
    queryFn: () => fetchActorPosts(username, cursor, limit, includeReplies),
    enabled: !!username,
  });
};

export interface PanaSummary {
  id: string;
  username: string;
  domain: string;
  name: string | null;
  summary: string | null;
  iconUrl: string | null;
}

export interface PanasResponse {
  /* Zero for everyone but the owner. Both halves are owner-only — see the
     docblock on app/api/social/actors/[username]/panas/route.ts. */
  count: number;
  canSeeList: boolean;
  actors: PanaSummary[];
  /* The Panas the viewer and this person share. Viewer-scoped, so unlike the
     two fields above it is readable on someone else's profile: everyone in it
     is already a Pana of the viewer. Empty for the owner and when signed out.
     `count` is the whole overlap, `actors` only the first page of faces. */
  mutualPanas: { count: number; actors: PanaSummary[] };
}

export interface ProfileGroupSummary {
  id: string;
  handle: string;
  name: string;
  summary: string | null;
  iconUrl: string | null;
  memberCount: number;
}

export interface ProfileGroupsResponse {
  groups: ProfileGroupSummary[];
}

async function fetchPanas(username: string): Promise<PanasResponse | null> {
  return getSocialData(`/api/social/actors/${username}/panas`);
}

async function fetchProfileGroups(
  username: string
): Promise<ProfileGroupsResponse | null> {
  return getSocialData(`/api/social/actors/${username}/groups`);
}

/**
 * Panas (mutual follows) for a handle.
 *
 * Count and list are owner-only, `mutualPanas` is viewer-scoped — all three
 * gated server-side. The key is the handle alone while the response varies by
 * who is asking, so switching identity clears this cache rather than keying
 * every social query on the active profile. See identity-provider.tsx.
 */
export const usePanas = (username: string) => {
  return useQuery<PanasResponse | null, Error>({
    queryKey: [socialQueryKey, 'actor', username, 'panas'],
    queryFn: () => fetchPanas(username),
    enabled: !!username,
  });
};

/** Discoverable groups for a handle. */
export const useProfileGroups = (username: string) => {
  return useQuery<ProfileGroupsResponse | null, Error>({
    queryKey: [socialQueryKey, 'actor', username, 'groups'],
    queryFn: () => fetchProfileGroups(username),
    enabled: !!username,
  });
};

/**
 * One event as a profile lists it.
 *
 * `role` is the difference between "they are putting this on" and "they said
 * they would come", which the card needs to label and the viewer needs to read
 * differently. Only the owner ever receives `going` rows — see the route.
 */
export interface ProfileEventSummary {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  role: 'hosting' | 'going';
  online: boolean;
  visibility: string;
  attendeeCount: number;
  coverImage: string | null;
  coverImageAlt: string | null;
  venue: { name: string; city: string; state: string } | null;
}

export interface ProfileEventsResponse {
  /** False for every viewer but the owner, so an empty list stays readable. */
  canSeeAttending: boolean;
  events: ProfileEventSummary[];
}

/** Events a handle is hosting, plus their own RSVPs when they are the viewer. */
export const useProfileEvents = (username: string) => {
  return useQuery<ProfileEventsResponse | null, Error>({
    queryKey: [socialQueryKey, 'actor', username, 'events'],
    queryFn: () =>
      getSocialData(
        `/api/social/actors/${encodeURIComponent(username)}/events`
      ),
    enabled: !!username,
  });
};

/**
 * One entry on a recommendation list.
 *
 * `isUnavailable` is the tombstone flag, and it is the field that decides how
 * the row renders rather than a detail beside it. A business leaving the
 * directory must not delete a sentence somebody else wrote, so the note and
 * its position survive while the link does not — see the nullable
 * `profileId` reasoning in lib/schema/index.ts.
 */
export interface RecommendationListItemSummary {
  id: string;
  position: number;
  note: string | null;
  profileId: string | null;
  profileScreenname: string | null;
  /** Live name while the listing exists, the add-time snapshot afterwards. */
  profileName: string | null;
  profileNameAtAdd: string | null;
  profileImage: string | null;
  profileCategory: string | null;
  isUnavailable: boolean;
  createdAt: string;
}

export interface RecommendationListSummary {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  visibility: 'private' | 'unlisted' | 'public';
  /** Authoritative total; `items` may be shorter than this. */
  itemCount: number;
  uri: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  items: RecommendationListItemSummary[];
}

export interface ProfileListsResponse {
  handle: string;
  lists: RecommendationListSummary[];
}

/**
 * A pana's visible recommendation lists.
 *
 * Note the path: `profiles/[handle]`, not the `actors/[username]` the rest of
 * this file uses. Lists are owned by a user rather than by a federation actor,
 * so the route resolves a directory handle — see the endpoint's docblock.
 *
 * Visibility is settled server-side against the session. Unlisted lists never
 * appear here by design, and private ones only when you are the owner, so the
 * client never has to decide what it is allowed to draw.
 */
export const useProfileLists = (handle: string) => {
  return useQuery<ProfileListsResponse | null, Error>({
    queryKey: [socialQueryKey, 'profile', handle, 'lists'],
    queryFn: () =>
      getSocialData(`/api/social/profiles/${encodeURIComponent(handle)}/lists`),
    enabled: !!handle,
  });
};

/**
 * One group as discovery returns it.
 *
 * Identity only. The search endpoint never returns posts, roster or events,
 * which is what lets private groups appear in results at all — see
 * GROUP_COLUMNS in lib/server/group-search.ts for that reasoning.
 */
export interface GroupSearchSummary {
  id: string;
  actorId: string;
  handle: string;
  domain: string;
  name: string | null;
  summary: string | null;
  iconUrl: string | null;
  /** Cover photo, or null. Actor identity, public for private groups too. */
  headerUrl: string | null;
  topics: Record<string, boolean>;
  visibility: SocialGroupVisibility;
  joinPolicy: SocialGroupJoinPolicy;
  memberCount: number;
  /**
   * A handful of member avatar URLs for the card's face pile, newest-ranked
   * first. Always empty for a private group: avatar URLs are roster data, and
   * the roster of a private group is not public. The server decides this in
   * SQL, so a client never has to.
   */
  faces: string[];
  /**
   * Posts in the last seven days. Always 0 for a private group, for the same
   * reason faces is empty -- what a private group is discussing is the thing
   * the setting protects. A card must not render "0 posts this week" for one;
   * see activityLabel, which returns null rather than a number.
   */
  postsThisWeek: number;
  /** Next published public event, or null. Always null for a private group. */
  nextEvent: {
    slug: string;
    title: string;
    startsAt: string;
    /** The event's own timezone. A Miami event is on the day Miami says. */
    timezone: string;
  } | null;
  /** Total upcoming events, so a card can say "+2 more". 0 when private. */
  upcomingEventCount: number;
}

export interface GroupSearchResponse {
  groups: GroupSearchSummary[];
  /** Echoed back so a stale render can tell which term it is showing. */
  query: string;
}

/**
 * How a browse list is ordered. Ignored by the server once there is a term,
 * where relevance decides instead.
 */
export type GroupSort = 'active' | 'members' | 'new';

export const GROUP_SORTS: readonly { id: GroupSort; label: string }[] = [
  { id: 'active', label: 'Most active' },
  { id: 'members', label: 'Biggest' },
  { id: 'new', label: 'Newest' },
];

/**
 * Reads a sort out of a URL, falling back rather than throwing.
 *
 * Defaults to 'active', not 'members'. Sorted by size, new groups are
 * invisible forever, and a browse page that only shows the biggest groups
 * cannot grow the next one. The server's own default is 'members' because an
 * API with no opinion should be stable; a browse page has an opinion.
 */
export function parseGroupSortId(value: string | null | undefined): GroupSort {
  const match = GROUP_SORTS.find((option) => option.id === value);
  return match ? match.id : 'active';
}

async function fetchGroupSearch(
  term: string,
  sort: GroupSort,
  topic: string | null
): Promise<GroupSearchResponse | null> {
  const params = new URLSearchParams({
    q: term,
    limit: String(GROUP_SEARCH_LIMIT),
    sort,
  });
  if (topic) params.set('topic', topic);
  return getSocialData(`/api/social/groups?${params.toString()}`);
}

/** How many groups a search page asks for. Server clamps at 50 regardless. */
const GROUP_SEARCH_LIMIT = 24;

/**
 * Group discovery.
 *
 * An empty term is not an error and is not disabled: the endpoint browses the
 * liveliest groups instead, which is what makes the Groups tab worth opening
 * before anybody has typed anything.
 *
 * `sort` and `topic` are in the query key rather than applied client-side,
 * because the server only returns one page: re-ordering or filtering 24 rows
 * locally would promise a "biggest first" list and deliver the biggest of an
 * arbitrary 24.
 */
export const useGroupSearch = (
  term: string,
  sort: GroupSort = 'members',
  topic: string | null = null
) => {
  return useQuery<GroupSearchResponse | null, Error>({
    queryKey: [socialQueryKey, 'groups', 'search', term, sort, topic ?? ''],
    queryFn: () => fetchGroupSearch(term, sort, topic),
  });
};

/** One topic, with how many groups carry it. */
export interface GroupTopicFacet {
  topic: string;
  count: number;
}

/**
 * The topic chips on the landing and discover pages.
 *
 * Derived from the data rather than a fixed list, because the create form
 * takes free text. Counts include private groups, matching what the search
 * endpoint returns, so a chip can never advertise a number the filter behind
 * it does not produce.
 */
export const useGroupTopics = () => {
  return useQuery<{ topics: GroupTopicFacet[] } | null, Error>({
    queryKey: [socialQueryKey, 'groups', 'topics'],
    queryFn: () => getSocialData('/api/social/groups/topics'),
    // Topics change when a group is created or edited, not between renders.
    staleTime: 5 * 60 * 1000,
  });
};

/** An upcoming event, with the group hosting it named on it. */
export interface UpcomingGroupEvent {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  timezone: string;
  mode: string;
  attendeeCount: number;
  groupHandle: string;
  groupName: string | null;
  venue: { name: string; city: string; state: string } | null;
}

/**
 * What groups have coming up, across all of them. Public groups only -- a
 * private group's calendar is content, not identity.
 */
export const useUpcomingGroupEvents = () => {
  return useQuery<{ events: UpcomingGroupEvent[] } | null, Error>({
    queryKey: [socialQueryKey, 'groups', 'upcoming-events'],
    queryFn: () => getSocialData('/api/social/groups/events'),
    staleTime: 5 * 60 * 1000,
  });
};

/** What the viewer is allowed to do with a group, decided by the server. */
export interface GroupViewer {
  canRead: boolean;
  canPost: boolean;
  isMember: boolean;
  isPending: boolean;
  role: string | null;
  /** Null when signed out -- "we do not know you yet", not "you may not". */
  canJoin: boolean | null;
}

export interface GroupDetailResponse {
  group: SocialGroup;
  actor: SocialActor;
  viewer: GroupViewer;
}

async function fetchGroup(handle: string): Promise<GroupDetailResponse | null> {
  return getSocialData(`/api/social/groups/${encodeURIComponent(handle)}`);
}

/**
 * One group, plus what the viewer may do with it.
 *
 * Returns null for a missing group rather than throwing, because
 * `getSocialData` folds 404 into null -- so a caller checks `data` and not
 * `isError` to tell "no such group" from "the request failed".
 */
export const useGroup = (handle: string) => {
  return useQuery<GroupDetailResponse | null, Error>({
    queryKey: [socialQueryKey, 'group', handle],
    queryFn: () => fetchGroup(handle),
    enabled: Boolean(handle),
  });
};

/**
 * Join a group, or ask to.
 *
 * No optimistic update, unlike `useFollowActor`. Following always lands the
 * same way, so guessing the result is safe; joining resolves to either a
 * membership or a pending request depending on the group's join policy, and
 * that is the server's call. Flashing "Joined" before a request-to-join group
 * answers "Requested" is a worse experience than waiting for the truth.
 */
export const useJoinGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) =>
      axios.post(`/api/social/groups/${encodeURIComponent(handle)}/join`),
    onSettled: (_data, _error, handle) => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'group', handle],
      });
      // The member count moved, so any list showing this group is now stale.
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'groups'],
      });
    },
  });
};

/** Leave a group, or withdraw a pending request. */
export const useLeaveGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) =>
      axios.delete(`/api/social/groups/${encodeURIComponent(handle)}/join`),
    onSettled: (_data, _error, handle) => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'group', handle],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'groups'],
      });
    },
  });
};

/**
 * One of the signed-in member's own groups.
 *
 * Carries `visibility` and `role`, which ProfileGroupSummary deliberately
 * does not — that list renders on pages strangers read, so admitting a group
 * is private would disclose both the group and the membership.
 */
/**
 * The next thing one of your groups has on its calendar.
 *
 * Mirrors MyGroupNextEvent on the server. Two fields because the rail dates
 * a group rather than naming the event, and `timezone` because an event is
 * on the day its own city says it is.
 */
export interface MyGroupNextEvent {
  startsAt: string;
  timezone: string;
}

export interface MyGroupSummary {
  id: string;
  handle: string;
  name: string;
  summary: string | null;
  iconUrl: string | null;
  memberCount: number;
  visibility: SocialGroupVisibility;
  joinPolicy: SocialGroupJoinPolicy;
  role: SocialGroupRole;
  /**
   * Posts in the last seven days.
   *
   * Unlike the browse cards, this is NOT zeroed for private groups -- you
   * are a member of everything in this list, so your own group's pulse is
   * yours to see.
   */
  postsThisWeek: number;
  /** Next published public event, or null. */
  nextEvent: MyGroupNextEvent | null;
}

interface MyGroupsResponse {
  groups: MyGroupSummary[];
}

async function fetchMyGroups(): Promise<MyGroupsResponse | null> {
  return getSocialData('/api/social/actors/me/groups');
}

/**
 * Every group the signed-in member belongs to, private ones included.
 *
 * Not interchangeable with `useProfileGroups`. That one asks "what may a
 * stranger know about this person" and hides private groups; this one asks
 * "where do I belong", which is the member asking about themselves. Using the
 * public one for the member's own surfaces is why the feed rail used to
 * undercount anyone in a private group.
 */
export const useMyGroups = (options?: { enabled?: boolean }) => {
  return useQuery<MyGroupsResponse | null, Error>({
    queryKey: [socialQueryKey, 'me', 'groups'],
    queryFn: fetchMyGroups,
    // Callers that render for signed-out visitors too pass `enabled` rather
    // than calling conditionally, which hooks do not allow. The endpoint 401s
    // without a session and there is nothing to show for it.
    enabled: options?.enabled ?? true,
  });
};

/**
 * Whether the viewer may reply to a post, given the group it belongs to.
 *
 * A reply inherits its parent's group -- `createStatus` resolves it from the
 * parent rather than from the client -- and posting into a group requires
 * active membership. So a non-member replying to a group post gets a 403 on
 * submit. This is what lets the cards withhold the affordance instead,
 * because an error after typing is a worse answer than no box at all.
 *
 * Returns `false` while the group list is still loading. That direction is
 * deliberate: it briefly hides a control from a member, which self-corrects,
 * rather than briefly offering one to a non-member who could start typing and
 * watch the box disappear.
 *
 * Posts with no group are always replyable from here; the ordinary visibility
 * rules still apply and are enforced server-side.
 */
export const useCanReplyToGroup = (group?: { id: string } | null): boolean => {
  const { data } = useMyGroups();
  if (!group) return true;
  return (data?.groups ?? []).some((g) => g.id === group.id);
};

/** What the create form collects. Mirrors the POST body the route validates. */

export interface NewGroupInput {
  handle: string;
  name: string;
  summary?: string;
  topics?: string[];
  rules?: string[];
  visibility?: SocialGroupVisibility;
  joinPolicy?: SocialGroupJoinPolicy;
}

/** What POST /api/social/groups hands back on success. */
export interface CreatedGroup {
  group: SocialGroup;
  /** The group's actor. `username` is the handle it is reachable by. */
  actor: SocialActor;
}

/**
 * Create a group. The creator becomes its founding admin.
 *
 * Resolves to the group *and* its actor, because the handle a caller needs to
 * navigate to lives on the actor rather than the group row -- a group is an
 * actor, and `username` is where its address is kept.
 *
 * The server's rejection messages are unwrapped rather than collapsed into a
 * generic failure, because they are the ones worth reading: "that handle is
 * taken" and "handles may not contain spaces" are different problems with
 * different fixes, and a form that says only "could not create group" leaves
 * the member guessing which one they hit.
 */
export const useCreateGroup = () => {
  const queryClient = useQueryClient();
  return useMutation<CreatedGroup, Error, NewGroupInput>({
    mutationFn: async (input) => {
      try {
        const response = await axios.post<ApiEnvelope<CreatedGroup>>(
          '/api/social/groups',
          input
        );
        const created = response.data?.data;
        if (!created?.group) {
          throw new Error(response.data?.error ?? 'Group was not created');
        }
        return created;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = (error.response?.data as ApiEnvelope<never>)?.error;
          if (message) throw new Error(message);
        }
        throw error;
      }
    },
    onSuccess: () => {
      // The founder is a member the moment the group exists, so both the
      // menu and the rail count are stale.
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'me', 'groups'],
      });
      queryClient.invalidateQueries({ queryKey: [socialQueryKey, 'groups'] });
    },
  });
};

/**
 * What the edit form sends. Mirrors the PATCH body the route validates.
 *
 * Every field is optional and absence means "leave it alone", so a form that
 * renders a subset of the settings cannot reset the rest. `summary: null`
 * clears the description -- that is distinct from omitting it.
 *
 * No `handle`. A group's handle is its address and is set once, at creation.
 */
export interface UpdateGroupInput {
  name?: string;
  summary?: string | null;
  /** Replaces the whole list. `[]` clears it. */
  topics?: string[];
  /** Replaces the whole list. `[]` clears it. */
  rules?: string[];
  visibility?: SocialGroupVisibility;
  joinPolicy?: SocialGroupJoinPolicy;
}

/**
 * Edit a group. Admin only; the server is the one that enforces that.
 *
 * Takes the handle as part of the mutation input rather than closing over it,
 * so the settings page can hold one mutation object regardless of which group
 * it is looking at.
 *
 * Unwraps the server's rejection messages for the same reason `useCreateGroup`
 * does: "a rule must be no more than 280 characters" tells the member what to
 * fix, and "could not save" does not.
 */
export const useUpdateGroup = () => {
  const queryClient = useQueryClient();
  return useMutation<
    CreatedGroup,
    Error,
    { handle: string; input: UpdateGroupInput }
  >({
    mutationFn: async ({ handle, input }) => {
      try {
        const response = await axios.patch<ApiEnvelope<CreatedGroup>>(
          `/api/social/groups/${encodeURIComponent(handle)}`,
          input
        );
        const updated = response.data?.data;
        if (!updated?.group) {
          throw new Error(response.data?.error ?? 'Group was not saved');
        }
        return updated;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = (error.response?.data as ApiEnvelope<never>)?.error;
          if (message) throw new Error(message);
        }
        throw error;
      }
    },
    onSuccess: (_updated, { handle }) => {
      // The group page renders the name, description, topics and rules, and
      // the listings render the name -- all of them just went stale.
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'group', handle],
      });
      queryClient.invalidateQueries({ queryKey: [socialQueryKey, 'groups'] });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'me', 'groups'],
      });
    },
  });
};

/**
 * A group's events.
 *
 * Mirrors useGroupPosts, including its silence: a non-member of a private
 * group gets an empty list rather than an error, so render off
 * `viewer.canRead` from `useGroup` rather than off emptiness.
 */
export interface GroupEventSummary {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  visibility: string;
  mode: string;
  attendeeCount: number;
  venue: { name: string; city: string; state: string } | null;
}

export const useGroupEvents = (handle: string) => {
  return useQuery<{ events: GroupEventSummary[] } | null, Error>({
    queryKey: [socialQueryKey, 'group', handle, 'events'],
    queryFn: () =>
      getSocialData(`/api/social/groups/${encodeURIComponent(handle)}/events`),
    enabled: Boolean(handle),
  });
};

export interface GroupMemberSummary {
  id: string;
  actorId: string;
  handle: string;
  name: string;
  iconUrl: string | null;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: string | null;
}

/**
 * How many members the card on the group page shows before deferring to the
 * full roster page.
 *
 * Small on purpose. The card answers "do I know anyone here", which is a
 * question people ask before reading anything, and six faces answers it. A
 * full dozen turns the card into a wall that pushes the group's actual posts
 * off the screen, which is the one thing a group page exists to show.
 *
 * Lives here rather than beside the query that serves it because that module
 * imports `db`, and a client component importing it would pull the database
 * into the browser bundle.
 */
export const ROSTER_CARD_SIZE = 6;

/** One page of the dedicated members page. Must not exceed the server cap. */
export const ROSTER_PAGE_SIZE = 50;

export interface GroupRosterResponse {
  canRead: boolean;
  /**
   * Admins and moderators, returned even when canRead is false. See the route
   * for why that disclosure is deliberate.
   */
  leaders: GroupMemberSummary[];
  members: GroupMemberSummary[];
  /** Active members in the group, not in `members` -- it is ungated. */
  total: number;
  nextOffset: number | null;
  /**
   * The viewer's own role, or null if they are not an active member. This is
   * what decides whether the management controls render at all, and it comes
   * from the server rather than being inferred from the roster, because the
   * roster is paged -- a viewer who is an admin can easily be on page 3.
   */
  viewerRole?: 'admin' | 'moderator' | 'member' | null;
  /** The viewer's own membership row id, so the UI can skip self-eviction. */
  viewerMemberId?: string | null;
  /**
   * Sent to leaders only, and only on the first page -- they do not change as
   * you page through the roster. Undefined for everyone else, which is not
   * the same as empty: a member is not told the queue is empty, they are not
   * told there is a queue.
   */
  pending?: GroupMemberSummary[];
  banned?: GroupMemberSummary[];
}

/**
 * A group's roster.
 *
 * Unlike useGroupPosts, this one does NOT hide the difference between "empty"
 * and "not yours to see": it returns `canRead` explicitly. A roster is never
 * legitimately empty -- every group has at least a founder -- so an empty list
 * could only ever mean the gate closed, and making the client guess that from
 * emptiness would be inviting it to guess wrong in the other direction later.
 */
export const useGroupMembers = (
  handle: string,
  options: { limit?: number; offset?: number } = {}
) => {
  const { limit, offset } = options;
  return useQuery<GroupRosterResponse | null, Error>({
    queryKey: [socialQueryKey, 'group', handle, 'members', limit, offset],
    queryFn: () => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      if (offset !== undefined) params.set('offset', String(offset));
      const query = params.toString();
      return getSocialData(
        `/api/social/groups/${encodeURIComponent(handle)}/members${
          query ? `?${query}` : ''
        }`
      );
    },
    enabled: Boolean(handle),
  });
};

export type GroupModerationAction =
  'approve' | 'reject' | 'setRole' | 'remove' | 'ban' | 'unban';

/**
 * Act on one membership: approve, reject, promote, remove, ban or unban.
 *
 * One hook for all six rather than six hooks, because they share a URL, a
 * refetch and an error shape, and the only thing that differs is a word in
 * the body. The server decides whether the action is allowed; this does not
 * try to predict that, so there is no optimistic update -- a row that
 * disappears and comes back because the server said no is worse than a row
 * that takes a moment to go.
 */
export const useModerateMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      handle,
      memberId,
      action,
      role,
    }: {
      handle: string;
      memberId: string;
      action: GroupModerationAction;
      role?: 'admin' | 'moderator' | 'member';
    }) =>
      axios.patch(
        `/api/social/groups/${encodeURIComponent(
          handle
        )}/members/${encodeURIComponent(memberId)}`,
        { action, role }
      ),
    onSettled: (_data, _error, { handle }) => {
      // Every action moves either the roster, the count or both, and the
      // count is on the group itself -- so invalidate the whole subtree
      // rather than trying to name which of the two moved.
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'group', handle],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'groups'],
      });
    },
  });
};

async function fetchGroupPosts(
  handle: string,
  cursor?: string,
  limit: number = 20
): Promise<TimelineResponse | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return getSocialData(
    `/api/social/groups/${encodeURIComponent(handle)}/posts?${params}`
  );
}

/**
 * A group's posts.
 *
 * A non-member reading a private group gets an empty timeline rather than an
 * error, because that is the honest answer -- the server will not say whether
 * there was anything to miss. Callers should render the locked panel off
 * `viewer.canRead` from `useGroup` instead of inferring it from emptiness.
 */
export const useGroupPosts = (
  handle: string,
  cursor?: string,
  limit: number = 20
) => {
  return useQuery<TimelineResponse | null, Error>({
    queryKey: [socialQueryKey, 'group', handle, 'posts', cursor, limit],
    queryFn: () => fetchGroupPosts(handle, cursor, limit),
    enabled: Boolean(handle),
  });
};

/**
 * What a group post accepts.
 *
 * Deliberately not `useCreatePost`'s input: there is no `recipientActorIds`
 * and no `'direct'` visibility, because a direct message that is also a group
 * post has no coherent audience and `createStatus` rejects the combination
 * outright. Leaving the fields off means the composer cannot offer a
 * combination the server will refuse.
 */
export interface GroupPostInput {
  handle: string;
  content: string;
  contentWarning?: string;
  inReplyTo?: string;
  visibility?: 'public' | 'unlisted' | 'private';
  attachments?: Array<{
    type: string;
    mediaType: string;
    url: string;
    name: string;
  }>;
  location?: {
    type?: 'Place';
    latitude?: number;
    longitude?: number;
    name?: string;
    precision?: 'precise' | 'general';
  };
  ccLicense?: 'cc-by-4' | 'cc-by-sa-4' | 'cc-0';
}

/**
 * Post into a group.
 *
 * Separate from `useCreatePost` because the endpoint is different: the group
 * route re-checks membership and owns the addressing of a private group's
 * posts, neither of which the generic status endpoint can do from a groupId
 * it was handed by a client.
 *
 * This used to send `{ content }` and nothing else, so a content warning or an
 * attachment chosen in a group composer was dropped on the floor without an
 * error. The route accepted those fields the whole time; only the hook was
 * narrow.
 */
export const useCreateGroupPost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ handle, ...body }: GroupPostInput) =>
      axios.post(
        `/api/social/groups/${encodeURIComponent(handle)}/posts`,
        body
      ),
    onSettled: (_data, _error, { handle }) => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'group', handle],
      });
      // The post also belongs in the author's own feed and profile.
      queryClient.invalidateQueries({ queryKey: [socialQueryKey, 'timeline'] });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'me', 'posts'],
      });
    },
  });
};

export interface SuggestedPana extends PanaSummary {
  /**
   * Panas shared with the viewer. Zero means the server had no graph to walk
   * and fell back to recently joined accounts, which is the normal state for a
   * new Pana and needs different copy rather than a hidden card.
   */
  mutualCount: number;
  /**
   * Whether this person already follows the viewer. The server only excludes
   * people the viewer follows, so this card can be one tap from a Pana -- which
   * is worth saying ahead of any overlap count. See docs/SOCIAL-GRAPH.md.
   */
  followsYou: boolean;
}

export interface SuggestionsResponse {
  actors: SuggestedPana[];
}

async function fetchSuggestedPanas(): Promise<SuggestionsResponse | null> {
  return getSocialData('/api/social/suggestions');
}

/**
 * Panas you might know. Always about the signed-in viewer, so it takes no
 * handle -- the server reads the actor from the session.
 *
 * Held stale for five minutes because this renders inline in the timeline: a
 * recommendation set that reshuffles every time the feed refetches makes the
 * page feel unstable and moves the Follow button out from under a thumb.
 */
export const useSuggestedPanas = () => {
  return useQuery<SuggestionsResponse | null, Error>({
    queryKey: [socialQueryKey, 'suggestions'],
    queryFn: fetchSuggestedPanas,
    staleTime: 5 * 60 * 1000,
  });
};

export const useStatus = (statusId: string) => {
  return useQuery<{ status: SocialStatusDisplay } | null, Error>({
    queryKey: [socialQueryKey, 'status', statusId],
    queryFn: () => fetchStatus(statusId),
    enabled: !!statusId,
  });
};

export const useStatusReplies = (
  statusId: string,
  cursor?: string,
  limit: number = 20
) => {
  return useQuery<RepliesResponse | null, Error>({
    queryKey: [socialQueryKey, 'status', statusId, 'replies', cursor, limit],
    queryFn: () => fetchStatusReplies(statusId, cursor, limit),
    enabled: !!statusId,
  });
};

export const useInfiniteStatusReplies = (
  statusId: string,
  limit = 20,
  {
    initialLimit = limit,
    enabled = true,
  }: { initialLimit?: number; enabled?: boolean } = {}
) =>
  useInfiniteQuery({
    queryKey: [
      socialQueryKey,
      'status',
      statusId,
      'replies',
      'infinite',
      { limit, initialLimit },
    ],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      fetchStatusReplies(statusId, pageParam, pageParam ? limit : initialLimit),
    getNextPageParam: (page) => page?.nextCursor ?? undefined,
    enabled: Boolean(statusId) && enabled,
  });

// `enabled` lets callers skip the request for signed-out viewers: this endpoint
// is session-scoped and answers 401 with no session, so firing it anonymously
// only produces console noise.
export const useFollows = (
  type: 'following' | 'followers',
  cursor?: string,
  limit: number = 20,
  enabled: boolean = true
) => {
  return useQuery<ActorsResponse | null, Error>({
    queryKey: [socialQueryKey, 'follows', type, cursor, limit],
    queryFn: () => fetchFollows(type, cursor, limit),
    enabled,
  });
};

export const useInboxMessages = (cursor?: string, limit: number = 20) => {
  return useQuery<TimelineResponse | null, Error>({
    queryKey: [socialQueryKey, 'messages', 'inbox', cursor, limit],
    queryFn: () => fetchInboxMessages(cursor, limit),
  });
};

export const useSentMessages = (cursor?: string, limit: number = 20) => {
  return useQuery<TimelineResponse | null, Error>({
    queryKey: [socialQueryKey, 'messages', 'sent', cursor, limit],
    queryFn: () => fetchSentMessages(cursor, limit),
  });
};

/**
 * One person waiting in the Requests folder, with what they sent.
 *
 * `messages` can be empty. Direct statuses expire while the request row
 * persists, so a sender may still be waiting with nothing left to read — the
 * UI has to render that as an aged-out request, not as a spinner that never
 * resolves.
 */
export interface DmRequestEntry {
  sender: {
    id: string;
    username: string;
    domain: string;
    name: string | null;
    iconUrl: string | null;
  };
  requestedAt: string;
  messages: SocialStatusDisplay[];
}

/** The Requests folder. See docs/SOCIAL-GRAPH.md section C1. */
export const useDmRequests = (enabled: boolean = true) =>
  useQuery({
    queryKey: [socialQueryKey, 'dm-requests'],
    queryFn: async (): Promise<DmRequestEntry[]> => {
      const { data } = await axios.get('/api/social/dm-requests');
      return data?.data?.requests ?? [];
    },
    enabled,
  });

/**
 * Both triage actions move a message between folders, so both have to drop the
 * message caches as well as the request list. Accepting moves it into the
 * inbox; deleting withdraws it from the recipient entirely. Refreshing only
 * the Requests list would leave the inbox showing yesterday's contents.
 */
function invalidateAfterRequestTriage(
  queryClient: ReturnType<typeof useQueryClient>
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: [socialQueryKey, 'dm-requests'],
    }),
    queryClient.invalidateQueries({ queryKey: [socialQueryKey, 'messages'] }),
  ]);
}

export const useAcceptDmRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (senderActorId: string) =>
      axios.patch('/api/social/dm-requests', { senderActorId }),
    onSettled: () => invalidateAfterRequestTriage(queryClient),
  });
};

export const useDeleteDmRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // axios sends a DELETE body only under `data`, not as the second argument.
    mutationFn: (senderActorId: string) =>
      axios.delete('/api/social/dm-requests', { data: { senderActorId } }),
    onSettled: () => invalidateAfterRequestTriage(queryClient),
  });
};

// ============================================================================
// DM conversations
//
// The chat view's data layer. These sit under the 'messages' key prefix on
// purpose: request triage already invalidates that whole subtree, so accepting
// a request refreshes the conversation list without the triage helper needing
// to learn about a third folder.
// ============================================================================

/** One person the viewer has a thread with. */
export interface ConversationSummary {
  counterparty: SocialActorDisplay;
  lastMessage: SocialStatusDisplay;
}

export interface ConversationListResult {
  conversations: ConversationSummary[];
  /** Null before the viewer has a social actor, when the list is empty anyway. */
  viewerActorId: string | null;
  /** Which domain counts as local, for marking federated counterparties. */
  localDomain: string | null;
}

/**
 * One open thread.
 *
 * `canSend` is the gate's answer for writing to this person, resolved
 * server-side so the composer never has to guess. It has two values, not the
 * gate's three: 'hold' is reported as 'allow' because telling the sender their
 * message was filed as a request discloses the recipient's settings, which is
 * the exact thing dm-gate.ts exists to prevent. 'refuse' replaces the composer
 * with the single deliberately-ambiguous refusal line.
 */
export interface ConversationThread {
  counterparty: SocialActorDisplay;
  messages: SocialStatusDisplay[];
  viewerActorId: string;
  localDomain: string | null;
  canSend: 'allow' | 'refuse';
}

export const useConversations = (enabled: boolean = true) =>
  useQuery({
    queryKey: [socialQueryKey, 'messages', 'conversations'],
    queryFn: async (): Promise<ConversationListResult> => {
      const { data } = await axios.get('/api/social/messages/conversations');
      return {
        conversations: data?.data?.conversations ?? [],
        viewerActorId: data?.data?.viewerActorId ?? null,
        localDomain: data?.data?.localDomain ?? null,
      };
    },
    enabled,
    // Defence in depth. The socket invalidates this key on delivery and on
    // wake (app/messages/_lib/use-dm-socket.ts), which is the fast path -- but
    // unlike the thread below, this list has no interval of its own, so a
    // socket that never connected would leave it frozen with no second
    // mechanism. Focus is the cheapest one that cannot itself go stale.
    refetchOnWindowFocus: true,
  });

/**
 * One thread, with the interval kept as a floor under the socket.
 *
 * Live delivery arrives over the DM socket now, so fifteen seconds is no
 * longer the visible latency -- it is what the thread falls back to when the
 * socket is down, blocked, or still reconnecting. Removing it would make a
 * failed socket silently fatal, which is the one thing this UI must not do:
 * it must never claim a message arrived that has not.
 */
export const useConversation = (actorId: string | null) =>
  useQuery({
    queryKey: [socialQueryKey, 'messages', 'conversation', actorId],
    queryFn: async (): Promise<ConversationThread | null> => {
      const { data } = await axios.get(
        `/api/social/messages/conversations/${actorId}`
      );
      return data?.data ?? null;
    },
    enabled: !!actorId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

/* Re-exported rather than restated. This was a second declaration that
   "mirrors lib/gifs/giphy.ts", and the two promptly drifted: the uploader
   credit GIPHY's terms require was added to one and not the other, so the
   picker could not see a field the server was already sending. One
   definition cannot drift from itself. */
export type { GifResult };

/* Re-exported so client components get GIPHY's required attribution strings
   without importing the server-only GIPHY module (which reads the API key at
   module scope). The constants live there because that is where the
   obligation is documented; they surface here because that is where the UI
   can reach them. */
export {
  GIPHY_ATTRIBUTION,
  GIPHY_ATTRIBUTION_MARK,
  GIPHY_SEARCH_PLACEHOLDER,
} from '@/lib/gifs/giphy';

/** Attachment metadata, already uploaded, ready to hang off a status. */
export interface DraftAttachment {
  type: string;
  mediaType: string;
  url: string;
  name?: string | null;
}

export interface DirectMessageDraft {
  content: string;
  attachments?: DraftAttachment[];
}

/**
 * Search GIPHY through our own proxy.
 *
 * `enabled` comes back from the server rather than being inferred here,
 * because the key it depends on is deliberately not readable from the client.
 * An unconfigured deployment reports `enabled: false` and the picker is never
 * drawn at all.
 */
export const useGifSearch = (term: string, enabled: boolean = true) =>
  useQuery({
    queryKey: [socialQueryKey, 'gifs', term],
    queryFn: async (): Promise<{ enabled: boolean; results: GifResult[] }> => {
      const { data } = await axios.get('/api/social/gifs', {
        params: term ? { q: term } : {},
      });
      return {
        enabled: data?.enabled ?? false,
        results: data?.results ?? [],
      };
    },
    enabled,
    /* An hour, matching the server's own cache window rather than guessing.
       A GIPHY beta key allows a hundred calls an hour for the entire app, so
       anything this layer can answer without a request is a call the whole
       community gets to keep. Results do not move meaningfully within the
       hour and the same few terms get typed constantly ("lol", "gracias"). */
    staleTime: 60 * 60_000,
  });

/**
 * Copy a chosen GIF into our own bucket and get attachment metadata back.
 *
 * Deliberately a separate step from sending. The copy is the slow part and
 * the part that can fail on someone else's availability, so doing it first
 * means a send either has a working attachment in hand or never starts --
 * rather than a message that posts with a broken image in it.
 */
export const useMirrorGif = () =>
  useMutation({
    mutationFn: async (gif: GifResult): Promise<DraftAttachment> => {
      const { data } = await axios.post('/api/social/gifs/mirror', {
        url: gif.url,
        description: gif.description,
        creator: gif.creator,
      });
      if (!data?.success) {
        throw new Error(data?.error ?? 'Could not save that GIF');
      }
      return data.data as DraftAttachment;
    },
  });

/**
 * Send one direct message.
 *
 * Goes through the same POST /api/social/statuses every other composer uses,
 * because the DM gate lives inside createStatus. A dedicated send endpoint
 * would be a second door into the same room, and only one of them would have
 * the lock on it.
 *
 * The recipient travels with each mutation, so changing threads cannot redirect
 * a send or invalidate the wrong conversation. The response acknowledges a
 * server ID; the workspace keeps its local bubble until that ID is refetched.
 */
export const useSendDirectMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipientActorId,
      content,
      attachments,
    }: DirectMessageDraft & { recipientActorId: string }) => {
      if (!recipientActorId) throw new Error('No conversation selected');
      const { data } = await axios.post<
        ApiEnvelope<{ status: { id: string } }>
      >('/api/social/statuses', {
        content,
        visibility: 'direct',
        recipientActorIds: [recipientActorId],
        ...(attachments?.length ? { attachments } : {}),
      });
      if (!data.success || !data.data?.status?.id) {
        throw new Error(data.error ?? 'Could not confirm message delivery.');
      }
      return data.data.status;
    },
    onSuccess: (_status, { recipientActorId }) => {
      queryClient.invalidateQueries({
        queryKey: [
          socialQueryKey,
          'messages',
          'conversation',
          recipientActorId,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'messages', 'conversations'],
      });
    },
    onError: (_error, { recipientActorId }) => {
      queryClient.invalidateQueries({
        queryKey: [
          socialQueryKey,
          'messages',
          'conversation',
          recipientActorId,
        ],
      });
    },
  });
};

/** One pana the viewer could open a conversation with. */
export interface MessageableActor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  uri: string;
}

/**
 * Panas matching a term, for starting a thread that does not exist yet.
 *
 * The conversation list can only ever show people the viewer has already
 * messaged, so without this the Messages page is a room with no door: the
 * empty state had to send members to someone's profile to begin, which is a
 * different page, reachable from a different search.
 *
 * Reuses the actor-search endpoint the voice-memo composer already calls
 * rather than adding a messages-specific one. It answers exactly the question
 * being asked -- local actors with a profile, signed-in only -- and a second
 * endpoint would be a second place for the membership-enumeration gate to be
 * got wrong.
 *
 * Results are cached briefly. A typeahead re-asks for the same prefix
 * constantly as people type and backspace, and the set of panas does not
 * change between two keystrokes.
 */
export const usePanaSearch = (term: string) =>
  useQuery({
    queryKey: [socialQueryKey, 'messages', 'pana-search', term],
    queryFn: async (): Promise<MessageableActor[]> => {
      const { data } = await axios.get('/api/social/actors/search', {
        params: { q: term, limit: 8 },
      });
      return data?.data ?? [];
    },
    enabled: term.length > 0,
    staleTime: 30_000,
  });

// ============================================================================
// Mutation Hooks
// ============================================================================

export const useEnableSocial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      return axios.post('/api/social/actors/me');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'me'],
      });
    },
  });
};

export const useCreatePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      content: string;
      contentWarning?: string;
      inReplyTo?: string;
      visibility?: 'public' | 'unlisted' | 'private' | 'direct';
      /** Mutual-only personal sharing; legacy private API posts stay followers-only. */
      audience?: 'panas';
      attachments?: Array<{
        type: string;
        mediaType: string;
        url: string;
        name: string;
      }>;
      /** For 'direct' visibility: array of recipient actor IDs (max 8) */
      recipientActorIds?: string[];
      /** Optional location (coordinates, name, or both) */
      location?: {
        type?: 'Place';
        latitude?: number;
        longitude?: number;
        name?: string;
        precision?: 'precise' | 'general';
      };
      /** Optional override; otherwise the active profile's saved license applies. */
      ccLicense?: 'cc-by-4' | 'cc-by-sa-4' | 'cc-0';
    }) => {
      return axios.post('/api/social/statuses', data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'timeline'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'me', 'posts'],
      });
      if (variables.inReplyTo) {
        queryClient.invalidateQueries({
          queryKey: [socialQueryKey, 'status'],
        });
      }
      // Invalidate messages if this was a direct message
      if (variables.visibility === 'direct') {
        queryClient.invalidateQueries({
          queryKey: [socialQueryKey, 'messages'],
        });
      }
    },
  });
};

export const useDeletePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statusId: string) => {
      return axios.delete(`/api/social/statuses/${statusId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'status'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'timeline'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'me', 'posts'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'messages'],
      });
    },
  });
};

export const useLikePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statusId: string) => {
      return axios.post(`/api/social/statuses/${statusId}/like`);
    },
    onMutate: async (statusId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: [socialQueryKey, 'status', statusId],
      });

      // Snapshot the previous value
      const previousStatus = queryClient.getQueryData([
        socialQueryKey,
        'status',
        statusId,
      ]);

      // Optimistically update
      queryClient.setQueryData(
        [socialQueryKey, 'status', statusId],
        (old: { status: SocialStatusDisplay } | undefined) => {
          if (!old) return old;
          return {
            status: {
              ...old.status,
              liked: true,
              likesCount: old.status.likesCount + 1,
            },
          };
        }
      );

      return { previousStatus };
    },
    onError: (_err, statusId, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(
          [socialQueryKey, 'status', statusId],
          context.previousStatus
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'status'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'timeline'],
      });
    },
  });
};

export const useUnlikePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statusId: string) => {
      return axios.delete(`/api/social/statuses/${statusId}/like`);
    },
    onMutate: async (statusId: string) => {
      await queryClient.cancelQueries({
        queryKey: [socialQueryKey, 'status', statusId],
      });

      const previousStatus = queryClient.getQueryData([
        socialQueryKey,
        'status',
        statusId,
      ]);

      queryClient.setQueryData(
        [socialQueryKey, 'status', statusId],
        (old: { status: SocialStatusDisplay } | undefined) => {
          if (!old) return old;
          return {
            status: {
              ...old.status,
              liked: false,
              likesCount: Math.max(0, old.status.likesCount - 1),
            },
          };
        }
      );

      return { previousStatus };
    },
    onError: (_err, statusId, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(
          [socialQueryKey, 'status', statusId],
          context.previousStatus
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'status'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'timeline'],
      });
    },
  });
};

export const useFollowActor = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => {
      return axios.post(
        `/api/social/actors/${encodeURIComponent(username)}/follow`
      );
    },
    onMutate: async (username: string) => {
      await queryClient.cancelQueries({
        queryKey: [socialQueryKey, 'actor', username],
      });

      const previousActor = queryClient.getQueryData([
        socialQueryKey,
        'actor',
        username,
      ]);

      queryClient.setQueryData(
        [socialQueryKey, 'actor', username],
        (old: ActorResponse | undefined) => {
          if (!old) return old;
          return {
            ...old,
            isFollowing: true,
            actor: {
              ...old.actor,
              followersCount: old.actor.followersCount + 1,
            },
          };
        }
      );

      return { previousActor };
    },
    onError: (_err, username, context) => {
      if (context?.previousActor) {
        queryClient.setQueryData(
          [socialQueryKey, 'actor', username],
          context.previousActor
        );
      }
    },
    onSettled: (_data, _error, username) => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'actor', username],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'follows'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'timeline'],
      });
    },
  });
};

export const useUnfollowActor = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => {
      return axios.delete(
        `/api/social/actors/${encodeURIComponent(username)}/follow`
      );
    },
    onMutate: async (username: string) => {
      await queryClient.cancelQueries({
        queryKey: [socialQueryKey, 'actor', username],
      });

      const previousActor = queryClient.getQueryData([
        socialQueryKey,
        'actor',
        username,
      ]);

      queryClient.setQueryData(
        [socialQueryKey, 'actor', username],
        (old: ActorResponse | undefined) => {
          if (!old) return old;
          return {
            ...old,
            isFollowing: false,
            actor: {
              ...old.actor,
              followersCount: Math.max(0, old.actor.followersCount - 1),
            },
          };
        }
      );

      return { previousActor };
    },
    onError: (_err, username, context) => {
      if (context?.previousActor) {
        queryClient.setQueryData(
          [socialQueryKey, 'actor', username],
          context.previousActor
        );
      }
    },
    onSettled: (_data, _error, username) => {
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'actor', username],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'follows'],
      });
      queryClient.invalidateQueries({
        queryKey: [socialQueryKey, 'timeline'],
      });
    },
  });
};

/** Block and mute. See docs/SOCIAL-GRAPH.md section B. */
export type SocialBlockKind = 'block' | 'mute';

export interface BlockedActorEntry {
  block: {
    id: string;
    createdAt: string;
    actorId: string;
    targetActorId: string;
    kind: SocialBlockKind;
  };
  actor: {
    id: string;
    username: string;
    domain: string;
    name: string | null;
    iconUrl: string | null;
  };
}

/**
 * The viewer's own block or mute list, for the settings screen.
 *
 * Outgoing rows only - the API never returns who blocked you.
 */
export const useBlockList = (kind: SocialBlockKind = 'block') =>
  useQuery({
    queryKey: [socialQueryKey, 'blocks', kind],
    queryFn: async (): Promise<BlockedActorEntry[]> => {
      const { data } = await axios.get(`/api/social/blocks?kind=${kind}`);
      return data?.data?.blocks ?? [];
    },
  });

/**
 * Invalidate everything a block can change.
 *
 * Blocking severs follows and removes the actor from every timeline, the
 * suggestion rail and the Panas count, so there is no useful optimistic update
 * here - the honest move is to drop the caches and refetch. Doing it by halves
 * is how you end up with a blocked person still sitting in the feed until the
 * next navigation, which reads as the block not having worked.
 */
function invalidateAfterBlock(
  queryClient: ReturnType<typeof useQueryClient>,
  username: string
) {
  for (const key of [
    'actor',
    'blocks',
    'follows',
    'timeline',
    'suggestions',
    'panas',
    'stories',
    'notifications',
    'messages',
    // Blocking a sender drops them from the Requests folder, which is the
    // whole point of offering Block beside Accept there.
    'dm-requests',
  ]) {
    queryClient.invalidateQueries({ queryKey: [socialQueryKey, key] });
  }
  queryClient.invalidateQueries({
    queryKey: [socialQueryKey, 'actor', username],
  });
}

interface BlockMutationVars {
  username: string;
  kind?: SocialBlockKind;
}

export const useBlockActor = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, kind = 'block' }: BlockMutationVars) =>
      axios.post(
        `/api/social/actors/${encodeURIComponent(username)}/block?kind=${kind}`
      ),
    onSettled: (_data, _error, variables) => {
      invalidateAfterBlock(queryClient, variables.username);
    },
  });
};

export const useUnblockActor = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, kind = 'block' }: BlockMutationVars) =>
      axios.delete(
        `/api/social/actors/${encodeURIComponent(username)}/block?kind=${kind}`
      ),
    onSettled: (_data, _error, variables) => {
      invalidateAfterBlock(queryClient, variables.username);
    },
  });
};

// ============================================================================
// Calendar
// ============================================================================

/** Why an event is on your calendar. Mirrors CalendarReason in lib/calendar.ts. */
export type CalendarReason = 'hosting' | 'rsvp' | 'group' | 'following';

/* Only two kinds, because an event has host_profile_id XOR host_group_id and
   nothing else. A directory listing hosts through its profile, so its events
   are pana-hosted -- there is no third badge the data could support. */
export type CalendarHostKind = 'pana' | 'group';

/**
 * One row of the personal calendar.
 *
 * `startsAt` arrives as an ISO string rather than a Date because it crossed
 * JSON to get here. Callers format it with the event's own `timezone`, not the
 * reader's -- an event is on the day its own city says it is, which is the
 * same rule the group rail already follows.
 */
export interface CalendarEntry {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  coverImage: string | null;
  mode: 'online' | 'offline' | 'hybrid';
  attendeeCount: number;
  visibility: 'public' | 'unlisted';
  reason: CalendarReason;
  rsvp: 'going' | 'maybe' | null;
  hostKind: CalendarHostKind;
  hostName: string;
  hostHandle: string | null;
  venueName: string | null;
  venueCity: string | null;
  /** Why an unsolicited row is here. Always set on suggested, never on
   *  committed -- you do not need telling why your own RSVP is listed. */
  because: string | null;
}

export interface PersonalCalendar {
  /** Things you said you would do: hosting, going, or still deciding. */
  committed: CalendarEntry[];
  /** Public events from groups you are in and panas you follow. */
  suggested: CalendarEntry[];
}

async function fetchMyCalendar(): Promise<PersonalCalendar | null> {
  return getSocialData('/api/social/actors/me/calendar');
}

/**
 * What the signed-in pana has coming up, across groups, panas and listings.
 *
 * There is no username-taking counterpart and there should not be. The
 * committed half includes unlisted events and undecided RSVPs, which are rows
 * a pana shared with an organiser rather than with the public.
 */
export const useMyCalendar = (options?: { enabled?: boolean }) => {
  return useQuery<PersonalCalendar | null, Error>({
    queryKey: [socialQueryKey, 'me', 'calendar'],
    queryFn: fetchMyCalendar,
    enabled: options?.enabled ?? true,
  });
};
