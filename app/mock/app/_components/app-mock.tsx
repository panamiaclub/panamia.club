'use client';

import {
  Children,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BatteryFull,
  Bell,
  Bookmark,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  ChevronUp,
  Globe,
  Heart,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Signal,
  Sparkles,
  Store,
  UserRound,
  Users,
  Wifi,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMediaQuery, useRail } from '@/components/home/rail';
import { ScopeMenu } from '@/components/directory-scope-bar';
import { SURFACE_MARK } from '@/lib/panaverse/branding';
import { projectMockCoordinates } from '../../_data/map';
import type { MockPost } from '../../feed/_data/mock-feed';
import {
  APP_POSTS,
  APP_DIRECTORY_PROFILE_HASH as DIRECTORY_PROFILE_HASH,
  APP_EVENT_PICKS,
  APP_GROUP_PICKS,
  APP_INITIAL_RSVPS,
  APP_PLACE_PICKS,
  APP_PROFILE,
  APP_SEARCH_SCOPES,
  APP_STORIES,
  APP_TABS,
  DIRECTORY_CATEGORIES,
  COMMUNITY_VIEWS,
  LISTINGS,
  MOCK_EVENTS,
  MOCK_GROUPS,
  MOCK_VIEWER,
  getAppDirectoryMapResults,
  getAppEventMapResults,
  getAppMapPins,
  getAppEventGoingCount,
  searchAppDirectoryContent,
  type AppMapResult,
  type AppRsvp,
} from '../_data/mock-app';
import styles from './app-mock.module.css';

const TAB_ICONS = {
  social: MessageCircle,
  directory: Store,
  community: Users,
  profile: UserRound,
};

interface PreviewDetail {
  title: string;
  description: string;
  meta?: string;
  image?: string | null;
}

type OpenDetail = (detail: PreviewDetail) => void;

const SHEET_STOPS = ['peek', 'half', 'expanded'] as const;
type SheetStop = (typeof SHEET_STOPS)[number];
const CARD_PREVIEW_INSET = 12;
const COMMUNITY_PROFILE_HASH = '#community/place/';
const LEGACY_EXPLORE_PROFILE_HASH = '#explore/place/';

function getSheetHeights(height: number): Record<SheetStop, number> {
  const peek = Math.min(height, Math.max(64, Math.min(184, height * 0.4)));
  return {
    peek,
    half: Math.max(peek, height * 0.6),
    expanded: height,
  };
}

function scrollToResultCard(card: HTMLElement, scroller: HTMLDivElement) {
  scroller.scrollTo({
    top:
      scroller.scrollTop +
      card.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      CARD_PREVIEW_INSET,
    behavior: 'auto',
  });
}

