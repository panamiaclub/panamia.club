'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Search, SlidersHorizontal } from 'lucide-react';
import { ScopeMenu } from '@/components/directory-scope-bar';
import { FilterMenu } from '@/components/ui/filter-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { profileCategoryList } from '@/lib/lists';
import {
  DIRECTORY_RADIUS_OPTIONS,
  effectiveDirectoryRadius,
  isDirectoryRadius,
} from '@/lib/directory-radius';
import { useSearch } from '@/lib/query/directory';
import { useMyGroups } from '@/lib/query/social';
import { useNativeEvents, useNativeGroups } from '@/lib/query/native-app';
import { nativeBusiness, nativeEvent, nativeGroup } from '@/lib/mobile/browse';
import { getDirectorySearchParams } from '@/app/directory/search/_lib/search-params';
import { useViewerLocation } from '@/app/p/[user]/_lib/use-viewer-location';
import { useToast } from '@/hooks/use-toast';
import { useNativeViewer } from './native-app-context';
import NativeMapResults from './NativeMapResults';
import { NativeNotice, NativeResultCard } from './NativeResultCard';
import styles from './native-app.module.css';

const SCOPES = ['directory', 'event', 'group'] as const;
type NativeScope = (typeof SCOPES)[number];
const SORTS = [
  { value: 'relevance', label: 'Best match' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'recommended', label: 'Most recommended' },
  { value: 'name', label: 'A-Z' },
] as const;

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [covered, setCovered] = useState({ directory: false, event: false });
  const previousRequest = useRef(request);
  const input = useRef<HTMLInputElement>(null);
  const { signedIn, viewerKey } = useNativeViewer();
  const location = useViewerLocation();
  const { toast } = useToast();
  const previousLocationStatus = useRef(location.status);
  const radius = effectiveDirectoryRadius(params.radius, !!location.coords);
  const sort =
    params.sort === 'nearest' && !location.coords
      ? 'relevance'
      : (params.sort ??
        (location.coords && radius !== 'all' ? 'nearest' : 'relevance'));

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
    setQuery(next.params.searchTerm);
    setTerm(next.params.searchTerm.trim());
    setFilterVersion((version) => version + 1);
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const directory = useSearch(
    {
      ...params,
      searchTerm: term,
      sort,
      radius,
      geolat: location.coords?.lat ?? 0,
      geolng: location.coords?.lng ?? 0,
    },
    { enabled: active && scope === 'directory' }
  );
  const events = useNativeEvents(term, active && scope === 'event');
  const groups = useNativeGroups(term, active && scope === 'group');
  const memberships = useMyGroups({
    enabled: signedIn && active && scope === 'group',
    viewerKey,
  });
  const businesses = useMemo(
    () => (directory.data?.data ?? []).map(nativeBusiness),
    [directory.data]
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
  const total = directory.data?.pagination.total ?? 0;
  const totalPages = directory.data?.pagination.totalPages ?? 1;
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

  return (
    <div
      className={styles.directory}
      data-controls-covered={controlsCovered || undefined}
    >
      <h1 className="sr-only">Directory</h1>
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
              className={styles.iconButton}
              aria-label="Directory filters"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
            </button>
          )}
        </form>

        {scope === 'directory' && (
          <div className={styles.categoryRow}>
            <div className={styles.chips} aria-label="Business categories">
              {[{ value: '', desc: 'All' }, ...profileCategoryList].map(
                (category) => (
                  <button
                    type="button"
                    key={category.value}
                    aria-pressed={
                      category.value
                        ? categories.includes(category.value)
                        : categories.length === 0
                    }
                    onClick={() => {
                      setParams((current) => ({
                        ...current,
                        pageNum: 1,
                        filterCategories: category.value,
                      }));
                      setFilterVersion((version) => version + 1);
                    }}
                  >
                    {category.desc}
                  </button>
                )
              )}
            </div>
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
          </div>
        )}
      </div>

      <div className={styles.mapPane} hidden={scope !== 'directory'}>
        {(scope === 'directory' || mountedMaps.includes('directory')) && (
          <NativeMapResults
            items={businesses}
            label="Directory"
            count={`${total} ${total === 1 ? 'listing' : 'listings'}`}
            filterKey={JSON.stringify([
              term,
              params,
              radius,
              sort,
              filterVersion,
            ])}
            active={active && scope === 'directory'}
            loading={directory.isPending || searching}
            failed={directory.isError || directory.data?.success === false}
            onRetry={() => void directory.refetch()}
            viewer={location.coords}
            controlsInset={106}
            onControlsCovered={directoryCovered}
            footer={
              totalPages > 1 ? (
                <div className={styles.pagination}>
                  <button
                    type="button"
                    disabled={params.pageNum <= 1}
                    onClick={() =>
                      setParams((current) => ({
                        ...current,
                        pageNum: current.pageNum - 1,
                      }))
                    }
                  >
                    Previous
                  </button>
                  <span>
                    Page {params.pageNum} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={params.pageNum >= totalPages}
                    onClick={() =>
                      setParams((current) => ({
                        ...current,
                        pageNum: current.pageNum + 1,
                      }))
                    }
                  >
                    Next
                  </button>
                </div>
              ) : null
            }
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

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className={styles.filtersDialog}>
          <DialogHeader>
            <DialogTitle>Directory filters</DialogTitle>
            <DialogDescription>
              Refine the live directory, without changing your search category.
            </DialogDescription>
          </DialogHeader>
          <FilterMenu
            label="Categories"
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
            label="Radius"
            single
            selected={[radius]}
            options={DIRECTORY_RADIUS_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              disabledReason:
                option.value !== 'all' && !location.coords
                  ? 'Use your location first'
                  : undefined,
            }))}
            onChange={([value]) => {
              if (!isDirectoryRadius(value))
                throw new Error('Unknown directory radius');
              setParams((current) => ({
                ...current,
                pageNum: 1,
                radius: value,
              }));
            }}
          />
          <FilterMenu
            label="Sort"
            single
            selected={[sort]}
            options={SORTS.map((option) => ({
              ...option,
              disabledReason:
                option.value === 'nearest' && !location.coords
                  ? 'Use your location first'
                  : undefined,
            }))}
            onChange={([value]) => {
              const next = SORTS.find((option) => option.value === value);
              if (!next) throw new Error('Unknown directory sort');
              setParams((current) => ({
                ...current,
                pageNum: 1,
                sort: next.value,
              }));
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={params.certifiedOnly}
              onChange={(event) =>
                setParams((current) => ({
                  ...current,
                  pageNum: 1,
                  certifiedOnly: event.target.checked,
                }))
              }
            />
            Pana certified only
          </label>
          <label>
            <input
              type="checkbox"
              checked={params.withEventsOnly}
              onChange={(event) =>
                setParams((current) => ({
                  ...current,
                  pageNum: 1,
                  withEventsOnly: event.target.checked,
                }))
              }
            />
            Hosting upcoming events
          </label>
          {hasLegacyFilters && (
            <p>
              Additional mentoring or language filters from your link are
              active.
            </p>
          )}
          {location.status === 'denied' && (
            <p role="status">
              Location is unavailable. Showing all areas; you can allow location
              in your device settings.
            </p>
          )}
          <button
            type="button"
            className={styles.loadMore}
            onClick={() =>
              setParams(getDirectorySearchParams(new URLSearchParams()))
            }
          >
            Clear filters
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setFiltersOpen(false)}
          >
            Show results
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
