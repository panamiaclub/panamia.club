'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Search } from 'lucide-react';
import { ScopeMenu } from '@/components/directory-scope-bar';
import { FilterMenu } from '@/components/ui/filter-menu';
import { profileCategoryList } from '@/lib/lists';
import { searchParamsToString, useSearch } from '@/lib/query/directory';
import { useMyGroups } from '@/lib/query/social';
import { useNativeEvents, useNativeGroups } from '@/lib/query/native-app';
import {
  matchesNativeVisit,
  nativeBusiness,
  nativeEvent,
  nativeGroup,
  type NativeDirectoryVisit,
} from '@/lib/mobile/browse';
import { getDirectorySearchParams } from '@/app/directory/search/_lib/search-params';
import { useViewerLocation } from '@/app/p/[user]/_lib/use-viewer-location';
import { useToast } from '@/hooks/use-toast';
import { useNativeViewer } from './native-app-context';
import NativeMapResults from './NativeMapResults';
import { NativeNotice, NativeResultCard } from './NativeResultCard';
import styles from './native-app.module.css';

const SCOPES = ['directory', 'event', 'group'] as const;
type NativeScope = (typeof SCOPES)[number];
const VISITS = [
  {
    value: 'both',
    label: 'Both',
    hint: 'In-person and online-only listings together',
  },
  {
    value: 'in-person',
    label: 'In person',
    hint: 'Local businesses and services',
  },
  { value: 'online', label: 'Online', hint: 'Businesses marked online-only' },
] satisfies { value: NativeDirectoryVisit; label: string; hint: string }[];

function readRequest(request: string | null) {
  const url = new URL(request || '/d', 'https://native.invalid');
  const rawScope = url.searchParams.get('scope');
  const scope: NativeScope =
    rawScope === 'event' || rawScope === 'group' ? rawScope : 'directory';
  const term = url.pathname.startsWith('/directory/search/')
    ? decodeURIComponent(url.pathname.slice('/directory/search/'.length))
    : undefined;
  return {
    scope,
    params: getDirectorySearchParams(url.searchParams, term),
  };
}

