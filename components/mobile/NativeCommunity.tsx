'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMediaQuery, useRail } from '@/components/home/rail';
import { useSearch } from '@/lib/query/directory';
import { GROUP_SORTS, useMyCalendar, useMyGroups } from '@/lib/query/social';
import {
  useNativeDiscovery,
  useNativeGroups,
  useSavedEvents,
} from '@/lib/query/native-app';
import { buildLanes } from '@/lib/events/lanes';
import {
  nativeBusiness,
  nativeCalendarEvent,
  nativeDiscoveryEvent,
  nativeEvent,
  nativeGroup,
  nativeJoinedGroup,
  type NativeResult,
} from '@/lib/mobile/browse';
import { useNativeViewer } from './native-app-context';
import { NativeNotice, NativeResultCard } from './NativeResultCard';
import styles from './native-app.module.css';

type YoursSection = 'all' | 'groups' | 'events' | 'saved';
type DiscoverSection = 'all' | 'events' | 'groups' | 'directory';

function groupSearch(request: string | null) {
  const params = new URL(request || '/groups', 'https://native.invalid')
    .searchParams;
  return {
    term: params.get('q') ?? '',
    topic: params.get('topic') ?? '',
    sort:
      GROUP_SORTS.find((entry) => entry.id === params.get('sort'))?.id ??
      'active',
  };
}