export function AppMock() {
  const [activeTab, setActiveTab] = useState<string>(APP_TABS[0].id);
  const [directoryProfileId, setDirectoryProfileId] = useState<string | null>(
    null
  );
  const [communityProfileId, setCommunityProfileId] = useState<string | null>(
    null
  );
  const [detail, setDetail] = useState<PreviewDetail | null>(null);
  const lastOpener = useRef<HTMLElement | null>(null);
  const directoryTab = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let previousSource: 'directory' | 'community' | null = null;
    const syncProfile = () => {
      const hash = window.location.hash;
      const communityPrefix = [
        COMMUNITY_PROFILE_HASH,
        LEGACY_EXPLORE_PROFILE_HASH,
      ].find((prefix) => hash.startsWith(prefix));
      const source = hash.startsWith(DIRECTORY_PROFILE_HASH)
        ? 'directory'
        : communityPrefix
          ? 'community'
          : null;
      setDirectoryProfileId(
        source === 'directory'
          ? hash.slice(DIRECTORY_PROFILE_HASH.length)
          : null
      );
      setCommunityProfileId(
        communityPrefix ? hash.slice(communityPrefix.length) : null
      );
      if (source !== null) {
        setActiveTab(source);
      } else if (hash === '#directory') {
        setActiveTab('directory');
      } else if (hash === '#social') {
        setActiveTab('social');
      } else if (hash === '#community' || hash === '#explore') {
        setActiveTab('community');
      } else if (previousSource !== null) {
        setActiveTab(previousSource);
      }
      previousSource = source;
    };
    syncProfile();
    window.addEventListener('hashchange', syncProfile);
    return () => window.removeEventListener('hashchange', syncProfile);
  }, []);

  const openDetail: OpenDetail = (next) => {
    lastOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDetail(next);
  };

  return (
    <div className={styles.stage}>
      <aside className={styles.guide} aria-label="About this design preview">
        <span className={styles.previewLabel}>
          <Sparkles size={14} aria-hidden="true" />A little app preview
        </span>
        <h1 className={styles.guideTitle}>
          Your people.
          <br />
          Your places.
          <br />
          <span>Your everyday.</span>
        </h1>
        <p className={styles.guideCopy}>
          One community, four ways in. Less website navigation, more of the
          things you came here for.
        </p>
        <div className={styles.guideTabs}>
          {APP_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id];
            return (
              <div key={tab.id}>
                <span className={styles.guideIcon}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <p>
                  <strong>{tab.label}</strong>
                  <span>{tab.description}</span>
                </p>
              </div>
            );
          })}
        </div>
        <p className={styles.guideHint}>
          Try the bottom tabs, search a listing, or save an event.
          <br />
          Sample content only. Nothing here is posted or sent.
        </p>
      </aside>

      <Tabs.Root
        value={activeTab}
        onValueChange={setActiveTab}
        className={styles.phone}
      >
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span>
          <div>
            <Signal size={14} />
            <Wifi size={14} />
            <BatteryFull size={19} />
          </div>
        </div>

        <header className={styles.header}>
          <div className={styles.brand}>
            <img
              src={SURFACE_MARK.www.src}
              alt={SURFACE_MARK.www.alt}
              width={SURFACE_MARK.www.width}
              height={SURFACE_MARK.www.height}
            />
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Preview notifications"
              onClick={() =>
                openDetail({
                  title: 'A little community catch-up',
                  description:
                    'Updates from your Panas, upcoming plans, and group activity would live here. These are sample screens, not live notifications.',
                  meta: 'Notifications preview',
                })
              }
            >
              <Bell size={21} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.panels}>
          <Tabs.Content value="directory" forceMount className={styles.panel}>
            <DirectoryScreen
              profileId={directoryProfileId}
              onOpen={openDetail}
            />
          </Tabs.Content>
          <Tabs.Content value="social" forceMount className={styles.panel}>
            <SocialScreen onOpen={openDetail} />
          </Tabs.Content>
          <Tabs.Content value="community" forceMount className={styles.panel}>
            <CommunityScreen
              onOpen={openDetail}
              onDirectory={() => {
                setActiveTab('directory');
                directoryTab.current?.focus();
              }}
              profileId={communityProfileId}
            />
          </Tabs.Content>
        </div>

        <nav className={styles.bottomBar} aria-label="App navigation">
          <Tabs.List className={styles.appTabs} aria-label="App sections">
            {APP_TABS.filter((tab) => tab.id !== 'profile').map((tab) => {
              const Icon = TAB_ICONS[tab.id];
              return (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  className={styles.tab}
                  ref={tab.id === 'directory' ? directoryTab : undefined}
                >
                  <span className={styles.tabIcon}>
                    <Icon size={23} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span>{tab.label}</span>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>
          <a
            href={APP_PROFILE.href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.tab}
            aria-label={`Profile: @${APP_PROFILE.handle} (opens in a new tab)`}
          >
            <span className={styles.tabIcon}>
              <img
                src={APP_PROFILE.avatar}
                alt=""
                width={30}
                height={30}
                className={styles.profileAvatar}
              />
            </span>
            <span>Profile</span>
          </a>
        </nav>
        <div className={styles.gestureBar} aria-hidden="true">
          <span />
        </div>
      </Tabs.Root>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent
          className={styles.details}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            lastOpener.current?.focus();
          }}
        >
          {detail && (
            <>
              {detail.image && (
                <img src={detail.image} alt="" className={styles.detailImage} />
              )}
              <DialogHeader>
                <span className={styles.eyebrow}>A closer look</span>
                <DialogTitle className={styles.detailTitle}>
                  {detail.title}
                </DialogTitle>
                <DialogDescription className={styles.detailDescription}>
                  {detail.description}
                </DialogDescription>
              </DialogHeader>
              {detail.meta && (
                <p className={styles.detailMeta}>{detail.meta}</p>
              )}
              <p className={styles.demoNote}>
                Design preview. No live actions or uploads.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chips({
  label,
  options,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={styles.chips}
      role="group"
      aria-label={label}
      data-compact={compact}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={styles.chip}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MockFooter({ photoCredit = false }: { photoCredit?: boolean }) {
  return (
    <footer className={styles.mockFooter}>
      <p>Design mock /mock/app. Sample data only.</p>
      {photoCredit && (
        <p>
          Stock cover photos:{' '}
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Pexels
          </a>
        </p>
      )}
    </footer>
  );
}

function SocialScreen({ onOpen }: { onOpen: OpenDetail }) {
  const [filter, setFilter] = useState('everyone');
  const posts =
    filter === 'panas' ? APP_POSTS.filter((post) => post.fromPana) : APP_POSTS;

  const openComposer = () =>
    onOpen({
      title: 'Share a little moment',
      description:
        'Posts, stories, and the camera start here. This mock is just for trying the navigation: it does not access your camera or publish anything.',
      meta: 'Composer preview',
    });

  return (
    <>
      <h2 className="sr-only">Pana Social</h2>
      <div className={styles.stories} aria-label="Sample stories">
        <button
          type="button"
          className={styles.story}
          onClick={openComposer}
          aria-label="Preview adding your story"
        >
          <span className={styles.ownStory}>
            <img src={MOCK_VIEWER.avatar} alt="" width={60} height={60} />
            <span className={styles.storyPlus}>
              <Plus size={14} aria-hidden="true" />
            </span>
          </span>
          <span>Your story</span>
        </button>
        {APP_STORIES.map((story) => (
          <button
            key={story.id}
            type="button"
            className={styles.story}
            aria-label={`Preview ${story.name}'s story`}
            onClick={() =>
              onOpen({
                title: `${story.name}'s story`,
                description: story.caption,
                image: story.image,
                meta: 'Sample story / Visible for 24 hours in the app',
              })
            }
          >
            <span className={styles.storyRing}>
              <img src={story.avatar} alt="" width={60} height={60} />
            </span>
            <span>{story.name}</span>
          </button>
        ))}
      </div>
      <div className={styles.screenBody}>
        <button
          type="button"
          className={styles.composer}
          onClick={openComposer}
        >
          <img src={MOCK_VIEWER.avatar} alt="" width={34} height={34} />
          <span>What&apos;s new, Claribel?</span>
          <Camera size={22} aria-hidden="true" />
        </button>
        <Chips
          label="Feed audience"
          compact
          options={[
            { id: 'everyone', label: 'Everyone' },
            { id: 'panas', label: 'My Panas' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className={styles.cardStack}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onOpen={onOpen} />
          ))}
        </div>
        <MockFooter />
      </div>
    </>
  );
}

function PostCard({ post, onOpen }: { post: MockPost; onOpen: OpenDetail }) {
  const [liked, setLiked] = useState(Boolean(post.liked));
  const likes = post.likesCount - (post.liked ? 1 : 0) + (liked ? 1 : 0);

  return (
    <article className={styles.postCard}>
      <div className={styles.postAuthor}>
        <img src={post.author.avatar} alt="" width={40} height={40} />
        <div>
          <h3>{post.author.name}</h3>
          <p>
            @{post.author.handle} / {post.published}
          </p>
        </div>
        <span className={styles.postSparkle} aria-hidden="true">
          <Sparkles size={19} />
        </span>
      </div>
      <p className={styles.postBody}>{post.body}</p>
      {post.attachments?.[0] && (
        <img
          src={post.attachments[0].src}
          alt={post.attachments[0].alt}
          className={styles.postImage}
          loading="lazy"
        />
      )}
      <div className={styles.postActions}>
        <button
          type="button"
          aria-label={`${liked ? 'Unlike' : 'Like'} post by ${post.author.name}`}
          aria-pressed={liked}
          onClick={() => setLiked((current) => !current)}
        >
          <Heart
            size={20}
            fill={liked ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
          {likes}
        </button>
        <button
          type="button"
          aria-label={`Preview replies to ${post.author.name}`}
          onClick={() =>
            onOpen({
              title: 'A conversation, not just a post',
              description: post.topReply
                ? `${post.topReply.author.name}: ${post.topReply.body}`
                : post.body,
              meta: `${post.repliesCount} sample replies`,
            })
          }
        >
          <MessageCircle size={20} aria-hidden="true" />
          {post.repliesCount}
        </button>
        <span>Made of little moments</span>
      </div>
    </article>
  );
}

function DirectoryScreen({
  profileId,
  onOpen,
}: {
  profileId: string | null;
  onOpen: OpenDetail;
}) {
  const [searchScope, setSearchScope] = useState<
    (typeof APP_SEARCH_SCOPES)[number]
  >(APP_SEARCH_SCOPES[0]);
  const [query, setQuery] = useState('');
  // Keep each hidden map's filters and fitted-card preview stable.
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [eventQuery, setEventQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [directoryFilterVersion, setDirectoryFilterVersion] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const openedProfileId = useRef<string | null>(null);
  const profile = LISTINGS.find((listing) => listing.id === profileId);

  useLayoutEffect(() => {
    if (profileId !== null) {
      setSearchScope(APP_SEARCH_SCOPES[0]);
      setQuery(directoryQuery);
    }
    if (profile && openedProfileId.current !== profile.id) {
      setQuery('');
      setDirectoryQuery('');
      setCategory('All');
    }
  }, [directoryQuery, profile, profileId]);

  const clearSearch = () => {
    setQuery('');
    if (searchScope.id === 'directory') {
      setDirectoryQuery('');
      setCategory('All');
    } else if (searchScope.id === 'events') {
      setEventQuery('');
    }
    searchInput.current?.focus({ preventScroll: true });
  };

  const backToDirectory = () => {
    if (openedProfileId.current === profileId && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.replace('#directory');
    }
  };

  return (
    <>
      <h2 className="sr-only">Directory</h2>
      <div className={styles.directoryScreen} hidden={profileId !== null}>
        <div className={styles.directoryControls}>
          <div
            className={styles.search}
            role="search"
            aria-label="Directory search"
          >
            <span className={styles.searchScope}>
              <ScopeMenu
                term={query}
                scope={searchScope.siteScope}
                scopes={APP_SEARCH_SCOPES.map((entry) => entry.siteScope)}
                counts={null}
                signedIn
                compact
                showDestinations={false}
                panelStyle={{
                  top: 'var(--app-scope-menu-top)',
                  width: 'min(23rem, calc(100cqw - 54px))',
                  maxHeight: 'var(--app-scope-menu-max-height)',
                  overflowY: 'auto',
                }}
                onSelect={(scope) => {
                  const next = APP_SEARCH_SCOPES.find(
                    (entry) => entry.siteScope === scope
                  );
                  if (!next) {
                    throw new Error('Unsupported directory search category');
                  }
                  if (next.id === 'directory') setDirectoryQuery(query);
                  else if (next.id === 'events') setEventQuery(query);
                  setSearchScope(next);
                }}
              />
            </span>
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchInput}
              type="search"
              aria-label={searchScope.searchLabel}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (searchScope.id === 'directory') {
                  setDirectoryQuery(event.target.value);
                } else if (searchScope.id === 'events') {
                  setEventQuery(event.target.value);
                }
              }}
              placeholder={searchScope.placeholder}
            />
          </div>
          <div hidden={searchScope.id !== 'directory'}>
            <Chips
              label="Listing categories"
              options={DIRECTORY_CATEGORIES.map((entry) => ({
                id: entry,
                label: entry,
              }))}
              value={category}
              onChange={(next) => {
                setCategory(next);
                // Re-selecting a chip also exits its selected-card preview.
                setDirectoryFilterVersion((version) => version + 1);
              }}
            />
          </div>
        </div>
        <MapResults
          kind="directory"
          items={getAppDirectoryMapResults(directoryQuery, category)}
          filterKey={JSON.stringify([
            directoryQuery,
            category,
            directoryFilterVersion,
          ])}
          hidden={searchScope.id !== 'directory'}
          profileId={profileId}
          openedProfileId={openedProfileId}
          onOpen={onOpen}
          onClear={clearSearch}
        />
        <MapResults
          kind="events"
          items={getAppEventMapResults(eventQuery)}
          filterKey={eventQuery}
          hidden={searchScope.id !== 'events'}
          openedProfileId={openedProfileId}
          onOpen={onOpen}
          onClear={clearSearch}
        />
        <DirectoryGroupResults
          query={query}
          hidden={searchScope.id !== 'groups'}
          onOpen={onOpen}
          onClear={clearSearch}
        />
      </div>
      {profileId !== null && (
        <DirectoryProfile listing={profile} onBack={backToDirectory} />
      )}
    </>
  );
}

function MapResults({
  kind,
  items,
  filterKey,
  hidden,
  profileId = null,
  openedProfileId,
  onOpen,
  onClear,
}: {
  kind: 'directory' | 'events';
  items: AppMapResult[];
  filterKey: string;
  hidden: boolean;
  profileId?: string | null;
  openedProfileId: RefObject<string | null>;
  onOpen: OpenDetail;
  onClear: () => void;
}) {
  const isDirectory = kind === 'directory';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [sheetStop, setSheetStop] = useState<SheetStop>('peek');
  const [preview, setPreview] = useState<{
    height: number | null;
    filterKey: string;
  } | null>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const mapArea = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listingCards = useRef(new Map<string, HTMLElement>());
  const previousProfileId = useRef<string | null>(null);
  const previousFilter = useRef(filterKey);
  const wasPreview = useRef(false);
  const drag = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const sheetId = useId();

  useEffect(() => {
    const element = mapArea.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        setAvailableHeight(entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pins = getAppMapPins(items);
  const activePin = pins.find((pin) => pin.id === activePinId);
  const listings = activePin?.results ?? items;
  const pinnedCount = listings.filter((listing) => listing.pin !== null).length;
  const offMapCount = listings.length - pinnedCount;
  const selected =
    listings.find((listing) => listing.id === selectedId) ??
    listings[0] ??
    null;
  const profileAvailable = items.some((listing) => listing.id === profileId);
  const height = availableHeight ?? 0;
  const snapHeights = getSheetHeights(height);
  const peekHeight = snapHeights.peek;
  const showingPreview =
    preview !== null && preview.filterKey === filterKey && dragHeight === null;
  const visibleListings = showingPreview && selected ? [selected] : listings;
  const sheetHeight =
    dragHeight ??
    Math.min(
      height,
      (showingPreview ? preview?.height : null) ?? snapHeights[sheetStop]
    );
  const mapHidden =
    availableHeight !== null && sheetHeight >= availableHeight - 1;

  useLayoutEffect(() => {
    if (previousFilter.current === filterKey) return;
    previousFilter.current = filterKey;
    wasPreview.current = false;
    setPreview(null);
    setActivePinId(null);
    setSheetStop((current) => (current === 'expanded' ? current : 'half'));
    if (list.current) list.current.scrollTop = 0;
  }, [filterKey]);

  useLayoutEffect(() => {
    const previous = previousProfileId.current;
    previousProfileId.current = profileId;
    if (
      profileId !== null &&
      profileAvailable &&
      openedProfileId.current !== profileId
    ) {
      setSelectedId(profileId);
      setActivePinId(null);
      setPreview({ height: null, filterKey });
      setSheetStop('half');
    } else if (profileId === null && previous !== null) {
      const target = listingCards.current.get(previous) ?? list.current;
      target?.focus({ preventScroll: true });
    }
  }, [filterKey, openedProfileId, profileAvailable, profileId]);

  useLayoutEffect(() => {
    const previous = wasPreview.current;
    wasPreview.current = showingPreview;
    const scroller = list.current;
    const card = selectedId ? listingCards.current.get(selectedId) : null;
    if (!showingPreview || !preview) {
      if (previous && card && scroller) {
        scrollToResultCard(card, scroller);
      }
      return;
    }

    const results = sheet.current;
    const area = mapArea.current;
    if (!card || !scroller || !results || !area) {
      throw new Error('The map preview cannot size the selected card');
    }
    const fitCard = () => {
      const areaHeight = area.getBoundingClientRect().height;
      if (areaHeight <= 0) return;
      const chrome =
        results.getBoundingClientRect().height -
        scroller.getBoundingClientRect().height;
      const requiredHeight =
        chrome + card.getBoundingClientRect().height + CARD_PREVIEW_INSET * 2;
      if (
        preview.height === null ||
        Math.abs(preview.height - requiredHeight) > 1
      ) {
        setPreview((current) =>
          current === preview ? { ...current, height: requiredHeight } : current
        );
      }
      if (
        requiredHeight >= areaHeight &&
        document.activeElement?.getAttribute('aria-controls') === card.id
      ) {
        card.focus({ preventScroll: true });
      }
      scroller.scrollTop = 0;
    };
    const observer = new ResizeObserver(fitCard);
    observer.observe(card);
    fitCard();
    return () => observer.disconnect();
  }, [availableHeight, preview, profileId, selectedId, showingPreview]);

  const browseSheet = (stop: SheetStop) => {
    setPreview(null);
    setActivePinId(null);
    setSheetStop(stop);
  };

  const previewListing = (id: string) => {
    setSelectedId(id);
    setActivePinId(null);
    setPreview({ height: null, filterKey });
    setSheetStop('half');
  };

  const resetListScroll = () => {
    if (list.current) list.current.scrollTop = 0;
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || !sheet.current) return;
    const startHeight = sheet.current.getBoundingClientRect().height;
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      height: startHeight,
      moved: false,
    };
    suppressClick.current = false;
    setDragHeight(startHeight);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const delta = current.startY - event.clientY;
    current.moved ||= Math.abs(delta) > 4;
    current.height = Math.min(
      height,
      Math.max(peekHeight, current.startHeight + delta)
    );
    setDragHeight(current.height);
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.moved) {
      browseSheet(
        SHEET_STOPS.reduce<SheetStop>(
          (nearest, stop) =>
            Math.abs(snapHeights[stop] - current.height) <
            Math.abs(snapHeights[nearest] - current.height)
              ? stop
              : nearest,
          sheetStop
        )
      );
      suppressClick.current = true;
    }
    drag.current = null;
    setDragHeight(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    suppressClick.current = false;
    setDragHeight(null);
  };

  const moveSheetWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        browseSheet(sheetStop === 'peek' ? 'half' : 'expanded');
        break;
      case 'ArrowDown':
        event.preventDefault();
        browseSheet(sheetStop === 'expanded' ? 'half' : 'peek');
        break;
      case 'Home':
        event.preventDefault();
        browseSheet('peek');
        break;
      case 'End':
        event.preventDefault();
        browseSheet('expanded');
        break;
    }
  };

  const renderCard = (listing: AppMapResult) => (
    <>
      <span className={styles.listingCover}>
        {listing.image ? (
          <img src={listing.image} alt="" loading="lazy" />
        ) : !isDirectory ? (
          <CalendarDays size={30} strokeWidth={1.5} aria-hidden="true" />
        ) : listing.pin ? (
          <Store size={30} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Globe size={30} strokeWidth={1.5} aria-hidden="true" />
        )}
        {isDirectory && (
          <span className={styles.listingNumber} aria-hidden="true">
            {listing.number}
          </span>
        )}
      </span>
      <span className={styles.listingInfo}>
        <span className={styles.listingCategory}>{listing.category}</span>
        <strong>{listing.title}</strong>
        {!isDirectory && (
          <span className={styles.eventMapDate}>{listing.when}</span>
        )}
        <span
          className={!isDirectory ? styles.mapResultDescription : undefined}
        >
          {listing.description}
        </span>
        <span className={styles.listingPlace}>
          {listing.pin ? (
            <MapPin size={12} aria-hidden="true" />
          ) : (
            <Globe size={12} aria-hidden="true" />
          )}
          {listing.location}
        </span>
        {!isDirectory && (
          <span className="sr-only" id={`${sheetId}-${listing.id}-meta`}>
            {listing.meta}
          </span>
        )}
      </span>
    </>
  );

  return (
    <div
      ref={mapArea}
      className={styles.directoryExplorer}
      hidden={hidden}
      role="region"
      aria-label={
        isDirectory ? 'Directory map and results' : 'Event map and results'
      }
      data-dragging={dragHeight !== null}
    >
      <div
        className={styles.directoryMap}
        role="group"
        aria-label={
          isDirectory
            ? 'Illustrative South Florida map'
            : 'Illustrative South Florida event map'
        }
        aria-hidden={mapHidden}
        inert={mapHidden}
        style={{
          bottom: availableHeight === null ? undefined : sheetHeight,
        }}
      >
        <DirectoryMapArtwork />
        <span className={styles.mapAreaLabel}>
          <MapPin size={12} aria-hidden="true" />
          South Florida
        </span>
        <span className={styles.mapParkLabel} aria-hidden="true">
          Everglades
        </span>
        <span className={styles.mapOceanLabel} aria-hidden="true">
          Atlantic
          <br />
          Ocean
        </span>
        <div className={styles.mapPlot}>
          {pins.map((pin) => (
            <button
              key={pin.id}
              type="button"
              className={styles.mapPin}
              style={projectMockCoordinates(pin.coords)}
              aria-label={
                pin.results.length > 1
                  ? `Show ${pin.results.length} events in ${pin.label} on map`
                  : `Select ${pin.results[0].title} on map`
              }
              aria-pressed={pin.results.some(
                (listing) => listing.id === selected?.id
              )}
              aria-controls={
                pin.results.length > 1
                  ? sheetId
                  : visibleListings.some(
                        (listing) => listing.id === pin.results[0].id
                      )
                    ? `${sheetId}-${pin.results[0].id}`
                    : undefined
              }
              onClick={() => {
                if (pin.results.length === 1) {
                  previewListing(pin.results[0].id);
                } else {
                  wasPreview.current = false;
                  setPreview(null);
                  setSelectedId(pin.results[0].id);
                  setActivePinId(pin.id);
                  setSheetStop('half');
                  resetListScroll();
                }
              }}
            >
              {isDirectory ? (
                pin.results[0].number
              ) : pin.results.length > 1 ? (
                pin.results.length
              ) : (
                <CalendarDays size={19} aria-hidden="true" />
              )}
              <span className={styles.mapPinPlace} aria-hidden="true">
                {pin.label}
              </span>
            </button>
          ))}
        </div>
        {listings.length > 0 && pinnedCount === 0 && (
          <p className={styles.mapNotice}>
            <Globe size={19} aria-hidden="true" />
            {isDirectory ? (
              <>These finds don&apos;t need a storefront.</>
            ) : (
              'These events are online. Join from anywhere.'
            )}
          </p>
        )}
        <p className={styles.mapNote}>
          {isDirectory
            ? 'Sample map /mock/app'
            : 'Sample event areas, not venue locations /mock/app'}
        </p>
      </div>

      <section
        ref={sheet}
        className={styles.directorySheet}
        aria-label={isDirectory ? 'Directory results' : 'Event results'}
        data-snap={showingPreview ? 'preview' : sheetStop}
        style={{
          height: availableHeight === null ? undefined : sheetHeight,
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            browseSheet('peek');
          }
        }}
      >
        <div className={styles.sheetHeader}>
          <button
            type="button"
            role="slider"
            className={styles.sheetHandle}
            aria-label={
              isDirectory
                ? 'Results sheet position'
                : 'Event results sheet position'
            }
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={2}
            aria-valuenow={SHEET_STOPS.indexOf(sheetStop)}
            aria-valuetext={
              showingPreview
                ? isDirectory
                  ? 'Selected place preview'
                  : 'Selected event preview'
                : sheetStop === 'peek'
                  ? 'Map view'
                  : sheetStop === 'half'
                    ? 'Half-open list'
                    : 'Expanded list'
            }
            aria-controls={sheetId}
            aria-describedby={`${sheetId}-help`}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onKeyDown={moveSheetWithKeyboard}
            onClick={(event) => {
              // Captured pointer gestures also produce a click after a drag.
              if (suppressClick.current && event.detail > 0) {
                suppressClick.current = false;
                return;
              }
              suppressClick.current = false;
              browseSheet(sheetStop === 'expanded' ? 'peek' : 'expanded');
            }}
          >
            <span className={styles.sheetGrip} aria-hidden="true" />
          </button>
          <div className={styles.sheetHeading}>
            <p className={styles.sheetCount} role="status">
              {showingPreview
                ? isDirectory
                  ? 'Selected place'
                  : 'Selected event'
                : isDirectory
                  ? `${listings.length} local ${listings.length === 1 ? 'find' : 'finds'}`
                  : `${listings.length} ${listings.length === 1 ? 'event' : 'events'}${activePin ? ` in ${activePin.label}` : ''}`}
            </p>
            <span aria-hidden="true">
              {showingPreview || activePin
                ? `Show all ${items.length}`
                : sheetStop === 'expanded'
                  ? 'Show map'
                  : 'Show list'}
              <ChevronUp size={15} />
            </span>
          </div>
          <p className="sr-only" id={`${sheetId}-help`}>
            Drag up or down, use the arrow keys, or tap to switch between the
            map and the full list. Home shows the map; End opens the full list.
          </p>
        </div>
        <div
          ref={list}
          id={sheetId}
          className={styles.directoryList}
          role="region"
          aria-label={
            isDirectory ? 'Directory listings' : 'Event search results'
          }
          data-preview={showingPreview}
          tabIndex={0}
        >
          {!showingPreview && listings.length > 0 && (
            <p className={styles.sheetMapCount}>
              {pinnedCount} on map
              {offMapCount > 0 &&
                ` / ${offMapCount} ${isDirectory ? 'without a storefront' : 'online'}`}
            </p>
          )}
          <div className={styles.listingGrid}>
            {visibleListings.map((listing) =>
              listing.href ? (
                <a
                  key={listing.id}
                  ref={(element) => {
                    if (element) listingCards.current.set(listing.id, element);
                    else listingCards.current.delete(listing.id);
                  }}
                  id={`${sheetId}-${listing.id}`}
                  href={listing.href}
                  className={styles.listingCard}
                  aria-label={`View ${listing.title}`}
                  data-selected={listing.id === selected?.id}
                  onClick={(event) => {
                    if (
                      event.button === 0 &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.shiftKey &&
                      !event.altKey
                    ) {
                      openedProfileId.current = listing.id;
                      setSelectedId(listing.id);
                    }
                  }}
                >
                  {renderCard(listing)}
                </a>
              ) : (
                <button
                  key={listing.id}
                  type="button"
                  ref={(element) => {
                    if (element) listingCards.current.set(listing.id, element);
                    else listingCards.current.delete(listing.id);
                  }}
                  id={`${sheetId}-${listing.id}`}
                  className={styles.listingCard}
                  aria-label={`Preview ${listing.title}`}
                  aria-describedby={`${sheetId}-${listing.id}-meta`}
                  data-selected={listing.id === selected?.id}
                  onClick={() => onOpen(listing)}
                >
                  {renderCard(listing)}
                </button>
              )
            )}
          </div>
          {listings.length === 0 && (
            <div className={styles.emptyState}>
              <Search size={28} aria-hidden="true" />
              <h3>
                {isDirectory ? 'No local finds just yet' : 'No matching events'}
              </h3>
              <p>
                {isDirectory
                  ? 'Try a different search or category.'
                  : 'Try a different name, topic, or place.'}
              </p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onClear}
              >
                {isDirectory ? 'Clear filters' : 'Clear search'}
              </button>
            </div>
          )}
          {!showingPreview && <MockFooter />}
        </div>
      </section>
    </div>
  );
}

function DirectoryGroupResults({
  query,
  hidden,
  onOpen,
  onClear,
}: {
  query: string;
  hidden: boolean;
  onOpen: OpenDetail;
  onClear: () => void;
}) {
  const list = useRef<HTMLElement>(null);
  const resultsId = useId();
  const results = searchAppDirectoryContent('groups', query);

  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [query]);

  return (
    <section
      ref={list}
      className={styles.directorySearchResults}
      hidden={hidden}
      aria-label="Group search results"
      tabIndex={0}
    >
      <p className={styles.resultCount} role="status">
        {results.length} {results.length === 1 ? 'group' : 'groups'}
      </p>
      <div className={styles.cardStack}>
        {results.map((result) => (
          <button
            key={result.id}
            type="button"
            className={styles.discoveryCard}
            aria-label={`Preview ${result.title}`}
            aria-describedby={`${resultsId}-${result.id}-meta`}
            onClick={() => onOpen(result)}
          >
            <DiscoveryImage image={result.thumbnail} kind="groups" />
            <span className={styles.discoveryInfo}>
              <strong>{result.title}</strong>
              <span id={`${resultsId}-${result.id}-meta`}>{result.meta}</span>
              <span className={styles.discoveryDescription}>
                {result.description}
              </span>
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
      {results.length === 0 && (
        <div className={styles.emptyState}>
          <Search size={28} aria-hidden="true" />
          <h3>No matching groups</h3>
          <p>Try a different name, topic, or place.</p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onClear}
          >
            Clear search
          </button>
        </div>
      )}
      <MockFooter />
    </section>
  );
}

function DirectoryProfile({
  listing,
  onBack,
  backLabel = 'Back to directory',
}: {
  listing: (typeof LISTINGS)[number] | undefined;
  onBack: () => void;
  backLabel?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [listing?.id]);

  return (
    <section
      className={styles.directoryProfile}
      aria-label={
        listing ? `${listing.name} directory profile` : 'Directory profile'
      }
    >
      <header className={styles.profileToolbar}>
        <button type="button" className={styles.profileBack} onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          {backLabel}
        </button>
      </header>
      <div className={styles.profileContent}>
        {listing ? (
          <>
            <div className={styles.profileCover}>
              {listing.cover ? (
                <img src={listing.cover} alt="" />
              ) : (
                <>
                  {listing.coords ? (
                    <Store size={38} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Globe size={38} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span>No cover photo yet</span>
                </>
              )}
            </div>
            <div className={styles.profileIdentity}>
              {listing.certified && (
                <span className={styles.profileCertification}>
                  <BadgeCheck size={15} aria-hidden="true" />
                  Pana Certified
                </span>
              )}
              <h2 ref={heading} tabIndex={-1}>
                {listing.name}
              </h2>
              <p>{listing.tagline}</p>
              <ul
                className={styles.profileCategories}
                aria-label="Business categories"
              >
                {listing.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            </div>
            <div className={styles.profileSignal}>
              {listing.faces.length > 0 && (
                <span className={styles.profileAvatars} aria-hidden="true">
                  {listing.faces.map((face) => (
                    <img key={face} src={face} alt="" width={26} height={26} />
                  ))}
                </span>
              )}
              <span>{listing.signal}</span>
            </div>
            <section className={styles.profileSection}>
              <h3>About</h3>
              <p>{listing.blurb}</p>
            </section>
            <section className={styles.profileSection}>
              <h3>Location</h3>
              <p className={styles.profilePlace}>
                {listing.coords ? (
                  <MapPin size={16} aria-hidden="true" />
                ) : (
                  <Globe size={16} aria-hidden="true" />
                )}
                {listing.where}
              </p>
              {!listing.coords && <p>No storefront is shown on the map.</p>}
            </section>
            {listing.nextEvent && (
              <section className={styles.profileSection}>
                <h3>Next up</h3>
                <p className={styles.profilePlace}>
                  <CalendarDays size={16} aria-hidden="true" />
                  {listing.nextEvent}
                </p>
              </section>
            )}
          </>
        ) : (
          <div className={styles.profileSection}>
            <h2 ref={heading} tabIndex={-1}>
              Profile not found
            </h2>
            <p>That sample profile isn&apos;t part of this preview.</p>
          </div>
        )}
        <MockFooter />
      </div>
    </section>
  );
}

function DirectoryMapArtwork() {
  const gridId = useId();
  return (
    <svg
      className={styles.mapArtwork}
      viewBox="0 0 400 500"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={gridId}
          width="31"
          height="27"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M31 0H0V27"
            fill="none"
            stroke="var(--color-pana-cream)"
            strokeWidth="3"
          />
        </pattern>
      </defs>
      <rect width="400" height="500" className={styles.mapLand} />
      <rect width="400" height="500" fill={`url(#${gridId})`} />
      <path
        className={styles.mapPark}
        d="M0 0H97L101 53 84 99 102 151 82 206 95 264 64 319 74 371 55 432 67 500H0Z"
      />
      <path
        className={styles.mapPark}
        d="M178 54H219V92H184ZM146 280H190V318H151ZM240 380H270V423H233Z"
      />
      <path
        className={styles.mapWater}
        d="M351 0C348 61 339 80 345 133S322 209 327 262 309 344 311 387 291 460 284 500H400V0Z"
      />
      <path
        className={styles.mapLand}
        d="M367 0H375L363 111 359 188 343 269 341 344 320 422 305 500H298L314 419 334 340 336 265 352 186 355 110Z"
      />
      <g fill="none" stroke="var(--color-pana-cream)" strokeWidth="8">
        <path d="M93 60H347M83 125H340M99 201H328M82 269H323M66 348H312M59 426H299" />
        <path d="M137 0L144 126 134 268 144 500M225 0L217 157 226 289 210 500" />
      </g>
      <path
        d="M304 -10C300 101 288 132 289 214S273 340 253 510"
        fill="none"
        stroke="var(--color-pana-cream)"
        strokeWidth="12"
      />
      <path
        d="M304 -10C300 101 288 132 289 214S273 340 253 510"
        fill="none"
        className={styles.mapHighway}
        strokeWidth="4"
      />
      <path
        d="M113 0L111 132 124 257 104 500"
        fill="none"
        stroke="var(--color-pana-cream)"
        strokeWidth="9"
      />
    </svg>
  );
}

type CommunitySection = 'overview' | 'events' | 'groups' | 'places';

function CommunityScreen({
  onOpen,
  onDirectory,
  profileId,
}: {
  onOpen: OpenDetail;
  onDirectory: () => void;
  profileId: string | null;
}) {
  const [view, setView] = useState('yours');
  const [section, setSection] = useState<CommunitySection>('overview');
  const [eventFilter, setEventFilter] = useState('all');
  const [groupView, setGroupView] = useState('mine');
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [rsvps, setRsvps] = useState(
    () =>
      new Map(APP_INITIAL_RSVPS.map(({ eventId, status }) => [eventId, status]))
  );
  const [joined, setJoined] = useState(
    () =>
      new Set(
        MOCK_GROUPS.filter((group) => group.joined).map((group) => group.id)
      )
  );
  const [requested, setRequested] = useState(
    () =>
      new Set(
        MOCK_GROUPS.filter((group) => group.requested).map((group) => group.id)
      )
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const viewControls = useRef<HTMLDivElement>(null);
  const browseBack = useRef<HTMLButtonElement>(null);
  const browseOpener = useRef<HTMLButtonElement | null>(null);
  const nextFocus = useRef<'browse' | 'home' | 'view' | null>(null);
  const lastPlaceOpener = useRef<HTMLAnchorElement | null>(null);
  const previousProfileId = useRef<string | null>(null);
  const placeLinks = useRef(new Map<string, HTMLAnchorElement>());
  const profile = LISTINGS.find((listing) => listing.id === profileId);
  const myGroups = MOCK_GROUPS.filter((group) => joined.has(group.id));
  const plans = MOCK_EVENTS.filter((event) => rsvps.has(event.id));
  const eventPicks = APP_EVENT_PICKS.filter(
    ({ event }) => !rsvps.has(event.id)
  );
  const groupPicks = APP_GROUP_PICKS.filter(
    ({ group }) => !joined.has(group.id)
  );
  const originLabel = view === 'yours' ? 'Yours' : 'Discover';
  const browseTitle = {
    overview: '',
    events: 'Events',
    groups: 'Groups',
    places: 'Places',
  }[section];

  useLayoutEffect(() => {
    const target =
      nextFocus.current === 'browse'
        ? browseBack.current
        : nextFocus.current === 'home'
          ? (browseOpener.current ??
            viewControls.current?.querySelector<HTMLButtonElement>(
              '[aria-pressed="true"]'
            ))
          : nextFocus.current === 'view'
            ? viewControls.current?.querySelector<HTMLButtonElement>(
                '[aria-pressed="true"]'
              )
            : null;
    if (target) {
      target.focus({ preventScroll: true });
    }
    nextFocus.current = null;
  }, [section, view]);

  useLayoutEffect(() => {
    const previous = previousProfileId.current;
    previousProfileId.current = profileId;
    if (profileId !== null && lastPlaceOpener.current === null) {
      setView('discover');
      setSection('places');
    } else if (profileId === null && previous !== null) {
      const target =
        lastPlaceOpener.current ??
        placeLinks.current.get(previous) ??
        heading.current;
      target?.focus({ preventScroll: true });
    }
  }, [profileId]);

  const backToCommunity = () => {
    if (
      lastPlaceOpener.current?.hash ===
        `${COMMUNITY_PROFILE_HASH}${profileId}` &&
      window.history.length > 1
    ) {
      window.history.back();
    } else {
      window.location.replace('#community');
    }
  };

  const selectView = (next: string, moveFocus = false) => {
    nextFocus.current = moveFocus ? 'view' : null;
    setView(next);
    setSection('overview');
  };

  const browseSection = (next: CommunitySection, opener: HTMLButtonElement) => {
    browseOpener.current = opener;
    nextFocus.current = 'browse';
    setSection(next);
  };

  const openEvents = (filter: string, opener: HTMLButtonElement) => {
    setEventFilter(filter);
    browseSection('events', opener);
  };

  const openGroups = (filter: string, opener: HTMLButtonElement) => {
    setGroupView(filter);
    browseSection('groups', opener);
  };

  const toggleSaved = (id: string) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRsvp = (id: string, status: AppRsvp) => {
    setRsvps((current) => {
      const next = new Map(current);
      if (next.get(id) === status) next.delete(id);
      else next.set(id, status);
      return next;
    });
  };

  const showEvent = (event: (typeof MOCK_EVENTS)[number]) =>
    onOpen({
      title: event.title,
      description: event.blurb,
      image: event.cover,
      meta: `${rsvps.get(event.id) === 'going' ? 'Going / ' : rsvps.get(event.id) === 'interested' ? 'Interested / ' : ''}${event.when} / ${event.where}`,
    });

  const showGroup = (group: (typeof MOCK_GROUPS)[number]) =>
    onOpen({
      title: group.name,
      description: group.summary,
      image: group.cover,
      meta: `${group.memberCount + (joined.has(group.id) && !group.joined ? 1 : 0)} members / Sample group`,
    });

  const placeCard = (
    { listing, why }: (typeof APP_PLACE_PICKS)[number],
    inPlaces: boolean
  ) => (
    <a
      key={listing.id}
      href={`${COMMUNITY_PROFILE_HASH}${listing.id}`}
      className={styles.discoveryCard}
      aria-label={`View ${listing.name}`}
      ref={
        inPlaces
          ? (element) => {
              if (element) placeLinks.current.set(listing.id, element);
              else placeLinks.current.delete(listing.id);
            }
          : undefined
      }
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          lastPlaceOpener.current = event.currentTarget;
        }
      }}
    >
      {inPlaces ? (
        <DiscoveryImage image={listing.cover} kind="places" />
      ) : (
        <DiscoveryCover image={listing.cover} kind="places" why={why} />
      )}
      <span className={styles.discoveryInfo}>
        <strong>{listing.name}</strong>
        {inPlaces ? (
          <>
            <span>{listing.where}</span>
            <span className={styles.discoveryReason}>
              <Sparkles size={12} aria-hidden="true" />
              {why}
            </span>
          </>
        ) : (
          <>
            <span className={styles.discoveryDescription}>
              {listing.tagline}
            </span>
            <span className={styles.discoveryMeta}>
              {listing.coords === null ? (
                <Globe size={12} aria-hidden="true" />
              ) : (
                <MapPin size={12} aria-hidden="true" />
              )}
              <span>{listing.where}</span>
            </span>
            <span className={styles.discoveryMeta}>
              <Store size={12} aria-hidden="true" />
              <span>{listing.categories.join(' / ')}</span>
            </span>
            <span className={styles.discoveryStats}>
              <span>{listing.signal}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </span>
          </>
        )}
      </span>
      {inPlaces && <ChevronRight size={16} aria-hidden="true" />}
    </a>
  );

  return (
    <>
      <h2 ref={heading} tabIndex={-1} className="sr-only">
        Community
      </h2>
      <div className={styles.communityScreen} hidden={profileId !== null}>
        <div className={styles.communityControls}>
          <div ref={viewControls} hidden={section !== 'overview'}>
            <Chips
              label="Community views"
              options={[...COMMUNITY_VIEWS]}
              value={view}
              onChange={(next) => selectView(next)}
              compact
            />
          </div>
          <div className={styles.browseHeader} hidden={section === 'overview'}>
            <button
              ref={browseBack}
              type="button"
              className={styles.profileBack}
              aria-label={`Back to ${originLabel}`}
              onClick={() => {
                nextFocus.current = 'home';
                setSection('overview');
              }}
            >
              <ArrowLeft size={17} aria-hidden="true" />
              {originLabel}
            </button>
            <span>{browseTitle}</span>
          </div>
        </div>
        <div className={styles.communityContents}>
          <section
            className={styles.communityPane}
            hidden={section !== 'overview' || view !== 'yours'}
            aria-label="Your community"
            tabIndex={0}
          >
            <div className={styles.screenBody}>
              <p className={styles.discoveryNote}>
                Sample memberships and plans
              </p>
              <section
                className={styles.discoveryLane}
                aria-label="Your groups"
              >
                <div className={styles.laneHeading}>
                  <h3>Your groups</h3>
                  <button
                    type="button"
                    onClick={(event) => openGroups('mine', event.currentTarget)}
                  >
                    All your groups ({myGroups.length})
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
                {myGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`${styles.discoveryCard} ${styles.membershipCard}`}
                    aria-label={`Preview ${group.name}`}
                    onClick={() => showGroup(group)}
                  >
                    <DiscoveryImage image={group.avatar} kind="groups" />
                    <span className={styles.discoveryInfo}>
                      <strong>{group.name}</strong>
                      <span className={styles.discoveryReason}>
                        {group.visibility === 'private'
                          ? 'Private group'
                          : group.postsThisWeek > 0
                            ? `${group.postsThisWeek} posts this week`
                            : 'No recent posts'}
                      </span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
                {myGroups.length === 0 && (
                  <div className={styles.emptyState}>
                    <Users size={26} aria-hidden="true" />
                    <h3>Your people are out there</h3>
                    <p>Groups you join will be right here.</p>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => selectView('discover', true)}
                    >
                      Discover groups
                    </button>
                  </div>
                )}
              </section>
              <section className={styles.discoveryLane} aria-label="Your plans">
                <div className={styles.laneHeading}>
                  <h3>Your plans</h3>
                  <button
                    type="button"
                    onClick={(event) =>
                      openEvents('plans', event.currentTarget)
                    }
                  >
                    View plans ({plans.length})
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
                {plans.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={styles.discoveryCard}
                    onClick={() => showEvent(event)}
                  >
                    <DiscoveryImage image={event.cover} kind="events" />
                    <span className={styles.discoveryInfo}>
                      <strong>{event.title}</strong>
                      <span>{event.when}</span>
                      <span
                        className={styles.planStatus}
                        data-status={rsvps.get(event.id)}
                      >
                        {rsvps.get(event.id) === 'going' ? (
                          <>
                            <Check size={12} aria-hidden="true" />
                            Going
                          </>
                        ) : (
                          <>
                            <Heart size={12} aria-hidden="true" />
                            Interested
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
                {plans.length === 0 && (
                  <div className={styles.emptyState}>
                    <CalendarDays size={26} aria-hidden="true" />
                    <h3>A little room for plans</h3>
                    <p>Events you mark Going or Interested will appear here.</p>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => selectView('discover', true)}
                    >
                      Find an event
                    </button>
                  </div>
                )}
              </section>
              <button
                type="button"
                className={styles.savedPlans}
                onClick={(event) => openEvents('saved', event.currentTarget)}
              >
                <Bookmark size={16} aria-hidden="true" />
                Saved events ({saved.size})
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <MockFooter photoCredit />
            </div>
          </section>
          <section
            className={styles.communityPane}
            hidden={section !== 'overview' || view !== 'discover'}
            aria-label="Discover recommendations"
            tabIndex={0}
          >
            <div className={styles.screenBody}>
              <p className={styles.discoveryNote}>Based on sample activity</p>
              <section
                className={styles.discoveryLane}
                aria-label="Event picks"
              >
                <div className={styles.laneHeading}>
                  <h3>A little something to do</h3>
                  <button
                    type="button"
                    onClick={(event) => openEvents('all', event.currentTarget)}
                  >
                    All events <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
                <DiscoverySlider label="Recommended events">
                  {eventPicks.map(({ event, why }) => (
                    <button
                      key={event.id}
                      type="button"
                      className={styles.discoveryCard}
                      onClick={() => showEvent(event)}
                    >
                      <DiscoveryCover
                        image={event.cover}
                        kind="events"
                        why={why}
                      />
                      <span className={styles.discoveryInfo}>
                        <strong>{event.title}</strong>
                        <span className={styles.discoveryMeta} data-emphasis>
                          <CalendarDays size={12} aria-hidden="true" />
                          <span>{event.when}</span>
                        </span>
                        <span className={styles.discoveryMeta}>
                          {event.mode === 'online' ? (
                            <Globe size={12} aria-hidden="true" />
                          ) : (
                            <MapPin size={12} aria-hidden="true" />
                          )}
                          <span>{event.where}</span>
                        </span>
                        <span className={styles.discoveryDescription}>
                          {event.blurb}
                        </span>
                        <span className={styles.discoveryStats}>
                          <Users size={12} aria-hidden="true" />
                          <span>
                            {getAppEventGoingCount(event, rsvps.get(event.id))}{' '}
                            going
                          </span>
                          <ChevronRight size={14} aria-hidden="true" />
                        </span>
                      </span>
                    </button>
                  ))}
                </DiscoverySlider>
                {eventPicks.length === 0 && (
                  <p className={styles.discoveryNote}>
                    You have plans for every matching sample event.
                  </p>
                )}
              </section>
              <section
                className={styles.discoveryLane}
                aria-label="Group picks"
              >
                <div className={styles.laneHeading}>
                  <h3>Find your little circle</h3>
                  <button
                    type="button"
                    onClick={(event) =>
                      openGroups('discover', event.currentTarget)
                    }
                  >
                    All groups <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
                <DiscoverySlider label="Recommended groups">
                  {groupPicks.map(({ group, why }) => (
                    <button
                      key={group.id}
                      type="button"
                      className={styles.discoveryCard}
                      onClick={() => showGroup(group)}
                    >
                      <DiscoveryCover
                        image={group.cover ?? null}
                        kind="groups"
                        why={why}
                        avatar={group.avatar}
                      />
                      <span className={styles.discoveryInfo}>
                        <strong>{group.name}</strong>
                        <span className={styles.discoveryDescription}>
                          {group.summary}
                        </span>
                        <span className={styles.discoveryMeta}>
                          {group.topics.join(' / ')}
                        </span>
                        <span className={styles.discoveryStats}>
                          <Users size={12} aria-hidden="true" />
                          <span>{group.memberCount} members</span>
                          <span>{group.postsThisWeek} posts this week</span>
                          <ChevronRight size={14} aria-hidden="true" />
                        </span>
                      </span>
                    </button>
                  ))}
                </DiscoverySlider>
                {groupPicks.length === 0 && (
                  <p className={styles.discoveryNote}>
                    You have joined every matching sample group.
                  </p>
                )}
              </section>
              <section
                className={styles.discoveryLane}
                aria-label="Place picks"
              >
                <div className={styles.laneHeading}>
                  <h3>Good places to know</h3>
                  <button
                    type="button"
                    onClick={(event) =>
                      browseSection('places', event.currentTarget)
                    }
                  >
                    All picks <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
                <DiscoverySlider label="Recommended places">
                  {APP_PLACE_PICKS.map((pick) => placeCard(pick, false))}
                </DiscoverySlider>
              </section>
              <MockFooter photoCredit />
            </div>
          </section>
          <section
            className={styles.communityPane}
            hidden={section !== 'events'}
            aria-label="Community events"
            tabIndex={0}
          >
            <EventsScreen
              onOpen={onOpen}
              filter={eventFilter}
              onFilterChange={setEventFilter}
              saved={saved}
              onSave={toggleSaved}
              rsvps={rsvps}
              onRsvp={toggleRsvp}
            />
          </section>
          <section
            className={styles.communityPane}
            hidden={section !== 'groups'}
            aria-label="Community groups"
            tabIndex={0}
          >
            <GroupsScreen
              onOpen={onOpen}
              view={groupView}
              onViewChange={setGroupView}
              joined={joined}
              requested={requested}
              onJoin={(id) => setJoined((current) => new Set(current).add(id))}
              onRequest={(id) =>
                setRequested((current) => new Set(current).add(id))
              }
            />
          </section>
          <section
            className={styles.communityPane}
            hidden={section !== 'places'}
            aria-label="Community places"
            tabIndex={0}
          >
            <div className={styles.screenBody}>
              <p className={styles.discoveryNote}>
                Places matched to sample interests
              </p>
              <div className={styles.discoveryLane}>
                {APP_PLACE_PICKS.map((pick) => placeCard(pick, true))}
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onDirectory}
              >
                <MapPin size={16} aria-hidden="true" />
                Browse the directory
              </button>
              <MockFooter />
            </div>
          </section>
        </div>
      </div>
      {profileId !== null && (
        <DirectoryProfile
          listing={profile}
          onBack={backToCommunity}
          backLabel="Back to Community"
        />
      )}
    </>
  );
}

function DiscoverySlider({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const count = Children.count(children);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const behavior = reducedMotion ? 'auto' : 'smooth';
  const { railRef, nudge } = useRail<HTMLDivElement>(
    `.${styles.discoveryCard}`,
    behavior
  );

  if (count === 0) return null;

  return (
    <div
      ref={railRef}
      className={styles.discoverySlides}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      aria-description="Swipe or scroll horizontally to browse. When focused, use Left/Right arrow keys, Home, or End."
      tabIndex={0}
      data-single={count === 1}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          nudge(event.key === 'ArrowRight' ? 1 : -1);
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          event.currentTarget.scrollTo({
            left: event.key === 'Home' ? 0 : event.currentTarget.scrollWidth,
            behavior,
          });
        }
      }}
    >
      {children}
    </div>
  );
}

function DiscoveryCover({
  image,
  kind,
  why,
  avatar,
}: {
  image: string | null;
  kind: 'events' | 'groups' | 'places';
  why: string;
  avatar?: string;
}) {
  return (
    <span className={styles.discoveryCover}>
      <DiscoveryImage image={image} kind={kind} />
      {avatar && (
        <img
          className={styles.discoveryAvatar}
          src={avatar}
          alt=""
          loading="lazy"
        />
      )}
      <span className={styles.discoveryReason}>
        <Sparkles size={12} aria-hidden="true" />
        <span>{why}</span>
      </span>
    </span>
  );
}

function DiscoveryImage({
  image,
  kind,
}: {
  image: string | null;
  kind: 'events' | 'groups' | 'places';
}) {
  const Icon =
    kind === 'events' ? CalendarDays : kind === 'groups' ? Users : Store;
  return (
    <span className={styles.discoveryImage} data-kind={kind}>
      {image ? (
        <img src={image} alt="" loading="lazy" />
      ) : (
        <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
      )}
    </span>
  );
}

function EventsScreen({
  onOpen,
  filter,
  onFilterChange,
  saved,
  onSave,
  rsvps,
  onRsvp,
}: {
  onOpen: OpenDetail;
  filter: string;
  onFilterChange: (value: string) => void;
  saved: ReadonlySet<string>;
  onSave: (id: string) => void;
  rsvps: ReadonlyMap<string, AppRsvp>;
  onRsvp: (id: string, status: AppRsvp) => void;
}) {
  const summary = useRef<HTMLParagraphElement>(null);
  const refocusResults = useRef(false);
  useLayoutEffect(() => {
    if (refocusResults.current) {
      summary.current?.focus({ preventScroll: true });
      refocusResults.current = false;
    }
  }, [saved, rsvps]);

  const events = MOCK_EVENTS.filter((event) =>
    filter === 'plans'
      ? rsvps.has(event.id)
      : filter === 'saved'
        ? saved.has(event.id)
        : filter === 'all' || event.bucket === filter
  );

  return (
    <>
      <h2 className="sr-only">Events</h2>
      <div className={styles.screenBody}>
        <Chips
          label="Event filters"
          options={[
            { id: 'all', label: 'All dates' },
            { id: 'plans', label: `Your plans (${rsvps.size})` },
            { id: 'today', label: 'Tonight' },
            { id: 'weekend', label: 'This weekend' },
            { id: 'saved', label: `Saved (${saved.size})` },
          ]}
          value={filter}
          onChange={onFilterChange}
        />
        <p
          ref={summary}
          tabIndex={-1}
          className={styles.resultCount}
          role="status"
        >
          {filter === 'plans'
            ? `${events.length} ${events.length === 1 ? 'plan' : 'plans'}`
            : `${events.length} ${filter === 'saved' ? 'saved' : 'sample'} ${events.length === 1 ? 'event' : 'events'}`}
        </p>
        <div className={styles.cardStack}>
          {events.map((event) => {
            const rsvp = rsvps.get(event.id);
            const going = getAppEventGoingCount(event, rsvp);
            const full = event.cap !== null && going >= event.cap;
            return (
              <article key={event.id} className={styles.eventCard}>
                <div className={styles.eventCover}>
                  {event.cover ? (
                    <img src={event.cover} alt="" loading="lazy" />
                  ) : (
                    <CalendarDays size={44} aria-hidden="true" />
                  )}
                  <span className={styles.eventDate}>{event.when}</span>
                  <button
                    type="button"
                    className={styles.saveButton}
                    aria-label={`${saved.has(event.id) ? 'Unsave' : 'Save'} ${event.title}`}
                    aria-pressed={saved.has(event.id)}
                    onClick={() => {
                      refocusResults.current = filter === 'saved';
                      onSave(event.id);
                    }}
                  >
                    <Bookmark
                      size={21}
                      fill={saved.has(event.id) ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <div className={styles.eventInfo}>
                  <span className={styles.eyebrow}>{event.tags[0]}</span>
                  <h3>
                    <button
                      type="button"
                      onClick={() =>
                        onOpen({
                          title: event.title,
                          description: event.blurb,
                          image: event.cover,
                          meta: `${event.when} / ${event.where}`,
                        })
                      }
                    >
                      {event.title}
                      <ArrowUpRight size={19} aria-hidden="true" />
                    </button>
                  </h3>
                  <p>
                    <MapPin size={14} aria-hidden="true" />
                    {event.where}
                  </p>
                  <span className={styles.going}>
                    <Users size={14} aria-hidden="true" />
                    {going} going in this sample
                  </span>
                  <div
                    className={styles.rsvpChoices}
                    role="group"
                    aria-label={`Your RSVP for ${event.title}`}
                  >
                    {(['going', 'interested'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-label={`${status === 'going' ? 'Going' : 'Interested'}: ${event.title}`}
                        aria-pressed={rsvp === status}
                        disabled={
                          status === 'going' && full && rsvp !== 'going'
                        }
                        onClick={() => {
                          refocusResults.current =
                            filter === 'plans' && rsvp === status;
                          onRsvp(event.id, status);
                        }}
                      >
                        {status === 'going' ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <Heart size={14} aria-hidden="true" />
                        )}
                        {status === 'going' ? 'Going' : 'Interested'}
                      </button>
                    ))}
                  </div>
                  {full && rsvp !== 'going' && (
                    <p className={styles.rsvpNote}>
                      At capacity. You can still mark Interested.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {events.length === 0 && (
          <div className={styles.emptyState}>
            {filter === 'plans' ? (
              <CalendarDays size={28} aria-hidden="true" />
            ) : (
              <Bookmark size={28} aria-hidden="true" />
            )}
            <h3>A little room for plans</h3>
            <p>
              {filter === 'plans'
                ? 'Mark an event Going or Interested to add it to your plans.'
                : 'Save an event to find it here. Saving is separate from Going or Interested.'}
            </p>
          </div>
        )}
        <p className={styles.demoNote}>
          RSVP changes are preview-only. Tap your selection again to remove it.
        </p>
        <MockFooter photoCredit />
      </div>
    </>
  );
}

function GroupsScreen({
  onOpen,
  view,
  onViewChange,
  joined,
  requested,
  onJoin,
  onRequest,
}: {
  onOpen: OpenDetail;
  view: string;
  onViewChange: (value: string) => void;
  joined: ReadonlySet<string>;
  requested: ReadonlySet<string>;
  onJoin: (id: string) => void;
  onRequest: (id: string) => void;
}) {
  const groups = MOCK_GROUPS.filter((group) =>
    view === 'mine' ? joined.has(group.id) : !joined.has(group.id)
  );

  return (
    <>
      <h2 className="sr-only">Groups</h2>
      <div className={styles.screenBody}>
        <Chips
          label="Group views"
          options={[
            { id: 'mine', label: `Your groups (${joined.size})` },
            { id: 'discover', label: 'All groups' },
          ]}
          value={view}
          onChange={onViewChange}
        />
        <p className={styles.resultCount} role="status">
          {view === 'mine'
            ? 'Pick up where you left off.'
            : 'Find a new little circle.'}
        </p>
        <div className={styles.cardStack}>
          {groups.map((group) => {
            const isJoined = joined.has(group.id);
            const isRequested = requested.has(group.id);
            const members =
              group.memberCount + (isJoined && !group.joined ? 1 : 0);

            return (
              <article key={group.id} className={styles.groupCard}>
                <div className={styles.groupCover}>
                  {group.cover ? (
                    <img src={group.cover} alt="" loading="lazy" />
                  ) : (
                    <Users size={40} aria-hidden="true" />
                  )}
                  <span className={styles.groupVisibility}>
                    {group.visibility === 'private' ? (
                      <LockKeyhole size={12} aria-hidden="true" />
                    ) : (
                      <Users size={12} aria-hidden="true" />
                    )}
                    {group.visibility === 'private'
                      ? 'Private group'
                      : 'Public group'}
                  </span>
                </div>
                <div className={styles.groupInfo}>
                  <img
                    src={group.avatar}
                    alt=""
                    className={styles.groupAvatar}
                  />
                  <h3>{group.name}</h3>
                  <p>{group.summary}</p>
                  <div className={styles.groupMeta}>
                    <span>{members} members</span>
                    {group.visibility === 'public' || isJoined ? (
                      <span>{group.postsThisWeek} posts this week</span>
                    ) : (
                      <span>Activity is private</span>
                    )}
                  </div>
                  {isJoined ? (
                    <button
                      type="button"
                      className={styles.groupButton}
                      aria-label={`Preview ${group.name}`}
                      onClick={() =>
                        onOpen({
                          title: group.name,
                          description: group.summary,
                          image: group.cover,
                          meta: `${members} members / Group preview`,
                        })
                      }
                    >
                      Open group
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.groupButton}
                      aria-label={`${group.joinPolicy === 'request' ? 'Request to join' : 'Join'} ${group.name}`}
                      disabled={group.joinPolicy === 'invite' || isRequested}
                      onClick={() => {
                        if (group.joinPolicy === 'open') {
                          onJoin(group.id);
                        } else if (group.joinPolicy === 'request') {
                          onRequest(group.id);
                        }
                      }}
                    >
                      {isRequested ? (
                        <>
                          <Check size={16} aria-hidden="true" />
                          Request pending
                        </>
                      ) : group.joinPolicy === 'invite' ? (
                        'Invite only'
                      ) : group.joinPolicy === 'request' ? (
                        'Request to join'
                      ) : (
                        <>
                          <Plus size={16} aria-hidden="true" />
                          Join group
                        </>
                      )}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className={styles.demoNote}>Membership changes are preview-only.</p>
        <MockFooter photoCredit />
      </div>
    </>
  );
}