export default function NativeDirectory({
  active,
  request,
}: {
  active: boolean;
  request: string | null;
}) {
  const [initial] = useState(() => readRequest(request));
  const [scope, setScope] = useState<NativeScope>(initial.scope);
  const [mountedMaps, setMountedMaps] = useState<NativeScope[]>([
    initial.scope,
  ]);
  const [params, setParams] = useState(initial.params);
  const [query, setQuery] = useState(initial.params.searchTerm);
  const [term, setTerm] = useState(query.trim());
  const [filterVersion, setFilterVersion] = useState(0);
  const [visit, setVisit] = useState<NativeDirectoryVisit>('both');
  const [covered, setCovered] = useState({ directory: false, event: false });
  const previousRequest = useRef(request);
  const input = useRef<HTMLInputElement>(null);
  const filterBoundary = useRef<HTMLDivElement>(null);
  const { signedIn, viewerKey } = useNativeViewer();
  const location = useViewerLocation();
  const { toast } = useToast();
  const previousLocationStatus = useRef(location.status);
  const sort =
    params.sort === 'nearest' && !location.coords
      ? 'relevance'
      : (params.sort ?? (location.coords ? 'nearest' : 'relevance'));

  useEffect(() => {
    setMountedMaps((current) =>
      current.includes(scope) ? current : [...current, scope]
    );
  }, [scope]);

  useEffect(() => {
    if (
      location.status === 'denied' &&
      previousLocationStatus.current !== 'denied'
    ) {
      toast({
        title: 'Location is unavailable',
        description:
          'Showing all areas. You can allow location in your device settings, or search by name and category.',
      });
    }
    previousLocationStatus.current = location.status;
  }, [location.status, toast]);

  useEffect(() => {
    if (request === null || request === previousRequest.current) return;
    previousRequest.current = request;
    const next = readRequest(request);
    setScope(next.scope);
    setParams(next.params);
    setVisit('both');
    setQuery(next.params.searchTerm);
    setTerm(next.params.searchTerm.trim());
    setFilterVersion((version) => version + 1);
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const queryFilters = {
    ...params,
    searchTerm: term,
    sort,
    geolat: location.coords?.lat ?? 0,
    geolng: location.coords?.lng ?? 0,
  };
  const directory = useSearch(
    { ...queryFilters, pageNum: 1, resultsView: 'map' },
    { enabled: active && scope === 'directory' }
  );
  const events = useNativeEvents(term, active && scope === 'event');
  const groups = useNativeGroups(term, active && scope === 'group');
  const memberships = useMyGroups({
    enabled: signedIn && active && scope === 'group',
    viewerKey,
  });
  const businesses = useMemo(
    () =>
      [
        ...(directory.data?.data ?? []),
        ...(directory.data?.map?.unmappedResults ?? []),
      ]
        // Map responses include every matching mapped and unlocated listing,
        // so Visit refines the complete set, never just a paginated subset.
        .filter((result) => matchesNativeVisit(result, visit))
        .map(nativeBusiness),
    [directory.data, visit]
  );
  const mappedBusinesses = useMemo(
    () =>
      (directory.data?.data ?? [])
        .filter((result) => matchesNativeVisit(result, visit))
        .map(nativeBusiness),
    [directory.data, visit]
  );
  const eventItems = useMemo(
    () =>
      (events.data?.pages ?? []).flatMap((page) =>
        page.events.map(nativeEvent)
      ),
    [events.data]
  );
  const groupItems = useMemo(() => {
    const joined = new Set(
      memberships.data?.groups.map((group) => group.id) ?? []
    );
    const pending = new Set(
      memberships.data?.pending?.map((group) => group.id) ?? []
    );
    return (groups.data?.pages ?? []).flatMap((page) =>
      page.groups.map((group) => ({
        ...nativeGroup(group),
        ...(joined.has(group.id)
          ? { annotation: 'Joined' }
          : pending.has(group.id)
            ? { annotation: 'Requested - not yet a member' }
            : {}),
      }))
    );
  }, [groups.data, memberships.data]);
  const directoryCovered = useCallback(
    (value: boolean) =>
      setCovered((current) =>
        current.directory === value ? current : { ...current, directory: value }
      ),
    []
  );
  const eventsCovered = useCallback(
    (value: boolean) =>
      setCovered((current) =>
        current.event === value ? current : { ...current, event: value }
      ),
    []
  );
  const searching = term !== query.trim();
  const categories = params.filterCategories.split('+').filter(Boolean);
  const total = businesses.length;
  const scopeLabel =
    scope === 'directory'
      ? 'Directory'
      : scope === 'event'
        ? 'Events'
        : 'Groups';
  const controlsCovered =
    scope === 'directory'
      ? covered.directory
      : scope === 'event'
        ? covered.event
        : false;
  const hasLegacyFilters =
    params.mentorsOnly ||
    params.expertise ||
    params.languages ||
    params.freeOnly;
  const clearFilters = useCallback(() => {
    setParams(getDirectorySearchParams(new URLSearchParams()));
    setVisit('both');
    setFilterVersion((version) => version + 1);
  }, []);
  const filterCaption = (label: string) => (
    <>
      <strong>{label}</strong>
      {hasLegacyFilters && (
        <span>
          Additional mentoring or language filters from your link are active.
          Clear all removes them.
        </span>
      )}
      {location.status === 'denied' && (
        <span role="status">
          Location is unavailable. Showing all areas; you can allow location in
          your device settings.
        </span>
      )}
    </>
  );
  const menuProps = {
    appearance: 'surface' as const,
    compact: true,
    onClearAll: clearFilters,
    boundaryRef: filterBoundary,
  };

  return (
    <div
      className={styles.directory}
      data-controls-covered={controlsCovered || undefined}
    >
      <h1 className="sr-only">Directory</h1>
      <div
        ref={filterBoundary}
        className={styles.filterBoundary}
        aria-hidden="true"
      />
      <div className={styles.directoryControls}>
        <form
          className={styles.search}
          role="search"
          aria-label="Search Pana Mia"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(query.trim());
            input.current?.blur();
          }}
        >
          <ScopeMenu
            term={query}
            scope={scope}
            scopes={SCOPES}
            signedIn={signedIn}
            counts={null}
            compact
            showDestinations={false}
            panelStyle={{
              top: 'var(--native-scope-top)',
              width: 'min(23rem, calc(100cqw - 52px))',
              maxHeight: 'var(--native-scope-height)',
              overflowY: 'auto',
            }}
            onSelect={(next) => {
              if (
                next !== 'directory' &&
                next !== 'event' &&
                next !== 'group'
              ) {
                throw new Error('Unsupported app search category');
              }
              setScope(next);
            }}
          />
          <Search size={17} aria-hidden="true" />
          <input
            ref={input}
            type="search"
            maxLength={200}
            aria-label={`Search ${scopeLabel.toLowerCase()}`}
            placeholder={`Search ${scopeLabel.toLowerCase()}`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          {scope === 'directory' && (
            <button
              type="button"
              className={styles.locate}
              aria-label="Use my location"
              aria-pressed={location.status === 'granted'}
              disabled={location.status === 'asking'}
              onClick={location.request}
            >
              <LocateFixed size={18} aria-hidden="true" />
            </button>
          )}
        </form>

        {scope === 'directory' && (
          <div
            className={styles.filterRow}
            role="group"
            aria-label="Directory filters"
          >
            <FilterMenu
              {...menuProps}
              label="Category"
              caption={filterCaption('Category')}
              options={profileCategoryList.map((category) => ({
                value: category.value,
                label: category.desc,
              }))}
              selected={categories}
              onChange={(values) =>
                setParams((current) => ({
                  ...current,
                  pageNum: 1,
                  filterCategories: values.join('+'),
                }))
              }
            />
            <FilterMenu
              {...menuProps}
              label="Visit"
              caption={filterCaption('Visit')}
              single
              defaultValue="both"
              options={VISITS}
              selected={[visit]}
              onChange={([value]) => {
                const next = VISITS.find((option) => option.value === value);
                if (!next) throw new Error('Unknown directory visit option');
                setVisit(next.value);
              }}
            />
            <FilterMenu
              {...menuProps}
              label="Certified"
              caption={filterCaption('Certified')}
              single
              defaultValue="all"
              options={[
                { value: 'all', label: 'All listings' },
                {
                  value: 'certified',
                  label: 'Pana certified only',
                  triggerLabel: 'Certified',
                },
              ]}
              selected={[params.certifiedOnly ? 'certified' : 'all']}
              onChange={([value]) =>
                setParams((current) => ({
                  ...current,
                  pageNum: 1,
                  certifiedOnly: value === 'certified',
                }))
              }
            />
            <FilterMenu
              {...menuProps}
              label="Events"
              caption={filterCaption('Events')}
              single
              defaultValue="all"
              options={[
                { value: 'all', label: 'All listings' },
                {
                  value: 'events',
                  label: 'Hosting upcoming events',
                  triggerLabel: 'Events',
                },
              ]}
              selected={[params.withEventsOnly ? 'events' : 'all']}
              onChange={([value]) =>
                setParams((current) => ({
                  ...current,
                  pageNum: 1,
                  withEventsOnly: value === 'events',
                }))
              }
            />
          </div>
        )}
      </div>

      <div className={styles.mapPane} hidden={scope !== 'directory'}>
        {(scope === 'directory' || mountedMaps.includes('directory')) && (
          <NativeMapResults
            items={businesses}
            mapItems={mappedBusinesses}
            directorySections
            label="Directory"
            count={`${total} ${total === 1 ? 'listing' : 'listings'}`}
            filterKey={JSON.stringify([
              searchParamsToString({ ...queryFilters, pageNum: 1 }),
              visit,
              filterVersion,
            ])}
            frameKey={term}
            active={active && scope === 'directory'}
            loading={directory.isPending || searching}
            failed={directory.isError || directory.data?.success === false}
            onRetry={() => {
              void directory.refetch();
            }}
            viewer={location.coords}
            controlsInset={106}
            onControlsCovered={directoryCovered}
          />
        )}
      </div>
      <div className={styles.mapPane} hidden={scope !== 'event'}>
        {(scope === 'event' || mountedMaps.includes('event')) && (
          <NativeMapResults
            items={eventItems}
            label="Events"
            count={`${eventItems.length} ${events.hasNextPage ? 'events shown' : 'events'}`}
            filterKey={term}
            active={active && scope === 'event'}
            loading={events.isPending || searching}
            failed={events.isError}
            onRetry={() => void events.refetch()}
            viewer={location.coords}
            controlsInset={70}
            onControlsCovered={eventsCovered}
            footer={
              events.hasNextPage ? (
                <button
                  type="button"
                  className={styles.loadMore}
                  disabled={events.isFetchingNextPage}
                  onClick={() => void events.fetchNextPage()}
                >
                  {events.isFetchingNextPage ? 'Loading...' : 'More events'}
                </button>
              ) : null
            }
          />
        )}
      </div>
      <div className={styles.groupResults} hidden={scope !== 'group'}>
        <h2>{groupItems.length} groups shown</h2>
        {signedIn && (memberships.isError || memberships.data === null) && (
          <NativeNotice
            title="Could not check your group memberships"
            onRetry={() => void memberships.refetch()}
          >
            Public results are still available. Joined and requested labels are
            unavailable.
          </NativeNotice>
        )}
        {(groups.isPending || searching) && (
          <NativeNotice title="Loading groups..." busy />
        )}
        {groups.isError && (
          <NativeNotice
            title="Could not load groups"
            onRetry={() => void groups.refetch()}
          />
        )}
        {!groups.isPending && !groups.isError && groupItems.length === 0 && (
          <NativeNotice title="No matching groups">
            Try another name or interest.
          </NativeNotice>
        )}
        {groupItems.map((item) => (
          <NativeResultCard key={item.id} item={item} />
        ))}
        {groups.hasNextPage && (
          <button
            type="button"
            className={styles.loadMore}
            disabled={groups.isFetchingNextPage}
            onClick={() => void groups.fetchNextPage()}
          >
            {groups.isFetchingNextPage ? 'Loading...' : 'More groups'}
          </button>
        )}
      </div>
    </div>
  );
}