export default function NativeCommunity({
  active,
  request,
  requestedView,
  requestedSection,
}: {
  active: boolean;
  request: string | null;
  requestedView?: 'yours' | 'discover';
  requestedSection?: 'all' | 'events' | 'groups';
}) {
  const [view, setView] = useState<'yours' | 'discover'>(
    requestedView ?? 'yours'
  );
  const [yoursSection, setYoursSection] = useState<YoursSection>(
    requestedView === 'yours' ? (requestedSection ?? 'all') : 'all'
  );
  const [discoverSection, setDiscoverSection] = useState<DiscoverSection>(
    requestedView === 'discover' ? (requestedSection ?? 'all') : 'all'
  );
  const [groupFilters, setGroupFilters] = useState(() => groupSearch(request));
  const { term: groupTerm, topic: groupTopic, sort: groupSort } = groupFilters;
  const previousRequest = useRef(request);
  const { signedIn, viewerKey } = useNativeViewer();
  const mine = useMyGroups({ enabled: active && signedIn, viewerKey });
  const calendar = useMyCalendar({ enabled: active && signedIn, viewerKey });
  const saved = useSavedEvents(viewerKey, active && signedIn);
  const discovering = active && view === 'discover';
  const canDiscoverEvents =
    !signedIn || (!calendar.isError && calendar.data != null);
  const canDiscoverGroups = !signedIn || (!mine.isError && mine.data != null);
  const discovery = useNativeDiscovery(viewerKey, discovering);
  const groups = useNativeGroups(groupTerm, discovering, groupTopic, groupSort);
  const places = useSearch(
    {
      pageNum: 1,
      pageLimit: 12,
      searchTerm: '',
      filterCategories: '',
      geolat: 0,
      geolng: 0,
      radius: 'all',
      sort: 'recommended',
    },
    {
      enabled:
        discovering &&
        (discoverSection === 'all' || discoverSection === 'directory'),
    }
  );
  const { refetch: refreshGroups } = mine;
  const { refetch: refreshCalendar } = calendar;
  const { refetch: refreshSaved } = saved;

  useEffect(() => {
    if (request === null || request === previousRequest.current) return;
    previousRequest.current = request;
    setView(requestedView ?? 'yours');
    setYoursSection(
      requestedView === 'yours' ? (requestedSection ?? 'all') : 'all'
    );
    setDiscoverSection(
      requestedView === 'discover' ? (requestedSection ?? 'all') : 'all'
    );
    setGroupFilters(groupSearch(request));
  }, [request, requestedSection, requestedView]);

  // Detail pages own the existing joins and RSVPs. Re-read on return even if
  // the query is still fresh, so those actions immediately reach Yours.
  useEffect(() => {
    if (!active || !signedIn) return;
    void refreshGroups();
    void refreshCalendar();
    void refreshSaved();
  }, [
    active,
    signedIn,
    viewerKey,
    refreshGroups,
    refreshCalendar,
    refreshSaved,
  ]);

  const commitments = calendar.data?.committed ?? [];
  const committedIds = new Set(commitments.map((event) => event.id));
  const suggestions = (calendar.data?.suggested ?? []).filter(
    (event) => !committedIds.has(event.id)
  );
  const hidden = new Set(discovery.data?.dismissedIds ?? []);
  const pool = (discovery.data?.events ?? []).filter(
    (event) =>
      !hidden.has(event.id) &&
      !committedIds.has(event.id) &&
      !suggestions.some((suggestion) => suggestion.id === event.id)
  );
  const { lanes, leftovers } = buildLanes(pool, {
    signedIn: discovery.data?.signedIn ?? false,
  });
  const discoveredGroups = useMemo(() => {
    const joined = new Set(mine.data?.groups.map((group) => group.id) ?? []);
    const pending = new Set(mine.data?.pending?.map((group) => group.id) ?? []);
    return (groups.data?.pages ?? []).flatMap((page) =>
      page.groups
        .filter((group) => !joined.has(group.id))
        .map((group) => ({
          ...nativeGroup(group),
          ...(pending.has(group.id)
            ? { annotation: 'Requested - not yet a member' }
            : {}),
        }))
    );
  }, [groups.data, mine.data]);
  const shownYours = (section: YoursSection) =>
    yoursSection === 'all' || yoursSection === section;
  const shownDiscover = (section: DiscoverSection) =>
    discoverSection === 'all' || discoverSection === section;

  return (
    <div className={styles.community}>
      <header className={styles.communityHeading}>
        <h1>Community</h1>
        <Link
          href="/groups/new"
          className={styles.iconButton}
          aria-label="Start a group"
        >
          <Plus size={21} aria-hidden="true" />
        </Link>
      </header>
      <Tabs
        value={view}
        onValueChange={(value) => {
          if (value === 'yours' || value === 'discover') setView(value);
        }}
      >
        <TabsList className={styles.viewTabs} aria-label="Community views">
          <TabsTrigger value="yours">Yours</TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
        </TabsList>
        <TabsContent value="yours" forceMount hidden={view !== 'yours'}>
          {!signedIn ? (
            <NativeNotice title="Your community starts here">
              <p>
                Sign in to find your joined groups, plans, and saved events.
              </p>
              <Link href="/signin?callbackUrl=%2Fgroups">Sign in</Link>
              {' or '}
              <button type="button" onClick={() => setView('discover')}>
                discover what is here
              </button>
              .
            </NativeNotice>
          ) : (
            <>
              <div className={styles.chips} aria-label="Your community filters">
                {(
                  [
                    ['all', 'Overview'],
                    ['groups', 'Groups'],
                    ['events', 'Plans'],
                    ['saved', 'Saved'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={yoursSection === id}
                    onClick={() => setYoursSection(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {shownYours('groups') && (
                <CommunitySection
                  title="Your groups"
                  note="Your joined groups, including private ones."
                >
                  {mine.isPending ? (
                    <NativeNotice title="Loading your groups..." busy />
                  ) : mine.isError || mine.data === null ? (
                    <NativeNotice
                      title="Could not load your groups"
                      onRetry={() => void mine.refetch()}
                    />
                  ) : mine.data?.groups.length ? (
                    mine.data.groups.map((group) => (
                      <NativeResultCard
                        key={group.id}
                        item={nativeJoinedGroup(group)}
                      />
                    ))
                  ) : (
                    <NativeNotice title="No joined groups yet">
                      <button
                        type="button"
                        onClick={() => {
                          setView('discover');
                          setDiscoverSection('groups');
                        }}
                      >
                        Find a group
                      </button>
                    </NativeNotice>
                  )}
                  {!!mine.data?.pending?.length && (
                    <div className={styles.pending}>
                      <h3>Pending requests</h3>
                      <p>Waiting for approval, not memberships yet.</p>
                      {mine.data.pending.map((group) => (
                        <Link
                          key={group.id}
                          href={`/g/${encodeURIComponent(group.handle)}`}
                        >
                          <span>{group.name}</span>
                          <strong>Requested</strong>
                        </Link>
                      ))}
                    </div>
                  )}
                </CommunitySection>
              )}
              {shownYours('events') && (
                <CommunitySection
                  title="Your plans"
                  note="Hosting, Going, and Interested. Saving an event does not put it here."
                >
                  {calendar.isPending ? (
                    <NativeNotice title="Loading your plans..." busy />
                  ) : calendar.isError || calendar.data === null ? (
                    <NativeNotice
                      title="Could not load your plans"
                      onRetry={() => void calendar.refetch()}
                    />
                  ) : commitments.length ? (
                    commitments.map((event) => (
                      <NativeResultCard
                        key={event.id}
                        item={nativeCalendarEvent(event)}
                      />
                    ))
                  ) : (
                    <NativeNotice title="Nothing planned yet">
                      RSVP on an event page to add it to your plans.
                    </NativeNotice>
                  )}
                </CommunitySection>
              )}
              {shownYours('saved') && (
                <CommunitySection
                  title="Saved events"
                  note="Private bookmarks, not RSVPs. Open an event to decide if you are going."
                >
                  {saved.isPending ? (
                    <NativeNotice title="Loading saved events..." busy />
                  ) : saved.isError ? (
                    <NativeNotice
                      title="Could not load saved events"
                      onRetry={() => void saved.refetch()}
                    />
                  ) : saved.data?.events.length ? (
                    saved.data.events.map((event) => (
                      <NativeResultCard
                        key={event.id}
                        item={nativeEvent(event)}
                      />
                    ))
                  ) : (
                    <NativeNotice title="No saved events yet">
                      Use the bookmark on an event to keep it here.
                    </NativeNotice>
                  )}
                </CommunitySection>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="discover" forceMount hidden={view !== 'discover'}>
          <div className={styles.chips} aria-label="Discovery categories">
            {(
              [
                ['all', 'For you'],
                ['events', 'Events'],
                ['groups', 'Groups'],
                ['directory', 'Places'],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={discoverSection === id}
                onClick={() => setDiscoverSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {shownDiscover('events') && (
            <>
              {signedIn &&
                (calendar.isError || calendar.data === null ? (
                  <NativeNotice
                    title="Could not load your plans for discovery"
                    onRetry={() => void calendar.refetch()}
                  >
                    Retry to keep events you already joined out of your
                    discoveries.
                  </NativeNotice>
                ) : !canDiscoverEvents ? (
                  <NativeNotice title="Checking your plans..." busy />
                ) : null)}
              {canDiscoverEvents && (
                <>
                  {suggestions.length > 0 && (
                    <NativeRail
                      title="From your groups and hosts"
                      note="Upcoming events from groups you joined and people you follow."
                      items={suggestions.map(nativeCalendarEvent)}
                    />
                  )}
                  {discovery.isPending && (
                    <NativeNotice title="Finding events..." busy />
                  )}
                  {discovery.isError && (
                    <NativeNotice
                      title="Could not load event discoveries"
                      onRetry={() => void discovery.refetch()}
                    />
                  )}
                  {lanes.map((lane) => (
                    <NativeRail
                      key={lane.id}
                      title={lane.title}
                      note={lane.note}
                      items={lane.events.map(({ event }) =>
                        nativeDiscoveryEvent(event)
                      )}
                    />
                  ))}
                  {leftovers.length > 0 && (
                    <NativeRail
                      title="More coming up"
                      note="More public events around the community."
                      items={leftovers.map(nativeDiscoveryEvent)}
                    />
                  )}
                  {!discovery.isPending &&
                    !discovery.isError &&
                    !pool.length &&
                    !suggestions.length && (
                      <NativeNotice title="No event discoveries right now">
                        Your existing plans are still under Yours.
                      </NativeNotice>
                    )}
                </>
              )}
              <Link className={styles.browseLink} href="/d?scope=event">
                Browse all events on the map
              </Link>
            </>
          )}
          {shownDiscover('groups') && (
            <>
              {signedIn &&
                (mine.isError || mine.data === null ? (
                  <NativeNotice
                    title="Could not load your memberships for discovery"
                    onRetry={() => void mine.refetch()}
                  >
                    Retry to distinguish new groups from groups you joined or
                    requested.
                  </NativeNotice>
                ) : !canDiscoverGroups ? (
                  <NativeNotice title="Checking your memberships..." busy />
                ) : null)}
              {(groupTerm || groupTopic) && (
                <div className={styles.discoverySearch}>
                  <label>
                    Search discovered groups
                    <input
                      type="search"
                      value={groupTerm}
                      onChange={(event) =>
                        setGroupFilters((current) => ({
                          ...current,
                          term: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {groupTopic && (
                    <button
                      type="button"
                      onClick={() =>
                        setGroupFilters((current) => ({
                          ...current,
                          topic: '',
                        }))
                      }
                    >
                      Clear topic: {groupTopic}
                    </button>
                  )}
                </div>
              )}
              {canDiscoverGroups && (
                <>
                  {groups.isPending && (
                    <NativeNotice title="Finding groups..." busy />
                  )}
                  {groups.isError && (
                    <NativeNotice
                      title="Could not load groups"
                      onRetry={() => void groups.refetch()}
                    />
                  )}
                  {discoveredGroups.length > 0 ? (
                    <NativeRail
                      title={
                        groupTerm
                          ? `Groups matching "${groupTerm}"`
                          : 'Groups to discover'
                      }
                      note={
                        groupSort === 'members'
                          ? 'Meet some of the largest groups in the community.'
                          : groupSort === 'new'
                            ? 'Recently created groups to explore.'
                            : 'Groups with recent public activity, plus more to explore.'
                      }
                      items={discoveredGroups}
                      more={
                        groups.hasNextPage ? (
                          <button
                            type="button"
                            disabled={groups.isFetchingNextPage}
                            onClick={() => void groups.fetchNextPage()}
                          >
                            {groups.isFetchingNextPage
                              ? 'Loading...'
                              : 'More groups'}
                          </button>
                        ) : undefined
                      }
                    />
                  ) : !groups.isPending && !groups.isError ? (
                    <NativeNotice title="No new groups match right now">
                      Your joined groups are under Yours.
                    </NativeNotice>
                  ) : null}
                </>
              )}
              <Link className={styles.browseLink} href="/d?scope=group">
                Search all groups
              </Link>
            </>
          )}
          {shownDiscover('directory') && (
            <>
              {places.isPending && (
                <NativeNotice title="Finding places..." busy />
              )}
              {(places.isError || places.data?.success === false) && (
                <NativeNotice
                  title="Could not load directory discoveries"
                  onRetry={() => void places.refetch()}
                />
              )}
              {!!places.data?.data.length && (
                <NativeRail
                  title="From the directory"
                  note="Places recommended by the community."
                  items={places.data.data.map(nativeBusiness)}
                />
              )}
              {!places.isPending &&
                places.data?.success &&
                places.data.data.length === 0 && (
                  <NativeNotice title="No directory listings to show right now" />
                )}
              <Link className={styles.browseLink} href="/d?scope=directory">
                Browse the directory
              </Link>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CommunitySection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.communitySection}>
      <h2>{title}</h2>
      <p className={styles.sectionNote}>{note}</p>
      <div className={styles.stack}>{children}</div>
    </section>
  );
}

function NativeRail({
  title,
  note,
  items,
  more,
}: {
  title: string;
  note: string;
  items: NativeResult[];
  more?: ReactNode;
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { railRef, nudge, syncRail } = useRail<HTMLDivElement>(
    '[data-native-rail-item]',
    reducedMotion ? 'instant' : 'smooth'
  );
  useEffect(syncRail, [items.length, syncRail]);
  return (
    <section className={styles.communitySection}>
      <h2>{title}</h2>
      <p className={styles.sectionNote}>{note}</p>
      <div
        className={styles.rail}
        ref={railRef}
        tabIndex={0}
        role="list"
        aria-label={`${title}. Scroll sideways or use arrow keys.`}
        onScroll={syncRail}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'PageDown') {
            event.preventDefault();
            nudge(1);
          } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
            event.preventDefault();
            nudge(-1);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            railRef.current?.scrollTo({
              left: event.key === 'Home' ? 0 : railRef.current.scrollWidth,
              behavior: 'instant',
            });
          }
        }}
      >
        {items.map((item) => (
          <div key={item.id} role="listitem" data-native-rail-item>
            <NativeResultCard item={item} square />
          </div>
        ))}
        {more && <div className={styles.railMore}>{more}</div>}
      </div>
    </section>
  );
}
